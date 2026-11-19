// Orbital mechanics around the body the ship is at: planar two-body physics, the stations and traffic that share
// the space, and the flight computer's plan for each phase (capture, parking, Hohmann transfer, intercept, escape).
// The physics runs in a scaled "map frame": the planet is OB.R metres across and gravity is strong enough that a low
// orbit takes about three minutes. Positions are shown scaled up to the real body (×DS); speeds and Δv are shown as
// they are. The orbit plane is x–y; prograde ships go anticlockwise.
import { WAYPOINTS } from './config.js';

export const TAU = Math.PI * 2;
export const OB = { R: 5000, mu: 7.2e8, soi: 40000, handD: 140, handV: 6 };
export const BODY = {
  luna: { name: 'Luna', km: 1737, atm: 0 },
  phobos: { name: 'Mars', km: 3390, atm: 0.03 },
  ceres: { name: 'Ceres', km: 470, atm: 0 },
  ganymede: { name: 'Ganymede', km: 2634, atm: 0 },
};
export const bodyOf = (wid) => BODY[wid] || BODY.luna;
// map metres → real kilometres for display
export const DSkm = (wid) => bodyOf(wid).km / OB.R;
export const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const wrap2 = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };
const len2 = (a) => Math.hypot(a[0], a[1]);
export const vcirc = (r) => Math.sqrt(OB.mu / r);
export const visViva = (r, a) => Math.sqrt(Math.max(0, OB.mu * (2 / r - 1 / a)));

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const TRAFFIC = [['MV Kestrel', 'freighter'], ['ISV Tamsin Oke', 'hauler'], ['Courier 7-Alder', 'courier'], ['FFG-41 Resolute', 'navy'], ['MV Long Patience', 'freighter'], ['Tug Okonkwo', 'hauler'], ['MV Saint Brendan', 'freighter']];
// stations and traffic in orbit around a waypoint's body (deterministic per game and leg)
export function bodyObjects(S, leg) {
  const wp = WAYPOINTS[leg], r = rng((S.seed || 7) * 977 + leg * 131), R = OB.R, o = [];
  o.push({ id: 'dock', name: wp.name.split(',')[0], kind: 'station', dock: true, a: R * (1.5 + 0.45 * r()), e: 0, w: 0, M0: r() * TAU });
  o.push({ id: 'relay', name: `${bodyOf(wp.id).name} Relay`, kind: 'relay', a: R * (2.5 + 0.6 * r()), e: 0, w: 0, M0: r() * TAU });
  const n = 2 + Math.floor(r() * 2), k0 = Math.floor(r() * TRAFFIC.length);
  for (let i = 0; i < n; i++) { const s = TRAFFIC[(k0 + i * 2) % TRAFFIC.length]; o.push({ id: 'tr' + i, name: s[0], kind: 'ship', hull: s[1], a: R * (1.3 + r() * 1.6), e: r() * 0.25, w: r() * TAU, M0: r() * TAU }); }
  return o;
}

