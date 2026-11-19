// Flying matters: orbital capture at periapsis, circularising, rendezvous with the station, docking slots,
// structural load limits, Sun-relative attitude (radiators, storm shielding), directional debris, burn scoring and
// the pilot's log. Host-side and pure (no three.js); the state is plain JSON like everything else.
import { WAYPOINTS, G0, SHIP, COMPS, EXT_DECK } from './config.js';
import { clamp, rand, chance, log, fx, msg } from './util.js';
import { qrot, qconj, nose, dot, vnorm, angDeg, sasModes } from './attitude.js';
import { OB, bodyOf, DSkm, bodyObjects, elements, objState, stepShip, orbFrame, toLocal, targetInfo, tToPe, tToAp, posAt, hohmann, ejection, solveIntercept, stateOn, visViva, vcirc, wrapPi, timeToR, ESC_VINF, destAngle } from './orbit.js';

export const CAP = { window: 30, lead: 150 };      // periapsis burn window ±s, seconds from capture start to periapsis
export const ORBIT = { period: 170, window: 25, ecc: 0.08, dvPerEcc: 900 };
export const RV = { start: 10000, handoff: 220, maxHandoffV: 3, slot: 540 };
export const STRAIN = { ring: 0.15, rad: 0.45, eva: 0.06 }; // g limits with the ring spinning / radiators out / crew outside

// ---------------- the Sun, seen from the ship ----------------
// inertial nav frame: -Z prograde (toward the current destination), +Y out of the ecliptic
export function shipHelio(S) {
  const N = S.nav, a = WAYPOINTS[N.leg].pos, b = WAYPOINTS[Math.min(N.leg + 1, WAYPOINTS.length - 1)].pos;
  const f = N.state === 'transit' ? clamp(N.x / N.L, 0, 1) : N.state === 'docked' ? 0 : 1;
  return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], a, b };
}
export function sunInertial(S) {
  const { p, a, b } = shipHelio(S);
  let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  const r = Math.hypot(p[0], p[1]) || 1, sx = -p[0] / r, sy = -p[1] / r;
  const nx = ty, ny = -tx; // in-ecliptic normal to the track: the nav frame's +X
  return { dir: vnorm([sx * nx + sy * ny, 0.08, -(sx * tx + sy * ty)]), au: r };
}
export function sunBody(S) { const s = sunInertial(S); return { dir: qrot(qconj(S.att.q), s.dir), au: s.au }; }
// Radiator wings lie in the ship's Y–Z plane (their faces look along ±X). Sunlight on a face heats it and kills its
// ability to dump heat; edge-on, or with the Sun dead ahead/astern, they work properly. Falls off with distance².
export function radiatorSunFactor(S) {
  const s = sunBody(S), face = Math.abs(s.dir[0]);
  return 1 - 0.55 * face * Math.min(1, 1 / (s.au * s.au));
}
// The shadow shield, the propellant tanks and the drive sit aft (+Z). Pointing the stern at the Sun puts all that
// mass between the crew and a proton storm.
export function stormShield(S) { const s = sunBody(S); return clamp(s.dir[2], 0, 1); }

// ---------------- orbits: capture, parking, transfer, intercept, escape (see orbit.js) ----------------
const bodyAt = (O) => bodyOf(WAYPOINTS[O.leg].id);
export const altKm = (O, r) => ((r - OB.R) * DSkm(WAYPOINTS[O.leg].id));
export const distKm = (O, d) => d * DSkm(WAYPOINTS[O.leg].id);
export function initOrb(S, leg) {
  S.orb = { leg, t: Math.round(rand(0, 4000)), r: [OB.R * 1.5, 0], v: [0, vcirc(OB.R * 1.5)], objs: bodyObjects(S, leg), tgt: 'dock', warp: 1, ph: 'park', used: 0, plan: null, loc: null };
  return S.orb;
}
// the drive's best usable acceleration for planning (structural limit, a modest cap so burns stay controllable)
export function aPlan(S) { return Math.max(0.3, Math.min(SHIP.thrust / ((SHIP.dry + Math.max(0, S.mass.rmass)) * 1000), safeG(S) * 0.95 * G0, 0.35 * G0)); }
const capRa = (O, el) => { const d = O.objs.find((o) => o.dock); return clamp(d ? d.a * 1.1 : el.rp * 1.6, el.rp * 1.25, OB.soi * 0.6); };
const capDv = (el, ra) => Math.sqrt(2 * (el.en + OB.mu / el.rp)) - visViva(el.rp, (el.rp + ra) / 2);
export function beginCapture(S) {
  const N = S.nav, D = S.drive, O = initOrb(S, N.leg + 1), B = bodyAt(O);
  const vInf = 80 + clamp(Math.abs(N.v) / 6000, 0, 1) * 150;
  const rp = OB.R * (rand(0.98, 1.6) + B.atm), e = 1 + (rp * vInf * vInf) / OB.mu, p = rp * (1 + e);
  const st = stateOn(p, e, rand(0, Math.PI * 2), 1, -Math.acos((p / (OB.soi * 0.97) - 1) / e));
  O.r = st.r; O.v = st.v;
  N.state = 'capture'; N.v = 0; D.ignited = false; D.cmdG = 0;
  const el = elements(O.r, O.v);
  N.cap = { t: 0, tPe: tToPe(el), dvNeed: Math.round(capDv(el, capRa(O, el))), dvEff: 0, dvUsed: 0, vInf: Math.round(vInf), firstBurn: null, lastBurn: null, bw: 0, bs: 0, en0: el.en };
  const dest = WAYPOINTS[N.leg + 1].name;
  log(S, `Entering ${B.name} space on a hyperbolic path: periapsis ${altKm(O, el.rp).toFixed(0)} km${el.rp < OB.R * (1.06 + B.atm) ? ' — TOO LOW, raise it with a radial-out burn' : ''}, in ${Math.round(N.cap.tPe)} s. CAPTURE BURN: retrograde about ${N.cap.dvNeed} m/s centred on periapsis. Watch it on the Navigation orbit map.`, el.rp < OB.R * (1.06 + B.atm) ? 'bad' : 'warn');
  fx(S, 'chime');
  pilotLeg(S).arrivalV = Math.round(vInf);
  void dest;
}
// efficiency of a retro burn t seconds from periapsis (kept for the pilot's log wording)
export const capEff = (dtPe) => Math.max(0.3, 1 - 0.45 * Math.pow(dtPe / 55, 2));

