// The ship's rugged maintenance tablet: a held item that shows a crude, interactive wireframe of the whole ship
// (every module coloured by its repair state, crew positions, breaches and fires), plus crew, nav and stores pages.
// Deliberately low-fi: rendered at 320×200 and scaled up with hard pixels, phosphor-green on black.
import * as THREE from 'three';
import { COMPS, COMP_IDS, DECKS, RING, RING_DECK, EXT_DECK, WAYPOINTS, ITEMS } from './config.js';
import { polar, compPos } from './util.js';
import { SL } from './hull.js';
import { repairNeeds, missingParts, PARTS, PART_IDS } from './repair.js';
import { BUNKS, EXPERIMENTS } from './crew.js';

const TW = 320, TH = 200;
const PH = { bg: 0x020803, line: 0x2fbf4a, dim: 0x15502a, ok: 0x39ff6a, warn: 0xffc030, bad: 0xff3a24, fire: 0xff8a1e, fault: 0x40c8ff, off: 0x4a5a50, crew: 0xe8ffe8, sel: 0xffffff };
// where each pressurised deck sits along the ship's axis (ship frame: z aft), and its module span
const DECK_SPAN = [SL.bus, SL.cargo, SL.eng, SL.hab, SL.cmd];
// a point on a deck (polar layout, floors face the drive) in the ship frame
function deckToShip(d, x, z, h = 1.2) { return new THREE.Vector3(-x * 0.95, -z * 0.95, DECK_SPAN[d][1] - h); }
export function compShipPos(id) {
  const c = COMPS[id];
  if (c.ext) return new THREE.Vector3(c.ex, c.ey || 0, c.ez);
  const p = compPos(id);
  return deckToShip(c.deck, p.x, p.z);
}
function playerShipPos(p) {
  if (p.deck === EXT_DECK) return new THREE.Vector3(p.x, (p.y || 0) + 1.6, p.z);
  if (p.deck === RING_DECK) { const th = -p.z / RING.R; return new THREE.Vector3(Math.sin(th) * (SL.ringR - 1), -Math.cos(th) * (SL.ringR - 1), SL.ringZ + p.x); }
  return deckToShip(p.deck, p.x, p.z, 1.0 + (p.y || 0) * 0.3);
}
const tbLine = (c) => new THREE.LineBasicMaterial({ color: c });
function tbWire(geo, color, parent) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), tbLine(color)); parent.add(l); return l; }

