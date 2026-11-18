// Ship attitude (RCS + SAS), and proximity-operations docking physics. Pure JS, no three.js.
// Frames: inertial "nav" frame where -Z points toward the current target (prograde), +Y is "up".
// Ship body: nose = -Z, dorsal = +Y, starboard = +X. Identity attitude = nose on prograde.
import { clamp, rand, log, fx } from './util.js';

export const ALPHA = 0.055;     // rad/s^2 RCS angular acceleration per axis
export const WMAX = 0.16;       // rad/s max body rate
export const TACC = 0.12;       // m/s^2 RCS translation (prox ops)
export const PORT_TOL = { lateral: 0.35, speed: 0.25, angle: 3, roll: 5 }; // soft-capture tolerances (m, m/s, deg, deg)

// ---------- quaternion helpers ([x,y,z,w]) ----------
export const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
export function qnorm(q) { const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; }
export function qrot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
export function qaxis(axis, ang) { const s = Math.sin(ang / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(ang / 2)]; }
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vnorm = (a) => { const n = vlen(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
export const nose = (q) => qrot(q, [0, 0, -1]);
export const angDeg = (a, b) => (Math.acos(clamp(dot(vnorm(a), vnorm(b)), -1, 1)) * 180) / Math.PI;
export function randDir(fwdBias = 0) { // random unit vector, optionally biased toward -Z/+Z (along track)
  let v; do { v = [rand(-1, 1), rand(-1, 1), rand(-1, 1)]; } while (vlen(v) > 1 || vlen(v) < 0.1);
  v[2] *= 1 + fwdBias; return vnorm(v);
}
// roll error (deg) between body up and reference up, measured around the nose
export function rollErr(q, refUp = [0, 1, 0]) {
  const n = nose(q), up = qrot(q, [0, 1, 0]);
  const r = vnorm([refUp[0] - n[0] * dot(refUp, n), refUp[1] - n[1] * dot(refUp, n), refUp[2] - n[2] * dot(refUp, n)]);
  return angDeg(up, r);
}

export function sasModes(S) {
  const s = S.settings.sas;
  if (s === 'none') return ['off'];
  if (s === 'hold') return ['off', 'hold'];
  return (S.settings.style || S.settings.difficulty) === 'recruit' ? ['off', 'hold', 'pro', 'retro', 'target', 'shield', 'sun', 'dock'] : ['off', 'hold', 'pro', 'retro', 'target', 'shield', 'sun'];
}

// Target direction (inertial) for a SAS pointing mode
function sasTarget(S) {
  const m = S.att.mode;
  if (m === 'pro') return [0, 0, -1];
  if (m === 'retro') return [0, 0, 1];
  if (m === 'target' && S.enc) { const e = S.enc.enemies.find((x) => x.id === S.sensors.lock && !x.dead && !x.gone); if (e) return e.dir; }
  if (m === 'dock') return [0, 0, -1];
  if (m === 'shield' && S.att.sunDir) return [-S.att.sunDir[0], -S.att.sunDir[1], -S.att.sunDir[2]]; // stern (shadow shield, tanks) to the Sun
  if (m === 'sun' && S.att.sunDir) return S.att.sunDir;
  return null;
}

export function updateAttitude(S, dt) {
  const A = S.att;
  if (S.t - (A.cmdT || 0) > 1.2) { A.cmd = [0, 0, 0]; A.tcmd = [0, 0, 0]; }
  const w = A.w, alpha = [0, 0, 0];
  const pilot = A.cmd.some((c) => Math.abs(c) > 0.05);
  // SAS
  let tgt = null;
  if (A.mode !== 'off') {
    tgt = sasTarget(S);
    let wdes = [0, 0, 0];
    if (tgt) {
      const tb = qrot(qconj(A.q), tgt); // target in body frame
      const ax = cross([0, 0, -1], tb), s = vlen(ax), ang = Math.atan2(s, dot([0, 0, -1], tb));
      if (s > 1e-6) { const k = Math.min(WMAX * 0.9, Math.sqrt(2 * ALPHA * 0.7 * ang)) / s; wdes = [ax[0] * k, ax[1] * k, 0]; }
      else if (ang > 3) wdes = [WMAX * 0.5, 0, 0];
      if (A.mode === 'dock') { const re = rollSigned(A.q); wdes[2] = clamp(-re * 0.6, -0.05, 0.05); }
    }
    for (let i = 0; i < 3; i++) alpha[i] = clamp((wdes[i] - w[i]) * 1.2, -ALPHA, ALPHA);
  }
  // pilot input overrides per axis (pitch = +x, yaw = +y (left), roll = +z)
  for (let i = 0; i < 3; i++) if (Math.abs(A.cmd[i]) > 0.05) alpha[i] = clamp(A.cmd[i], -1, 1) * ALPHA * (S.nav.state === 'approach' ? 0.5 : 1);
  const rcsOk = S.comps.injector.hp > 0 && S.mass.rmass > 0;
  let used = 0;
  for (let i = 0; i < 3; i++) { if (!rcsOk) alpha[i] = 0; w[i] = clamp(w[i] + alpha[i] * dt, -WMAX, WMAX); used += Math.abs(alpha[i]); }
  A.q = qnorm(qmul(A.q, qaxis(vnorm(w), vlen(w) * dt)));
  if (vlen(w) < 1e-7) A.q = qnorm(A.q);
  S.mass.rmass = Math.max(0, S.mass.rmass - used * dt * 0.0004);
  A.rcs = used > 0.001 && (pilot || A.mode !== 'off');
  A.err = tgt ? angDeg(nose(A.q), tgt) : 0;
}
function rollSigned(q) {
  const n = nose(q), up = qrot(q, [0, 1, 0]), ref = [0, 1, 0];
  const r = vnorm([ref[0] - n[0] * dot(ref, n), ref[1] - n[1] * dot(ref, n), ref[2] - n[2] * dot(ref, n)]);
  const s = dot(cross(up, r), n);
  return Math.atan2(s, dot(up, r)); // rad, sign = which way to roll (about nose)
}

// Disturbance torque (hits, collisions)
export function kick(S, mag) {
  S.att.w = S.att.w.map((x) => clamp(x + rand(-mag, mag), -WMAX, WMAX));
}

// ---------- proximity operations (manual docking) ----------
export function startApproach(S) {
  S.nav.state = 'approach';
  S.prox = { p: [rand(-20, 20), rand(-15, 15), rand(170, 220)], v: [rand(-0.12, 0.12), rand(-0.12, 0.12), -rand(0.5, 0.9)], bumps: 0, t: 0 };
  // arrive slightly off-axis and rolled: the pilot must line up
  S.att.q = qnorm(qmul(qmul(qaxis([0, 1, 0], rand(-0.25, 0.25)), qaxis([1, 0, 0], rand(-0.2, 0.2))), qaxis([0, 0, 1], rand(-0.6, 0.6))));
  S.att.w = [rand(-0.004, 0.004), rand(-0.004, 0.004), rand(-0.006, 0.006)];
  S.att.mode = sasModes(S).includes('hold') ? 'hold' : 'off';
  S.drive.ignited = false; S.drive.cmdG = 0;
  log(S, 'Proximity operations: fly the docking port onto the station target. Main drive locked out. RCS only.', 'info');
  fx(S, 'chime');
}
export function updateProx(S, dt, onCapture, onCollide) {
  const P = S.prox, A = S.att;
  if (!P) return;
  P.t += dt;
  const rcsOk = S.comps.injector.hp > 0 && S.mass.rmass > 0;
  const t = A.tcmd.map((c) => clamp(c, -1, 1));
  const acc = rcsOk ? qrot(A.q, [t[0] * TACC, t[1] * TACC, -t[2] * TACC]) : [0, 0, 0];
  S.mass.rmass = Math.max(0, S.mass.rmass - (Math.abs(t[0]) + Math.abs(t[1]) + Math.abs(t[2])) * dt * 0.0006);
  for (let i = 0; i < 3; i++) { P.v[i] += acc[i] * dt; P.p[i] += P.v[i] * dt; }
  P.trans = t.some((x) => Math.abs(x) > 0.05);
  if (P.p[2] <= 0 && P.v[2] < 0) {
    const lateral = Math.hypot(P.p[0], P.p[1]), closing = -P.v[2];
    const ang = angDeg(nose(A.q), [0, 0, -1]), roll = rollErr(A.q);
    P.last = { lateral, closing, ang, roll };
    if (lateral < PORT_TOL.lateral && closing < PORT_TOL.speed && ang < PORT_TOL.angle && roll < PORT_TOL.roll) { P.p = [P.p[0], P.p[1], 0]; P.v = [0, 0, 0]; onCapture(P.last); return; }
    const hard = closing > 0.6 || lateral > 1.4;
    P.bumps++;
    P.p[2] = 0.3; P.v = [P.v[0] * 0.5 + rand(-0.05, 0.05), P.v[1] * 0.5 + rand(-0.05, 0.05), Math.max(0.08, closing * (hard ? 0.45 : 0.3))];
    kick(S, hard ? 0.02 : 0.006);
    onCollide(P.last, hard);
  }
}