// The flight computer's plan for the current phase: what to burn, which way, and when. The autopilot flies it; the
// Navigation orbit map shows it to a human pilot. Phase changes (O.ph) happen here, on the host.
function burnStep(O, P, key, need, tTo, dv, A, mode, at) {
  P.mode = mode; P.dv = Math.max(0, Math.abs(dv)); P.at = at || null;
  const bt = P.dv / A;
  if (!need) { if (O.bk === key) O.bk = null; return false; }
  if (O.bk === key) { O.bkT = (O.bkT || 0) + 1; if (O.bkT > 20 * (3 * bt + 25)) { O.bk = null; return false; } P.burn = true; P.tBurn = 0; return true; }
  P.tBurn = Math.max(0, tTo - bt / 2);
  if (tTo <= bt / 2 + 0.3) { O.bk = key; O.bkT = 0; P.burn = true; return true; }
  return false;
}
export function orbitPlan(S, el) {
  const N = S.nav, O = S.orb, B = bodyAt(O), A = aPlan(S), R = OB.R, safeR = R * (1.06 + B.atm), raiseR = R * (1.14 + B.atm);
  const P = { step: '', text: '', mode: null, burn: false, tBurn: Infinity, dv: 0, at: null, xfer: null };
  const km = (r) => `${altKm(O, r).toFixed(0)} km`, T = (t) => (isFinite(t) ? `T−${Math.max(0, Math.ceil(t))} s` : '—');
  const raisePe = (key) => { // prograde at apoapsis
    const dv = visViva(el.ra, (el.ra + raiseR) / 2) - visViva(el.ra, el.a);
    burnStep(O, P, key, el.rp < raiseR, tToAp(el), dv, A, 'pro', posAt(el, tToAp(el)));
    P.step = 'raise'; P.text = `PERIAPSIS ${km(el.rp)}${el.rp < R ? ' — ON A COLLISION COURSE' : B.atm && el.rp < R * (1 + B.atm) ? ' — inside the atmosphere' : ' — dangerously low'}. Burn PROGRADE ${P.dv.toFixed(0)} m/s at apoapsis (${T(P.tBurn)}).`;
  };
  if (N.state === 'capture') {
    const tPe = tToPe(el);
    if (el.rp < safeR && tPe > 15 && O.bk !== 'cap') {
      burnStep(O, P, 'rad', el.rp < raiseR, 0, 20, A, 'radout');
      P.step = 'raise'; P.text = `PERIAPSIS ${km(el.rp)}${el.rp < R ? ' — IMPACT COURSE' : ' — too low'}. Burn RADIAL OUT now to raise it (${Math.ceil(tPe)} s to periapsis).`;
      return P;
    }
    const raT = capRa(O, el), dv = capDv(el, raT);
    burnStep(O, P, 'cap', el.e >= 1 || el.ra > raT * 1.03, tPe, dv, A, 'retro', posAt(el, Math.max(0, tPe)));
    P.step = 'capture'; P.text = `CAPTURE: burn RETROGRADE ${P.dv.toFixed(0)} m/s centred on periapsis (${km(el.rp)}). ${P.burn ? 'BURNING' : 'Start ' + T(P.tBurn)}.`;
    return P;
  }
  if (N.state === 'depart') {
    const vinf = el.en > 0 ? Math.sqrt(2 * el.en) : 0, E = ejection(O, el, O.leg);
    if (vinf < ESC_VINF * 0.97 || O.bk === 'eject') {
      const dv = O.bk === 'eject' ? Math.max(0.5, ESC_VINF - vinf) : E.dv;
      burnStep(O, P, 'eject', vinf < ESC_VINF, E.dt, dv, A, 'pro', E.pt);
      P.step = 'eject'; P.text = `ESCAPE BURN: PROGRADE ${P.dv.toFixed(0)} m/s at the ejection mark (${P.burn ? 'BURNING' : T(P.tBurn)}), so the hyperbola leaves toward ${WAYPOINTS[O.leg + 1].name.split(',')[0]}.`;
    } else {
      const outAng = el.w + el.s * Math.acos(-1 / el.e), err = Math.abs(wrapPi(outAng - E.th)) * 180 / Math.PI;
      P.step = 'escape'; P.tBurn = Infinity; P.err = err;
      P.text = `ESCAPING ${B.name}: leaving its sphere of influence in ${T(timeToR(el, OB.soi))}. Heading error ${err.toFixed(0)}°${err > 20 ? ' — a late burn: the trip will be longer' : ''}.`;
    }
    return P;
  }
  // parking orbit → intercept the port
  let I = targetInfo(O, el, 'dock', 1, true); if (!I) return P;
  if (!O.caC || Math.abs(O.t - O.caC.t) > (O.caC.v !== O.used ? 0.15 : 0.5)) { const F = targetInfo(O, el, 'dock'); O.caC = { t: O.t, v: O.used, ca: F.ca }; }
  I.ca = { ...O.caC.ca, t: Math.max(0, O.caC.ca.t - (O.t - O.caC.t)) };
  const o = I.o, rs = o.a, H = OB.handD;
  P.ca = I.ca;
  if (I.d < H && I.rel < OB.handV) { P.step = 'zone'; P.text = `Inside ${o.name} control zone (${distKm(O, I.d).toFixed(0)} km, ${I.rel.toFixed(1)} m/s). Traffic control is handing over the final approach.`; return P; }
  if ((el.rp < R * (1.02 + B.atm) && tToPe(el) < 70 && tToPe(el) > 2) || O.bk === 'erad') { // about to hit the ground or the air: radial out, now
    burnStep(O, P, 'erad', el.rp < R * (1.07 + B.atm), 0, 10, A, 'radout');
    P.step = 'raise'; P.text = `PERIAPSIS ${km(el.rp)} — ${el.rp < R ? 'COLLISION COURSE' : 'into the atmosphere'} in ${T(tToPe(el))}. Burn RADIAL OUT now!`; return P;
  }
  if (el.rp < safeR && O.ph === 'park') { raisePe('rpe'); return P; }
  if (I.d < 6 * H && ['park', 'xfer', 'coast'].includes(O.ph)) O.ph = 'match';
  if (I.d > 25 * H && O.ph === 'close' && !O.node) O.ph = 'park';
  const rPark = rs * 0.8 >= R * (1.15 + B.atm) ? rs * 0.8 : rs * 1.25;
  if (O.ph === 'park') {
    if (el.rp < 0.95 * rPark && el.ra >= 0.95 * rPark) { burnStep(O, P, 'p1', el.rp < 0.985 * rPark, tToAp(el), visViva(el.ra, (el.ra + rPark) / 2) - visViva(el.ra, el.a), A, 'pro', posAt(el, tToAp(el))); P.text = `PARKING ORBIT: raise periapsis — PROGRADE ${P.dv.toFixed(0)} m/s at apoapsis (${P.burn ? 'BURNING' : T(P.tBurn)}).`; }
    else if (el.ra < 0.95 * rPark) { burnStep(O, P, 'p2', el.ra < 0.985 * rPark, tToPe(el), visViva(el.rp, (el.rp + rPark) / 2) - visViva(el.rp, el.a), A, 'pro', posAt(el, tToPe(el))); P.text = `PARKING ORBIT: raise apoapsis — PROGRADE ${P.dv.toFixed(0)} m/s at periapsis (${P.burn ? 'BURNING' : T(P.tBurn)}).`; }
    else if (el.rp > 1.05 * rPark) { burnStep(O, P, 'p3', el.rp > 1.015 * rPark, tToAp(el), visViva(el.ra, el.a) - visViva(el.ra, (el.ra + rPark) / 2), A, 'retro', posAt(el, tToAp(el))); P.text = `PARKING ORBIT: lower periapsis — RETROGRADE ${P.dv.toFixed(0)} m/s at apoapsis (${P.burn ? 'BURNING' : T(P.tBurn)}).`; }
    else if (el.ra > 1.05 * rPark) { burnStep(O, P, 'p4', el.ra > 1.015 * rPark, tToPe(el), visViva(el.rp, el.a) - visViva(el.rp, (el.rp + rPark) / 2), A, 'retro', posAt(el, tToPe(el))); P.text = `PARKING ORBIT: lower apoapsis — RETROGRADE ${P.dv.toFixed(0)} m/s at periapsis (${P.burn ? 'BURNING' : T(P.tBurn)}).`; }
    else {
      const Hm = hohmann(O, el, o), at = posAt(el, Hm.dt), wb = Math.atan2(at[1], at[0]), a2 = (el.r + rs) / 2, e2 = Math.abs(rs - el.r) / (rs + el.r);
      P.xfer = { e: e2, p: a2 * (1 - e2 * e2), w: Hm.up ? wb : wb + Math.PI, s: 1, a: a2, half: true, up: Hm.up };
      if (burnStep(O, P, 'xfer', true, Hm.dt, Hm.dv1, A, Hm.up ? 'pro' : 'retro', at)) { O.ph = 'xfer'; O.corr = O.corr2 = 0; O.node = null; }
      P.text = `TRANSFER WINDOW ${P.burn ? 'NOW' : T(P.tBurn)}: ${Hm.up ? 'PROGRADE' : 'RETROGRADE'} ${Math.abs(Hm.dv1).toFixed(0)} m/s at the mark, then ${Math.abs(Hm.dv2).toFixed(0)} m/s to match at ${o.name} (phase ${(Hm.phase * 180 / Math.PI).toFixed(0)}°, want ${(Hm.want * 180 / Math.PI).toFixed(0)}°).`;
    }
    P.step = 'park';
    if (P.text.startsWith('PARKING')) P.text += ` Target: circular at ${km(rPark)}.`;
    return P;
  }
  if (O.ph === 'xfer') {
    const up = rs > el.rp * 1.01 && !(el.rp > rs);
    const done = up ? el.ra >= rs : el.rp <= rs;
    O.bk = 'xfer'; burnStep(O, P, 'xfer', !done, 0, up ? visViva(el.rp, (el.rp + rs) / 2) - visViva(el.rp, el.a) : visViva(el.ra, el.a) - visViva(el.ra, (el.ra + rs) / 2), A, up ? 'pro' : 'retro');
    if (done) { O.ph = 'coast'; O.up = up; }
    P.step = 'xfer'; P.text = `TRANSFER BURN: ${up ? 'PROGRADE until apoapsis' : 'RETROGRADE until periapsis'} reaches ${o.name}'s orbit (${km(rs)}).`;
    return P;
  }
  // a correction burn on the node: point SAS "Maneuver" and burn the planned Δv
  const nodeStep = (what) => {
    const nd = O.node; P.mode = 'node'; P.dv = nd.left; P.burn = S.att.err < 30 || O.bk === 'node'; O.bk = 'node'; P.tBurn = 0;
    P.text = `${what}: CORRECTION BURN ${nd.left.toFixed(1)} m/s — point SAS MANEUVER (${nd.dvP >= 0 ? '+' : ''}${nd.dvP.toFixed(1)} pro, ${nd.dvR >= 0 ? '+' : ''}${nd.dvR.toFixed(1)} radial). Closest approach after: ${distKm(O, nd.ca).toFixed(0)} km.`;
  };
  const plotNode = (Hh, M) => { if (O.t - (O.nodeTry || -99) < 3) return false; O.nodeTry = O.t; const sol = solveIntercept(O, o, Hh, M); if (sol.dv > 0.3 && sol.ca.d < I.ca.d * 0.8) { O.node = { dvP: sol.dvP, dvR: sol.dvR, left: sol.dv, ca: sol.ca.d, t: sol.ca.t }; return true; } return false; };
  if (O.ph === 'coast') {
    const up = O.up !== false, tArr = up ? tToAp(el) : tToPe(el);
    if (O.node) { nodeStep('COAST'); return P; }
    if (!O.corr && I.ca.d > 0.5 * H) { O.corr = 1; if (plotNode(Math.min(el.period || 600, tArr * 1.6 + 30), 25)) { nodeStep('COAST'); return P; } }
    if (I.ca.d > 30 * H && tArr > 20 && !O.corr2) { O.corr2 = 1; O.corr = 0; }
    P.mode = 'tret'; P.dv = I.rel; P.at = I.ca.ship;
    P.tBurn = Math.max(0, I.ca.t - I.ca.v / (A * 0.6) / 2 - 4);
    if ((P.tBurn <= 0 && I.ca.d < 15 * H) || I.d < 2 * H) O.ph = 'match';
    else if (P.tBurn <= 0 && tArr > 20) O.ph = 'park';
    P.step = 'coast'; P.text = `COAST — closest approach to ${o.name}: ${distKm(O, I.ca.d).toFixed(0)} km in ${T(I.ca.t)}. Then MATCH VELOCITY (SAS Target-retro, ${I.rel.toFixed(0)} m/s).`;
    return P;
  }
  if (O.ph === 'match') {
    if (I.d > 25 * H && O.bk !== 'match') { O.ph = 'park'; O.corr = O.corr2 = 0; return P; }
    // brake along a stopping profile, so the relative velocity runs out as we reach the control zone
    const vAllow = Math.sqrt(2 * A * 0.6 * Math.max(0, I.d - 0.6 * H)) + 0.6;
    const need = I.rel > (O.bk === 'match' ? vAllow * 0.75 : vAllow);
    burnStep(O, P, 'match', need, 0, Math.max(0.3, I.rel - vAllow * 0.75), A, 'tret');
    if (!need && I.d > H && (I.closing < 0.5 || I.ca.d > 0.6 * H)) { O.ph = 'close'; O.node = null; }
    P.step = 'match'; P.text = `BRAKE: point TARGET-RETRO and burn down to ${vAllow.toFixed(1)} m/s (now ${I.rel.toFixed(1)} m/s). Range ${distKm(O, I.d).toFixed(0)} km.`;
    return P;
  }
  if (O.ph === 'close') {
    if (O.node) { nodeStep('CLOSE IN'); return P; }
    const Hh = clamp(I.d / 6, 25, 120);
    if (I.ca.d > 0.4 * H || I.ca.t > Hh) { if (plotNode(Hh, clamp((I.d / Hh) * 2.5, 2, 40))) { nodeStep('CLOSE IN'); return P; } }
    P.mode = 'tret'; P.dv = I.rel; P.at = I.ca.ship;
    const stop = (I.rel * I.rel) / (2 * A * 0.6) + 0.8 * H; P.tBurn = I.closing > 0.3 ? Math.max(0, (I.d - stop) / I.closing) : 0;
    if (I.closing > 0.3 && I.d <= stop) O.ph = 'match';
    P.step = 'close'; P.text = `CLOSING on ${o.name}: ${distKm(O, I.d).toFixed(0)} km, closest approach ${distKm(O, I.ca.d).toFixed(0)} km in ${T(I.ca.t)}. Then brake (TARGET-RETRO).`;
    return P;
  }
  O.ph = 'park'; return P;
}

