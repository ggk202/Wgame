// Crew-side systems: fatigue and sleep, science experiments, radio hails with light-lag, damage that cascades when
// faults are left alone, the flyable work pod with tug/cargo jobs, and jobs for dead crew waiting on their cryo thaw.
// Host-side and pure (no three.js).
import { COMPS, COMP_IDS, RING, RING_DECK, EXT, EXT_DECK, WAYPOINTS, AU, C_LIGHT, G0 } from './config.js';
import { clamp, rand, chance, pick, polar, log, fx, msg } from './util.js';
import { PARTS, moduleOf, issueOf } from './repair.js';
import { hullNormal, hullSDF } from './hull.js';
import { qrot, qconj, angDeg, nose } from './attitude.js';

// ---------------- bunks ----------------
// four sleep stations on Habitation (walk-in cubicles in thrust, zipped sleeping bags in zero-g) and six bunks in the
// ring under the big windows, where spin gravity gives the best sleep on the ship
const RING_C = 2 * Math.PI * RING.R;
export const BUNKS = [
  ...[22, -22, 68, -68].map((a, i) => ({ id: 'hab' + (i + 1), deck: 3, a, r: 10.15, label: `Sleep station ${i + 1}` })),
  ...[1, 3, 5].flatMap((k) => [-1, 1].map((s) => ({ id: `ring${k}${s > 0 ? 'b' : 'a'}`, deck: RING_DECK, x: s * (RING.W / 2 - 0.55), z: (k / 6) * RING_C, label: `Ring bunk ${k}${s > 0 ? 'B' : 'A'}` }))),
];
export function bunkPos(b) { if (b.deck === RING_DECK) return { x: b.x, z: b.z }; return polar(b.a, b.r); }
export const FATIGUE = { awake: 100 / (32 * 60), work: 0.6, sleepHab: 100 / 240, sleepZeroG: 100 / 300, sleepRing: 100 / 130, limit: 100 };
const fatigueRate = (S) => (S.settings.fatigue !== undefined ? S.settings.fatigue : { recruit: 0.45, spacer: 0.7, veteran: 1, newtonian: 1.2 }[S.settings.difficulty] || 1);

