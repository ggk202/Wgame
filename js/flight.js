// Flying matters: orbital capture at periapsis, circularising, rendezvous with the station, docking slots,
// structural load limits, Sun-relative attitude (radiators, storm shielding), directional debris, burn scoring and
// the pilot's log. Host-side and pure (no three.js); the state is plain JSON like everything else.
import { WAYPOINTS, G0, SHIP, COMPS, EXT_DECK } from './config.js';
import { clamp, rand, chance, log, fx, msg } from './util.js';
import { qrot, qconj, nose, dot, vnorm, angDeg } from './attitude.js';

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

// ---------------- arrival: hyperbolic approach and the capture burn ----------------
export function beginCapture(S) {
  const N = S.nav, D = S.drive;
  const vInf = Math.abs(N.v);
  // sized for a burn of roughly 35–50 s at a structurally safe thrust (radiators out, the ring may be turning)
  const aMax = Math.min(SHIP.thrust / ((SHIP.dry + Math.max(0, S.mass.rmass)) * 1000), 0.4 * G0);
  N.state = 'capture'; N.v = 0; D.ignited = false; D.cmdG = 0;
  N.cap = { t: 0, tPe: CAP.lead, dvNeed: Math.round(aMax * rand(32, 46) + vInf * 0.02), dvEff: 0, dvUsed: 0, vInf: Math.round(vInf), firstBurn: null, lastBurn: null };
  const dest = WAYPOINTS[N.leg + 1].name;
  log(S, `Entering ${dest.split(',')[1] ? dest.split(', ')[1] : dest} space on a hyperbolic path. CAPTURE BURN: point RETROGRADE and burn ${(N.cap.dvNeed / 1000).toFixed(2)} km/s centred on periapsis (T−${CAP.lead} s).`, 'warn');
  fx(S, 'chime');
  pilotLeg(S).arrivalV = Math.round(vInf);
}
// efficiency of a retro burn t seconds from periapsis (the Oberth effect: burn deep in the well, where you're fastest)
export const capEff = (dtPe) => Math.max(0.3, 1 - 0.45 * Math.pow(dtPe / 55, 2));
function updateCapture(S, dt, dvAlong, auto) {
  const N = S.nav, C = N.cap, D = S.drive;
  C.t += dt;
  const tPe = C.tPe - C.t; // seconds to periapsis (negative after)
  const retro = Math.max(0, -dvAlong), wrong = Math.max(0, dvAlong);
  if (retro > 0 || wrong > 0) {
    C.dvUsed += retro + wrong; C.dvEff += retro * capEff(tPe) - wrong;
    if (C.firstBurn === null) C.firstBurn = -tPe;
    C.lastBurn = -tPe;
  }
  if (auto) { // the autopilot times it well, though not perfectly
    const aFull = SHIP.thrust / ((SHIP.dry + S.mass.rmass) * 1000), aCap = Math.min(aFull, safeG(S) * 0.95 * G0);
    const aNow = Math.max(0.3, D.ignited && D.acc ? D.acc : aCap);
    const burnT = Math.max(4, (C.dvNeed - C.dvEff) / aNow);
    if (S.att.mode !== 'retro') S.att.mode = 'retro';
    if (C.dvEff < C.dvNeed * 1.01 && tPe < burnT / 2 + 2 && S.att.err < 3) { if (!D.ignited && S.mass.rmass > 0) D.ignited = true; D.cmdG = aCap / G0; }
    else if (C.dvEff >= C.dvNeed * 1.01) { D.cmdG = 0; D.ignited = false; }
  }
  const done = C.dvEff >= C.dvNeed && !D.ignited;
  if (done || tPe < -80) {
    D.ignited = false; D.cmdG = 0;
    const k = C.dvEff / C.dvNeed;
    const L = pilotLeg(S);
    L.capture = { need: C.dvNeed, used: Math.round(C.dvUsed), eff: Math.round(C.dvEff), centre: C.firstBurn === null ? null : Math.round((C.firstBurn + C.lastBurn) / 2) };
    if (k >= 0.97) {
      N.state = 'orbit'; N.ecc = clamp((k - 1) * 0.4, 0, 0.3); N.peT = ORBIT.period;
      log(S, `CAPTURED. ${N.ecc > ORBIT.ecc ? `Orbit eccentric (e=${N.ecc.toFixed(2)}): overburned. Trim it at periapsis before requesting an approach.` : 'Near-circular parking orbit. Request an approach slot at the helm or comms.'} Δv used ${(C.dvUsed / 1000).toFixed(2)} of ${(C.dvNeed / 1000).toFixed(2)} km/s ideal.`, 'good');
      fx(S, 'chime');
    } else if (k >= 0.55) {
      N.state = 'orbit'; N.ecc = clamp((1 - k) * 1.6, ORBIT.ecc + 0.02, 0.75); N.peT = ORBIT.period;
      log(S, `Captured into a highly eccentric orbit (e=${N.ecc.toFixed(2)}) — the burn was ${C.firstBurn === null ? 'too short' : Math.abs((C.firstBurn + C.lastBurn) / 2) > 25 ? 'off-centre' : 'too short'}. Burn RETROGRADE at the next periapsis to circularise.`, 'warn');
    } else {
      // missed: the ship swings past and climbs back out; turn round costs time and reaction mass
      N.state = 'transit'; N.x = N.L - 2.5e9; N.v = -1800 - rand(0, 900);
      log(S, `CAPTURE FAILED — only ${Math.round(k * 100)}% of the required Δv at periapsis. We are flying out past the planet. Turn back and try again.`, 'bad');
      fx(S, 'alarm', { kind: 'warn' });
      L.missedCapture = (L.missedCapture || 0) + 1;
    }
    N.cap = null;
  }
}
// parking orbit: periapsis comes round every ORBIT.period seconds; a retro burn there drops the eccentricity
function updateOrbit(S, dt, dvAlong, auto) {
  const N = S.nav, D = S.drive;
  if (N.ecc === undefined) { N.ecc = 0; N.peT = ORBIT.period; }
  N.peT -= dt;
  if (N.peT < -ORBIT.period / 2) N.peT += ORBIT.period;
  const dtPe = Math.abs(N.peT) < ORBIT.period / 2 ? N.peT : N.peT - ORBIT.period;
  const retro = Math.max(0, -dvAlong), pro = Math.max(0, dvAlong);
  if (retro || pro) {
    const k = Math.abs(dtPe) < ORBIT.window ? 1 : 0.25;
    N.ecc = clamp(N.ecc - (retro * k) / ORBIT.dvPerEcc + pro / ORBIT.dvPerEcc, 0, 0.95);
    pilotLeg(S).trimDv = (pilotLeg(S).trimDv || 0) + retro + pro;
  }
  if (auto && N.ecc > ORBIT.ecc * 0.6) {
    if (S.att.mode !== 'retro') S.att.mode = 'retro';
    if (Math.abs(dtPe) < ORBIT.window * 0.8 && S.att.err < 3) { D.ignited = true; D.cmdG = 0.3; }
    else { D.cmdG = 0; D.ignited = false; }
  } else if (auto && D.ignited) { D.cmdG = 0; D.ignited = false; }
  if (N.ecc <= ORBIT.ecc && N.eccWas > ORBIT.ecc) { log(S, `Orbit circularised (e=${N.ecc.toFixed(2)}). Request an approach slot when ready.`, 'good'); D.ignited = false; D.cmdG = 0; }
  N.eccWas = N.ecc;
}