function updateOrbital(S, dt, aAcc, auto, hooks) {
  const N = S.nav, D = S.drive, O = S.orb;
  const B = bodyAt(O), nz = nose(S.att.q), { p, q } = orbFrame(O), a = D.ignited ? aAcc : 0;
  stepShip(O, dt, [a * (-nz[2] * p[0] + nz[1] * q[0]), a * (-nz[2] * p[1] + nz[1] * q[1])]);
  O.used += a * dt;
  // the atmosphere (aerobraking, and heating) and the ground
  let rm = Math.hypot(O.r[0], O.r[1]);
  if (B.atm && rm < OB.R * (1 + B.atm)) {
    const depth = clamp(1 - (rm - OB.R) / (OB.R * B.atm), 0, 1), k = 0.025 * depth * dt;
    O.v[0] *= 1 - k; O.v[1] *= 1 - k; S.hull = Math.max(0, S.hull - 0.6 * depth * dt);
    if (!O.aero) { O.aero = 1; log(S, `AEROBRAKING in the upper atmosphere of ${B.name}: drag is slowing us, and heating the hull.`, 'warn'); fx(S, 'alarm', { kind: 'warn' }); }
  } else O.aero = 0;
  if (rm < OB.R * 1.004) {
    hooks.applyHit(S, 40, { label: 'Surface graze' }); S.hull = Math.max(0, S.hull - 12);
    const k = (OB.R * 1.15) / rm; O.r = [O.r[0] * k, O.r[1] * k]; const v = vcirc(OB.R * 1.15), rr = Math.hypot(O.r[0], O.r[1]);
    O.v = [(-O.r[1] / rr) * v, (O.r[0] / rr) * v]; rm = OB.R * 1.15;
    log(S, `SURFACE GRAZE on ${B.name}! The hull scraped the ground; emergency burn into a low orbit. Check for damage.`, 'bad'); fx(S, 'alarm', { kind: 'bad' });
    if (N.state === 'capture') { N.state = 'orbit'; O.ph = 'park'; N.cap = null; }
  }
  if (O.node && D.ignited && S.att.mode === 'node') { O.node.left -= a * dt * Math.max(0, Math.cos((S.att.err * Math.PI) / 180)); if (O.node.left <= 0.05) { O.node = null; O.bk = null; D.ignited = false; D.cmdG = 0; if (O.ph === 'close') O.ph = 'close'; } }
  const el = elements(O.r, O.v);
  N.ecc = el.e; N.peT = tToPe(el);
  // target pointing for SAS (navball frame)
  const I = O.tgt ? targetInfo(O, el, O.tgt, 1, true) : null;
  O.loc = I ? { tret: I.rel > 0.05 ? toLocal(O, I.dv) : null, tlos: toLocal(O, I.dr) } : {};
  if (O.node) { const m = Math.hypot(O.node.dvP, O.node.dvR) || 1; O.loc.node = [0, O.node.dvR / m, -O.node.dvP / m]; }
  if (N.state === 'capture' && N.cap) {
    const C = N.cap; C.t = 0; C.tPe = tToPe(el); C.dvUsed += a * dt;
    if (a > 0) { const tr = -C.tPe; C.bw += a * dt; C.bs += a * dt * tr; if (C.firstBurn === null) C.firstBurn = tr; C.lastBurn = tr; }
    const enT = -OB.mu / (el.rp + capRa(O, el)); C.dvEff = C.dvNeed * clamp((C.en0 - el.en) / Math.max(1, C.en0 - enT), 0, 1.3);
    if (el.e < 1 && (el.ra < OB.soi * 0.85 || (rm > OB.soi * 0.8 && !D.ignited))) {
      const L = pilotLeg(S), used = Math.round(C.dvUsed);
      L.capture = { need: C.dvNeed, used, eff: Math.round(C.dvNeed * Math.min(1, C.dvNeed / Math.max(1, used))), centre: C.bw > 0 ? Math.round(C.bs / C.bw) : null };
      N.state = 'orbit'; O.ph = 'park'; N.cap = null; D.ignited = false; D.cmdG = 0; O.bk = null;
      log(S, `CAPTURED into a ${altKm(O, el.rp).toFixed(0)} × ${altKm(O, el.ra).toFixed(0)} km orbit of ${B.name}, ${used} m/s spent. Plan the intercept with ${WAYPOINTS[O.leg].name.split(',')[0]} on the Navigation orbit map.`, 'good');
      fx(S, 'chime');
    } else if (rm > OB.soi && el.e >= 1 && O.r[0] * O.v[0] + O.r[1] * O.v[1] > 0) {
      // missed: we fly out past the planet; turning round costs hours and reaction mass, then we come in again
      const vIn = C.vInf; S.mass.rmass = Math.max(0, S.mass.rmass - 60); S.gameTime += 8 * 3600; D.ignited = false; D.cmdG = 0;
      pilotLeg(S).missedCapture = (pilotLeg(S).missedCapture || 0) + 1;
      log(S, `CAPTURE FAILED — we swung past ${B.name} and climbed back out of its gravity. Eight hours and 60 t of reaction mass to turn round for another pass.`, 'bad');
      fx(S, 'alarm', { kind: 'warn' });
      N.v = vIn * 20; beginCapture(S);
      return;
    }
  }
  if (N.state === 'depart' && rm > OB.soi) { finishDeparture(S, el); return; }
  const P = (O.plan = orbitPlan(S, el));
  // the port's control zone: traffic control takes over for the final approach
  if (N.state === 'orbit' && P.step === 'zone' && !S.tutorial) {
    if (N.holdT > 0) { if (!O.holdMsg) { O.holdMsg = 1; msg(S, 'Traffic control', `Wolfram, hold position for ${Math.ceil(N.holdT)} s.`); } }
    else if (N.trafficLate) { N.trafficLate = false; N.holdT = 120; log(S, 'Traffic control: no flight plan on file for Wolfram. Hold 2 minutes for slot allocation.', 'warn'); }
    else { const I2 = targetInfo(O, el, 'dock', 1, true); O.holdMsg = 0; D.ignited = false; D.cmdG = 0; beginRendezvous(S, I2.d, I2.closing); return; }
  }
  if (auto) {
    if (P.mode && S.att.mode !== P.mode && (P.burn || P.tBurn < 45) && sasModes(S).includes(P.mode)) S.att.mode = P.mode;
    const A = aPlan(S);
    if (P.burn && S.att.err < 3 && S.mass.rmass > 0) { D.ignited = true; D.cmdG = clamp(P.dv / (G0 * 1.2), 0.004, A / G0); }
    else if (D.ignited) { D.ignited = false; D.cmdG = 0; }
    O.warp = P.burn || S.att.err > 5 || S.enc ? 1 : P.tBurn > 90 ? 10 : P.tBurn > 30 ? 5 : 1;
  } else if (O.warp > 1 && P.tBurn < 10) { O.warp = 1; log(S, 'Time compression off: burn window coming up.', 'info'); }
}
// keep the ship on the station's orbit while traffic control flies the last kilometres, and while docked
function trackStation(S, dt) {
  const O = S.orb; if (!O) return;
  O.t += dt; const d = O.objs.find((o) => o.dock); if (!d) return;
  const st = objState(d, O.t); O.r = st.r; O.v = st.v; O.plan = null; O.loc = null;
}
function finishDeparture(S, el) {
  const N = S.nav, O = S.orb, B = bodyAt(O), th = destAngle(O.leg);
  const outAng = Math.atan2(O.v[1], O.v[0]), err = Math.abs(wrapPi(outAng - th)), vinf = Math.sqrt(Math.max(0, 2 * el.en));
  const pen = 0.4 * (1 - Math.cos(err)) / 2 + (vinf < ESC_VINF * 0.8 ? 0.05 : 0);
  N.L *= 1 + pen; N.state = 'transit'; N.x = 0; N.v = Math.cos(err) * vinf * 12; S.orb = null; S.drive.ignited = false; S.drive.cmdG = 0;
  pilotLeg(S).eject = Math.round((err * 180) / Math.PI);
  log(S, `Left ${B.name}'s sphere of influence. Departure heading ${(err * 180 / Math.PI).toFixed(0)}° off${pen > 0.02 ? ` — the trip is ${Math.round(pen * 100)}% longer` : ' — a clean ejection'}. Interplanetary transit: burn prograde toward ${WAYPOINTS[O.leg + 1].name.split(',')[0]}.`, pen > 0.05 ? 'warn' : 'good');
  fx(S, 'chime');
}
// undocking: the ship drifts off the port, on the station's orbit, and must burn out of the planet's gravity
export function beginDeparture(S) {
  const O = initOrb(S, S.nav.leg); O.tgt = null; O.ph = 'eject';
  const d = O.objs.find((o) => o.dock), st = objState(d, O.t);
  O.r = [st.r[0] * 0.9995, st.r[1] * 0.9995]; O.v = [...st.v];
  S.nav.state = 'depart';
}

