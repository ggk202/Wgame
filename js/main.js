// WOLFRAM — boot, lobby, game loop, networking glue.
import { VERSION, DIFFICULTY, STORYTELLERS, LENGTHS, PLAYER_COLORS, COMPS, COMP_IDS, DECKS, LIFT_A, SHAFT_R, WAYPOINTS, EXT, EXT_DECK, AIRLOCK, ROOM_R, RING, RING_DECK } from './config.js';
import { polar, fmtTime, clamp } from './util.js';
import { createState, newPlayer, extDeck } from './state.js';
import { step } from './sim.js';
import { applyAction } from './actions.js';
import { World } from './world.js';
import { Controller, input, prefs, savePrefs } from './player.js';
import { isTouchDevice, setupTouch } from './touch.js';
import { HUD, PanelView, $, esc } from './ui.js';
import { PANELS, screenInfo } from './panels.js';
import { HostNet, ClientNet, makeCode } from './net.js';
import { Sfx } from './audio.js';
import { ExtView } from './extview.js';
import { sasModes } from './attitude.js';
import { Tutorial } from './tutorial.js';
import { RepairGame, fmtClock } from './minigame.js';
import { repairNeeds, missingParts, PARTS, MODULES, PROCS } from './repair.js';
import { ENEMY_TYPES } from './combat.js';
import { podState } from './crew.js';
import { EXT_CAMS } from './ship.js';

const ART = !!window.WOLFRAM_ARTIFACT;
const QS = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); } })();
const NETMODE = QS.get('net') === 'local' ? 'local' : 'peer';
const SAVE_KEY = 'wolfram.save.v1';
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } } };

const G = {
  role: null, S: null, myId: null, net: null, code: '',
  ctl: new Controller(), world: null, hud: null, panel: null, panelKind: null, panelComp: null,
  sfx: new Sfx(), touch: null, touchMode: false, ext: new ExtView(), cams: null, pilotTouch: { r: [0, 0, 0], t: [0, 0, 0] }, pilotSent: '', pilotT: 0,
  simAcc: 0, sendT: 0, posT: 0, hudT: 0, panelT: 0, workT: 0, saveT: 0, lastTp: 0,
  focus: null, menuOpen: false, chatOpen: false, ended: false, lifting: false, statusHeld: false,
};
window.WOLFRAM = G; // for debugging from the console
G.dbg = { input, openPanel: (...a) => openPanel(...a), closePanel: () => closePanel(), act: (...a) => act(...a), rideLift: (d) => rideLift(d), eva: (o) => cycleAirlock(o) };

// ---------------- lobby ----------------
function initLobby() {
  $('#ver').textContent = 'v' + VERSION;
  const fill = (sel, obj) => { sel.innerHTML = Object.entries(obj).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join(''); };
  fill($('#opt-diff'), DIFFICULTY); fill($('#opt-story'), STORYTELLERS); fill($('#opt-len'), LENGTHS);
  $('#opt-diff').value = 'spacer'; $('#opt-story').value = 'cassiopeia'; $('#opt-len').value = 'standard';
  const desc = () => {
    $('#diff-desc').textContent = DIFFICULTY[$('#opt-diff').value].desc;
    $('#story-desc').textContent = STORYTELLERS[$('#opt-story').value].desc;
  };
  $('#opt-diff').onchange = desc; $('#opt-story').onchange = desc; desc();
  const name = store.get('wolfram.name') || 'Crew-' + Math.floor(Math.random() * 90 + 10);
  $('#opt-name').value = name;
  let color = store.get('wolfram.color') || PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
  const sw = $('#swatches');
  sw.innerHTML = PLAYER_COLORS.map((c) => `<button class="sw" data-c="${c}" style="background:${c}"></button>`).join('');
  const mark = () => sw.querySelectorAll('.sw').forEach((b) => b.classList.toggle('sel', b.dataset.c === color));
  sw.onclick = (e) => { const b = e.target.closest('.sw'); if (b) { color = b.dataset.c; mark(); } };
  mark();
  const who = () => { const n = $('#opt-name').value.trim().slice(0, 16) || 'Crew'; store.set('wolfram.name', n); store.set('wolfram.color', color); return { name: n, color }; };
  const settings = () => ({ difficulty: $('#opt-diff').value, storyteller: $('#opt-story').value, length: $('#opt-len').value });

  if (ART) { document.body.classList.add('artifact'); }
  const save = store.get(SAVE_KEY);
  if (save) { try { const s = JSON.parse(save); $('#btn-continue').style.display = ''; $('#btn-continue').textContent = `Continue saved game (leg ${s.nav.leg + 1}, ${DIFFICULTY[s.settings.difficulty].name})`; } catch (e) {} }

  $('#btn-solo').onclick = () => { G.sfx.unlock(); startHost('solo', who(), createState(settings())); };
  setupPractice();
  $('#btn-tutorial').onclick = () => {
    G.sfx.unlock();
    const S = createState({ difficulty: 'recruit', storyteller: 'halley', length: 'short' });
    S.tutorial = true; G.wantTutorial = true;
    startHost('solo', who(), S);
  };
  $('#btn-host').onclick = () => { G.sfx.unlock(); startHost('host', who(), createState(settings())); };
  $('#btn-continue').onclick = () => { G.sfx.unlock(); const s = JSON.parse(store.get(SAVE_KEY)); startHost(ART ? 'solo' : 'host', who(), s); };
  $('#btn-join').onclick = () => { G.sfx.unlock(); const code = $('#opt-code').value.trim().toUpperCase(); if (code.length < 4) return lobbyMsg('Enter the 5-character join code from the host.'); startClient(code, who()); };
  $('#opt-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-join').click(); });
  $('#btn-import').onclick = () => $('#file-import').click();
  $('#file-import').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const s = JSON.parse(await f.text()); if (!s.nav || !s.comps) throw new Error('not a save'); G.sfx.unlock(); startHost(ART ? 'solo' : 'host', who(), s); }
    catch (err) { lobbyMsg('That file is not a WOLFRAM save.'); }
  };
  const code = (QS.get('join') || (location.hash.length === 6 ? location.hash.slice(1) : '')).toUpperCase();
  if (code) $('#opt-code').value = code;
}
function lobbyMsg(t) { $('#lobby-msg').textContent = t; }

