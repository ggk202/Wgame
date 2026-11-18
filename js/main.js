// WOLFRAM — boot, lobby, game loop, networking glue.
import { VERSION, DIFFICULTY, STORYTELLERS, LENGTHS, PLAYER_COLORS, COMPS, DECKS, LIFT_A, SHAFT_R, WAYPOINTS, EXT, EXT_DECK, AIRLOCK, ROOM_R } from './config.js';
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

const ART = !!window.WOLFRAM_ARTIFACT;
const QS = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); } })();
const NETMODE = QS.get('net') === 'local' ? 'local' : 'peer';
const SAVE_KEY = 'wolfram.save.v1';
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } } };

const G = {
  role: null, S: null, myId: null, net: null, code: '',
  ctl: new Controller(), world: null, hud: null, panel: null, panelKind: null, panelComp: null,
  sfx: new Sfx(), touch: null, touchMode: false,
  simAcc: 0, sendT: 0, posT: 0, hudT: 0, panelT: 0, workT: 0, saveT: 0, lastTp: 0,
  focus: null, menuOpen: false, chatOpen: false, ended: false, lifting: false, statusHeld: false,
};
window.WOLFRAM = G; // for debugging from the console
G.dbg = { input, openPanel: (...a) => openPanel(...a), closePanel: () => closePanel(), act: (...a) => act(...a), rideLift: (d) => rideLift(d) };

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