// ---------------- rendezvous: close 10 km to the station's hold point ----------------
export function beginRendezvous(S, dSim, vClose) {
  const N = S.nav;
  N.state = 'rendezvous';
  N.rv = { d: dSim === undefined ? RV.start + rand(-800, 1500) : RV.start * clamp(dSim / OB.handD, 0.6, 1.2), vc: vClose === undefined ? rand(-3, 4) : clamp(vClose, -1, 5), t: 0, used: 0 };
  N.slotT = RV.slot; // traffic control's window: be at soft capture before it closes
  S.drive.ignited = false; S.drive.cmdG = 0;
  if (S.att.mode === 'off' || S.att.mode === 'hold') { /* the pilot points it */ }
  log(S, `Approach slot granted: ${WAYPOINTS[N.leg + 1].name.split(',')[0]} traffic control expects soft capture within ${Math.round(RV.slot / 60)} min. Inside the control zone: station ${(N.rv.d / 1000).toFixed(1)} km ahead. Burn toward it (prograde), coast, then brake (retro) to arrive at the 200 m hold point below ${RV.maxHandoffV} m/s.`, 'info');
  fx(S, 'chime');
}
// a safe closing speed for the remaining distance with a gentle brake
export const rvSafe = (d) => Math.sqrt(2 * 0.35 * Math.max(0, d - RV.handoff)) + 0.5;
function updateRendezvous(S, dt, dvAlong, auto, startApproach) {
  const N = S.nav, R = N.rv, D = S.drive;
  R.t += dt;
  R.vc += dvAlong; R.used += Math.abs(dvAlong);
  R.d -= R.vc * dt;
  if (auto) {
    // conservative profile: half the safe speed, cruising no faster than 22 m/s; a human can do it quicker
    const want = Math.min(22, rvSafe(R.d) * 0.55);
    const err = want - R.vc;
    // hysteresis: coast inside ±1.5 m/s, so it doesn't flip end over end chasing small errors
    if (Math.abs(err) > (R.burning ? 0.3 : 1.5)) {
      const mode = err >= 0 ? 'pro' : 'retro';
      if (S.att.mode !== mode) S.att.mode = mode;
      R.burning = true;
      if (S.att.err < 4) { D.ignited = true; D.cmdG = clamp(Math.abs(err) / 9.81 / 2, 0.01, 0.06); } else D.cmdG = 0;
    } else { R.burning = false; D.cmdG = 0; D.ignited = false; if (R.d < 3000 && S.att.mode !== 'retro') S.att.mode = 'retro'; }
  }
  if (R.d <= RV.handoff) {
    if (R.vc <= RV.maxHandoffV && R.vc > -1) {
      const L = pilotLeg(S); L.rendezvous = { t: Math.round(R.t), used: Math.round(R.used) };
      D.ignited = false; D.cmdG = 0;
      const d = R.d, v = R.vc;
      startApproach(S);
      if (S.prox) { S.prox.p[2] = Math.max(120, d); S.prox.v[2] = -Math.max(0.15, Math.min(0.9, v * 0.3)); }
      N.rv = null;
      log(S, `Hold point reached in ${Math.round(R.t / 60)} min ${Math.round(R.t % 60)} s, ${R.used.toFixed(0)} m/s spent.`, 'good');
    } else if (R.vc > RV.maxHandoffV) {
      // too hot: traffic waves you off; you sail past and have to come back round
      R.d = 1600; R.vc = -Math.min(12, R.vc * 0.4);
      log(S, `WAVE-OFF: closing at ${R.vc ? Math.abs(R.vc / 0.4).toFixed(1) : '?'} m/s at the hold point. Station traffic: "Wolfram, you are too fast, abort and go around." Brake earlier.`, 'bad');
      fx(S, 'alarm', { kind: 'warn' });
      pilotLeg(S).waveOffs = (pilotLeg(S).waveOffs || 0) + 1;
    }
  }
  if (R && R.d > 30000) { R.d = 30000; R.vc = Math.max(R.vc, 0); }
}
// traffic-control slot: from rendezvous until soft capture
function updateSlot(S, dt) {
  const N = S.nav;
  if (N.slotT === undefined || N.slotT === null) return;
  if (N.state !== 'rendezvous' && N.state !== 'approach') { N.slotT = null; return; }
  N.slotT -= dt;
  if (N.slotT <= 60 && (N.slotWarn || 0) < 1) { N.slotWarn = 1; msg(S, 'Traffic control', 'Wolfram, one minute left on your approach slot.'); }
  if (N.slotT <= 0) {
    N.slotT = null; N.slotWarn = 0;
    N.state = 'orbit'; N.rv = null; S.prox = null;
    if (S.orb) { const O = S.orb, d = O.objs.find((o) => o.dock), th = Math.atan2(O.r[1], O.r[0]) - 0.9, r = d.a * 0.85, v = vcirc(r); O.r = [r * Math.cos(th), r * Math.sin(th)]; O.v = [-v * Math.sin(th), v * Math.cos(th)]; O.ph = 'park'; O.bk = null; }
    N.holdT = 90; S.credits = Math.max(0, S.credits - 5);
    log(S, 'APPROACH SLOT LOST. Traffic control sends us back to the parking orbit: 90 s hold, 5 credit fee. Request a new slot when cleared.', 'bad');
    pilotLeg(S).slotsLost = (pilotLeg(S).slotsLost || 0) + 1;
  }
}