// ---------------- science ----------------
// requirement kinds: zerog (no thrust, not in the ring), spin (ring g range), burn (drive g), sun (nose on the Sun),
// orbit (in orbit at a planet), storm (during a proton storm)
export const EXPERIMENTS = {
  protein: { name: 'Protein crystal growth', req: 'zerog', dur: 300, credits: 22, text: 'Grows drug-target crystals with no convection. Needs the drive off.' },
  bone: { name: 'Bone density study', req: 'spin', g: [0.3, 1], dur: 420, credits: 15, upg: 'sleep', text: 'Measures how spin gravity protects the crew. Unlocks better sleep in the ring.' },
  fluid: { name: 'Partial-g fluid dynamics', req: 'spin', g: [0.1, 0.25], dur: 360, credits: 18, upg: 'recycler', text: 'Bubbles and films at Mars-like gravity. Improves the water recycler.' },
  plasma: { name: 'Exhaust plasma diagnostics', req: 'burn', g: [0.2, 9], dur: 300, credits: 12, upg: 'drive', text: 'Watches the torch plume under sustained thrust. Improves drive efficiency.' },
  solar: { name: 'Solar wind spectrometer', req: 'sun', deg: 20, dur: 240, credits: 26, text: 'Points the bow instrument at the Sun. Needs the nose held within 20° of the Sun.' },
  coating: { name: 'Radiator coating trial', req: 'zerog', dur: 360, credits: 10, upg: 'radCoat', text: 'Tests a new emissive coating in vacuum and zero-g. +10% radiator output when done.' },
  survey: { name: 'Planetary magnetometer survey', req: 'orbit', dur: 200, credits: 34, text: 'Maps the local field from parking orbit.' },
  cosmic: { name: 'Proton storm spectrometry', req: 'storm', dur: 80, credits: 45, text: 'Only runs during a solar particle event. Someone has to stay at the rack.' },
};
export const SCI_COST = { feedstock: 15 };
export function sciConditions(S, ex) {
  const g = S.drive.ignited ? S.drive.g : 0, rg = S.ring ? S.ring.g : 0;
  switch (ex.req) {
    case 'zerog': return { ok: g < 0.01, why: g < 0.01 ? 'drive off: weightless' : `thrust ${g.toFixed(2)} g — needs the drive off` };
    case 'spin': return { ok: rg >= ex.g[0] && rg <= ex.g[1], why: `ring at ${rg.toFixed(2)} g — needs ${ex.g[0]}–${ex.g[1] >= 1 ? '1+' : ex.g[1]} g` };
    case 'burn': return { ok: g >= ex.g[0], why: `thrust ${g.toFixed(2)} g — needs ${ex.g[0]} g or more` };
    case 'sun': { const s = sunDirSimple(S), a = angDeg(nose(S.att.q), s); return { ok: a <= ex.deg, why: `nose ${a.toFixed(0)}° from the Sun — needs ${ex.deg}°` }; }
    case 'orbit': return { ok: S.nav.state === 'orbit' || S.nav.state === 'rendezvous', why: S.nav.state === 'orbit' ? 'in parking orbit' : 'needs a parking orbit at a planet' };
    case 'storm': return { ok: S.effects.stormT > 0, why: S.effects.stormT > 0 ? 'storm in progress' : 'waits for a proton storm' };
  }
  return { ok: false, why: '' };
}
// (a copy of flight.sunInertial kept here to avoid a module cycle)
function sunDirSimple(S) {
  const N = S.nav, a = WAYPOINTS[N.leg].pos, b = WAYPOINTS[Math.min(N.leg + 1, WAYPOINTS.length - 1)].pos;
  const f = N.state === 'transit' ? clamp(N.x / N.L, 0, 1) : N.state === 'docked' ? 0 : 1;
  const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  const r = Math.hypot(p[0], p[1]) || 1, sx = -p[0] / r, sy = -p[1] / r;
  const v = [sx * ty + sy * -tx, 0.08, -(sx * tx + sy * ty)], l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
}
export const BAY_IDS = Array.from({ length: RING.bays * 2 }, (_, i) => 'bay' + i);
function updateScience(S, dt) {
  const X = S.sci || (S.sci = { bays: {}, done: {} });
  for (const [bay, run] of Object.entries(X.bays)) {
    if (!run) continue;
    const ex = EXPERIMENTS[run.ex];
    const c = sciConditions(S, ex);
    run.ok = c.ok;
    if (!c.ok) { run.bad = (run.bad || 0) + dt; continue; }
    run.p = Math.min(1, run.p + dt / ex.dur);
    if (run.p >= 1) {
      X.bays[bay] = null; X.done[run.ex] = (X.done[run.ex] || 0) + 1;
      const first = X.done[run.ex] === 1;
      const cr = Math.round(ex.credits * (first ? 1 : 0.5) * (S.nav.route === 'sun' && S.nav.state === 'transit' ? 1.5 : 1));
      S.credits += cr;
      let up = '';
      if (ex.upg && first) { S.upg = S.upg || {}; S.upg[ex.upg] = true; up = ` Upgrade unlocked: ${UPG_TEXT[ex.upg]}.`; }
      log(S, `Science: ${ex.name} complete. +${cr} credits${first ? '' : ' (repeat run, half pay)'}.${up}`, 'good');
      fx(S, 'chime');
    }
  }
}
export const UPG_TEXT = { sleep: 'ring bunks rest you 30% faster', recycler: 'water recycler losses halved', drive: 'drive exhaust +4% efficiency', radCoat: 'radiators +10%' };

