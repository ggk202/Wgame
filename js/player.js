// Local first-person controller, keyboard/mouse input and interaction targeting.
import { COMPS, COMP_IDS, LOCKERS, LIFT_A, ROOM_R, ROOM_H, DECK_H, SHAFT_R, RAIL_H, EYE, PLAYER_H, ITEMS, DECKS, EXT_DECK, EXT, AIRLOCK, RING, RING_DECK, G0 } from './config.js';
import { polar, compPos, compDeck, clamp } from './util.js';
import { hullSDF, hullPush, hullNormal } from './hull.js';

const WALK_G = 0.4; // m/s^2 (~0.04 g): below this you float
// Apparent gravity (m/s^2) in the local frame of a space: decks have floors facing the drive, the ring's floor faces outward
export function gravityAt(S, deck) {
  if (!S) return [0, -G0, 0];
  const thrust = (S.drive ? S.drive.g : 0) * G0;
  if (deck === RING_DECK) return [thrust, -((S.ring && S.ring.g) || 0) * G0, 0];
  if (deck === EXT_DECK) return [0, 0, thrust];
  return [0, -thrust, 0];
}

// Shared input state, written by keyboard/mouse and touch controls.
export const input = {
  fwd: 0, right: 0, up: 0, lookX: 0, lookY: 0, sprint: false,
  use: false, repair: false, item: false, drop: false, // repair/item are "held"; use/drop are edge-triggered
  // touch-control contributions (combined with keyboard each frame, so keyboards and trackpads work on tablets too)
  tfwd: 0, tright: 0, tup: 0, trepair: false, titem: false, tsprint: false,
};
export const prefs = { sens: 1, invertY: false };
try { const p = JSON.parse(localStorage.getItem('wolfram.prefs') || '{}'); Object.assign(prefs, p); } catch (e) {}
export function savePrefs() { try { localStorage.setItem('wolfram.prefs', JSON.stringify(prefs)); } catch (e) {} }

export class Controller {
  constructor() {
    this.x = 0; this.y = 0; this.z = 3.2; this.yaw = Math.PI; this.pitch = 0; this.deck = 3;
    this.vx = 0; this.vy = 0; this.vz = 0; this.fl = false; this.gm = 0; this.tether = 0;
    this.moving = false;
    this.locked = false;
    this.sens = 0.0022;
    this.keys = {};
  }
  setFrom(p) { this.x = p.x; this.y = p.y || 0; this.z = p.z; this.deck = p.deck; this.yaw = p.yaw ?? this.yaw; this.vx = this.vy = this.vz = 0; }