function solveE(M, e) { let E = e < 0.8 ? M : Math.sign(M || 1) * Math.PI; for (let i = 0; i < 14; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return E; }
// position and velocity of an object on a fixed (elliptic) orbit at orbital time t
export function objState(o, t) {
  const n = Math.sqrt(OB.mu / o.a ** 3), E = solveE(wrapPi(o.M0 + n * t), o.e);
  const cE = Math.cos(E), sE = Math.sin(E), b = Math.sqrt(1 - o.e * o.e);
  const px = o.a * (cE - o.e), py = o.a * b * sE, rr = o.a * (1 - o.e * cE), k = Math.sqrt(OB.mu * o.a) / rr;
  const vx = -k * sE, vy = k * b * cE, c = Math.cos(o.w), s = Math.sin(o.w);
  return { r: [px * c - py * s, px * s + py * c], v: [vx * c - vy * s, vx * s + vy * c] };
}
export function objElements(o) { const p = o.a * (1 - o.e * o.e); return { e: o.e, w: o.w, s: 1, p, a: o.a, rp: o.a * (1 - o.e), ra: o.a * (1 + o.e) }; }

// conic elements from a state vector
export function elements(r, v) {
  const mu = OB.mu, rm = len2(r), v2 = v[0] * v[0] + v[1] * v[1], h = r[0] * v[1] - r[1] * v[0], s = h >= 0 ? 1 : -1;
  const rv = r[0] * v[0] + r[1] * v[1];
  const ex = ((v2 - mu / rm) * r[0] - rv * v[0]) / mu, ey = ((v2 - mu / rm) * r[1] - rv * v[1]) / mu;
  let e = Math.hypot(ex, ey); if (Math.abs(e - 1) < 1e-4) e = 1.0001;
  const w = e > 1e-6 ? Math.atan2(ey, ex) : Math.atan2(r[1], r[0]);
  const p = (h * h) / mu, en = v2 / 2 - mu / rm, a = -mu / (2 * en);
  const rp = p / (1 + e), ra = e < 1 ? p / (1 - e) : Infinity;
  const nu = wrapPi(s * (Math.atan2(r[1], r[0]) - w));
  let tp, n, period = Infinity;
  if (e < 1) { n = Math.sqrt(mu / a ** 3); period = TAU / n; const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2)); tp = (E - e * Math.sin(E)) / n; }
  else { n = Math.sqrt(mu / (-a) ** 3); const F = 2 * Math.atanh(Math.max(-0.999999, Math.min(0.999999, Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2)))); tp = (e * Math.sinh(F) - F) / n; }
  return { e, w, s, p, a, rp, ra, nu, tp, n, period, en, r: rm };
}
// seconds to the next periapsis / apoapsis (hyperbolic: negative once periapsis has passed)
export const tToPe = (el) => (el.e < 1 ? (el.tp <= 0 ? -el.tp : el.period - el.tp) : -el.tp);
export const tToAp = (el) => (el.e < 1 ? wrap2(((el.period / 2 - el.tp) / el.period) * TAU) / TAU * el.period : Infinity);
// position on the conic dt seconds from now
export function posAt(el, dt) {
  const M = el.n * (el.tp + dt); let nu;
  if (el.e < 1) { const E = solveE(wrapPi(M), el.e); nu = 2 * Math.atan(Math.sqrt((1 + el.e) / (1 - el.e)) * Math.tan(E / 2)); }
  else { let F = Math.asinh(M / el.e); for (let i = 0; i < 24; i++) F -= (el.e * Math.sinh(F) - F - M) / (el.e * Math.cosh(F) - 1); nu = 2 * Math.atan(Math.sqrt((el.e + 1) / (el.e - 1)) * Math.tanh(F / 2)); }
  return conicPt(el, nu);
}
export function conicPt(el, nu) { const r = el.p / (1 + el.e * Math.cos(nu)), th = el.w + el.s * nu; return [r * Math.cos(th), r * Math.sin(th)]; }
// state on a conic at true anomaly nu
export function stateOn(p, e, w, s, nu) {
  const r = p / (1 + e * Math.cos(nu)), th = w + s * nu, k = Math.sqrt(OB.mu / p);
  const vr = k * e * Math.sin(nu), vt = k * (1 + e * Math.cos(nu)) * s;
  const c = Math.cos(th), sn = Math.sin(th);
  return { r: [r * c, r * sn], v: [vr * c - vt * sn, vr * sn + vt * c] };
}
// points along a conic for drawing (hyperbolas clipped at rmax)
export function pathPts(el, N = 160, rmax = OB.soi) {
  let lo = -Math.PI, hi = Math.PI;
  if (el.e >= 1 || el.ra > rmax) {
    const c = (el.p / rmax - 1) / el.e, nuMax = Math.abs(c) <= 1 ? Math.acos(c) : el.e >= 1 ? Math.acos(-1 / el.e) - 0.02 : Math.PI;
    lo = -nuMax; hi = nuMax;
  }
  const out = [];
  for (let i = 0; i <= N; i++) out.push(conicPt(el, lo + ((hi - lo) * i) / N));
  return out;
}