// ---------------- structural loads under thrust ----------------
export function strainLimits(S) {
  const why = [];
  if ((S.ring && (S.ring.g > 0.03 || S.ring.target > 0))) why.push({ k: 'ring', lim: STRAIN.ring, text: 'centrifuge spinning' });
  if (S.heat.radExt) why.push({ k: 'rad', lim: STRAIN.rad, text: 'radiators deployed' });
  if (Object.values(S.players).some((p) => p.connected && p.state === 'alive' && p.deck === EXT_DECK && !p.pod)) why.push({ k: 'eva', lim: STRAIN.eva, text: 'crew on EVA' });
  return why;
}
export function safeG(S) { return strainLimits(S).reduce((m, w) => Math.min(m, w.lim), 9); }
function updateStrain(S, dt) {
  const g = S.drive.ignited ? S.drive.g : 0;
  const lims = strainLimits(S);
  let over = 0, worst = null;
  for (const w of lims) { const o = Math.max(0, g / w.lim - 1); if (o > over) { over = o; worst = w; } }
  S.strain = S.strain || { v: 0, warn: 0 };
  const T = S.strain;
  T.v = clamp(T.v + (over > 0 ? over * 0.09 : -0.05) * dt, 0, 1.2);
  T.why = worst ? worst.text : '';
  if (T.v > 0.45 && T.warn < 1) { T.warn = 1; log(S, `STRUCTURAL LOAD: ${worst ? worst.text : 'excess thrust'} at ${g.toFixed(2)} g. Cut thrust or ${worst && worst.k === 'ring' ? 'despin the ring' : worst && worst.k === 'rad' ? 'retract the radiators' : 'get the crew inside'}.`, 'warn'); fx(S, 'alarm', { kind: 'warn' }); }
  if (T.v < 0.2) T.warn = 0;
  if (T.v >= 1 && worst) {
    // something gives
    if (chance(dt * 0.6)) {
      if (worst.k === 'ring') { S.comps.centrifuge.hp = Math.max(0, S.comps.centrifuge.hp - rand(4, 9)); S.ring.wear = Math.min(1, (S.ring.wear || 0) + 0.04); log(S, 'Ring bearing groaning under side load — centrifuge damaged', 'bad'); }
      else if (worst.k === 'rad') { const id = chance(0.5) ? 'radA' : 'radB'; S.comps[id].hp = Math.max(0, S.comps[id].hp - rand(6, 12)); log(S, `${COMPS[id].name}: hinge overstressed under thrust`, 'bad'); }
      else for (const p of Object.values(S.players)) if (p.deck === EXT_DECK && p.state === 'alive' && !p.pod) p.hp -= rand(6, 12);
      fx(S, 'hit', { deck: 2, power: 0.15 });
    }
  }
}