// ---------------- radio hails (light-lag) ----------------
// A message from a station or ship arrives after the light-time from them to us; our reply takes the same again.
// Each hail has a deadline in ship time; whether the reply makes it depends on when you answer and on the lag.
export function stationLag(S) {
  const N = S.nav;
  if (N.state !== 'transit') return 1.5;
  return Math.max(1.5, (N.L - N.x) / C_LIGHT);
}
export const HAILS = {
  traffic: {
    from: (S) => `${WAYPOINTS[S.nav.leg + 1].name.split(',')[0]} Traffic`,
    text: () => 'Wolfram, confirm your flight plan and arrival window for slot allocation. Unconfirmed traffic is held at the outer marker.',
    opts: [{ id: 'confirm', label: 'Transmit flight plan' }, { id: 'ignore', label: 'Ignore' }],
    window: 1500,
    ok: (S, o) => { if (o === 'confirm') { S.nav.trafficOk = true; return 'Flight plan accepted. Expect a priority approach slot.'; } return null; },
    late: (S) => { S.nav.trafficLate = true; S.credits = Math.max(0, S.credits - 6); return 'No flight plan received. Wolfram is fined 6 credits and will be held 2 minutes at arrival.'; },
  },
  distress: {
    from: () => pick(['Ore hauler “Kittiwake”', 'Survey cutter “Ibis”', 'Prospector “Lucky Seven”']),
    text: () => 'Mayday, mayday. Coolant loop ruptured, two injured. Requesting medical guidance and any spare seals you can drop on our track.',
    opts: [{ id: 'help', label: 'Send medical guidance and drop 2 seals' }, { id: 'relay', label: 'Relay to Mission Control' }, { id: 'decline', label: 'Decline' }],
    window: 1800, urgent: true,
    ok: (S, o) => {
      if (o === 'help') { S.qc = S.qc || {}; S.qc.rescue = (S.qc.rescue || 0) + 1; if ((S.stores.seal || 0) >= 2) { S.stores.seal -= 2; S.credits += 18; return 'They made it. Belt Mutual pays an 18 credit salvage-assist bounty.'; } return 'You had no seals to spare; the guidance alone kept them alive. Thank you, Wolfram.'; }
      if (o === 'relay') { S.credits += 4; return 'Mission Control routed a tug. A small courtesy payment follows.'; }
      return 'Understood, Wolfram. Good luck.';
    },
    late: () => 'Too late: the distress beacon went silent before our reply arrived.',
  },
  customs: {
    from: () => 'Belt Authority Customs',
    text: () => 'Wolfram, submit your cargo manifest for pre-clearance or expect a boarding inspection on arrival.',
    opts: [{ id: 'send', label: 'Transmit manifest' }, { id: 'ignore', label: 'Ignore' }],
    window: 2400,
    ok: (S, o) => (o === 'send' ? 'Manifest cleared. No inspection required.' : null),
    late: (S) => { S.credits = Math.max(0, S.credits - 8); return 'No manifest received. An inspection fee of 8 credits has been charged.'; },
  },
  medical: {
    from: () => 'Mission Control (Earth)',
    text: () => 'Flight surgeon here. Please run the medbay diagnostics and send the crew dose readings for the long-term study.',
    opts: [{ id: 'send', label: 'Send dose readings' }, { id: 'ignore', label: 'Not now' }],
    window: 3600,
    ok: (S, o) => { if (o === 'send') { S.credits += 6; return 'Readings received. Thank you. 6 credits study fee paid.'; } return null; },
    late: () => 'Readings window closed.',
  },
};
export function sendHail(S, kind) {
  const H = HAILS[kind]; if (!H) return;
  S.comms = S.comms || { hails: [] };
  const lag = kind === 'medical' ? earthLagSimple(S) : stationLag(S);
  const h = { id: 'h' + Math.random().toString(36).slice(2, 7), kind, from: H.from(S), text: H.text(S), opts: H.opts, sent: S.gameTime, arrive: S.gameTime + lag, deadline: S.gameTime + lag + H.window, lag, reply: null, replyArrive: null, done: false, urgent: !!H.urgent };
  S.comms.hails.push(h);
  if (S.comms.hails.length > 12) S.comms.hails.shift();
}
function earthLagSimple(S) {
  const N = S.nav, a = WAYPOINTS[N.leg].pos, b = WAYPOINTS[Math.min(N.leg + 1, WAYPOINTS.length - 1)].pos;
  const f = N.state === 'transit' ? clamp(N.x / N.L, 0, 1) : 0;
  return (Math.hypot(a[0] + (b[0] - a[0]) * f - 1, a[1] + (b[1] - a[1]) * f) * AU) / C_LIGHT;
}
export function replyHail(S, id, opt) {
  const h = S.comms && S.comms.hails.find((x) => x.id === id);
  if (!h || h.done || h.reply || S.gameTime < h.arrive) return false;
  if (!h.opts.some((o) => o.id === opt)) return false;
  h.reply = opt; h.replyArrive = S.gameTime + h.lag;
  return true;
}
function updateHails(S) {
  const C = S.comms; if (!C) return;
  for (const h of C.hails) {
    if (h.done) continue;
    if (!h.noted && S.gameTime >= h.arrive) { h.noted = true; log(S, `Incoming hail from ${h.from} — reply at the Comms console (light-lag ${fmtLag(h.lag)} each way)`, 'warn'); fx(S, 'chime'); }
    const H = HAILS[h.kind];
    if (h.reply && S.gameTime >= h.replyArrive) {
      h.done = true;
      const ontime = h.replyArrive <= h.deadline;
      const out = ontime ? H.ok(S, h.reply) : H.late(S);
      if (out === null && H.late) { const r = H.late(S); if (r) msg(S, h.from, r, h.lag); }
      else if (out) msg(S, h.from, (ontime ? '' : '(Reply arrived too late.) ') + out, h.lag);
    } else if (!h.reply && S.gameTime > h.deadline - h.lag) {
      // even a reply now could not get there in time
      h.done = true; h.expired = true;
      const r = H.late ? H.late(S) : null; if (r) msg(S, h.from, r, h.lag);
    }
  }
}
export const fmtLag = (s) => (s < 90 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);