// leapfrog integration of the ship, with a constant extra acceleration (thrust) over the step
export function stepShip(O, dt, acc) {
  const n = Math.max(1, Math.ceil(dt / 0.05)), h = dt / n, r = O.r, v = O.v;
  const g = () => { const d = Math.hypot(r[0], r[1]), k = -OB.mu / (d * d * d); return [k * r[0] + acc[0], k * r[1] + acc[1]]; };
  for (let i = 0; i < n; i++) {
    let a = g(); v[0] += a[0] * h / 2; v[1] += a[1] * h / 2;
    r[0] += v[0] * h; r[1] += v[1] * h;
    a = g(); v[0] += a[0] * h / 2; v[1] += a[1] * h / 2;
  }
  O.t += dt;
}
// the ship's local orbital frame: p prograde, q in-plane radial (outward side). Navball: -Z prograde, +Y radial out.
export function orbFrame(O) {
  const vm = len2(O.v) || 1, p = [O.v[0] / vm, O.v[1] / vm];
  let q = [-p[1], p[0]]; if (q[0] * O.r[0] + q[1] * O.r[1] < 0) q = [-q[0], -q[1]];
  return { p, q };
}
export function toLocal(O, u) { const { p, q } = orbFrame(O); const a = u[0] * p[0] + u[1] * p[1], b = u[0] * q[0] + u[1] * q[1], m = Math.hypot(a, b) || 1; return [0, b / m, -a / m]; }
export function fromLocal(O, l) { const { p, q } = orbFrame(O); return [-l[2] * p[0] + l[1] * q[0], -l[2] * p[1] + l[1] * q[1]]; }