// ---------------- external camera feeds (rendered by the main renderer, copied into a console canvas) ----------------
class CamView {
  constructor() {
    this.cam = 0; this.t = 0;
    this.wrap = document.createElement('div'); this.wrap.className = 'extview camview';
    this.canvas = document.createElement('canvas'); this.canvas.width = 640; this.canvas.height = 360;
    this.wrap.appendChild(this.canvas);
  }
  attach(host) { host.appendChild(this.wrap); }
  render(S, now) {
    if (!this.wrap.isConnected || !this.wrap.offsetParent || !G.world) return; // not on screen (another console tab)
    if (now - this.t < 1 / 20) return; // 20 fps is plenty for a CCTV feed
    this.t = now;
    const C = G.world.renderExtCam(S, this.cam, this.canvas, now);
    const g = this.canvas.getContext('2d'), w = this.canvas.width, h = this.canvas.height;
    g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
    g.font = '16px "Share Tech Mono", ui-monospace, monospace'; g.fillStyle = '#ffc27a'; g.shadowColor = '#000'; g.shadowBlur = 4;
    const n = ((this.cam % 9) + 9) % 9;
    g.fillText(`CAM ${String(n + 1).padStart(2, '0')}  ${C.name}`, 12, 24);
    const t = new Date(S.gameTime * 1000);
    g.fillText(`T+${Math.floor(S.gameTime / 3600)}:${String(t.getUTCMinutes()).padStart(2, '0')}:${String(t.getUTCSeconds()).padStart(2, '0')}`, w - 130, 24);
    if (Math.floor(now * 2) % 2) { g.fillStyle = '#ff3b2f'; g.beginPath(); g.arc(w - 150, 18, 6, 0, 7); g.fill(); }
    g.shadowBlur = 0;
  }
}

// ---------------- start as host / solo ----------------
function startHost(role, who, S) {
  G.role = role;
  G.S = S;
  S.debug = role === 'solo' || QS.get('debug') === '1';
  if (S.decks.length < 6) S.decks.push(extDeck()); // older saves
  if (!S.ring) S.ring = { g: 0, target: 0, spin: 0, wear: 0, brake: false };
  if (S.weap.cells === undefined) { S.weap.cells = 8; S.weap.cellT = 0; S.weap.pdcFire = [0, 0, 0]; }
  if (S.stores.srm === undefined) S.stores.srm = 16;
  if (S.stores.board === undefined) { // pre-parts saves: the old universal spares are traded in for typed parts
    const old = S.stores.spares || 0;
    for (const [k, d] of Object.entries(PARTS)) S.stores[k] = d.start + Math.floor(old / 4);
    delete S.stores.spares;
  }
  for (const id of COMP_IDS) if (!S.comps[id]) S.comps[id] = { id, hp: 100, fire: 0, on: true, pw: 1, prio: COMPS[id].prio, fault: 0, reboot: 0 };
  for (const p of Object.values(S.players)) if (p.y === undefined) p.y = 0;
  S.fx = [];
  for (const p of Object.values(S.players)) { p.connected = false; p.seat = null; }
  const existing = Object.values(S.players).find((p) => p.name === who.name);
  G.myId = existing ? existing.id : 'p' + Math.random().toString(36).slice(2, 7);
  if (existing) { existing.connected = true; existing.color = who.color; }
  else S.players[G.myId] = Object.assign(newPlayer(G.myId, who.name, who.color), { x: (Math.random() - 0.5) * 2, z: -3.2, y: 0.3 });
  if (role === 'host') {
    G.code = makeCode();
    lobbyMsg('Opening a channel…');
    const net = (G.net = new HostNet(G.code, {
      onReady: () => { lobbyMsg(''); enterGame(); G.hud.toast(`Join code: ${G.code}`, 'good'); },
      onError: (e) => {
        if (e === 'code-taken') { net.close(); startHost(role, who, S); return; }
        if (!G.world) lobbyMsg('Could not open multiplayer channel: ' + e + '. You can still play solo.');
        else G.hud.toast('Network: ' + e, 'warn');
      },
      onMsg: hostOnMsg,
      onLeave: (pid) => { const p = G.S.players[pid]; if (p && p.connected) { p.connected = false; p.seat = null; logLocal(`${p.name} disconnected`, 'warn'); } },
    }, NETMODE));
  } else enterGame();
}
function hostOnMsg(pid, m) {
  const S = G.S;
  if (m.t === 'hello') {
    if (Object.values(S.players).filter((p) => p.connected).length >= 5 && !S.players[pid]) { G.net.send(pid, { t: 'full' }); return; }
    const old = Object.values(S.players).find((p) => p.name === m.name && !p.connected && p.id !== G.myId);
    let p;
    if (old) { delete S.players[old.id]; p = Object.assign(old, { id: pid, connected: true, color: m.color }); }
    else p = Object.assign(newPlayer(pid, String(m.name || 'Crew').slice(0, 16), m.color), { x: (Math.random() - 0.5) * 2, z: -3.2, y: 0.3 });
    S.players[pid] = p;
    G.net.send(pid, { t: 'welcome', id: pid, state: snapshot() });
    logLocal(`${p.name} came aboard`, 'good');
    S.log.push({ t: S.t, text: `${p.name} came aboard`, kind: 'good' });
    return;
  }
  const p = S.players[pid];
  if (!p) return;
  if (m.t === 'pos') { if (p.state !== 'dead' || p.ghost === 'scout') { p.x = m.x; p.z = m.z; p.y = +m.h || 0; p.fl = !!m.f; p.pitch = +m.p || 0; p.deck = clamp(m.d | 0, 0, RING_DECK); p.yaw = m.y; } }
  else if (m.t === 'act') applyAction(S, pid, m.a, m.args || {});
  else if (m.t === 'chat') { const msg = { t: 'chat', from: p.name, color: p.color, text: String(m.text).slice(0, 200) }; G.net.broadcast(msg); showChat(msg); }
}
function snapshot() { const { fx, ...rest } = G.S; return rest; }

// ---------------- start as client ----------------
function startClient(code, who) {
  G.role = 'client'; G.code = code;
  lobbyMsg(`Connecting to ${code}…`);
  G.net = new ClientNet(code, {
    onOpen: () => { G.net.send({ t: 'hello', name: who.name, color: who.color }); lobbyMsg('Connected. Boarding…'); },
    onMsg: clientOnMsg,
    onClose: () => { if (G.world && !G.ended) showEnd('Connection lost', 'The host left or the connection dropped. The host can save and re-open the game with a new code.'); },
    onError: (e) => { lobbyMsg(e === 'no-such-game' ? `No game found with code ${code}.` : e === 'timeout' ? 'Connection timed out. Check the code, or your network may block peer-to-peer connections.' : 'Network error: ' + e); },
  }, NETMODE);
}
function clientOnMsg(m) {
  if (m.t === 'welcome') { G.myId = m.id; G.S = m.state; enterGame(); }
  else if (m.t === 'full') lobbyMsg('That ship already has 5 crew aboard.');
  else if (m.t === 'state' && G.S) {
    const mine = G.S.players[G.myId];
    G.S = m.s;
    // keep smoother positions from the faster pos channel
    if (mine && G.S.players[G.myId]) G.S.players[G.myId].x = G.ctl.x;
  } else if (m.t === 'pos' && G.S) {
    for (const [id, q] of Object.entries(m.p)) { const p = G.S.players[id]; if (p && id !== G.myId) { p.x = q[0]; p.z = q[1]; p.deck = q[2]; p.yaw = q[3]; } }
  } else if (m.t === 'fx') handleFx(m.fx);
  else if (m.t === 'chat') showChat(m);
}