// ---------------- damage cascades ----------------
// faults left alone make other things worse: leaks heat the deck, shorts start fires and crash neighbours, HV faults
// drain the bus and strain the power gear, seized bearings wear the module faster, cracks let the hull fatigue
function updateCascade(S, dt, H) {
  S.cascade = [];
  for (const id of COMP_IDS) {
    const c = S.comps[id];
    if (c.issue === undefined || c.issue === null || c.hp >= 70) continue;
    const iss = issueOf(id, c.issue), sev = clamp((70 - c.hp) / 70, 0.1, 1);
    const def = COMPS[id];
    switch (iss.proc) {
      case 'coolant': S.heat.stored += 2 * sev * dt; S.cascade.push(`${def.name}: leak dumping heat (+${(2 * sev).toFixed(1)} MW)`); break;
      case 'circuit': if (chance(dt * 0.004 * sev) && c.fire <= 0 && !def.ext) { H.igniteComp(S, id, 0.2); log(S, `Shorted wiring in ${def.name} started a fire!`, 'bad'); } S.cascade.push(`${def.name}: shorts — fire risk`); break;
      case 'hv': S.battery.charge = Math.max(0, S.battery.charge - 0.0015 * sev * dt); if (chance(dt * 0.01 * sev)) { S.comps.powerdist.hp = Math.max(0, S.comps.powerdist.hp - rand(1, 3)); } S.cascade.push(`${def.name}: arcing — draining the bus`); break;
      case 'bearing': c.hp -= 0.05 * sev * dt; S.cascade.push(`${def.name}: seizing — wearing faster`); break;
      case 'weld': S.hull = Math.max(0, S.hull - 0.004 * sev * dt); S.cascade.push(`${def.name}: crack growing — hull fatigue`); break;
      case 'optics': if (S.sensors) S.sensors.q = Math.max(0, S.sensors.q - 0.01 * sev * dt); S.cascade.push(`${def.name}: degraded optics — sensor lock suffers`); break;
    }
  }
  // the classic chain: an overheated engineering deck cooks the battery bank
  const hf = S.heat.stored / H.heatCap;
  if (hf > 0.72) {
    const k = (hf - 0.72) * 3;
    if (S.comps.battery) S.comps.battery.hp = Math.max(0, S.comps.battery.hp - 0.18 * k * dt);
    S.cascade.push(`Engineering heat ${Math.round(hf * 100)}% — battery cells degrading`);
  }
}