// target data: range, relative speed, closing speed, and the closest approach over the coming orbit
export function targetInfo(O, el, id, horizon, noCA) {
  const o = O.objs.find((x) => x.id === id); if (!o) return null;
  const T = objState(o, O.t), dr = [T.r[0] - O.r[0], T.r[1] - O.r[1]], dv = [T.v[0] - O.v[0], T.v[1] - O.v[1]];
  const d = len2(dr), rel = len2(dv), closing = -(dr[0] * dv[0] + dr[1] * dv[1]) / (d || 1);
  if (noCA) return { o, T, d, rel, closing, dr, dv, ca: null };
  const H = horizon || (el.e < 1 ? Math.min(el.period * 1.2, 1500) : Math.max(30, Math.min(600, timeToR(el, OB.soi))));
  let best = { t: 0, d }, N = 240;
  for (let i = 1; i <= N; i++) { const t = (H * i) / N, a = posAt(el, t), b = objState(o, O.t + t).r, dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (dd < best.d) best = { t, d: dd }; }
  for (let k = 0, span = H / N; k < 2; k++, span /= 10) for (let i = -10; i <= 10; i++) { const t = Math.max(0, best.t + (span * i) / 10), a = posAt(el, t), b = objState(o, O.t + t).r, dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (dd < best.d) best = { t, d: dd }; }
  const sep = (t) => { const a = posAt(el, t), b = objState(o, O.t + t).r; return [a[0] - b[0], a[1] - b[1]]; };
  const s0 = sep(best.t + 0.25), s1 = sep(Math.max(0, best.t - 0.25)), vca = Math.hypot(s0[0] - s1[0], s0[1] - s1[1]) / (best.t >= 0.25 ? 0.5 : 0.25 + best.t);
  return { o, T, d, rel, closing, dr, dv, ca: { t: best.t, d: best.d, v: vca, ship: posAt(el, best.t), tgt: objState(o, O.t + best.t).r } };
}
// seconds until the ship's radius reaches r (outbound), or Infinity
export function timeToR(el, r) {
  if (el.e < 1 && el.ra < r) return Infinity;
  const c = (el.p / r - 1) / el.e; if (Math.abs(c) > 1) return Infinity;
  const nu = Math.acos(c);
  // time from periapsis at nu
  let tAt;
  if (el.e < 1) { const E = 2 * Math.atan(Math.sqrt((1 - el.e) / (1 + el.e)) * Math.tan(nu / 2)); tAt = (E - el.e * Math.sin(E)) / el.n; }
  else { const F = 2 * Math.atanh(Math.sqrt((el.e - 1) / (el.e + 1)) * Math.tan(nu / 2)); tAt = (el.e * Math.sinh(F) - F) / el.n; }
  const dt = tAt - el.tp;
  return dt >= 0 ? dt : el.e < 1 ? dt + el.period : Infinity;
}
// Hohmann transfer from a near-circular orbit at r0 to a circular target at rs: phase angle wanted at the burn,
// the time to that window, and the two burns
export function hohmann(O, el, o) {
  const r0 = el.r, rs = o.a, at = (r0 + rs) / 2;
  const want = Math.PI * (1 - Math.pow(at / rs, 1.5)); // target's lead over the ship at the burn
  const T = objState(o, O.t), phase = wrap2(Math.atan2(T.r[1], T.r[0]) - Math.atan2(O.r[1], O.r[0]));
  const ns = el.s * Math.sqrt(OB.mu / r0 ** 3), nt = Math.sqrt(OB.mu / rs ** 3), w = nt - ns; // phase changes at w
  let dt = wrapPi(want - phase) / w; const syn = Math.abs(TAU / w);
  if (dt < 0) dt += syn;
  return { want, phase, dt, syn, dv1: visViva(r0, at) - vcirc(r0), dv2: vcirc(rs) - visViva(rs, at), up: rs > r0, tof: Math.PI * Math.sqrt(at ** 3 / OB.mu) };
}
// the departure: where on the orbit to start the escape burn so the hyperbola leaves toward the next port
export const ESC_VINF = 120;
export function destAngle(leg) { const a = WAYPOINTS[leg].pos, b = WAYPOINTS[Math.min(leg + 1, WAYPOINTS.length - 1)].pos; return Math.atan2(b[1] - a[1], b[0] - a[0]); }
export function ejection(O, el, leg) {
  const r = el.r, e = 1 + (r * ESC_VINF * ESC_VINF) / OB.mu, nuInf = Math.acos(-1 / e), th = destAngle(leg);
  const burnAng = th - el.s * nuInf, cur = Math.atan2(O.r[1], O.r[0]);
  const ang = wrap2(el.s * (burnAng - cur)), wv = Math.sqrt(OB.mu / r ** 3);
  const dv = Math.sqrt(ESC_VINF * ESC_VINF + (2 * OB.mu) / r) - len2(O.v);
  return { th, burnAng, dt: ang / wv, dv, pt: [r * Math.cos(burnAng), r * Math.sin(burnAng)] };
}
// closest approach to object o over the next H seconds if the ship burned (dvP prograde, dvR radial) right now
export function caAfter(O, o, dvP, dvR, H, N = 90) {
  const { p, q } = orbFrame(O), v = [O.v[0] + dvP * p[0] + dvR * q[0], O.v[1] + dvP * p[1] + dvR * q[1]], el = elements(O.r, v);
  let best = { t: 0, d: Infinity };
  for (let i = 1; i <= N; i++) { const t = (H * i) / N, a = posAt(el, t), b = objState(o, O.t + t).r, d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d < best.d) best = { t, d }; }
  for (let i = -6; i <= 6; i++) { const t = Math.max(0.1, best.t + (H / N) * i / 6), a = posAt(el, t), b = objState(o, O.t + t).r, d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d < best.d) best = { t, d }; }
  return best;
}
// a correction burn (in the local frame) that brings the closest approach to the target down: a coarse-to-fine search
export function solveIntercept(O, o, H, M, wDv = 1.5) {
  let bp = 0, br = 0, bc = caAfter(O, o, 0, 0, H), bs = bc.d;
  for (let lvl = 0, span = M; lvl < 3; lvl++, span /= 3.5) {
    const cp = bp, cr = br;
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      const dp = cp + (span * i) / 4, dr = cr + (span * j) / 4, c = caAfter(O, o, dp, dr, H, 60), sc = c.d + wDv * Math.hypot(dp, dr);
      if (sc < bs) { bs = sc; bp = dp; br = dr; bc = c; }
    }
  }
  return { dvP: bp, dvR: br, dv: Math.hypot(bp, br), ca: bc };
}