// ---------------- start as host / solo ----------------
function startHost(role, who, S) {
  G.role = role;
  G.S = S;
  S.debug = role === 'solo' || QS.get('debug') === '1';
  if (S.decks.length < 6) S.decks.push(extDeck()); // older saves
  S.fx = [];
  for (const p of Object.values(S.players)) { p.connected = false; p.seat = null; }
  const existing = Object.values(S.players).find((p) => p.name === who.name);
  G.myId = existing ? existing.id : 'p' + Math.random().toString(36).slice(2, 7);
  if (existing) { existing.connected = true; existing.color = who.color; }
  else S.players[G.myId] = Object.assign(newPlayer(G.myId, who.name, who.color), { x: (Math.random() - 0.5) * 2, z: 3.2 });
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
    else p = Object.assign(newPlayer(pid, String(m.name || 'Crew').slice(0, 16), m.color), { x: (Math.random() - 0.5) * 2, z: 3.2 });
    S.players[pid] = p;
    G.net.send(pid, { t: 'welcome', id: pid, state: snapshot() });
    logLocal(`${p.name} came aboard`, 'good');
    S.log.push({ t: S.t, text: `${p.name} came aboard`, kind: 'good' });
    return;
  }
  const p = S.players[pid];
  if (!p) return;
  if (m.t === 'pos') { if (p.state !== 'dead') { p.x = m.x; p.z = m.z; p.deck = clamp(m.d | 0, 0, 5); p.yaw = m.y; } }
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
    G.world = new World($('#view'));
    G.world.screenInfo = screenInfo;
    G.hud = new HUD($('#hud'));
    G.panel = new PanelView($('#panel'), panelCtx());
    G.touchMode = isTouchDevice();
    G.ctl.bindPointer($('#view'), {
      uiOpen: () => G.panel.open || G.menuOpen || G.chatOpen || $('#help').style.display !== 'none',
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
  G.lastTp = me.tp;
  $('#codebox').textContent = G.role === 'host' ? `JOIN CODE ${G.code}` : G.role === 'client' ? `CREW · ${G.code}` : 'SOLO';
  $('#codebox').style.display = '';
  if (G.S.debug) $('#btn-debug').style.display = '';
  G.hud.toast(G.touchMode ? 'Left stick: move · drag right side: look · USE on consoles' : 'Click to look around · WASD move · E use · H help', '');
  if (G.S.t < 1) {
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
  return { ...p, x: G.ctl.x, z: G.ctl.z, deck: G.ctl.deck, yaw: G.ctl.yaw, pitch: G.ctl.pitch, moving: G.ctl.moving };
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
  setTimeout(() => {
    const p = polar(LIFT_A, SHAFT_R + 0.9);
    G.ctl.deck = deck; G.ctl.x = p.x + (Math.random() - 0.5) * 0.6; G.ctl.z = p.z; G.ctl.yaw = Math.PI; G.ctl.pitch = 0;
    pushMyPos(true);
    setTimeout(() => { $('#fade').classList.remove('on'); G.lifting = false; logLocal(`${DECKS[deck].full}`, 'info'); }, 250);
  }, 650);
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
    if (out) { G.ctl.deck = EXT_DECK; G.ctl.x = EXT.hatch.x + (Math.random() - 0.5) * 0.6; G.ctl.z = EXT.hatch.z + 1.8; G.ctl.yaw = Math.PI; }
    else { const p = polar(AIRLOCK.a, ROOM_R - 1.6); G.ctl.deck = AIRLOCK.deck; G.ctl.x = p.x; G.ctl.z = p.z; G.ctl.yaw = Math.atan2(p.x, p.z); }
    G.ctl.pitch = 0;
    pushMyPos(true);
    act('eva', { out });
    setTimeout(() => { $('#fade').classList.remove('on'); G.lifting = false; }, 400);
  }, 1500);
}
function onKey(k, e) {
  if (G.chatOpen) return true;
  if (k === 'escape') { if (G.panel.open) closePanel(); else toggleMenu(); return true; }
  if (k === 'tab') { if (!G.panel.open) { G.statusHeld = true; openPanel('status'); } return true; }
  if (k === 'h') { toggleHelp(); return true; }
  if (k === 't' || k === 'enter') { openChat(); e.preventDefault(); return true; }
  if (k === '`' || k === 'f9') { if (G.S && G.S.debug) { G.panel.open && G.panelKind === 'debug' ? closePanel() : openPanel('debug'); } return true; }
  if (k === 'm') { G.sfx.setMuted(!G.sfx.muted); G.hud.toast(G.sfx.muted ? 'Sound muted' : 'Sound on'); return true; }
  if (G.S && G.S.vote && /^[1-4]$/.test(k)) { const o = G.S.vote.options[+k - 1]; if (o) act('vote', { opt: o.id }); return true; }
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
  const blocked = G.panel.open || G.menuOpen || G.chatOpen || G.lifting || !!G.world.focus || me.state !== 'alive';
  G.focus = blocked ? null : G.ctl.focus(S, me);
  const f = G.focus;
  if (input.use) {
    input.use = false;
    if (G.panel.open && G.touchMode) closePanel();
    else if (f && !blocked) {
      if (f.kind === 'comp') openPanel(COMPS[f.id].panel || 'extcomp', f.id);
      else if (f.kind === 'locker') openPanel('locker');
      else if (f.kind === 'lift') openPanel('lift');
      else if (f.kind === 'airlock') openPanel('airlock');
      else if (f.kind === 'hatch') openPanel('hatch');
      else if (f.kind === 'item') act('item.pickup', { id: f.id });
    }
  }
  if (input.drop) {
    input.drop = false;
    if (me.item && !blocked) { const fx = -Math.sin(G.ctl.yaw), fz = -Math.cos(G.ctl.yaw); act('item.drop', { x: G.ctl.x + fx * 0.8, z: G.ctl.z + fz * 0.8 }); }
  }
  G.workT -= dt;
  if (!blocked && f && (input.repair || input.item) && G.workT <= 0) {
    G.workT = 0.25;
    const it = me.item;
    if (input.repair && f.kind === 'comp') { act('work', { kind: 'repair', target: f.id }); G.sfx.play('repair'); }
    else if (input.item && it) {
      if (it.type === 'ext' && f.kind === 'comp') { act('work', { kind: 'ext', target: f.id }); G.sfx.play('hiss'); }
      else if (it.type === 'patch' && f.kind === 'breach') { act('work', { kind: 'patch', target: f.id }); G.sfx.play('repair'); }
      else if (it.type === 'patch' && f.kind === 'hull') { act('work', { kind: 'hull', target: 'hull' }); G.sfx.play('repair'); }
      else if (it.type === 'medkit') { act('work', { kind: 'medkit', target: f.kind === 'player' ? f.id : null }); input.item = false; }
      else if (it.type === 'cartridge' && f.kind === 'comp' && f.id === 'scrubbers') { act('work', { kind: 'cartridge', target: 'scrubbers' }); input.item = false; }
      else if (it.type === 'spares' && f.kind === 'comp') { act('work', { kind: 'repair', target: f.id }); G.sfx.play('repair'); }
    }
  } else if (!blocked && !f && input.item && me.item && me.item.type === 'medkit' && G.workT <= 0) { G.workT = 0.5; act('work', { kind: 'medkit', target: null }); input.item = false; }
  if (G.touch) {
    G.touch.setLabels({
      use: f && f.kind !== 'hull' ? (f.kind === 'item' ? 'TAKE' : f.kind === 'lift' ? 'LIFT' : f.kind === 'airlock' || f.kind === 'hatch' ? 'AIRLOCK' : 'USE') : (G.panel.open ? 'CLOSE' : ''),
      repair: f && f.kind === 'comp' && S.comps[f.id].hp < 100 ? 'REPAIR' : '',
      item: me.item ? (me.item.type === 'ext' ? 'SPRAY' : me.item.type === 'patch' ? 'PATCH' : me.item.type === 'medkit' ? 'HEAL' : me.item.type === 'cartridge' ? 'SWAP' : 'REPAIR') : '',
      drop: me.item ? 'DROP' : '',
    });
  }
}