// ---------------- in-game ----------------
function enterGame() {
  $('#lobby').style.display = 'none';
  $('#game').style.display = 'block';
  if (!G.world) {
    G.cams = new CamView();
    G.repair = new RepairGame({ S: () => G.S, act, sfx: G.sfx, toast: (t, k) => G.hud.toast(t, k), me: () => meView(), onClose: () => {} });
    G.world = new World($('#view'));
    G.world.screenInfo = screenInfo;
    G.world.setQuality(prefs.quality || (G.touchMode || isTouchDevice() ? 'medium' : 'high'));
    G.world.onScreenBoot = (id, dist) => { const v = Math.max(0, 1 - dist / 14); if (v > 0.05) { G.sfx.crtOn(v * 0.5); G.sfx.relayBank(3, 0.8, v * 0.7); } };
    G.hud = new HUD($('#hud'));
    G.panel = new PanelView($('#panel'), panelCtx());
    G.touchMode = isTouchDevice();
    G.ctl.bindPointer($('#view'), {
      uiOpen: () => G.panel.open || G.menuOpen || G.chatOpen || (G.repair && G.repair.open) || $('#help').style.display !== 'none',
      key: onKey, keyUp: onKeyUp,
      mouseSeen: () => setInputMode('mouse'), keyboardSeen: () => { if (G.touch) setInputMode('mouse'); },
      lockChange: (on) => { if (on) setInputMode('mouse'); },
      lockError: () => G.hud.toast('This browser refused pointer lock. Hold the mouse button and drag to look instead.', 'warn'),
    });
    if (G.touchMode) G.touch = setupTouch(document.body, { button: onTouchButton, unlockAudio: () => G.sfx.unlock(), touchSeen: () => setInputMode('touch') });
    document.addEventListener('pointerdown', () => G.sfx.unlock(), { once: false });
    setupMenus();
    requestAnimationFrame(frame);
  }
  const me = G.S.players[G.myId];
  G.ctl.setFrom(me);
  G.ctl.onImpact = (v) => { act('impact', { v }); G.sfx.play('hit'); if (G.world) G.world.shake = Math.min(1.5, v / 8); };
  G.lastTp = me.tp;
  $('#codebox').textContent = G.role === 'host' ? `JOIN CODE ${G.code}` : G.role === 'client' ? `CREW · ${G.code}` : 'SOLO';
  $('#codebox').style.display = '';
  if (G.S.debug) $('#btn-debug').style.display = '';
  G.hud.toast(G.touchMode ? 'Left stick: move · drag right side: look · USE on consoles' : 'Click to look around · WASD move · E use · H help', '');
  if (G.S.tutorial && !G.tut) { G.tut = new Tutorial(G); G.world.focusInset = () => (G.tut && window.innerWidth >= 900 ? 350 : 0); $('#codebox').textContent = 'TUTORIAL'; }
  else if (G.S.t < 1) {
    logLocal('Welcome aboard the CSV Wolfram. Cargo: a fusion reactor core for Ganymede. Undock from the Helm on the Bridge (Deck 4) via the lift.', 'info');
  }
}
// Switch HUD/control layout between touch and keyboard+mouse (e.g. an iPad with a Magic Keyboard or trackpad).
function setInputMode(mode) {
  const touch = mode === 'touch' && !!G.touch;
  if (touch === G.touchMode) return;
  G.touchMode = touch;
  document.body.classList.toggle('touch', touch);
  if (G.touch) { G.touch.show(touch); if (!touch) G.touch.reset(); }
  if (touch) G.ctl.releaseLock();
  else G.hud.toast('Keyboard & mouse detected: click the view to lock the pointer (Esc releases it)', '');
}
function panelCtx() {
  return {
    S: () => G.S, me: () => meView(), act, click: () => G.sfx.play('click'), get touch() { return G.touchMode; },
    local: (a, args) => { if (a === 'local.lift') rideLift(args.deck); if (a === 'local.eva') cycleAirlock(args.out); },
    sfx: G.sfx,
    ext: G.ext,
    attachView: (host, mode) => (mode === 'cams' ? G.cams.attach(host) : G.ext.attach(host, mode)),
    cams: G.cams,
    pilotPress: (grp, idx, v) => { G.pilotTouch[grp][idx] = v; },
    closePanel: () => closePanel(),
  };
}
function act(a, args = {}) {
  if (!G.S) return;
  if (G.role === 'client') G.net.send({ t: 'act', a, args });
  else applyAction(G.S, G.myId, a, args);
}
function meView() {
  const p = G.S && G.S.players[G.myId];
  if (!p) return null;
  return { ...p, x: G.ctl.x, y: G.ctl.y, z: G.ctl.z, deck: G.ctl.deck, yaw: G.ctl.yaw, pitch: G.ctl.pitch, moving: G.ctl.moving, fl: G.ctl.fl, tether: G.ctl.tether };
}
function logLocal(text, kind = 'info') { if (G.hud) G.hud.addLog(text, kind); }

function openPanel(kind, compId) {
  const def = PANELS[kind];
  if (!def) return;
  const onScreen = compId && G.world.comps[compId] && G.world.comps[compId].screen;
  G.panel.show(def, compId || null, onScreen ? 'screen' : 'overlay');
  if (onScreen) G.world.setFocus(compId);
  G.panelKind = kind; G.panelComp = compId || null;
  document.body.classList.add('panel-open');
  if (compId) act('seat', { id: compId });
  G.ctl.releaseLock();
  G.panel.update(G.S);
}
function closePanel() {
  if (!G.panel.open) return;
  G.panel.hide();
  G.world.setFocus(null);
  document.body.classList.remove('panel-open');
  if (G.panelComp) act('seat', { id: null });
  G.panelKind = null; G.panelComp = null;
}
function rideLift(deck) {
  closePanel();
  if (deck === G.ctl.deck || G.lifting) return;
  G.lifting = true;
  G.sfx.play('lift');
  $('#fade').classList.add('on');
  const ring = deck === RING_DECK || G.ctl.deck === RING_DECK;
  setTimeout(() => {
    if (deck === RING_DECK) { // climb a spoke ladder from the hub down to the ring floor
      const C = 2 * Math.PI * RING.R, a = RING.spokes[Math.floor(Math.random() * RING.spokes.length)];
      G.ctl.deck = RING_DECK; G.ctl.x = (Math.random() - 0.5) * 0.8; G.ctl.z = (a / 360) * C + 1.6; G.ctl.y = 0.2; G.ctl.yaw = Math.PI; G.ctl.pitch = 0;
    } else {
      const p = polar(LIFT_A, SHAFT_R + 0.9);
      G.ctl.deck = deck; G.ctl.x = p.x + (Math.random() - 0.5) * 0.6; G.ctl.z = p.z; G.ctl.y = 0; G.ctl.yaw = Math.PI; G.ctl.pitch = 0;
    }
    G.ctl.vx = G.ctl.vy = G.ctl.vz = 0;
    pushMyPos(true);
    setTimeout(() => { $('#fade').classList.remove('on'); G.lifting = false; logLocal(deck === RING_DECK ? `CENTRIFUGE RING — ${(G.S.ring.g).toFixed(2)} g spin gravity` : `${DECKS[deck].full}`, 'info'); }, 250);
  }, ring ? 1400 : 650);
}