export class Tablet {
  constructor(host) {
    this.host = host; this.open = false; this.page = 'ship'; this.sel = null;
    this.yaw = 0.9; this.pitch = 0.35; this.dist = 150;
    const el = (this.el = document.createElement('div'));
    el.id = 'tablet';
    el.innerHTML = `<div class="tb-dev"><div class="tb-top"><span>WOLFRAM · SHIPBOARD MAINTENANCE TERMINAL MK II</span><span class="tb-bat">▮▮▮▯</span></div>
      <div class="tb-screen"><canvas width="${TW}" height="${TH}"></canvas><div class="tb-info"></div><div class="tb-scan"></div></div>
      <div class="tb-keys"><button data-p="ship">F1 SHIP</button><button data-p="crew">F2 CREW</button><button data-p="nav">F3 NAV</button><button data-p="stores">F4 STORES</button><button class="tb-x">PWR ✕</button></div>
      <div class="tb-screw s1"></div><div class="tb-screw s2"></div><div class="tb-screw s3"></div><div class="tb-screw s4"></div></div>`;
    document.body.appendChild(el);
    this.canvas = el.querySelector('canvas'); this.info = el.querySelector('.tb-info');
    el.querySelectorAll('.tb-keys button[data-p]').forEach((b) => (b.onclick = () => this.setPage(b.dataset.p)));
    el.querySelector('.tb-x').onclick = () => this.close();
    // drag to turn, wheel / pinch to zoom, tap a module to inspect it
    const pts = new Map(); let moved = 0, pinch0 = 0;
    this.canvas.addEventListener('pointerdown', (e) => { this.canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    this.canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p[0], dy = e.clientY - p[1]; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) this.zoom(pinch0 / d); pinch0 = d; moved = 99; return; }
      moved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.008; this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch + dy * 0.008));
    });
    const up = (e) => { if (pts.size === 1 && moved < 6) this.pick(e); pts.delete(e.pointerId); pinch0 = 0; };
    this.canvas.addEventListener('pointerup', up); this.canvas.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    this.info.addEventListener('pointerdown', (e) => { const t = e.target.closest('[data-sel]'); if (t) { this.sel = t.dataset.sel; this.setPage('ship'); } });
  }
  zoom(k) { this.dist = Math.max(60, Math.min(420, this.dist * k)); }
  init() {
    if (this.r) return;
    const r = (this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false }));
    r.setPixelRatio(1); r.setSize(TW, TH, false);
    const sc = (this.scene = new THREE.Scene()); sc.background = new THREE.Color(PH.bg);
    this.cam = new THREE.PerspectiveCamera(40, TW / TH, 1, 2000);
    this.ray = new THREE.Raycaster(); this.ray.params.Points = { threshold: 3 };
    // ---- the hull, as crude wireframe ----
    const hull = new THREE.Group(); sc.add(hull);
    const cylZ = (r0, r1, z0, z1, seg = 10, col = PH.line) => { const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, seg, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, (z0 + z1) / 2); return tbWire(g, col, hull); };
    cylZ(SL.capR0, SL.R, SL.cap[0], SL.cap[1]);
    for (const k of ['cmd', 'hab', 'eng', 'cargo']) cylZ(SL.R, SL.R, SL[k][0], SL[k][1]);
    cylZ(SL.hubR, SL.hubR, SL.hub[0], SL.hub[1], 8, PH.dim);
    { const g = new THREE.TorusGeometry(SL.ringR, SL.ringHR, 4, 24); g.translate(0, 0, SL.ringZ); this.ring = tbWire(g, PH.line, hull); }
    { const g = new THREE.BoxGeometry(SL.tw * 2, SL.tw * 2, SL.truss[1] - SL.truss[0]); g.translate(0, 0, (SL.truss[0] + SL.truss[1]) / 2); tbWire(g, PH.dim, hull); }
    for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(SL.rad.x1 - SL.rad.x0, 0.3, SL.rad.z1 - SL.rad.z0); g.translate(s * (SL.rad.x0 + SL.rad.x1) / 2, 0, (SL.rad.z0 + SL.rad.z1) / 2); this['rad' + (s < 0 ? 'A' : 'B')] = tbWire(g, PH.dim, hull); }
    cylZ(SL.busR, SL.busR, SL.bus[0], SL.bus[1]);
    cylZ(SL.shieldR, SL.shieldR, SL.shield[0], SL.shield[1], 12);
    cylZ(SL.nozR0, SL.nozR1, SL.nozzle[0], SL.nozzle[1], 10, PH.dim);
    // deck floors, labelled
    this.deckRings = DECKS.map((d) => { const g = new THREE.RingGeometry(1.5, 11, 12, 1); const l = tbWire(g, PH.dim, hull); l.position.z = DECK_SPAN[d.id][1] - 0.2; return l; });
    // ---- modules: chunky flat-shaded markers ----
    this.mods = {};
    for (const id of COMP_IDS) {
      const c = COMPS[id], s = Math.max(3.2, c.fp * 2.6);
      const geo = c.ext ? new THREE.OctahedronGeometry(s * 0.9) : new THREE.BoxGeometry(s, s, s * 0.8);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PH.ok }));
      m.position.copy(compShipPos(id)); m.userData.id = id; sc.add(m);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), tbLine(0x000000)); m.add(edge);
      this.mods[id] = m;
    }
    this.selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), tbLine(PH.sel)); sc.add(this.selBox);
    // crew dots, breaches, the pod
    this.crewPts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(30), 3)), new THREE.PointsMaterial({ color: PH.crew, size: 4, sizeAttenuation: false }));
    this.crewPts.frustumCulled = false; sc.add(this.crewPts);
    this.breachPts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(60), 3)), new THREE.PointsMaterial({ color: PH.bad, size: 5, sizeAttenuation: false }));
    this.breachPts.frustumCulled = false; sc.add(this.breachPts);
  }
  setPage(p) { this.page = p; this.el.querySelectorAll('.tb-keys button[data-p]').forEach((b) => b.classList.toggle('on', b.dataset.p === p)); this.lastInfo = ''; }
  show() { this.init(); this.open = true; this.el.style.display = 'flex'; this.setPage(this.page); this.host.sfx && this.host.sfx.chirp && this.host.sfx.chirp(1400, 0.05, 0.04); }
  close() { if (!this.open) return; this.open = false; this.el.style.display = 'none'; this.host.onClose && this.host.onClose(); }
  key(k) {
    if (!this.open) return false;
    if (k === 'escape' || k === 'f' || k === 'tab') { this.close(); return true; }
    const pages = { 1: 'ship', 2: 'crew', 3: 'nav', 4: 'stores', f1: 'ship', f2: 'crew', f3: 'nav', f4: 'stores' };
    if (pages[k]) { this.setPage(pages[k]); return true; }
    if (k === 'arrowleft') this.yaw += 0.2; else if (k === 'arrowright') this.yaw -= 0.2; else if (k === 'arrowup') this.zoom(0.85); else if (k === 'arrowdown') this.zoom(1.18);
    return true;
  }
  pick(e) {
    const rc = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    this.ray.setFromCamera(v, this.cam);
    const hit = this.ray.intersectObjects(Object.values(this.mods), false)[0];
    // modules are small at this resolution: fall back to the nearest one to the tap on screen
    let id = hit && hit.object.userData.id;
    if (!id) { let best = 0.08; for (const [k, m] of Object.entries(this.mods)) { const p = m.position.clone().project(this.cam), d = Math.hypot(p.x - v.x, p.y - v.y); if (d < best) { best = d; id = k; } } }
    this.sel = id || null; this.lastInfo = '';
    if (this.host.sfx && this.host.sfx.click) this.host.sfx.click(0.25, 0, 4000);
  }
  // colour of a module by its state
  stateOf(S, id) {
    const c = S.comps[id], def = COMPS[id];
    if (c.fire > 0) return ['FIRE', PH.fire, true];
    if (c.hp <= 0) return ['DEAD', PH.bad, true];
    if (def.computer && c.fault) return ['FAULT', PH.fault, true];
    if (!c.on || c.pw <= 0) return ['OFF', PH.off, false];
    if (c.hp < 30) return ['CRIT', PH.bad, false];
    if (c.hp < 70 || (c.issue !== undefined && c.issue !== null)) return ['DMG', PH.warn, false];
    return ['OK', PH.ok, false];
  }
  tick(dt, now) {
    if (!this.open) return;
    const S = this.host.S(); if (!S) return;
    const me = this.host.me();
    if (!me || !me.item || me.item.type !== 'tablet' || me.state !== 'alive') { this.close(); return; }
    // model
    const blink = Math.sin(now * 8) > 0;
    for (const [id, m] of Object.entries(this.mods)) {
      const [, col, flash] = this.stateOf(S, id);
      m.material.color.setHex(flash && !blink ? 0x000000 : col);
    }
    if (this.ring) this.ring.rotation.z = S.ring ? S.ring.spin : 0;
    for (const id of ['radA', 'radB']) { const w = this[id]; if (w) w.scale.x = S.heat.radExt && S.comps[id].hp > 0 ? 1 : 0.15; }
    const cp = this.crewPts.geometry.attributes.position; let n = 0;
    for (const p of Object.values(S.players)) { if (!p.connected || p.state === 'dead' || p.state === 'spectator' || n >= 10) continue; cp.setXYZ(n++, ...playerShipPos(p).toArray()); }
    for (let i = n; i < 10; i++) cp.setXYZ(i, 0, 0, 9999);
    cp.needsUpdate = true; this.crewPts.material.size = blink ? 5 : 3;
    const bp = this.breachPts.geometry.attributes.position; let k = 0;
    for (const b of S.breaches) { if (k >= 20) break; const p = polar(b.a, 11); bp.setXYZ(k++, ...deckToShip(b.deck, p.x, p.z).toArray()); }
    for (let i = k; i < 20; i++) bp.setXYZ(i, 0, 0, 9999);
    bp.needsUpdate = true; this.breachPts.visible = blink;
    if (this.sel && this.mods[this.sel]) { const m = this.mods[this.sel]; this.selBox.visible = true; this.selBox.position.copy(m.position); this.selBox.scale.setScalar(5 + Math.sin(now * 6)); this.selBox.rotation.y = now; }
    else this.selBox.visible = false;
    // camera orbit about the middle of the ship (or the selected module)
    this.yaw += dt * 0.05;
    const want = this.sel && this.mods[this.sel] ? this.mods[this.sel].position : new THREE.Vector3(0, 0, -25);
    this.tgt = this.tgt || want.clone(); this.tgt.lerp(want, Math.min(1, dt * 3)); const tgt = this.tgt;
    this.cam.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist).add(tgt);
    this.cam.up.set(0, 1, 0); this.cam.lookAt(tgt);
    this.r.render(this.scene, this.cam);
    // text side (refreshed a few times a second)
    this.infoT = (this.infoT || 0) - dt;
    if (this.infoT <= 0) { this.infoT = 0.25; const h = this.text(S, me); if (h !== this.lastInfo) { this.info.innerHTML = h; this.lastInfo = h; } }
  }
  text(S, me) {
    const pct = (v) => Math.round(v) + '%';
    const N = S.nav;
    const head = `<div class="tb-h">${{ ship: 'SYSTEMS', crew: 'CREW', nav: 'NAVIGATION', stores: 'STORES' }[this.page]} <i>${S.alert === 'red' ? '<b class="r">RED ALERT</b>' : S.alert === 'yellow' ? '<b class="y">CAUTION</b>' : 'NOMINAL'}</i></div>`;
    if (this.page === 'ship') {
      let h = head;
      if (this.sel) {
        const id = this.sel, c = S.comps[id], def = COMPS[id], [st] = this.stateOf(S, id), need = repairNeeds(S, id);
        h += `<div class="tb-sel">&gt; ${def.name.toUpperCase()}</div><div>LOC: ${def.ext ? 'EXTERIOR (EVA/POD)' : DECKS[def.deck].name.toUpperCase() + ' DECK'}</div><div>INTEG: ${tbBar(c.hp / 100)} ${pct(c.hp)}</div><div>STATE: <b class="${st === 'OK' ? 'g' : st === 'DMG' || st === 'OFF' ? 'y' : 'r'}">${st}</b>${c.on ? '' : ' (SWITCHED OFF)'}${c.pw < 1 && c.on ? ` PWR ${pct(c.pw * 100)}` : ''}</div>`;
        if (need) { const miss = missingParts(S, need.parts); h += `<div>FAULT: <b class="y">${need.issues.map((i) => i.label.toUpperCase()).join(' + ')}</b></div><div>PARTS: ${Object.entries(need.parts).map(([k, n]) => `${n}×${PARTS[k].short} <i>(${S.stores[k] || 0})</i>`).join(' ')}</div>${miss.length ? `<div class="r">MISSING: ${miss.join(', ').toUpperCase()}</div>` : '<div class="g">PARTS IN STOCK — PRESS R AT MODULE</div>'}`; }
        if (S.drones.jobs.some((j) => j.target === id)) h += '<div class="g">DRONE WORKING</div>';
        h += `<div class="tb-dim">[tap empty space to clear]</div>`;
      } else {
        const bad = COMP_IDS.map((id) => ({ id, s: this.stateOf(S, id), hp: S.comps[id].hp })).filter((x) => x.s[0] !== 'OK').sort((a, b) => a.hp - b.hp).slice(0, 9);
        h += `<div>HULL ${tbBar(S.hull / 100)} ${pct(S.hull)}${S.breaches.length ? ` <b class="r">${S.breaches.length} BREACH</b>` : ''}</div>`;
        h += bad.length ? bad.map((x) => `<div class="tb-row" data-sel="${x.id}"><b class="${x.s[0] === 'DMG' || x.s[0] === 'OFF' ? 'y' : 'r'}">${x.s[0].padEnd(5, ' ')}</b> ${COMPS[x.id].name.toUpperCase().slice(0, 22)} ${pct(x.hp)}</div>`).join('') : '<div class="g">ALL SYSTEMS NOMINAL</div>';
        if (S.cascade && S.cascade.length) h += `<div class="r">CASCADE: ${S.cascade.length} SPREADING</div>`;
        h += `<div class="tb-dim">drag: turn · wheel/pinch: zoom · tap: inspect</div>`;
      }
      return h;
    }
    if (this.page === 'crew') {
      return head + Object.values(S.players).filter((p) => p.connected).map((p) => {
        const where = p.state === 'dead' ? 'IN CRYO THAW' : p.pod ? 'WORK POD' : p.deck === EXT_DECK ? 'EVA' : p.deck === RING_DECK ? 'RING' : DECKS[p.deck].name.toUpperCase();
        const st = p.state === 'downed' ? '<b class="r">DOWN</b>' : p.state === 'dead' ? '<b class="r">KIA</b>' : p.sleep ? '<b class="y">ASLEEP</b>' : p.seat ? `@${(COMPS[p.seat] ? COMPS[p.seat].name : p.seat).toUpperCase().slice(0, 12)}` : '';
        return `<div class="tb-row">${p.id === me.id ? '&gt;' : ' '}${p.name.toUpperCase().slice(0, 10).padEnd(10, ' ')} ${where}</div><div class="tb-sub">HP ${tbBar(p.hp / 100, 6)} FTG ${tbBar((p.fatigue || 0) / 100, 6)} ${p.suit ? 'SUIT ' : ''}${p.item ? ITEMS[p.item.type].short : ''} ${st}</div>`;
      }).join('') + `<div class="tb-dim">BACKUP CREW IN CRYO: ${S.pods}</div>`;
    }
    if (this.page === 'nav') {
      const dest = WAYPOINTS[Math.min(N.leg + 1, WAYPOINTS.length - 1)].name.split(',')[0].toUpperCase();
      let h = head + `<div>STATE: ${N.state.toUpperCase()} → ${dest}</div><div>LEG ${N.leg + 1}/${WAYPOINTS.length - 1}${N.state === 'transit' ? ` · ${pct((N.x / N.L) * 100)}` : ''}</div>`;
      h += `<div>DRIVE: ${S.drive.ignited ? S.drive.g.toFixed(2) + ' G' : 'COLD'} · SAS ${S.att.mode.toUpperCase()}</div><div>RM ${S.mass.rmass.toFixed(0)} T</div>`;
      if (N.cap) h += `<div class="y">CAPTURE: PE T${N.cap.tPe - N.cap.t > 0 ? '−' : '+'}${Math.abs(Math.round(N.cap.tPe - N.cap.t))}s · ${pct((N.cap.dvEff / N.cap.dvNeed) * 100)}</div>`;
      if (N.state === 'orbit') h += `<div>ORBIT e=${(N.ecc || 0).toFixed(2)}</div>`;
      if (N.rv) h += `<div class="y">RNDZ ${(N.rv.d / 1000).toFixed(2)} KM @ ${N.rv.vc.toFixed(1)} M/S</div>`;
      if (N.slotT > 0) h += `<div class="${N.slotT < 60 ? 'r' : 'y'}">SLOT ${Math.ceil(N.slotT)} S</div>`;
      if (S.effects.chunk) h += `<div class="r">ROCK! IMPACT ${Math.ceil(S.effects.chunk.t)} S</div>`;
      if (S.effects.stormWarn > 0 || S.effects.stormT > 0) h += `<div class="r">PROTON STORM${S.effects.stormWarn > 0 ? ` IN ${Math.ceil(S.effects.stormWarn)} S` : ''}</div>`;
      if (S.enc) h += `<div class="r">HOSTILES ${S.enc.enemies.filter((e) => !e.dead && !e.gone).length} · INBOUND ${S.enc.proj.filter((p) => p.from === 'them' && !p.done).length}</div>`;
      const hails = ((S.comms && S.comms.hails) || []).filter((x) => !x.done && !x.reply && S.gameTime >= x.arrive);
      if (hails.length) h += `<div class="y">${hails.length} HAIL${hails.length > 1 ? 'S' : ''} AWAIT REPLY (COMMS)</div>`;
      if (S.strain && S.strain.v > 0.2) h += `<div class="r">STRUCTURE LOAD ${pct(S.strain.v * 100)}</div>`;
      return h;
    }
    // stores
    let h = head + PART_IDS.map((k) => `<div class="tb-row">${PARTS[k].short.padEnd(5, ' ')} ${String(S.stores[k] || 0).padStart(3, ' ')} ${tbBar(Math.min(1, (S.stores[k] || 0) / 8), 6)}</div>`).join('');
    h += `<div>PATCH ${S.stores.patch} · MED ${S.stores.medkit} · CART ${S.stores.cartridge}</div><div>FEED ${Math.round(S.stores.feedstock)} KG · CR ${S.credits}</div>`;
    const sci = S.sci ? Object.entries(S.sci.bays).filter(([, r]) => r) : [];
    if (sci.length) h += sci.map(([b, r]) => `<div class="tb-sub">${b.toUpperCase()}: ${EXPERIMENTS[r.ex].name.toUpperCase().slice(0, 18)} ${pct(r.p * 100)}${r.ok ? '' : ' <b class="y">PAUSED</b>'}</div>`).join('');
    if (S.fab.queue.length) h += `<div class="tb-sub">FAB: ${S.fab.queue.length} JOB(S)</div>`;
    return h;
  }
}
function tbBar(v, n = 8) { const k = Math.round(Math.max(0, Math.min(1, v)) * n); return '<span class="tb-bar">' + '█'.repeat(k) + '░'.repeat(n - k) + '</span>'; }