  // Mouse / trackpad / keyboard on any device (desktop, iPad with Magic Keyboard or mouse, Android, ...).
  bindPointer(canvas, hooks) {
    this.hooks = hooks; this.canvas = canvas;
    this.lockSupported = !!(canvas.requestPointerLock || canvas.webkitRequestPointerLock);
    this.dragLook = null;
    const lockEl = () => document.pointerLockElement || document.webkitPointerLockElement;
    const onChange = () => { const was = this.locked; this.locked = lockEl() === canvas; if (this.locked) { this.dragLook = null; fails = 0; } if (was !== this.locked && hooks.lockChange) hooks.lockChange(this.locked); };
    document.addEventListener('pointerlockchange', onChange);
    document.addEventListener('webkitpointerlockchange', onChange);
    let fails = 0;
    const onErr = () => { fails++; if (fails >= 2) { this.lockFailed = true; if (hooks.lockError) hooks.lockError(); } };
    document.addEventListener('pointerlockerror', onErr);
    document.addEventListener('webkitpointerlockerror', onErr);
    // Any mouse/trackpad press on the 3D view (or the touch look-pad) grabs the pointer.
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      hooks.mouseSeen && hooks.mouseSeen();
      const t = e.target;
      if (!(t === canvas || (t && (t.id === 'lookpad' || t.id === 'hud' || t.id === 'helmet' || t.id === 'vignette')))) return;
      if (hooks.uiOpen() || this.locked) return;
      this.dragLook = { x: e.clientX, y: e.clientY }; // drag-to-look works immediately; becomes a lock if the browser grants it
      if (!this.lockFailed) this.requestLock();
    });
    document.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') this.dragLook = null; });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) { input.lookX += e.movementX || 0; input.lookY += e.movementY || 0; return; }
      if (this.dragLook && !hooks.uiOpen()) { input.lookX += (e.clientX - this.dragLook.x) * 1.2; input.lookY += (e.clientY - this.dragLook.y) * 1.2; this.dragLook.x = e.clientX; this.dragLook.y = e.clientY; }
    });
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
      hooks.keyboardSeen && hooks.keyboardSeen();
      const k = e.key.toLowerCase();
      if (k === 'tab') e.preventDefault();
      if (this.keys[k]) return;
      this.keys[k] = true;
      if (hooks.key(k, e)) return;
      if (k === 'e') input.use = true;
      if (k === 'g') input.drop = true;
    });
    window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); this.keys[k] = false; hooks.keyUp && hooks.keyUp(k); });
    window.addEventListener('blur', () => { this.keys = {}; });
  }
  requestLock() {
    const c = this.canvas;
    if (!c || this.locked) return true;
    const fn = c.requestPointerLock || c.webkitRequestPointerLock;
    if (!fn) { this.lockFailed = true; return false; }
    try {
      const r = fn.call(c);
      if (r && r.catch) r.catch(() => {}); // failures arrive as 'pointerlockerror'
      return true;
    } catch (e) { this.lockFailed = true; return false; }
  }
  releaseLock() { if (this.locked) { (document.exitPointerLock || document.webkitExitPointerLock || (() => {})).call(document); } this.dragLook = null; }
  readKeys(blocked) {
    const k = this.keys;
    const kf = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0);
    const kr = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0);
    const ku = (k[' '] ? 1 : 0) - (k['c'] || k['control'] ? 1 : 0);
    if (blocked) { input.fwd = 0; input.right = 0; input.up = 0; input.repair = false; input.item = false; return; }
    input.fwd = kf || input.tfwd;
    input.right = kr || input.tright;
    input.up = ku || input.tup;
    input.sprint = !!k['shift'] || input.tsprint;
    input.repair = !!k['r'] || input.trepair;
    input.item = !!k['f'] || input.titem;
  }

  // ---------------- movement: walking under thrust or spin gravity, floating in zero-g, jet pack on EVA ----------------
  // y is the feet height above the floor (eye = y + EYE). In zero-g the eye is what collides.
  update(dt, S, me, blocked) {
    this.readKeys(blocked);
    this.yaw -= input.lookX * this.sens * prefs.sens;
    this.pitch = clamp(this.pitch - input.lookY * this.sens * prefs.sens * (prefs.invertY ? -1 : 1), -1.5, 1.5);
    input.lookX = 0; input.lookY = 0;
    if (!me || me.state === 'dead') { this.moving = false; return; }
    const still = blocked || me.state === 'downed';
    const fwd = still ? 0 : input.fwd, right = still ? 0 : input.right, up = still ? 0 : input.up;
    const G = gravityAt(S, this.deck), gm = Math.hypot(G[0], G[1], G[2]);
    this.gm = gm;
    if (me.state === 'spectator') { this.spectate(dt, fwd, right, up); return; }
    if (this.deck === EXT_DECK) { this.eva(dt, S, me, fwd, right, up, G); return; }
    const walk = gm >= WALK_G;
    this.fl = !walk;
    if (walk) this.walkStep(dt, S, me, fwd, right, G, gm);
    else this.floatStep(dt, S, me, fwd, right, up, G);
    if (this.deck === RING_DECK) this.constrainRing(walk); else this.constrainDeck(walk);
  }
  spectate(dt, fwd, right, up) {
    const f = this.lookVec(), r = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)], sp = 5;
    this.x += (f[0] * fwd + r[0] * right) * sp * dt; this.z += (f[2] * fwd + r[2] * right) * sp * dt; this.y += (f[1] * fwd + up) * sp * dt;
    this.moving = false; this.fl = true;
    if (this.deck !== EXT_DECK && this.deck !== RING_DECK) { const rr = Math.hypot(this.x, this.z); if (rr > ROOM_R - 0.5) { this.x *= (ROOM_R - 0.5) / rr; this.z *= (ROOM_R - 0.5) / rr; } this.y = clamp(this.y, -1.2, ROOM_H - EYE - 0.2); }
  }
  lookVec() { const cp = Math.cos(this.pitch); return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp]; }
  walkStep(dt, S, me, fwd, right, G, gm) {
    const gG = gm / G0;
    let speed = input.sprint ? 5.2 : 3.2;
    if (me.suit) speed *= 0.85;
    if (gG > 1.2) speed /= Math.sqrt(gG);
    if (gG < 0.3) speed *= 0.55 + gG * 1.5; // low gravity: long, careful strides
    // the floor normal is the dominant gravity axis; any sideways component (thrust inside the spinning ring) is a slope
    let side = 0;
    if (this.deck === RING_DECK) { const k = Math.abs(G[0]) / Math.max(0.01, Math.abs(G[1])); speed *= clamp(1.1 - k, 0.2, 1); side = k > 0.55 ? Math.sign(G[0]) * (k - 0.55) * 2.5 : 0; }
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = fx * fwd + rx * right, mz = fz * fwd + rz * right;
    const l = Math.hypot(mx, mz); this.moving = l > 0.1 && this.y <= 0.05; if (l > 1) { mx /= l; mz /= l; }
    const air = this.y > 0.05 || this.inTrunk();
    if (!air) { this.vx = mx * speed + side; this.vz = mz * speed; }
    else { this.vx *= Math.exp(-0.1 * dt); this.vz *= Math.exp(-0.1 * dt); }
    this.vy = (this.vy || 0) - Math.abs(G[1] || gm) * dt;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
  }
  floatStep(dt, S, me, fwd, right, up, G) {
    const f = this.lookVec(), r = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
    const acc = (input.sprint ? 3.4 : 2.2) * (me.suit ? 0.8 : 1), vmax = input.sprint ? 4.2 : 2.8;
    const a = [f[0] * fwd + r[0] * right, f[1] * fwd + up, f[2] * fwd + r[2] * right];
    const al = Math.hypot(a[0], a[1], a[2]); if (al > 1) { a[0] /= al; a[1] /= al; a[2] /= al; }
    this.vx = (this.vx || 0) + (a[0] * acc + G[0]) * dt; this.vy = (this.vy || 0) + (a[1] * acc + G[1]) * dt; this.vz = (this.vz || 0) + (a[2] * acc + G[2]) * dt;
    const sp = Math.hypot(this.vx, this.vy, this.vz); if (sp > vmax) { const k = vmax / sp; this.vx *= k; this.vy *= k; this.vz *= k; }
    // with nothing pressed you catch the nearest handrail; out in the open you just drift
    const grab = al < 0.1 && this.nearSurface();
    const damp = Math.exp(-(grab ? 3.2 : 0.12) * dt);
    this.vx *= damp; this.vy *= damp; this.vz *= damp;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.moving = al > 0.1;
  }
  inTrunk() { return this.deck !== RING_DECK && this.deck !== EXT_DECK && Math.hypot(this.x, this.z) < SHAFT_R - 0.25; }
  nearSurface() {
    const eye = this.y + EYE;
    if (this.deck === RING_DECK) return eye < 1.3 || eye > RING.H - 1.0 || Math.abs(this.x) > RING.W / 2 - 1.1;
    const r = Math.hypot(this.x, this.z);
    if (r < SHAFT_R + 0.6 && r > SHAFT_R - 0.9) return true; // trunk rails and ladder
    return eye < 1.3 || eye > ROOM_H - 1.0 || r > ROOM_R - 1.6;
  }
  // stops a fall (or a zero-g bump) and reports hard landings to the host
  land(v) { if (v > 5.5 && this.onImpact) this.onImpact(v); }
  constrainDeck(walk) {
    const r = Math.hypot(this.x, this.z);
    const trunk = r < SHAFT_R - 0.25;
    // the trunk is a 3 m open tube through every deck; between the decks it is a tunnel
    const eye = this.y + EYE, bottom = walk ? this.y : eye - 0.35, top = walk ? this.y + PLAYER_H : eye + 0.25;
    if (!trunk) {
      if (bottom < 0) { if (this.vy < 0) this.land(-this.vy); this.y = walk ? 0 : 0.35 - EYE; this.vy = Math.max(0, this.vy); }
      if (top > ROOM_H && r > SHAFT_R - 0.25) { this.y -= top - ROOM_H; this.vy = Math.min(0, this.vy); }
      // safety railing round the trunk opening: knee-high to hip-high, you can float over it but not walk through it
      const railTop = RAIL_H;
      if (bottom < railTop && r < SHAFT_R + 0.42) { const k = (SHAFT_R + 0.42) / Math.max(0.01, r); this.x *= k; this.z *= k; this.vx = 0; this.vz = 0; }
    } else {
      // inside the trunk: tunnel walls between decks; the decks above and below connect through it
      if (eye > ROOM_H || eye < 0) { const rr = Math.hypot(this.x, this.z), lim = SHAFT_R - 0.45; if (rr > lim) { this.x *= lim / rr; this.z *= lim / rr; } }
      if (this.deck < 4 && this.y + EYE > DECK_H + 0.3) { this.deck++; this.y -= DECK_H; }
      else if (this.deck > 0 && this.y < -0.6) { this.deck--; this.y += DECK_H; }
      if (this.deck === 4 && top > ROOM_H + 2.6) { this.y -= top - (ROOM_H + 2.6); this.vy = Math.min(0, this.vy); } // bow docking hatch, sealed
      if (this.deck === 0 && bottom < 0) { if (this.vy < 0) this.land(-this.vy); this.y = walk ? 0 : 0.35 - EYE; this.vy = Math.max(0, this.vy); }
    }
    this.collideComps(eye);
    const rr = Math.hypot(this.x, this.z), maxR = ROOM_R - 0.55;
    if (rr > maxR) { this.x *= maxR / rr; this.z *= maxR / rr; }
  }
  collideComps(eye) {
    const pr = 0.35;
    const push = (cx, cz, rad) => {
      const dx = this.x - cx, dz = this.z - cz, d = Math.hypot(dx, dz);
      if (d < rad + pr && d > 1e-4) { const k = (rad + pr - d) / d; this.x += dx * k; this.z += dz * k; }
    };
    for (const id of COMP_IDS) {
      if (compDeck(id) !== this.deck) continue;
      const c = COMPS[id];
      if (this.y > (c.h || 2.4)) continue; // floated over it
      const p = compPos(id); push(p.x, p.z, c.fp);
    }
    const lk = LOCKERS.find((l) => l.deck === this.deck);
    if (lk) { const lp = polar(lk.a, lk.r); push(lp.x, lp.z, 0.6); }
  }
  constrainRing(walk) {
    const C = 2 * Math.PI * RING.R, hw = RING.W / 2 - 0.45;
    this.z = ((this.z % C) + C) % C;
    if (Math.abs(this.x) > hw) { this.x = Math.sign(this.x) * hw; this.vx = 0; }
    const eye = this.y + EYE, bottom = walk ? this.y : eye - 0.35, top = walk ? this.y + PLAYER_H : eye + 0.25;
    if (bottom < 0) { if (this.vy < 0) this.land(-this.vy); this.y = walk ? 0 : 0.35 - EYE; this.vy = Math.max(0, this.vy); }
    if (top > RING.H) { this.y -= top - RING.H; this.vy = Math.min(0, this.vy); }
  }
  // EVA: SAFER-style jet pack. Translation only where you push; near the hull you hold on to handrails.
  eva(dt, S, me, fwd, right, up, G) {
    this.fl = true;
    const f = this.lookVec(), r = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
    const a = [f[0] * fwd + r[0] * right, f[1] * fwd + up, f[2] * fwd + r[2] * right];
    const al = Math.min(1, Math.hypot(a[0], a[1], a[2]));
    const p = { x: this.x, y: this.y + EYE, z: this.z };
    const near = hullSDF(p.x, p.y, p.z) < 1.4;
    const jet = EXT.jet * (input.sprint ? 1.6 : 1);
    this.vx = (this.vx || 0) + a[0] * jet * dt; this.vy = (this.vy || 0) + a[1] * jet * dt; this.vz = (this.vz || 0) + a[2] * jet * dt;
    if (!(near && al < 0.1)) this.vz += G[2] * dt; // under thrust the ship accelerates away from anyone not holding on
    const damp = Math.exp(-(near && al < 0.1 ? 3.0 : 0.25) * dt); // hand-over-hand on the rails, or the pack's hold mode
    this.vx *= damp; this.vy *= damp; this.vz *= damp;
    const sp = Math.hypot(this.vx, this.vy, this.vz); if (sp > EXT.vmax) { const k = EXT.vmax / sp; this.vx *= k; this.vy *= k; this.vz *= k; }
    p.x += this.vx * dt; p.y += this.vy * dt; p.z += this.vz * dt;
    const before = { ...p };
    hullPush(p, 0.55);
    if (Math.hypot(p.x - before.x, p.y - before.y, p.z - before.z) > 1e-4) { // bumped the hull: lose the velocity into it
      const n = hullNormal(p.x, p.y, p.z), vn = this.vx * n[0] + this.vy * n[1] + this.vz * n[2];
      if (vn < 0) { if (-vn > 3) this.land(-vn + 2.5); this.vx -= vn * n[0]; this.vy -= vn * n[1]; this.vz -= vn * n[2]; }
    }
    // safety tether from the hatch
    const H = EXT.hatch, dx = p.x - H.x, dy = p.y - H.y, dz = p.z - H.z, d = Math.hypot(dx, dy, dz);
    if (d > EXT.tether) { const k = EXT.tether / d; p.x = H.x + dx * k; p.y = H.y + dy * k; p.z = H.z + dz * k; const vr = (this.vx * dx + this.vy * dy + this.vz * dz) / d; if (vr > 0) { this.vx -= (vr * dx) / d; this.vy -= (vr * dy) / d; this.vz -= (vr * dz) / d; } }
    this.tether = d / EXT.tether;
    this.x = p.x; this.y = p.y - EYE; this.z = p.z;
    this.moving = al > 0.1;
    this.jetting = al > 0.1;
  }

  // Interaction target: the thing in front of the player within reach (3D: floating crew can reach from above)
  focus(S, me) {
    if (!S || !me) return null;
    const f = this.lookVec(), eye = [this.x, this.y + EYE, this.z];
    let best = null, bestScore = Infinity;
    const consider = (obj, x, y, z, range, cone = 0.6) => {
      const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
      const dh = Math.hypot(dx, dz), d = Math.hypot(dh, Math.max(0, Math.abs(dy) - 0.9));
      if (d > range) return;
      const dl = Math.hypot(dx, dy, dz);
      const dot3 = dl < 0.01 ? 1 : (dx * f[0] + dy * f[1] + dz * f[2]) / dl;
      const hz = Math.hypot(f[0], f[2]) || 1, doth = dh < 0.01 ? 1 : (dx * f[0] + dz * f[2]) / (dh * hz);
      const ang = Math.acos(clamp(Math.max(dot3, doth), -1, 1));
      if (ang > cone + (d < 1.6 ? 0.5 : 0)) return;
      const score = ang * 2 + d * 0.25;
      if (score < bestScore) { bestScore = score; best = { ...obj, d }; }
    };
    const D = this.deck;
    for (const it of S.items) if (it.deck === D) consider({ kind: 'item', id: it.id, label: ITEMS[it.type].name }, it.x, (it.y || 0) + 0.2, it.z, 2.6);
    for (const p of Object.values(S.players)) {
      if (p.id === me.id || p.deck !== D || !p.connected || !(p.state === 'alive' || p.state === 'downed')) continue;
      consider({ kind: 'player', id: p.id, label: p.name }, p.x, (p.y || 0) + 1.2, p.z, 2.4, 0.45);
    }
    if (D === RING_DECK) {
      const C = 2 * Math.PI * RING.R;
      for (const a of RING.spokes) { let z = (a / 360) * C; if (z - this.z > C / 2) z -= C; if (this.z - z > C / 2) z += C; consider({ kind: 'spoke', id: 'spoke', label: 'Spoke ladder to the hub' }, 0, RING.H - 0.3, z, 3.2, 1.2); }
      for (let i = 0; i < RING.bays; i++) { let z = ((i + 0.5) / RING.bays) * C; if (z - this.z > C / 2) z -= C; if (this.z - z > C / 2) z += C; for (const s of [-1, 1]) consider({ kind: 'bay', id: 'bay' + (i * 2 + (s > 0 ? 1 : 0)), label: `Science Bay ${i * 2 + (s > 0 ? 2 : 1)} (empty)` }, s * (RING.W / 2 - 0.4), 1.2, z, 2.4); }
      return best;
    }
    for (const b of S.breaches) if (b.deck === D) { const p = polar(b.a, ROOM_R - 0.4); consider({ kind: 'breach', id: b.id, label: 'Hull breach' }, p.x, b.y || 1.2, p.z, 3.4, 0.6); }
    for (const id of COMP_IDS) {
      const c = COMPS[id];
      if (compDeck(id) !== D) continue;
      const p = compPos(id);
      consider({ kind: 'comp', id, label: c.name }, p.x, (p.y || 0) + (c.ext ? 0.6 : 1.1), p.z, c.fp + (c.ext ? 2.6 : 2.3), c.ext ? 0.9 : 0.6);
    }
    if (D === EXT_DECK) {
      consider({ kind: 'hatch', id: 'hatch', label: 'Airlock hatch' }, EXT.hatch.x, EXT.hatch.y, EXT.hatch.z, 3.2, 0.9);
      if (!best && me.item && me.item.type === 'patch' && S.hull < 100 && hullSDF(this.x, this.y + EYE, this.z) < 2.2) best = { kind: 'hull', id: 'hull', label: 'Hull plating', d: 1 };
      return best;
    }
    if (D === AIRLOCK.deck) { const ap = polar(AIRLOCK.a, ROOM_R - 0.4); consider({ kind: 'airlock', id: 'airlock', label: 'Airlock' }, ap.x, 1.2, ap.z, 2.8); }
    const lk = LOCKERS.find((l) => l.deck === D);
    if (lk) { const lp = polar(lk.a, lk.r); consider({ kind: 'locker', id: 'locker', label: 'Emergency Locker' }, lp.x, 1.2, lp.z, 2.6); }
    const lift = polar(LIFT_A, SHAFT_R + 0.45); consider({ kind: 'lift', id: 'lift', label: `Trunk lift (${DECKS[D].name} deck)` }, lift.x, 1.1, lift.z, 2.6);
    return best;
  }
}