// ---------------- rendezvous: close 10 km to the station's hold point ----------------
export function beginRendezvous(S) {
  const N = S.nav;
  N.state = 'rendezvous';
  N.rv = { d: RV.start + rand(-800, 1500), vc: rand(-3, 4), t: 0, used: 0 };
  N.slotT = RV.slot; // traffic control's window: be at soft capture before it closes
  S.drive.ignited = false; S.drive.cmdG = 0;
  if (S.att.mode === 'off' || S.att.mode === 'hold') { /* the pilot points it */ }
  log(S, `Approach slot granted: ${WAYPOINTS[N.leg + 1].name.split(',')[0]} traffic control expects soft capture within ${Math.round(RV.slot / 60)} min. Station ${(N.rv.d / 1000).toFixed(1)} km ahead. Burn toward it (prograde), coast, then brake (retro) to arrive at the 200 m hold point below ${RV.maxHandoffV} m/s.`, 'info');
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
    N.state = 'orbit'; N.ecc = Math.min(N.ecc || 0, ORBIT.ecc * 0.5); N.peT = ORBIT.period; N.rv = null; S.prox = null;
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
  if (N.state === 'capture') updateCapture(S, dt, dvAlong, auto);
  else if (N.state === 'orbit') { updateOrbit(S, dt, dvAlong, auto); if (N.holdT > 0) N.holdT -= dt; }
  else if (N.state === 'rendezvous') updateRendezvous(S, dtg, dvAlong, auto, hooks.startApproach);
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