function cycleAirlock(out) {
  closePanel();
  if (G.lifting) return;
  const me = G.S.players[G.myId];
  if (out && !me.suit) { G.hud.toast('Put on a vacuum suit first (emergency locker)', 'warn'); return; }
  G.lifting = true;
  G.sfx.play('hiss');
  $('#fade').classList.add('on');
  setTimeout(() => {
    if (out) { G.ctl.deck = EXT_DECK; G.ctl.x = EXT.hatch.x + 1.3; G.ctl.y = EXT.hatch.y - 1.65 + (Math.random() - 0.5) * 0.6; G.ctl.z = EXT.hatch.z + (Math.random() - 0.5) * 0.6; G.ctl.yaw = Math.PI / 2; } // facing back along the hull, toward the bow
    else { const p = polar(AIRLOCK.a, ROOM_R - 1.6); G.ctl.deck = AIRLOCK.deck; G.ctl.x = p.x; G.ctl.z = p.z; G.ctl.y = 0.4; G.ctl.yaw = Math.atan2(p.x, p.z); }
    G.ctl.vx = G.ctl.vy = G.ctl.vz = 0;
    G.ctl.pitch = 0;
    pushMyPos(true);
    act('eva', { out });
    setTimeout(() => { $('#fade').classList.remove('on'); G.lifting = false; }, 400);
  }, 1500);
}
const PILOT_KEYS = 'wasdqeijkluox';
function onKey(k, e) {
  if (G.chatOpen) return true;
  if (G.repair && G.repair.open) return G.repair.key(k);
  const me0 = G.S && G.S.players[G.myId];
  if (me0 && me0.sleep && me0.state === 'alive' && (k === 'e' || k === ' ')) { act('wake'); return true; }
  if (me0 && (me0.state === 'dead' || me0.state === 'spectator') && !G.panel.open) {
    if (k === 'v') { const modes = ['free', 'scout', 'cams'], cur = me0.ghost || 'free', nx = modes[(modes.indexOf(cur) + 1) % modes.length]; act('ghost.mode', { m: nx }); if (nx === 'cams') ghostCam(0); else if (nx === 'free' && G.ctl.deck === EXT_DECK) { G.ctl.deck = 3; G.ctl.x = 0; G.ctl.z = 3; G.ctl.y = 0; } G.hud.toast(nx === 'scout' ? 'Scout drone: fly with WASD / Space / C. Your telemetry sharpens sensor locks and point defence.' : nx === 'cams' ? 'Camera net: [ and ] cycle cameras, mouse to look.' : 'Free camera', ''); return true; }
    if ((me0.ghost === 'cams') && (k === '[' || k === ']')) { ghostCam((G.ghostCam || 0) + (k === ']' ? 1 : -1)); return true; }
  }
  if (G.panel.open && G.panelComp === 'helm' && PILOT_KEYS.includes(k) && k.length === 1) {
    if (k === 'x') { if (sasModes(G.S).includes('hold')) act('att.mode', { m: 'hold' }); else G.hud.toast('No SAS on this difficulty: counter the rotation by hand', 'warn'); }
    return true;
  }
  if (k === 'escape') { if (G.panel.open) closePanel(); else toggleMenu(); return true; }
  if (k === 'tab') { if (!G.panel.open) { G.statusHeld = true; openPanel('status'); } return true; }
  if (k === 'h') { toggleHelp(); return true; }
  if (k === 'n' && G.tut) { G.tut.skip(); return true; }
  if (k === 't' || k === 'enter') { openChat(); e.preventDefault(); return true; }
  if (k === '`' || k === 'f9') { if (G.S && G.S.debug) { G.panel.open && G.panelKind === 'debug' ? closePanel() : openPanel('debug'); } return true; }
  if (k === 'm') { G.sfx.setMuted(!G.sfx.muted); G.hud.toast(G.sfx.muted ? 'Sound muted' : 'Sound on'); return true; }
  if (G.S && G.S.vote && /^[1-4]$/.test(k)) { const o = G.S.vote.options[+k - 1]; if (o) act('vote', { opt: o.id }); return true; }
  if (G.panel.open && (k === '[' || k === ']')) { G.panel.cycleTab(k === ']' ? 1 : -1); return true; }
  if (G.panel.open && (k === 'e')) { closePanel(); return true; }
  return false;
}
function onKeyUp(k) { if (k === 'tab' && G.statusHeld) { G.statusHeld = false; if (G.panelKind === 'status' && !G.panelComp) closePanel(); } }
function onTouchButton(name) {
  if (name === 'status') { G.panel.open && G.panelKind === 'status' ? closePanel() : openPanel('status'); }
  else if (name === 'menu') toggleMenu();
  else if (name === 'chat') openChat();
  else if (name === 'mouse') lockMouse();
}
function lockMouse() {
  setInputMode('mouse');
  if (G.ctl.lockFailed || !G.ctl.lockSupported) { G.hud.toast('Pointer lock is not available here. Hold the mouse button and drag to look.', 'warn'); return; }
  G.ctl.requestLock();
}