// ---------------- the work pod ----------------
// A two-metre pressurised work pod rides in a cradle beside the EVA hatch. Board it from EVA. It flies like a jet
// pack with four times the thrust and no tether; its arm grapples cargo and towed drones, and reaches further for
// external repairs. Under thrust the ship will leave it behind, so bring it home before a burn.
export const POD = { jet: 3.4, vmax: 18, reach: 8, grab: 7, deliver: 16, range: 2500 };
export const POD_CRADLE = (() => {
  const h = EXT.hatch, n = hullNormal(h.x, h.y, h.z);
  const p = { x: h.x + n[0] * 3.4, y: h.y + n[1] * 3.4 - 3.0, z: h.z + n[2] * 3.4 + 4.0 };
  for (let i = 0; i < 20 && hullSDF(p.x, p.y, p.z) < 2.2; i++) { p.x += n[0] * 0.4; p.y += n[1] * 0.4; p.z += n[2] * 0.4; }
  return p;
})();
export function podState(S) { return S.pod || (S.pod = { at: 'cradle', pilot: null, x: POD_CRADLE.x, y: POD_CRADLE.y, z: POD_CRADLE.z, carry: null }); }
export function spawnCargo(S, kind) {
  S.cargo = S.cargo || [];
  const ang = rand(0, Math.PI * 2), dist = rand(220, 520);
  const item = { id: 'c' + Math.random().toString(36).slice(2, 7), kind, x: Math.cos(ang) * dist, y: rand(-60, 60), z: Math.sin(ang) * dist * 0.6 - 40, vz: 0, t: kind === 'drone' ? 420 : 600 };
  S.cargo.push(item);
  return item;
}
function updatePod(S, dt) {
  const P = podState(S);
  const pilot = P.pilot && S.players[P.pilot];
  if (pilot && (!pilot.connected || pilot.state !== 'alive' || !pilot.pod)) { if (pilot) pilot.pod = false; P.pilot = null; }
  if (P.pilot) { const p = S.players[P.pilot]; P.x = p.x; P.y = p.y + 1.0; P.z = p.z; P.at = 'out'; }
  else if (P.at === 'out' && S.drive.ignited && S.drive.g > 0.002) { P.vz = (P.vz || 0) + S.drive.g * G0 * dt; P.z += P.vz * dt; } // left behind under thrust
  if (P.at === 'out' && !P.pilot && P.z > 6000) { P.at = 'lost'; log(S, 'The unmanned work pod has been left behind under thrust and is lost.', 'bad'); }
  // cargo drifts; under thrust it falls astern
  const A = S.drive.ignited ? S.drive.g * G0 : 0;
  for (const c of S.cargo || []) {
    if (P.carry === c.id) { c.x = P.x; c.y = P.y - 2.4; c.z = P.z + 0.5; c.vz = 0; continue; }
    c.vz += A * dt; c.z += c.vz * dt; c.t -= dt;
  }
  if (S.cargo) {
    for (const c of S.cargo) if (c.z > 4000 || c.t <= 0) { c.gone = true; log(S, c.kind === 'drone' ? 'The damaged drone drifted out of range and was lost.' : 'The salvage container drifted out of range.', 'warn'); }
    S.cargo = S.cargo.filter((c) => !c.gone);
  }
}
export function deliverCargo(S, c) {
  S.cargo = (S.cargo || []).filter((x) => x.id !== c.id);
  if (c.kind === 'drone') { if (S.drones) S.drones.total++; log(S, 'Drone recovered and back in the bay. It needs a refit but it is ours.', 'good'); return; }
  S.qc = S.qc || {}; S.qc.salvage = (S.qc.salvage || 0) + 1;
  const k = pick(Object.keys(PARTS)), n = 2 + Math.floor(Math.random() * 3), cr = 10 + Math.floor(Math.random() * 15);
  S.stores[k] = (S.stores[k] || 0) + n; S.credits += cr;
  log(S, `Container cracked open in the bay: ${n}× ${PARTS[k].name.toLowerCase()} and salvage worth ${cr} credits.`, 'good');
  fx(S, 'chime');
}

