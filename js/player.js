// Local first-person controller, keyboard/mouse input and interaction targeting.
import { COMPS, COMP_IDS, LOCKERS, LIFT_A, ROOM_R, SHAFT_R, ITEMS, DECKS, EXT_DECK, EXT, AIRLOCK } from './config.js';
import { polar, compPos, compDeck, clamp } from './util.js';

// Shared input state, written by keyboard/mouse and touch controls.
export const input = {
  fwd: 0, right: 0, lookX: 0, lookY: 0, sprint: false,
  use: false, repair: false, item: false, drop: false, // repair/item are "held"; use/drop are edge-triggered
};

export class Controller {
  constructor() {
    this.x = 0; this.z = 3.2; this.yaw = Math.PI; this.pitch = 0; this.deck = 3;
    this.moving = false;
    this.locked = false;
    this.sens = 0.0022;
    this.keys = {};
  }
  setFrom(p) { this.x = p.x; this.z = p.z; this.deck = p.deck; this.yaw = p.yaw ?? this.yaw; }

  bindDesktop(canvas, hooks) {
    this.hooks = hooks;
    canvas.addEventListener('click', () => { if (!hooks.uiOpen() && !this.locked && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} } });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      input.lookX += e.movementX; input.lookY += e.movementY;
    });
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
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
  readKeys(blocked) {
    const k = this.keys;
    if (blocked) { if (!input.touch) { input.fwd = 0; input.right = 0; } return; }
    if (!input.touch) {
      input.fwd = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0);
      input.right = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0);
      input.sprint = !!k['shift'];
      input.repair = !!k['r'];
      input.item = !!k['f'];
    }
  }

  update(dt, S, me, blocked) {
    this.readKeys(blocked);
    this.yaw -= input.lookX * this.sens;
    this.pitch = clamp(this.pitch - input.lookY * this.sens, -1.45, 1.45);
    input.lookX = 0; input.lookY = 0;
    if (blocked || !me || me.state === 'downed' || me.state === 'dead') { this.moving = false; return; }
    const g = S ? S.drive.g : 1;
    let speed = input.sprint ? 5.2 : 3.2;
    if (me.suit) speed *= 0.85;
    if (g > 1.2) speed /= Math.sqrt(g);
    if (g < 0.05 || this.deck === EXT_DECK) speed *= 0.75; // mag boots
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = fx * input.fwd + rx * input.right, mz = fz * input.fwd + rz * input.right;
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.1;
    if (len > 1) { mx /= len; mz /= len; }
    this.x += mx * speed * dt; this.z += mz * speed * dt;
    if (me.state !== 'spectator') this.collide();
    else { const r = Math.hypot(this.x, this.z); if (r > ROOM_R - 0.5) { this.x *= (ROOM_R - 0.5) / r; this.z *= (ROOM_R - 0.5) / r; } }
  }
  collide() {
    const pr = 0.35;
    const push = (cx, cz, rad) => {
      const dx = this.x - cx, dz = this.z - cz, d = Math.hypot(dx, dz);
      if (d < rad + pr && d > 1e-4) { const k = (rad + pr - d) / d; this.x += dx * k; this.z += dz * k; }
    };
    for (let it = 0; it < 2; it++) {
      for (const id of COMP_IDS) {
        if (compDeck(id) !== this.deck) continue;
        const p = compPos(id);
        push(p.x, p.z, COMPS[id].fp);
      }
      if (this.deck === EXT_DECK) {
        push(EXT.hatch.x, EXT.hatch.z, 0.8);
        this.x = clamp(this.x, -EXT.w, EXT.w); this.z = clamp(this.z, EXT.zMin, EXT.zMax);
        continue;
      }
      const lk = LOCKERS.find((l) => l.deck === this.deck);
      const lp = polar(lk.a, lk.r); push(lp.x, lp.z, 0.6);
      push(0, 0, SHAFT_R);
      const r = Math.hypot(this.x, this.z), maxR = ROOM_R - 0.55;
      if (r > maxR) { this.x *= maxR / r; this.z *= maxR / r; }
    }
  }

  // Interaction target: the thing in front of the player within reach.
  focus(S, me) {
    if (!S || !me) return null;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let best = null, bestScore = Infinity;
    const consider = (obj, x, z, range, cone = 0.55) => {
      const dx = x - this.x, dz = z - this.z, d = Math.hypot(dx, dz);
      if (d > range) return;
      const dot = d < 0.01 ? 1 : (dx * fx + dz * fz) / d;
      const ang = Math.acos(clamp(dot, -1, 1));
      if (ang > cone + (d < 1.6 ? 0.5 : 0)) return;
      const score = ang * 2 + d * 0.25;
      if (score < bestScore) { bestScore = score; best = { ...obj, d }; }
    };
    for (const it of S.items) if (it.deck === this.deck) consider({ kind: 'item', id: it.id, label: ITEMS[it.type].name }, it.x, it.z, 2.6);
    for (const p of Object.values(S.players)) {
      if (p.id === me.id || p.deck !== this.deck || !p.connected || !(p.state === 'alive' || p.state === 'downed')) continue;
      consider({ kind: 'player', id: p.id, label: p.name }, p.x, p.z, 2.4, 0.45);
    }
    for (const b of S.breaches) if (b.deck === this.deck) { const p = polar(b.a, ROOM_R - 0.4); consider({ kind: 'breach', id: b.id, label: 'Hull breach' }, p.x, p.z, 3.4, 0.6); }
    for (const id of COMP_IDS) {
      const c = COMPS[id];
      if (compDeck(id) !== this.deck) continue;
      const p = compPos(id);
      consider({ kind: 'comp', id, label: c.name }, p.x, p.z, c.fp + 2.3, 0.6);
    }
    if (this.deck === EXT_DECK) {
      consider({ kind: 'hatch', id: 'hatch', label: 'Airlock hatch' }, EXT.hatch.x, EXT.hatch.z, 3.0);
      if (!best && me.item && me.item.type === 'patch' && S.hull < 100) best = { kind: 'hull', id: 'hull', label: 'Hull plating', d: 1 };
      return best;
    }
    if (this.deck === AIRLOCK.deck) { const ap = polar(AIRLOCK.a, ROOM_R - 0.4); consider({ kind: 'airlock', id: 'airlock', label: 'Airlock' }, ap.x, ap.z, 2.8); }
    const lk = LOCKERS.find((l) => l.deck === this.deck);
    const lp = polar(lk.a, lk.r); consider({ kind: 'locker', id: 'locker', label: 'Emergency Locker' }, lp.x, lp.z, 2.6);
    const lift = polar(LIFT_A, SHAFT_R + 0.2); consider({ kind: 'lift', id: 'lift', label: `Lift (${DECKS[this.deck].name} deck)` }, lift.x, lift.z, 2.6);
    return best;
  }
}