// ---------------- interaction ----------------
function handleInteraction(dt) {
  const S = G.S, me = meView();
  if (!me) return;
  const blocked = G.panel.open || G.menuOpen || G.chatOpen || G.lifting || !!G.world.focus || me.state !== 'alive' || (G.repair && G.repair.open);
  if ((me.state === 'dead' || me.state === 'spectator') && G.touch) { // touch: USE cycles the ghost job, DROP the camera
    if (input.use) { input.use = false; onKey('v'); }
    if (input.drop) { input.drop = false; if (me.ghost === 'cams') onKey(']'); }
    G.touch.setLabels({ use: 'GHOST JOB', repair: '', item: '', drop: me.ghost === 'cams' ? 'NEXT CAM' : '' });
  }
  G.focus = blocked ? null : G.ctl.focus(S, me);
  const f = G.focus;
  if (input.use) {
    input.use = false;
    if (G.panel.open && G.touchMode) closePanel();
    else if (me.pod && !blocked && !f) act('pod.exit');
    else if (f && !blocked) {
      if (me.pod && f.kind === 'comp') openPanel('extcomp', f.id);
      else if (f.kind === 'comp') openPanel(COMPS[f.id].panel || 'extcomp', f.id);
      else if (f.kind === 'locker') openPanel('locker');
      else if (f.kind === 'lift') openPanel('lift');
      else if (f.kind === 'airlock') openPanel('airlock');
      else if (f.kind === 'hatch') openPanel('hatch');
      else if (f.kind === 'item') act('item.pickup', { id: f.id });
      else if (f.kind === 'spoke') rideLift(3);
      else if (f.kind === 'bay') openPanel('science', f.id);
      else if (f.kind === 'bunk') act('sleep', { bunk: f.id });
      else if (f.kind === 'pod') act('pod.board');
    }
  }
  if (G.touch && G.touch.setFloat) G.touch.setFloat(G.ctl.fl || G.ctl.deck === EXT_DECK);
  if (me.pod && input.item && !blocked && G.workT <= 0) { input.item = false; G.workT = 0.5; act('pod.grab'); }
  if (input.drop && me.pod) { input.drop = false; act('pod.exit'); }
  if (input.drop) {
    input.drop = false;
    if (me.item && !blocked) { const fx = -Math.sin(G.ctl.yaw), fz = -Math.cos(G.ctl.yaw); act('item.drop', { x: G.ctl.x + fx * 0.8, z: G.ctl.z + fz * 0.8, y: G.ctl.fl ? G.ctl.y + 1.0 : 0 }); }
  }
  G.workT -= dt;
  if (!blocked && f && (input.repair || input.item) && G.workT <= 0) {
    G.workT = 0.25;
    const it = me.item;
    if (input.repair && f.kind === 'comp') {
      const need = repairNeeds(S, f.id);
      if (need) { // a real fault: open the hands-on repair procedure
        input.repair = false; G.workT = 0.6;
        if (S.comps[f.id].fire > 0.05) G.hud.toast('Put the fire out first', 'warn');
        else { const miss = missingParts(S, need.parts); if (miss.length) G.hud.toast(`Can't fix it yet — missing ${miss.join(', ')}. Fabricate them (Cargo deck) or buy them in port.`, 'warn'); else { G.ctl.releaseLock(); G.repair.start(f.id); } }
      } else { act('work', { kind: 'repair', target: f.id }); G.sfx.play('repair'); }
    }
    else if (input.item && it) {
      if (it.type === 'ext' && f.kind === 'comp') { act('work', { kind: 'ext', target: f.id }); G.sfx.play('hiss'); }
      else if (it.type === 'patch' && f.kind === 'breach') { act('work', { kind: 'patch', target: f.id }); G.sfx.play('repair'); }
      else if (it.type === 'patch' && f.kind === 'hull') { act('work', { kind: 'hull', target: 'hull' }); G.sfx.play('repair'); }
      else if (it.type === 'medkit') { act('work', { kind: 'medkit', target: f.kind === 'player' ? f.id : null }); input.item = false; }
      else if (it.type === 'cartridge' && f.kind === 'comp' && f.id === 'scrubbers') { act('work', { kind: 'cartridge', target: 'scrubbers' }); input.item = false; }
    }
  } else if (!blocked && !f && input.item && me.item && me.item.type === 'medkit' && G.workT <= 0) { G.workT = 0.5; act('work', { kind: 'medkit', target: null }); input.item = false; }
  if (G.touch) {
    G.touch.setLabels({
      use: f && f.kind !== 'hull' ? (f.kind === 'item' ? 'TAKE' : f.kind === 'lift' ? 'LIFT' : f.kind === 'spoke' ? 'CLIMB' : f.kind === 'airlock' || f.kind === 'hatch' ? 'AIRLOCK' : f.kind === 'bunk' ? 'SLEEP' : f.kind === 'pod' ? 'BOARD' : 'USE') : (me.pod ? 'EXIT POD' : G.panel.open ? 'CLOSE' : ''),
      repair: f && f.kind === 'comp' && S.comps[f.id].hp < 100 ? 'REPAIR' : '',
      item: me.pod ? (podState(S).carry ? 'RELEASE' : 'GRAB') : me.item ? (me.item.type === 'ext' ? 'SPRAY' : me.item.type === 'patch' ? 'PATCH' : me.item.type === 'medkit' ? 'HEAL' : me.item.type === 'cartridge' ? 'SWAP' : 'REPAIR') : '',
      drop: me.item ? 'DROP' : '',
    });
  }
}

// ---------------- FX ----------------
function handleFx(list) {
  const me = meView();
  for (const f of list) {
    G.ext.onFx(f);
    switch (f.type) {
      case 'log': logLocal(f.text, f.kind); if (f.kind === 'bad') G.sfx.play('shipwarn'); break;
      case 'repaired': G.sfx.relay && G.sfx.relay(0.8); break;
      case 'dock': G.sfx.relayBank(6, 1.2, 1); G.sfx.play('hit'); if (G.world) G.world.shake = 0.5; break;
      case 'toast': if (f.to === G.myId) { G.hud.toast(f.text, 'warn'); G.sfx.play('warn'); } break;
      case 'hit': if (G.world) G.world.shake = me && me.deck === f.deck ? Math.min(1.6, 0.7 + f.power) : 0.35; G.sfx.play('hit'); break;
      case 'alarm': G.sfx.play(f.kind === 'storm' ? 'storm' : 'alarm'); break;
      case 'boom': if (G.world) G.world.flash = 0.9; G.sfx.play('boom'); break;
      case 'rail': if (G.world) G.world.shake = Math.max(G.world.shake, 0.3); G.sfx.play('rail'); break;
      case 'launch': G.sfx.play('launch'); break;
      case 'pdc': G.sfx.gatling(1.3, f.n || 1); if (G.world) G.world.onFx(f); break;
      case 'srm': G.sfx.play('srm'); if (G.world) G.world.onFx(f); break;
      case 'chime': case 'vote': G.sfx.play('chime'); break;
      case 'msg': G.sfx.play('msg'); break;
      case 'ignite': G.sfx.play('ignite'); G.hud.toast('DRIVE IGNITION — thrust is gravity now: anyone floating falls toward the drive', 'warn'); break;
      case 'down': if (f.id === G.myId) G.hud.toast('You are down! A crewmate must revive you with a medkit.', 'bad'); break;
      case 'death': if (f.id === G.myId) { closePanel(); G.hud.toast('You died.', 'bad'); } break;
    }
  }
}