// ---------------- debris: a directional stream and the odd big rock to dodge ----------------
// exposure of the ship to a stream arriving from inertial direction `from`: stern-on hides behind the shadow shield
// and tanks, nose-on is a small target, broadside is worst
export function streamExposure(S, from) {
  const b = qrot(qconj(S.att.q), from);
  return clamp(1 - 0.8 * Math.max(0, b[2]) - 0.45 * Math.max(0, -b[2]), 0.15, 1);
}
export function startChunk(S) {
  const from = vnorm([rand(-1, 1), rand(-0.6, 0.6), rand(-1, -0.2)]);
  S.effects.chunk = { t: rand(32, 45), from, need: 1.6, got: 0, size: Math.round(rand(8, 25)) };
  log(S, `COLLISION WARNING: ${S.effects.chunk.size} m rock on an intercept course, impact in ${Math.round(S.effects.chunk.t)} s. Get ${S.effects.chunk.need} m/s sideways: translate with the RCS at the helm, or burn off-axis.`, 'bad');
  fx(S, 'alarm', { kind: 'warn' });
}
function updateChunk(S, dt, latDv, applyHit) {
  const C = S.effects.chunk;
  if (!C) return;
  C.t -= dt; C.got += latDv;
  if (C.got >= C.need) { S.effects.chunk = null; log(S, 'Rock passes clear. Nice flying.', 'good'); pilotLeg(S).dodges = (pilotLeg(S).dodges || 0) + 1; return; }
  if (C.t <= 0) {
    S.effects.chunk = null;
    const k = clamp(1 - C.got / C.need, 0.2, 1);
    applyHit(S, 30 + 40 * k, { label: 'Rock strike', fireP: 0.2, breachP: 0.9, extBias: 0.3 });
    applyHit(S, 15 * k, { label: 'Rock fragments', fireP: 0, breachP: 0.4, extBias: 0.6 });
    pilotLeg(S).rockHits = (pilotLeg(S).rockHits || 0) + 1;
  }
}