// ---------------- FX ----------------
function handleFx(list) {
  const me = meView();
  for (const f of list) {
    switch (f.type) {
      case 'log': logLocal(f.text, f.kind); if (f.kind === 'bad') G.sfx.play('warn'); break;
      case 'toast': if (f.to === G.myId) { G.hud.toast(f.text, 'warn'); G.sfx.play('warn'); } break;
      case 'hit': if (G.world) G.world.shake = me && me.deck === f.deck ? Math.min(1.6, 0.7 + f.power) : 0.35; G.sfx.play('hit'); break;
      case 'alarm': G.sfx.play(f.kind === 'storm' ? 'storm' : 'alarm'); break;
      case 'boom': if (G.world) G.world.flash = 0.9; G.sfx.play('boom'); break;
      case 'rail': if (G.world) G.world.shake = Math.max(G.world.shake, 0.3); G.sfx.play('rail'); break;
      case 'launch': G.sfx.play('launch'); break;
      case 'pdc': G.sfx.play('pdc'); break;
      case 'chime': case 'vote': G.sfx.play('chime'); break;
      case 'msg': G.sfx.play('msg'); break;
      case 'ignite': G.sfx.play('ignite'); break;
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
  const blocked = G.panel.open || G.menuOpen || G.chatOpen || G.lifting || !!G.world.focus;
  G.ctl.update(dt, S, me, blocked);
  if (G.role !== 'client') {
    if (me) { me.x = G.ctl.x; me.z = G.ctl.z; me.deck = G.ctl.deck; me.yaw = G.ctl.yaw; }
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
  G.world.update(S, meView(), dt, now);
  G.world.render();
  if (G.panel.open) G.panel.place(G.world.focusRect());
  document.body.classList.toggle('focused', !!G.world.focus);
  G.sfx.tick(dt, S.alert);
  G.hudT -= dt;
  if (G.hudT <= 0) { G.hudT = 0.1; G.hud.update(S, meView(), G.focus, { act, touch: G.touchMode }); }
  G.panelT -= dt;
  if (G.panelT <= 0) { G.panelT = 0.2; G.panel.update(S); }
  $('#hint').style.display = !G.touchMode && !G.ctl.locked && !G.ctl.dragLook && !G.panel.open && !G.menuOpen && !G.chatOpen ? '' : 'none';
  if (S.phase !== 'play' && !G.ended) showEnd(S.phase === 'won' ? 'MISSION COMPLETE' : 'MISSION FAILED', S.endReason, S);
}
function pushMyPos(force) {
  if (G.role !== 'client' || !G.net) { const me = G.S && G.S.players[G.myId]; if (me) { me.x = G.ctl.x; me.z = G.ctl.z; me.deck = G.ctl.deck; } return; }
  G.posT = 0.066;
  G.net.send({ t: 'pos', x: G.ctl.x, z: G.ctl.z, d: G.ctl.deck, y: G.ctl.yaw });
}
function autosave() {
  if (!G.S || G.role === 'client' || G.S.phase !== 'play') return;
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
    if (G.role !== 'client') store.set(SAVE_KEY, '');
  }
}

initLobby();