// ---------------- main loop ----------------
let last = 0;
function frame(tms) {
  requestAnimationFrame(frame);
  const now = tms / 1000;
  const rdt = Math.min(0.25, last ? now - last : 0.016);
  const dt = Math.min(0.05, rdt);
  last = now;
  const S = G.S;
  if (!S) return;
  const me = S.players[G.myId];
  // teleports (respawn) from the host
  if (me && me.tp !== G.lastTp) { G.lastTp = me.tp; G.ctl.setFrom(me); }
  const blocked = G.panel.open || G.menuOpen || G.chatOpen || G.lifting || !!G.world.focus || (G.repair && G.repair.open);
  G.ctl.update(dt, S, me, blocked);
  if (G.role !== 'client') {
    if (me) { me.x = G.ctl.x; me.y = G.ctl.y; me.z = G.ctl.z; me.deck = G.ctl.deck; me.yaw = G.ctl.yaw; me.pitch = G.ctl.pitch; me.fl = G.ctl.fl; }
    const paused = S.paused || (G.role === 'solo' && G.menuOpen);
    if (!paused) {
      G.simAcc += rdt;
      while (G.simAcc >= 0.1) { G.simAcc -= 0.1; step(S, 0.1); }
    }
    if (S.fx.length) { const fx = S.fx.splice(0); handleFx(fx); if (G.net) G.net.broadcast({ t: 'fx', fx }); }
    if (G.net) {
      G.sendT -= rdt; G.posT -= rdt;
      if (G.sendT <= 0) { G.sendT = 0.2; G.net.broadcast({ t: 'state', s: snapshot() }); }
      if (G.posT <= 0) { G.posT = 0.066; const p = {}; for (const q of Object.values(S.players)) if (q.connected) p[q.id] = [q.x, q.z, q.deck, q.yaw]; G.net.broadcast({ t: 'pos', p }); }
    }
    G.saveT -= dt;
    if (G.saveT <= 0) { G.saveT = 60; autosave(); }
  } else {
    G.posT -= dt;
    if (G.posT <= 0) pushMyPos();
  }
  handleInteraction(rdt);
  if (G.panel.open && me && me.state !== 'alive' && G.panelKind !== 'status' && G.panelKind !== 'debug') closePanel();
  G.world.update(S, meView(), dt, now, G.ctl);
  if (G.panel.open) G.cams.render(S, now); // drawn into a corner of the main canvas first, then the main view covers it
  G.world.render();
  if (G.panel.open) G.panel.place(G.world.focusRect());
  document.body.classList.toggle('focused', !!G.world.focus);
  G.sfx.setEnv(G.ctl.deck === EXT_DECK ? 'eva' : 'inside');
  let inb = null;
  if (S.enc) { let n = 0, r = 1e9; for (const pr of S.enc.proj || []) if (pr.from === 'them' && pr.type === 'missile' && !pr.done) { n++; r = Math.min(r, pr.range); } for (const e of S.enc.enemies || []) if (!e.dead && !e.gone && ENEMY_TYPES[e.type] && ENEMY_TYPES[e.type].kamikaze) { n++; r = Math.min(r, e.range); } if (n) inb = { n, range: r }; }
  G.sfx.tick(dt, S.alert, S.breaches.length > 0 || S.hull < 40 || S.reactor.state !== 'running' || Object.values(S.comps).some((c) => c.fire > 0 || c.hp <= 0), inb);
  G.sfx.engine(S.drive.ignited ? Math.max(S.drive.throttle || 0, S.drive.g > 0.005 ? 0.15 : 0) : 0, G.ctl.deck === EXT_DECK ? 'eva' : 'inside');
  // hand controllers: keys + on-screen pads while seated at the helm
  if (G.panel.open && G.panelComp === 'helm' && G.world.focus) {
    const k = G.ctl.keys, P = G.pilotTouch, b = (x) => (k[x] ? 1 : 0), c = (x) => Math.max(-1, Math.min(1, x));
    const r = [c(b('s') - b('w') + P.r[0]), c(b('a') - b('d') + P.r[1]), c(b('q') - b('e') + P.r[2])];
    const t = [c(b('l') - b('j') + P.t[0]), c(b('u') - b('o') + P.t[1]), c(b('i') - b('k') + P.t[2])];
    const sig = r.join() + '|' + t.join(), active = sig !== '0,0,0|0,0,0';
    G.pilotT -= rdt;
    if (sig !== G.pilotSent || (active && G.pilotT <= 0)) { act('att.cmd', { r, t }); G.pilotSent = sig; G.pilotT = 0.2; }
    if (active && Math.random() < rdt * 6) G.sfx.noise(0.06, 0.05, 2600);
  } else if (G.pilotSent && G.pilotSent !== '0,0,0|0,0,0') { act('att.cmd', { r: [0, 0, 0], t: [0, 0, 0] }); G.pilotSent = ''; }
  if (G.panel.open) G.ext.render(S, rdt, now);
  if (G.tut) G.tut.tick(rdt);
  if (G.repair && G.repair.open) { if (!me || me.state !== 'alive') G.repair.close(true); else G.repair.tick(rdt, now); }
  updateSleepFx(me, rdt);
  G.sfx.setConsoleHum(!!G.world.focus && G.world.focusT > 0.5);
  { let near = 0; const me2 = meView(); if (me2) for (const id in G.world.comps) { const v = G.world.comps[id]; if (v.canvas && v.wasLive && v.group.parent && v.group.parent.visible) { const p = v.group.position; if (Math.hypot(p.x - me2.x, p.z - me2.z) < 7) near++; } } G.sfx.idle(rdt, !!G.world.focus, near); }
  G.hudT -= dt;
  if (G.hudT <= 0) { G.hudT = 0.1; G.hud.update(S, meView(), G.focus, { act, touch: G.touchMode, ladder: G.ctl.ladder, ladderFloor: G.ctl.ladderFloor }); }
  G.panelT -= dt;
  if (G.panelT <= 0) { G.panelT = 0.2; G.panel.update(S); }
  $('#hint').style.display = !G.touchMode && !G.ctl.locked && !G.ctl.dragLook && !G.panel.open && !G.menuOpen && !G.chatOpen ? '' : 'none';
  if (S.phase !== 'play' && !G.ended) showEnd(S.phase === 'won' ? 'MISSION COMPLETE' : 'MISSION FAILED', S.endReason, S);
}
function pushMyPos(force) {
  if (G.role !== 'client' || !G.net) { const me = G.S && G.S.players[G.myId]; if (me) { me.x = G.ctl.x; me.y = G.ctl.y; me.z = G.ctl.z; me.deck = G.ctl.deck; me.fl = G.ctl.fl; } return; }
  G.posT = 0.066;
  G.net.send({ t: 'pos', x: G.ctl.x, z: G.ctl.z, h: G.ctl.y, f: G.ctl.fl ? 1 : 0, p: G.ctl.pitch, d: G.ctl.deck, y: G.ctl.yaw });
}
function autosave() {
  if (!G.S || G.role === 'client' || G.S.phase !== 'play' || G.S.tutorial) return;
  const { fx, ...rest } = G.S;
  store.set(SAVE_KEY, JSON.stringify(rest));
}