// ---------------- burn advice (manual mode) and burn scoring ----------------
// The autopilot computes what it would do; in manual mode it only advises and a human flies it.
export function burnAdvice(S) { return S.nav.advice || null; }
function scoreBurns(S, wasIgnited) {
  const N = S.nav, D = S.drive;
  if (N.state !== 'transit') return;
  if (D.ignited && !wasIgnited) N.burnStart = { orient: D.orient, v: N.v, rem: N.L - N.x };
  if (!D.ignited && wasIgnited && N.burnStart) {
    const b = N.burnStart; N.burnStart = null;
    const rem = N.L - N.x, a = Math.max(0.05, N.plan.g) * G0;
    let score = null, kind = '';
    if (b.orient > 0 && Math.abs(N.v) > Math.abs(b.v)) { // acceleration burn: hit the planned cruise speed
      kind = 'Departure burn'; const want = N.plan.cruise * 1000; score = clamp(100 - (Math.abs(Math.abs(N.v) - want) / want) * 200, 0, 100);
    } else if (b.orient < 0) { // braking burn: end with the stopping distance matching the range left
      kind = 'Braking burn'; const stop = (N.v * N.v) / (2 * a); score = rem < 2e9 ? clamp(100 - (Math.abs(N.v) / 6000) * 25, 0, 100) : clamp(100 - Math.abs(stop - rem) / Math.max(rem, 1) * 150, 0, 100);
    }
    if (score !== null) {
      score = Math.round(score);
      pilotLeg(S).burns.push({ kind, score, by: N.autopilot && !N.manual ? 'autopilot' : 'pilot' });
      if (!(N.autopilot && !N.manual)) log(S, `${kind} accuracy: ${score}/100`, score >= 85 ? 'good' : score >= 60 ? 'info' : 'warn');
    }
  }
}