// ---------------- ghost jobs: dead crew run a scout drone or the camera net until their thaw ----------------
export const SCOUT = { jet: 6, vmax: 40, range: 1500 };
function updateGhosts(S) {
  S.scoutOut = Object.values(S.players).some((p) => p.connected && (p.state === 'dead' || p.state === 'spectator') && p.ghost === 'scout' && Math.hypot(p.x, p.y || 0, p.z) > 60);
}

// ---------------- fatigue and sleep ----------------
function updateFatigue(S, dt) {
  const k = fatigueRate(S);
  const alarm = S.alert === 'red';
  for (const p of Object.values(S.players)) {
    if (!p.connected) continue;
    if (p.fatigue === undefined) p.fatigue = 10;
    if (p.state !== 'alive') { p.sleep = null; continue; }
    if (p.sleep) {
      const b = BUNKS.find((x) => x.id === p.sleep.bunk);
      const ringG = S.ring ? S.ring.g : 0;
      let r;
      if (b && b.deck === RING_DECK && ringG >= 0.15) r = FATIGUE.sleepRing * (S.upg && S.upg.sleep ? 1.3 : 1) * clamp(0.6 + ringG, 0.75, 1.3);
      else if (b) r = (S.drive.ignited && S.drive.g > 0.05 ? FATIGUE.sleepHab : FATIGUE.sleepZeroG);
      else r = FATIGUE.sleepZeroG * 0.5; // passed out on the floor
      p.fatigue = Math.max(0, p.fatigue - r * dt);
      p.sleep.t += dt;
      if (p.sleep.forced && p.sleep.t > 25) p.sleep = null;
      else if (alarm && p.sleep.t > 2 && !p.sleep.woke) { p.sleep = null; log(S, `${p.name} jolted awake by the alarm`, 'warn'); }
      else if (p.fatigue <= 0 && p.sleep.t > 5) { p.sleep = null; log(S, `${p.name} wakes up rested`, 'good'); }
      continue;
    }
    const busy = p.seat || p.work ? 1 + FATIGUE.work : 1;
    p.fatigue = Math.min(100, p.fatigue + FATIGUE.awake * k * busy * dt);
    if (p.fatigue >= FATIGUE.limit && !p.god) {
      p.sleep = { bunk: null, t: 0, forced: true }; p.seat = null;
      log(S, `${p.name} has collapsed from exhaustion!`, 'bad');
    }
  }
}

// ---------------- entry point ----------------
export function updateCrew(S, dt, dtg, hooks) {
  updateFatigue(S, dt);
  updateScience(S, dt);
  updateHails(S);
  updateCascade(S, dt, hooks);
  updatePod(S, dt);
  updateGhosts(S);
}
export const BUNK_REACH = 2.0;