// ---------------- menus, chat, help, end ----------------
function setupMenus() {
  $('#btn-resume').onclick = () => toggleMenu(false);
  $('#btn-help').onclick = () => { toggleMenu(false); toggleHelp(true); };
  $('#btn-save').onclick = () => { autosave(); G.hud.toast('Game saved in this browser', 'good'); };
  $('#btn-export').onclick = () => {
    const { fx, ...rest } = G.S; const txt = JSON.stringify(rest);
    if (ART) { $('#exportbox').style.display = ''; $('#exporttext').value = txt; $('#exporttext').select(); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    a.download = `wolfram-save-leg${G.S.nav.leg + 1}.json`; a.click();
  };
  $('#btn-copycode').onclick = () => { try { navigator.clipboard.writeText(G.code).then(() => G.hud.toast('Code copied'), () => {}); } catch (e) {} };
  $('#btn-pause').onclick = () => { G.S.paused = !G.S.paused; $('#btn-pause').textContent = G.S.paused ? 'Resume simulation' : 'Pause simulation'; };
  $('#btn-quit').onclick = () => { if (G.role !== 'client') autosave(); location.reload(); };
  $('#btn-debug').onclick = () => { toggleMenu(false); openPanel('debug'); };
  $('#btn-endlobby').onclick = () => location.reload();
  $('#help-close').onclick = () => toggleHelp(false);
  $('#btn-lock').onclick = () => { toggleMenu(false); lockMouse(); };
  const ql = $('#opt-quality'); ql.value = prefs.quality || (G.touchMode ? 'medium' : 'high');
  ql.onchange = () => { prefs.quality = ql.value; savePrefs(); G.world.setQuality(ql.value); };
  const sens = $('#opt-sens'), inv = $('#opt-invert');
  sens.value = prefs.sens; $('#sens-val').textContent = prefs.sens.toFixed(1) + '×'; inv.checked = !!prefs.invertY;
  sens.oninput = () => { prefs.sens = +sens.value; $('#sens-val').textContent = prefs.sens.toFixed(1) + '×'; savePrefs(); };
  inv.onchange = () => { prefs.invertY = inv.checked; savePrefs(); };
  $('#chatinput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const t = e.target.value.trim(); if (t) sendChat(t); e.target.value = ''; closeChat(); }
    if (e.key === 'Escape') closeChat();
    e.stopPropagation();
  });
}
function toggleMenu(v) {
  G.menuOpen = v === undefined ? !G.menuOpen : v;
  $('#menu').style.display = G.menuOpen ? 'flex' : 'none';
  if (G.menuOpen) {
    G.ctl.releaseLock();
    const host = G.role !== 'client';
    $('#btn-save').style.display = host ? '' : 'none';
    $('#btn-export').style.display = host ? '' : 'none';
    $('#btn-pause').style.display = G.role === 'host' ? '' : 'none';
    $('#btn-copycode').style.display = G.role === 'host' ? '' : 'none';
    $('#menu-info').innerHTML = G.role === 'host' ? `Join code: <b>${G.code}</b> · ${G.net ? G.net.count : 0} crew connected` : G.role === 'client' ? `Connected to ${G.code}` : (ART ? 'Solo debug build: the simulation is paused while this menu is open.' : 'Solo: paused while this menu is open.');
  }
}
function toggleHelp(v) { const el = $('#help'); const on = v === undefined ? el.style.display === 'none' : v; el.style.display = on ? 'flex' : 'none'; if (on) G.ctl.releaseLock(); }
function openChat() { if (G.role === 'solo') return; G.chatOpen = true; $('#chat').classList.add('open'); G.ctl.releaseLock(); setTimeout(() => $('#chatinput').focus(), 0); }
function closeChat() { G.chatOpen = false; $('#chat').classList.remove('open'); $('#chatinput').blur(); }
function sendChat(text) {
  if (G.role === 'client') G.net.send({ t: 'chat', text });
  else { const p = G.S.players[G.myId]; const m = { t: 'chat', from: p.name, color: p.color, text }; if (G.net) G.net.broadcast(m); showChat(m); }
}
function showChat(m) {
  const e = document.createElement('div'); e.className = 'cl';
  e.innerHTML = `<b style="color:${esc(m.color || '#fff')}">${esc(m.from)}:</b> ${esc(m.text)}`;
  const log = $('#chatlog'); log.appendChild(e);
  while (log.children.length > 8) log.removeChild(log.firstChild);
  setTimeout(() => e.classList.add('old'), 20000);
  G.sfx.play('msg');
}
function showEnd(title, text, S) {
  G.ended = true;
  closePanel();
  G.ctl.releaseLock();
  $('#end').style.display = 'flex';
  $('#end-title').textContent = title;
  $('#end-text').textContent = text || '';
  if (S) {
    $('#end-stats').innerHTML = `<div>Real time: <b>${fmtTime(S.t)}</b></div><div>Voyage time: <b>${(S.gameTime / 86400).toFixed(1)} days</b></div><div>Legs completed: <b>${S.nav.leg} / ${WAYPOINTS.length - 1}</b></div><div>Hostiles destroyed: <b>${S.stats.kills}</b></div><div>Hits taken: <b>${S.stats.hits}</b></div><div>Backup crew used: <b>${S.stats.podsUsed}</b></div><div>Difficulty: <b>${DIFFICULTY[S.settings.difficulty].name}</b> · Storyteller: <b>${STORYTELLERS[S.settings.storyteller].name}</b></div>`;
    $('#end-stats').innerHTML += pilotReport(S);
    if (G.role !== 'client') store.set(SAVE_KEY, '');
  }
}

initLobby();

// ---------------- ghost camera net ----------------
function ghostCam(i) {
  const n = EXT_CAMS.length; i = ((i % n) + n) % n; G.ghostCam = i;
  const c = EXT_CAMS[i], d = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]], l = Math.hypot(...d) || 1;
  G.ctl.deck = EXT_DECK; G.ctl.x = c.pos[0]; G.ctl.y = c.pos[1] - 1.65; G.ctl.z = c.pos[2];
  G.ctl.yaw = Math.atan2(-d[0], -d[2]); G.ctl.pitch = Math.asin(d[1] / l);
  G.hud.toast(`Camera ${i + 1}/${n}: ${c.name}`, '');
}
// ---------------- sleep fade, exhaustion microsleeps ----------------
function updateSleepFx(me, dt) {
  const el = $('#sleepfx'); if (!el) return;
  let target = 0, text = '';
  if (me && me.state === 'alive' && me.sleep) { target = 0.92; text = me.sleep.forced ? 'You collapsed from exhaustion…' : `Asleep · fatigue ${Math.round(me.fatigue || 0)}% · ${G.touchMode ? 'tap USE' : 'press E or Space'} to wake`; }
  else if (me && me.state === 'alive' && (me.fatigue || 0) > 88) { // eyelids
    G.blinkT = (G.blinkT || 0) - dt;
    if (G.blinkT <= 0) { G.blinkT = 6 + Math.random() * 10; G.blinkOn = 1.2 + Math.random(); }
    if (G.blinkOn > 0) { G.blinkOn -= dt; target = 0.85; text = 'So tired… find a bunk'; }
  }
  G.sleepA = (G.sleepA || 0) + (target - (G.sleepA || 0)) * Math.min(1, dt * 2.5);
  el.style.opacity = G.sleepA.toFixed(3); el.style.display = G.sleepA > 0.01 ? 'flex' : 'none';
  el.textContent = text;
}