// ---------------- pilot's log (shown at the end of the voyage) ----------------
export function pilotLeg(S) {
  S.pilot = S.pilot || { legs: [] };
  let L = S.pilot.legs.find((l) => l.leg === S.nav.leg);
  if (!L) { L = { leg: S.nav.leg, dvUsed: 0, dvIdeal: 0, burns: [] }; S.pilot.legs.push(L); }
  return L;
}
export function pilotDock(S, r) { const L = pilotLeg(S); L.dock = { v: +r.closing.toFixed(2), lat: +r.lateral.toFixed(2), bumps: S.prox ? S.prox.bumps : 0 }; }

// ---------------- per-tick entry point, called from updateDrive ----------------
// along: cos(nose, prograde); aAcc: drive acceleration (m/s²) this tick
export function updateFlight(S, dt, dtg, along, aAcc, hooks) {
  const N = S.nav, D = S.drive;
  const dv = D.ignited ? aAcc * dtg : 0;
  const dvAlong = along * dv;
  S.att.sunDir = sunInertial(S).dir;
  const L = pilotLeg(S);
  L.dvUsed += dv;
  if (N.state === 'transit' && !L.dvIdeal) { const a = N.plan.g * G0, vb = Math.sqrt(a * N.L); L.dvIdeal = 2 * Math.min(N.plan.cruise * 1000, vb); }
  const auto = N.autopilot && S.settings.autopilot && !N.manual && hooks.eff(S, 'navcomp') > 0 && hooks.eff(S, 'helm') > 0;
  if ((N.state === 'capture' || N.state === 'orbit' || N.state === 'depart') && S.orb) { updateOrbital(S, dtg, aAcc, auto, hooks); if (N.holdT > 0) N.holdT -= dt; }
  else if (N.state === 'orbit' && N.holdT > 0) N.holdT -= dt;
  if (['rendezvous', 'approach', 'docking', 'docked'].includes(N.state)) trackStation(S, dt);
  if (N.state === 'rendezvous') updateRendezvous(S, dtg, dvAlong, auto, hooks.startApproach);
  updateSlot(S, dt);
  updateStrain(S, dt);
  // sideways Δv this tick (RCS translation, or the drive burning off-axis) for dodging
  if (S.effects.chunk) {
    const t = S.att.tcmd || [0, 0, 0], rcs = Math.hypot(t[0], t[1]) * 0.12 * dt * (S.comps.injector.hp > 0 ? 1 : 0);
    S.mass.rmass = Math.max(0, S.mass.rmass - Math.hypot(t[0], t[1]) * dt * 0.0006);
    updateChunk(S, dt, rcs + dv * Math.sqrt(Math.max(0, 1 - along * along)), hooks.applyHit);
  }
  scoreBurns(S, N.wasIgnited);
  N.wasIgnited = D.ignited;
}