// ---------------- repair practice (main menu): the workbench on its own, unlimited parts, timed ----------------
function setupPractice() {
  const mods = Object.entries(MODULES).map(([mesh, m]) => ({ mesh, m, id: COMP_IDS.find((id) => COMPS[id].mesh === mesh) })).filter((x) => x.id);
  const modSel = $('#pr-mod'), faultSel = $('#pr-fault'), diffSel = $('#pr-diff');
  modSel.innerHTML = mods.map((x, i) => `<option value="${i}">${esc(x.m.name)}${COMPS[x.id].ext ? ' (exterior)' : ''}</option>`).join('');
  diffSel.innerHTML = Object.entries(DIFFICULTY).map(([k, d]) => `<option value="${k}">${esc(d.name)}</option>`).join('');
  let pr = {};
  try { pr = JSON.parse(localStorage.getItem('wolfram-practice') || '{}'); } catch (e) { pr = {}; }
  if (pr.diff) diffSel.value = pr.diff;
  const best = pr.best || {};
  const fillFaults = () => {
    const x = mods[+modSel.value];
    faultSel.innerHTML = x.m.issues.map((iss, i) => `<option value="${i}">${esc(iss.label)} · ${esc(PROCS[iss.proc].name)}</option>`).join('');
    showInfo();
  };
  const jobKey = () => `${mods[+modSel.value].mesh}/${faultSel.value}/${diffSel.value}/${$('#pr-dead').checked ? 2 : 1}`;
  const showInfo = () => {
    const x = mods[+modSel.value], iss = x.m.issues[+faultSel.value] || x.m.issues[0];
    const parts = Object.entries(iss.parts).map(([k, n]) => `${n}× ${PARTS[k].name.toLowerCase()}`).join(', ');
    const b = best[jobKey()];
    $('#pr-info').innerHTML = `Uses ${parts} on a real ship.${b ? ` · Your best: <b>${fmtClock(b)}</b>` : ''}`;
    $('#pr-dead').disabled = x.m.issues.length < 2; if (x.m.issues.length < 2) $('#pr-dead').checked = false;
  };
  modSel.onchange = fillFaults; faultSel.onchange = showInfo; diffSel.onchange = showInfo; $('#pr-dead').onchange = showInfo;
  if (pr.mod !== undefined && mods[pr.mod]) modSel.value = pr.mod;
  fillFaults();
  if (pr.fault !== undefined) { faultSel.value = pr.fault; showInfo(); }
  $('#btn-practice').onclick = () => { G.sfx.unlock(); $('#pr-result').textContent = ''; $('#practice').style.display = 'flex'; };
  $('#pr-close').onclick = () => { $('#practice').style.display = 'none'; };
  $('#pr-random').onclick = () => { modSel.value = Math.floor(Math.random() * mods.length); fillFaults(); faultSel.value = Math.floor(Math.random() * faultSel.options.length); showInfo(); };
  let running = false, lastT = 0;
  const loop = (tms) => {
    if (!running) return;
    requestAnimationFrame(loop);
    const now = tms / 1000, dt = Math.min(0.1, lastT ? now - lastT : 0.016); lastT = now;
    G.practice.tick(dt, now);
  };
  const result = (text, bad) => { const r = $('#pr-result'); r.innerHTML = text; r.className = bad ? 'bad' : ''; $('#practice').style.display = 'flex'; };
  $('#pr-start').onclick = () => {
    const x = mods[+modSel.value], fault = +faultSel.value, diff = diffSel.value, dead = $('#pr-dead').checked && x.m.issues.length > 1;
    const key = jobKey();
    try { localStorage.setItem('wolfram-practice', JSON.stringify({ mod: +modSel.value, fault, diff, best })); } catch (e) { /* private mode */ }
    const stores = {}; for (const k of Object.keys(PARTS)) stores[k] = 99;
    const PS = { settings: { difficulty: diff }, stores, comps: { [x.id]: { id: x.id, hp: dead ? 0 : 40, fire: 0, issue: fault, issue2: dead ? (fault + 1) % x.m.issues.length : null } } };
    let done = false;
    const host = {
      S: () => PS, sfx: G.sfx,
      act: (a) => { if (a === 'repair.complete') done = true; },
      toast: () => {},
      onClose: () => {
        running = false;
        const g = G.practice;
        if (done) {
          const t = g.elapsed, prev = best[key], rec = !prev || t < prev;
          if (rec) best[key] = t;
          try { localStorage.setItem('wolfram-practice', JSON.stringify({ mod: +modSel.value, fault, diff, best })); } catch (e) { /* private mode */ }
          result(`Repaired in <b>${fmtClock(t)}</b> · ${g.errors} mistake${g.errors === 1 ? '' : 's'}${rec ? (prev ? ` · <b>new best</b> (was ${fmtClock(prev)})` : ' · first time logged') : ` · best ${fmtClock(prev)}`}`);
          showInfo();
        } else result('Repair abandoned.', true);
      },
    };
    if (!G.practice) G.practice = new RepairGame(host); else G.practice.host = host;
    G.practice.practice = true;
    $('#practice').style.display = 'none';
    if (G.practice.start(x.id)) { running = true; lastT = 0; requestAnimationFrame(loop); }
  };
  addEventListener('keydown', (e) => { if (G.practice && G.practice.open && !G.S) { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase(); if (G.practice.key(k === 'esc' ? 'escape' : k)) e.preventDefault(); } });
}

// the pilot's log: Δv per leg against the ideal plan, burn accuracy, capture, rendezvous and docking contact
function pilotReport(S) {
  const legs = (S.pilot && S.pilot.legs) || [];
  if (!legs.length) return '';
  const row = (L) => {
    const name = `${WAYPOINTS[L.leg].name.split(',')[0]} → ${(WAYPOINTS[L.leg + 1] || WAYPOINTS[L.leg]).name.split(',')[0]}`;
    const waste = L.dvIdeal ? Math.max(0, L.dvUsed - L.dvIdeal) : 0;
    const burns = L.burns.length ? Math.round(L.burns.reduce((a, b) => a + b.score, 0) / L.burns.length) + '/100' : '—';
    const cap = L.capture ? `${Math.round((L.capture.eff / L.capture.need) * 100)}% eff.${L.capture.centre !== null ? `, ${Math.abs(L.capture.centre)} s off periapsis` : ''}` : '—';
    const rv = L.rendezvous ? `${Math.floor(L.rendezvous.t / 60)}:${String(L.rendezvous.t % 60).padStart(2, '0')}, ${L.rendezvous.used} m/s` : '—';
    const dock = L.dock ? `${L.dock.v} m/s, ${L.dock.lat} m off${L.dock.bumps ? `, ${L.dock.bumps} bump${L.dock.bumps > 1 ? 's' : ''}` : ''}` : '—';
    const extra = [L.missedCapture ? `${L.missedCapture} missed capture` : '', L.waveOffs ? `${L.waveOffs} wave-off` : '', L.slotsLost ? `${L.slotsLost} slot lost` : '', L.dodges ? `${L.dodges} rock dodged` : '', L.rockHits ? `${L.rockHits} rock hit` : ''].filter(Boolean).join(', ');
    return `<tr><td>${name}</td><td>${(L.dvUsed / 1000).toFixed(0)} km/s${waste > 1000 ? ` <i class="warn">(+${(waste / 1000).toFixed(0)} wasted)</i>` : ''}</td><td>${burns}</td><td>${cap}</td><td>${rv}</td><td>${dock}</td><td>${extra || '—'}</td></tr>`;
  };
  return `<h3>Pilot's log</h3><table class="tbl"><tr><th>Leg</th><th>Δv used</th><th>Burn accuracy</th><th>Capture</th><th>Rendezvous</th><th>Docking contact</th><th>Notes</th></tr>${legs.map(row).join('')}</table>`;
}
