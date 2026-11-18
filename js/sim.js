// Host-authoritative ship simulation. step(S, dt) advances everything by dt real seconds.
import { COMPS, COMP_IDS, DECKS, SHIP, G0, KG_PER_KPA, SHELTER, WAYPOINTS, LOCKERS, EXT_DECK, EXT, AIRLOCK, ROOM_R } from './config.js';
import { clamp, rand, randn, chance, pick, polar, compPos, log, fx } from './util.js';
import { updateCombat, updateWeapons } from './combat.js';
import { storyStep, updateVote, updateEffects } from './story.js';
import { updateAttitude, updateProx, startApproach, nose, sasModes, kick } from './attitude.js';
import { legLength } from './state.js';

const INTERNAL = COMP_IDS.filter((id) => !COMPS[id].ext);
export const PDCS = ['pdc1', 'pdc2', 'pdc3'];

// ---------- helpers ----------
export function eff(S, id) {
  const c = S.comps[id];
  if (!c || !c.on || c.hp <= 0 || c.pw <= 0) return 0;
  if (COMPS[id].computer && c.fault) return 0;
  return Math.min(1, 0.25 + c.hp / 80) * Math.min(1, c.pw);
}
export function hpf(S, id) { return clamp(S.comps[id].hp / 100, 0, 1); }
export function massKg(S) { return (SHIP.dry + Math.max(0, S.mass.rmass)) * 1000; }
export function maxG(S) { return SHIP.thrust / massKg(S) / G0; }
export function deltaV(S) { return SHIP.ve * Math.log((SHIP.dry + Math.max(0, S.mass.rmass)) / SHIP.dry); }
export function heatFrac(S) { return S.heat.stored / SHIP.heatCap; }
export function alivePlayers(S) { return Object.values(S.players).filter((p) => p.state === 'alive' && p.connected); }
export function compsOnDeck(deck) { return INTERNAL.filter((id) => COMPS[id].deck === deck); }
export function inShelter(p) {
  if (p.deck !== SHELTER.deck) return false;
  const c = polar(SHELTER.a, SHELTER.r);
  return Math.hypot(p.x - c.x, p.z - c.z) < SHELTER.rad;
}
export function igniteComp(S, id, amount = 0.25) {
  const c = S.comps[id];
  if (!c || COMPS[id].ext) return;
  const d = S.decks[COMPS[id].deck];
  if (d.o2 < 8) return;
  if (c.fire <= 0) log(S, `FIRE: ${COMPS[id].name} (${DECKS[COMPS[id].deck].name} deck)`, 'bad');
  c.fire = Math.max(c.fire, amount);
}

// ---------- main step ----------
export function step(S, dt) {
  if (S.phase !== 'play' || S.paused) return;
  S.t += dt;
  S.warp = S.enc || S.nav.state !== 'transit' ? 1 : S.settings.warpBase;
  const dtg = dt * S.warp;
  S.gameTime += dtg;

  updateEffects(S, dt);
  updateComps(S, dt);
  updatePower(S, dt);
  updateReactor(S, dt, dtg);
  updateHeat(S, dt);
  if (S.nav.state === 'docked' || S.nav.state === 'docking') { S.att.w = [0, 0, 0]; } else updateAttitude(S, dt);
  updateDrive(S, dt, dtg);
  if (S.nav.state === 'approach') updateProx(S, dt, (r) => onCapture(S, r), (r, hard) => onCollide(S, r, hard));
  updateLife(S, dt, dtg);
  updateWeapons(S, dt);
  updateCombat(S, dt);
  updatePlayers(S, dt);
  updateWorkshops(S, dt);
  storyStep(S, dt);
  updateVote(S);
  updateAlert(S);
  checkEnd(S, dt);
}

// ---------- components: wear, nanites, fires, reboots ----------
function updateComps(S, dt) {
  const set = S.settings;
  for (const id of COMP_IDS) {
    const c = S.comps[id], def = COMPS[id];
    let w = (def.wear * set.wear) / 60;
    switch (id) {
      case 'drivecore': w *= (S.drive.ignited ? 0.4 + 2 * S.drive.throttle : 0.15) * (1 + 3 * S.mass.contam); break;
      case 'reactor': w *= S.reactor.state === 'running' ? 0.3 + S.reactor.actual : 0.1; break;
      case 'fabricator': w *= S.fab.queue.length ? 1.6 : 0.3; break;
      case 'coolpump': w *= 0.5 + S.heat.inMW / 100; break;
      case 'scrubbers': w *= S.life.regen > 0 ? 3 : 1; break;
      case 'pdc1': case 'pdc2': case 'pdc3': w *= S.enc ? 3 : 0.5; break;
      case 'injector': w *= S.drive.ignited ? 1 + S.drive.throttle : 0.2; break;
    }
    if (!c.on) w *= 0.2;
    if (S.nav.state === 'docked') w *= 0.2;
    c.hp -= w * dt;
    if (set.nanites > 0 && c.fire <= 0 && (c.hp > 0 || set.naniteBreach)) c.hp += (set.nanites / 60) * dt;

    // fire
    if (c.fire > 0 && !def.ext) {
      const d = S.decks[def.deck];
      if (d.o2 < 7) c.fire -= 0.15 * dt;
      else c.fire += 0.022 * (d.o2 / 21 - 0.35) * dt;
      if (set.autoFire) c.fire -= 0.06 * dt; // automatic water-mist sprinklers
      c.hp -= 2.2 * c.fire * dt;
      if (c.fire > 0.5 && chance(0.025 * dt)) {
        const others = compsOnDeck(def.deck).filter((o) => o !== id && S.comps[o].fire <= 0);
        if (others.length) igniteComp(S, pick(others), 0.15);
      }
      if (c.fire <= 0) { c.fire = 0; log(S, `Fire out: ${def.name}`, 'good'); }
      c.fire = clamp(c.fire, 0, 1);
    }
    if (c.reboot > 0) {
      c.reboot -= dt;
      if (c.reboot <= 0) { c.reboot = 0; c.fault = 0; log(S, `${def.name} rebooted`, 'good'); }
    }
    c.hp = clamp(c.hp, 0, 100);
    if (c.hp <= 0 && !c.dead) { c.dead = true; log(S, `${def.name} has FAILED`, 'bad'); fx(S, 'fail', { id }); }
    else if (c.hp > 3) c.dead = false;
  }
}

// ---------- power ----------
export function demandOf(S, id) {
  const c = S.comps[id], def = COMPS[id];
  if (!c.on || c.hp <= 0) return 0;
  let d = def.power;
  switch (id) {
    case 'sensors': d += S.sensors.pingT > 0 ? 8 : 0; break;
    case 'lifesupport': d = S.life.electrolysis && S.life.o2 < 1500 && S.life.water > 0 ? 3 : 0.6; break;
    case 'scrubbers': d = S.life.regen > 0 ? 3 : 1; break;
    case 'medbay': d += S.medActive ? 2 : 0; break;
    case 'coolpump': d = 1 + 4 * Math.min(1, S.heat.inMW / 100); break;
    case 'fabricator': d += S.fab.queue.length ? 5 : 0; break;
    case 'dronebay': d += 1.5 * S.drones.jobs.length; break;
    case 'magazine': d += S.weap.tubes.some((t) => t.load > 0) ? 2 : 0; break;
    case 'drivecore': d = S.drive.ignited ? 2 + 14 * S.drive.want : 0.5; break;
    case 'railgun': d += S.weap.charging && S.weap.rail < 1 ? 20 : 0; break;
    case 'pdc1': case 'pdc2': case 'pdc3': d += S.enc ? 1 : 0; break;
    case 'reactor': d = S.reactor.state === 'preheat' ? 6 : 0; break;
  }
  return d;
}

function updatePower(S, dt) {
  const R = S.reactor, B = S.battery, P = S.power;
  const gen = R.state === 'running' ? SHIP.reactorMW * R.actual * (0.5 + 0.5 * hpf(S, 'reactor')) : 0;
  const battOk = S.comps.battery.hp > 0;
  const batAvail = battOk && B.charge > 0.002 ? SHIP.battMaxDis * (0.4 + 0.6 * hpf(S, 'battery')) : 0;
  let supply = gen + batAvail;
  if (S.comps.powerdist.hp <= 0) supply *= 0.5; // bus faults
  let remaining = supply - SHIP.habLoad;
  let used = SHIP.habLoad, total = SHIP.habLoad;
  const order = [...COMP_IDS].sort((a, b) => S.comps[a].prio - S.comps[b].prio);
  for (const id of order) {
    const c = S.comps[id];
    const d = demandOf(S, id);
    total += d;
    if (d <= 0) { c.pw = c.on ? 1 : 0; continue; }
    if (remaining >= d) { c.pw = 1; remaining -= d; used += d; }
    else if (id === 'drivecore' && remaining > 0.5) { c.pw = remaining / d; used += remaining; remaining = 0; }
    else c.pw = 0;
  }
  // emergency fuel cell trickle-charges the battery while the reactor is down (black-start capability)
  const fuelCell = R.state !== 'running' && battOk ? 2 : 0;
  const net = gen - used + fuelCell;
  const cap = SHIP.batteryMWh * (0.3 + 0.7 * hpf(S, 'battery'));
  if (net >= 0) B.charge += (battOk ? Math.min(net, SHIP.battMaxChg) : 0) * dt / 3600;
  else B.charge += net * dt / 3600;
  B.charge = clamp(B.charge, 0, cap);
  P.gen = gen; P.demand = total; P.used = used; P.batt = net; P.deficit = Math.max(0, total - used); P.cap = cap;

  if (S.settings.autoPower && R.state === 'running') {
    const want = (total + (B.charge < cap * 0.95 ? 4 : 0)) / (SHIP.reactorMW * (0.5 + 0.5 * hpf(S, 'reactor')));
    R.target = clamp(want * 1.05, 0.15, 1);
  }
}

// ---------- reactor ----------
export function scram(S, why) {
  const R = S.reactor;
  if (R.state !== 'running') return;
  R.state = 'scram'; R.actual = 0; R.preheat = 0; R.lowStabT = 0;
  log(S, `REACTOR SCRAM — ${why}`, 'bad');
  fx(S, 'alarm', { kind: 'scram' });
}
function containmentBreach(S) {
  const R = S.reactor;
  R.state = 'scram'; R.actual = 0; R.lowStabT = 0;
  S.comps.reactor.hp = 0;
  S.hull -= 12;
  S.effects.reactorRadT = 45;
  igniteComp(S, 'powerdist', 0.5); igniteComp(S, 'coolpump', 0.4);
  for (const p of Object.values(S.players)) if (p.deck === 2 && p.state === 'alive') p.hp -= 45;
  log(S, 'CONTAINMENT FAILURE — plasma breach in reactor! Radiation on Engineering deck!', 'bad');
  fx(S, 'hit', { deck: 2, power: 2 });
}
function updateReactor(S, dt, dtg) {
  const R = S.reactor, rc = S.comps.reactor, h = hpf(S, 'reactor');
  const driftRate = 0.03 * (0.4 + R.actual) * (1.7 - h) * (S.effects.stormT > 0 ? 1.8 : 1);
  R.drift = clamp(R.drift * (1 - 0.01 * dt) + randn() * driftRate * Math.sqrt(dt), -1, 1);
  if (R.state === 'running') {
    const auto = S.settings.autoReactor;
    if (auto === 'full') R.field += clamp(R.drift - R.field, -0.3 * dt, 0.3 * dt);
    else if (auto === 'assist') R.field += clamp(R.drift - R.field, -0.05 * dt, 0.05 * dt);
    const err = Math.abs(R.field - R.drift);
    const tgt = clamp(1 - err * 2.2 - (1 - h) * 0.35 - (rc.fire > 0 ? 0.2 : 0), 0, 1);
    R.stab += (tgt - R.stab) * Math.min(1, 0.6 * dt);
    R.actual += clamp(R.target - R.actual, -0.08 * dt, 0.08 * dt);
    S.mass.pellets = Math.max(0, S.mass.pellets - 0.00012 * R.actual * dtg);
    if (rc.hp <= 0) scram(S, 'reactor damaged');
    else if (S.mass.pellets <= 0) scram(S, 'fuel pellets exhausted');
    else if (eff(S, 'injector') <= 0) scram(S, 'pellet injector offline');
    else if (S.heat.stored > SHIP.heatCap) scram(S, 'thermal overload');
    if (R.state === 'running') {
      R.lowStabT = R.stab < 0.2 ? R.lowStabT + dt : Math.max(0, R.lowStabT - dt);
      if (R.lowStabT > 4) {
        if (rc.hp > 25) scram(S, 'containment instability');
        else containmentBreach(S);
      }
    }
  } else if (R.state === 'scram' && S.settings.autoReactor === 'full' && rc.hp > 10 && S.battery.charge >= 0.1 && S.mass.pellets > 0) {
    R.autoT = (R.autoT || 0) + dt;
    if (R.autoT > 25) { R.autoT = 0; R.state = 'preheat'; R.preheat = 0; log(S, 'Reactor automation: restart sequence initiated', 'info'); }
  } else if (R.state === 'ready' && S.settings.autoReactor === 'full') {
    R.state = 'running'; R.actual = 0.1; R.target = Math.max(R.target, 0.4); R.stab = 0.6; R.field = R.drift;
    log(S, 'Reactor automation: ignition, fusion sustained', 'good');
  } else if (R.state === 'preheat') {
    if (S.comps.reactor.pw > 0 && S.battery.charge > 0.01) R.preheat += dt;
    else { R.state = 'scram'; R.preheat = 0; log(S, 'Reactor pre-heat failed — no battery power for the magnets', 'bad'); }
    if (R.preheat >= 20) { R.state = 'ready'; log(S, 'Reactor magnets at field. Ready to ignite.', 'good'); }
  }
}

// ---------- heat ----------
function updateHeat(S, dt) {
  const H = S.heat;
  const fires = INTERNAL.reduce((s, id) => s + S.comps[id].fire, 0);
  const inMW = S.power.gen * 1.5 + 30 * S.drive.throttle + S.power.used + fires * 2;
  const pumpF = 0.15 + 0.85 * eff(S, 'coolpump');
  let out = 0;
  if (S.settings.autoRadiators) {
    const threat = S.enc && S.enc.enemies.some((e) => !e.dead && !e.gone && e.range < 3500);
    H.radExt = !(threat && heatFrac(S) < 0.6);
  }
  for (const id of ['radA', 'radB']) {
    const c = S.comps[id];
    if (c.hp <= 0) continue;
    out += (H.radExt ? SHIP.radExt : SHIP.radRet) * (0.3 + 0.7 * c.hp / 100) * (c.pw > 0 ? 1 : 0.6) * pumpF;
  }
  H.inMW = inMW; H.outMW = out;
  H.stored = clamp(H.stored + (inMW - out) * dt, 0, SHIP.heatCap * 1.15);
  const f = heatFrac(S);
  if (f > 0.9 && chance(dt * 1.2)) {
    const id = pick(INTERNAL);
    S.comps[id].hp -= rand(2, 5) * (f - 0.85) * 10;
  }
  if (f >= 1 && S.drive.ignited) { S.drive.ignited = false; log(S, 'Drive shut down — thermal overload', 'bad'); }
}

// ---------- drive & navigation ----------
// Flip = an attitude maneuver flown by the SAS (if the difficulty provides one).
export function startFlip(S) {
  if (!sasModes(S).includes('pro')) return 'No attitude autopilot at this difficulty. Flip by hand with the RCS.';
  const want = S.drive.orient >= 0 ? 'retro' : 'pro';
  S.att.mode = want; S.drive.cmdG = 0;
  log(S, want === 'retro' ? 'Flip maneuver: slewing nose to retrograde' : 'Flip maneuver: slewing nose to prograde', 'info');
  return null;
}
function onCapture(S, r) {
  S.nav.state = 'docking'; S.nav.dockT = 8; S.prox = null; S.att.q = [0, 0, 0, 1]; S.att.w = [0, 0, 0];
  log(S, `SOFT CAPTURE: lateral ${r.lateral.toFixed(2)} m, ${r.closing.toFixed(2)} m/s, ${r.ang.toFixed(1)}°, roll ${r.roll.toFixed(1)}°. Hard-dock latches driving…`, 'good');
  fx(S, 'dock');
}
function onCollide(S, r, hard) {
  if (hard) {
    const dmg = 6 + r.closing * 18 + r.lateral * 4;
    S.hull = Math.max(0, S.hull - dmg * 0.35 * S.settings.dmg);
    const victims = ['helm', 'navcomp', 'sensors', 'comms', 'antenna', 'sensorArray', 'pdc1', 'pdc2'];
    const v = victims[Math.floor(Math.random() * victims.length)];
    S.comps[v].hp = Math.max(0, S.comps[v].hp - dmg);
    for (const p of Object.values(S.players)) if (p.state === 'alive' && !p.seat && p.deck >= 3) p.hp -= dmg * 0.4;
    log(S, `COLLISION with the station at ${r.closing.toFixed(2)} m/s, ${r.lateral.toFixed(1)} m off-axis! ${COMPS[v].name} damaged.`, 'bad');
    fx(S, 'hit', { deck: 4, power: 0.8 });
  } else {
    const why = r.lateral >= 0.35 ? `${r.lateral.toFixed(2)} m off-centre` : r.closing >= 0.25 ? `too fast (${r.closing.toFixed(2)} m/s)` : r.ang >= 3 ? `misaligned ${r.ang.toFixed(1)}°` : `hatch rolled ${r.roll.toFixed(1)}°`;
    log(S, `Contact: soft capture failed, ${why}. Rebounding. Back off and line up again.`, 'warn');
    fx(S, 'hit', { deck: 4, power: 0.2 });
  }
}
function autopilot(S, dt) {
  const N = S.nav, D = S.drive;
  const rem = N.L - N.x;
  const dir = Math.sign(rem) || 1;
  const gPlan = clamp(N.plan.g, 0.05, maxG(S) * 0.95);
  const aPlan = gPlan * G0;
  const vCruise = N.plan.cruise * 1000;
  const vToward = N.v * dir;
  const flipCoast = D.orient === dir ? Math.max(0, vToward) * 22 * S.warp : 0;
  const dist = Math.max(0, Math.abs(rem) - flipCoast);
  const vDes = Math.min(vCruise, Math.sqrt(2 * aPlan * 0.9 * dist));
  const dv = vDes - vToward;
  const dtg = dt * S.warp;
  const needOrient = dv >= 0 ? dir : -dir;
  if (!D.ignited) { if (eff(S, 'drivecore') > 0 && S.mass.rmass > 0 && eff(S, 'injector') > 0) { D.ignited = true; log(S, 'Autopilot: drive ignition', 'info'); } else return; }
  const wantMode = needOrient > 0 ? 'pro' : 'retro';
  if (Math.abs(dv) < aPlan * 2) { D.cmdG = 0; return; }
  if (S.att.mode !== wantMode) {
    if (D.orient !== needOrient && Math.abs(dv) <= aPlan * 120) { D.cmdG = 0; return; }
    S.att.mode = wantMode;
    if (D.orient !== needOrient) log(S, `Autopilot: slewing to ${wantMode === 'pro' ? 'prograde' : 'retrograde'}`, 'info');
  }
  if (S.att.err > 3) { D.cmdG = 0; return; }
  D.cmdG = Math.min(gPlan, Math.abs(dv) / dtg / G0);
}
function updateDrive(S, dt, dtg) {
  const D = S.drive, N = S.nav, M = S.mass;
  // the drive pushes along the nose; only the component along the nav axis counts
  const along = -nose(S.att.q)[2];
  const prevOrient = D.orient;
  D.orient = along > 0.866 ? 1 : along < -0.866 ? -1 : 0;
  D.along = along;
  D.flip = (S.att.mode === 'pro' || S.att.mode === 'retro') && S.att.err > 3 ? S.att.err : 0;
  if (prevOrient === 0 && D.orient !== 0 && N.state === 'transit') log(S, `Nose aligned ${D.orient > 0 ? 'PROGRADE' : 'RETROGRADE'}`, 'good');
  if (N.state !== 'transit' && D.ignited) { D.ignited = false; D.cmdG = 0; }
  if (N.state === 'transit' && N.autopilot && S.settings.autopilot && eff(S, 'navcomp') > 0 && eff(S, 'helm') > 0 && D.locked <= 0) autopilot(S, dt);
  const m = massKg(S);
  const maxA = SHIP.thrust / m;
  D.want = D.ignited ? clamp((D.cmdG * G0) / maxA, 0, 1) : 0;
  if (D.locked > 0) { D.locked -= dt; D.want = D.lockedThr; if (D.locked <= 0) log(S, 'Throttle valve freed', 'good'); }
  let thr = D.want;
  if (S.comps.drivecore.hp <= 0 || !D.ignited) thr = 0;
  thr *= Math.min(1, S.comps.drivecore.pw);
  if (D.ignited && M.rmass <= 0) { D.ignited = false; log(S, 'Reaction mass exhausted — drive flameout', 'bad'); }
  if (D.ignited && eff(S, 'injector') <= 0) { D.ignited = false; log(S, 'Pellet injector failure — drive flameout', 'bad'); }
  if (D.ignited && S.comps.drivecore.hp <= 0) { D.ignited = false; log(S, 'Drive core failure — flameout', 'bad'); }
  if (!D.ignited) thr = 0;
  D.throttle = thr;
  const F = SHIP.thrust * thr * (1 - 0.35 * M.contam) * (0.6 + 0.4 * hpf(S, 'drivecore'));
  const a = F / m;
  D.acc = a;
  const jink = D.evasive && D.ignited && eff(S, 'drivecore') > 0 && M.rmass > 0;
  D.g = a / G0 + (jink ? 1.2 : 0);
  if (N.state === 'transit') {
    N.v += along * a * dtg;
    N.x += N.v * dtg;
  }
  const ve = SHIP.ve * (1 - 0.3 * M.contam);
  M.rmass -= ((F / ve) * dtg) / 1000 + (jink ? 0.02 * dt : 0) + (S.enc && D.maneuver !== 'hold' && D.ignited ? 0.03 * dt : 0);
  M.pellets = Math.max(0, M.pellets - 0.0003 * thr * dtg);
  M.rmass = Math.max(0, M.rmass);

  // arrival / docking
  const rem = N.L - N.x;
  if (N.state === 'transit' && Math.abs(rem) < 5e8 && Math.abs(N.v) < 6000) {
    N.state = 'orbit'; N.v = 0; D.ignited = false; D.cmdG = 0;
    log(S, `Arrived: holding orbit at ${WAYPOINTS[N.leg + 1].name}. Request an approach slot at the helm, then fly the docking by hand.`, 'good');
    fx(S, 'chime');
  }
  if (N.state === 'docking') {
    N.dockT -= dt;
    if (N.dockT <= 0) {
      N.state = 'docked'; N.leg += 1; N.x = 0; N.v = 0;
      S.credits += 40;
      S.mass.rmass = SHIP.rmassMax; S.mass.contam = 0; S.mass.pellets = Math.max(S.mass.pellets, SHIP.pellets);
      log(S, `Docked at ${WAYPOINTS[N.leg].name}. Contracted refuelling complete (reaction mass and pellets full). +40 credits — spend them at the Comms console.`, 'good');
      fx(S, 'chime');
      if (N.leg >= WAYPOINTS.length - 1) { S.phase = 'won'; S.endReason = `The Wolfram made port at ${WAYPOINTS[N.leg].name}.`; }
    }
  }
}
export function depart(S) {
  const N = S.nav;
  if (N.state !== 'docked' || N.leg >= WAYPOINTS.length - 1) return false;
  N.state = 'transit'; N.x = 0; N.v = 0; N.L = legLength(N.leg);
  S.drive.cmdG = 0; S.drive.flip = 0;
  // undock: pushed off pointing back out along the departure axis; the next leg's target is ahead (-Z)
  S.att.q = [0, 0, 0, 1]; S.att.w = [0, 0, 0];
  if (S.att.mode === 'off' && sasModes(S).includes('hold')) S.att.mode = 'hold';
  log(S, `Undocked from ${WAYPOINTS[N.leg].name}. Course laid in for ${WAYPOINTS[N.leg + 1].name}.`, 'info');
  S.story.nextAt = S.t + 60;
  return true;
}

// ---------- life support & atmosphere ----------
function updateLife(S, dt, dtg) {
  const L = S.life;
  const ls = eff(S, 'lifesupport'), sc = eff(S, 'scrubbers');
  if (L.regen > 0) {
    L.regen -= dt; L.sat = Math.max(0.2, L.sat - 0.012 * dt);
    if (L.regen <= 0) { L.regen = 0; log(S, 'Scrubber bake-out complete', 'good'); }
  } else if (S.comps.scrubbers.on) L.sat = Math.min(1, L.sat + dt * 0.0011);
  const scrubE = L.regen > 0 ? 0 : sc * (1 - Math.pow(L.sat, 3));
  S.scrubE = scrubE;

  if (L.electrolysis && ls > 0 && L.water > 0 && L.o2 < 1500) { const r = 0.25 * ls * dt; L.o2 += r; L.water -= r * 1.125; }
  const crew = Math.max(1, alivePlayers(S).length);
  L.food -= (1.8 / 86400) * crew * dtg;
  L.food += (eff(S, 'hydro') * 2.5 / 86400) * dtg;
  L.water -= ((3 + 27 * (1 - eff(S, 'recycler'))) / 86400) * crew * dtg;
  L.food = Math.max(0, L.food); L.water = Math.max(0, L.water);

  const hf = heatFrac(S);
  const counts = [0, 0, 0, 0, 0, 0];
  for (const p of alivePlayers(S)) counts[p.deck]++;
  const stormRad = S.effects.stormT > 0 ? 30 * Math.min(1, S.effects.stormT / 10, (S.effects.stormLen - S.effects.stormT + 5) / 10) : 0;
  for (const d of S.decks) {
    if (d.ext) { d.o2 = 0; d.n2 = 0; d.co2 = 0; d.temp = -100; d.rad = 0.00008 + stormRad * 1.6; continue; }
    const k = S.breaches.filter((b) => b.deck === d.id).reduce((s, b) => s + b.size * 0.012, 0) + (d.vent ? 0.08 : 0);
    if (k > 0) { const f = Math.exp(-k * dt); d.o2 *= f; d.n2 *= f; d.co2 *= f; }
    d.o2 -= 0.0015 * counts[d.id] * dt;
    d.co2 += (0.0012 * counts[d.id] + 0.0035) * dt;
    let fire = 0;
    for (const id of compsOnDeck(d.id)) fire += S.comps[id].fire;
    d.o2 -= 0.02 * fire * dt; d.co2 += 0.012 * fire * dt;
    d.co2 = Math.max(0.03, d.co2 - scrubE * 0.02 * dt);
    const breached = S.breaches.some((b) => b.deck === d.id);
    if (ls > 0 && !d.vent && !d.isolate && (!breached || d.force)) {
      const rate = 1.2 * ls * dt;
      if (d.o2 < 21 && L.o2 > 0) { const add = Math.min(21 - d.o2, rate); d.o2 += add; L.o2 -= add * KG_PER_KPA.o2; }
      if (d.n2 < 79 && L.n2 > 0) { const add = Math.min(79 - d.n2, rate * 2.5); d.n2 += add; L.n2 -= add * KG_PER_KPA.n2; }
      if (d.o2 > 23) d.o2 -= 0.2 * dt;
    }
    d.o2 = Math.max(0, d.o2); d.n2 = Math.max(0, d.n2); d.co2 = Math.max(0, d.co2);
    L.o2 = Math.max(0, L.o2); L.n2 = Math.max(0, L.n2);
    const P = d.o2 + d.n2 + d.co2;
    const tgt = P < 5 ? -40 : 21 + Math.max(0, hf - 0.55) * 70 + fire * 25;
    d.temp += (tgt - d.temp) * Math.min(1, (P < 5 ? 0.005 : 0.02) * dt);
    // radiation (mSv/s)
    let rad = 0.00004;
    rad += stormRad;
    if (d.id === 0) rad *= 1 - 0.6 * S.mass.rmass / SHIP.rmassMax;
    if (d.id === 4) rad *= 1.2;
    if (d.id === 2) rad += (S.effects.leakT > 0 ? 1.5 : 0) + (S.effects.reactorRadT > 0 ? 18 : 0);
    d.rad = rad;
  }
}

// ---------- players ----------
export function killPlayer(S, p, why) {
  p.state = 'dead'; p.respawnT = 12; p.seat = null;
  if (p.item) { S.items.push({ id: 'i' + Math.random().toString(36).slice(2, 8), type: p.item.type, charge: p.item.charge, deck: p.deck, x: p.x, z: p.z }); p.item = null; }
  log(S, `${p.name} has died${why ? ' — ' + why : ''}.`, 'bad');
  fx(S, 'death', { id: p.id });
}
function updatePlayers(S, dt) {
  const L = S.life;
  S.medActive = false;
  for (const p of Object.values(S.players)) {
    if (!p.connected) continue;
    if (p.state === 'alive') {
      const d = S.decks[p.deck];
      const P = d.o2 + d.n2 + d.co2;
      let dmg = 0, cause = '';
      if (p.suit) {
        p.suitO2 -= dt;
        if (p.suitO2 <= 0) { p.suitO2 = 0; dmg += 8; cause = 'suit oxygen'; }
        if (d.temp > 90) { dmg += (d.temp - 90) * 0.2; cause = 'heat'; }
      } else {
        if (P < 25) { dmg += 14; cause = 'vacuum exposure'; }
        else if (d.o2 < 13) { dmg += (13 - d.o2) * 0.9; cause = 'hypoxia'; }
        if (d.co2 > 2) { dmg += (d.co2 - 2) * 1.4; cause = 'CO2 poisoning'; }
        if (d.temp > 55) { dmg += (d.temp - 55) * 0.3; cause = 'heat'; }
        if (d.temp < -5) { dmg += 1.5; cause = 'cold'; }
      }
      for (const id of compsOnDeck(p.deck)) {
        const c = S.comps[id];
        if (c.fire > 0.1) {
          const cp = compPos(id);
          if (Math.hypot(p.x - cp.x, p.z - cp.z) < COMPS[id].fp + 1.6) { dmg += 7 * c.fire * (p.suit ? 0.4 : 1); cause = 'burns'; }
        }
      }
      let rad = d.rad;
      if (inShelter(p)) rad *= 0.05;
      if (p.suit) rad *= 0.85;
      p.dose += (rad * dt) / 1000;
      if (p.dose > 5) { dmg += (p.dose - 5) * 0.6; cause = 'radiation sickness'; }
      if (S.drive.g > 2.2 && !p.seat) { dmg += (S.drive.g - 2.2) * 3; cause = 'high-g trauma'; }
      if (p.deck === EXT_DECK && S.drive.g > EXT.maxG) {
        // mag boots can't hold under thrust: the safety tether reels the crew member back into the airlock
        const ap = airlockInside();
        Object.assign(p, { deck: AIRLOCK.deck, x: ap.x, z: ap.z, tp: p.tp + 1, seat: null });
        p.hp -= 25;
        log(S, `${p.name} was torn off the hull by thrust and reeled in on the safety tether!`, 'bad');
        fx(S, 'hit', { deck: AIRLOCK.deck, power: 0.4 });
      }
      if (L.food <= 0) { dmg += 0.15; cause = 'starvation'; }
      if (L.water <= 0) { dmg += 0.25; cause = 'dehydration'; }
      if (p.god) dmg = 0;
      p.maxHp = clamp(100 - p.dose * 10, 30, 100);
      p.hp -= dmg * dt;
      if (dmg === 0 && p.hp < Math.min(p.maxHp, 60)) p.hp += 0.15 * dt;
      if (p.seat === 'medbay' && eff(S, 'medbay') > 0 && p.hp < p.maxHp) { p.hp += 6 * eff(S, 'medbay') * dt; S.medActive = true; }
      p.hp = Math.min(p.hp, p.maxHp);
      p.lastCause = cause || p.lastCause;
      if (p.hp <= 0) {
        p.hp = 0; p.state = 'downed'; p.downT = 40; p.seat = null;
        log(S, `${p.name} is DOWN (${p.lastCause || 'injuries'}) — get a medkit to them!`, 'bad');
        fx(S, 'down', { id: p.id });
      }
    } else if (p.state === 'downed') {
      p.downT -= dt;
      if (p.downT <= 0) killPlayer(S, p, p.lastCause);
    } else if (p.state === 'dead') {
      p.respawnT -= dt;
      if (p.respawnT <= 0) {
        if (S.pods > 0) {
          S.pods--; S.stats.podsUsed++;
          const cp = polar(COMPS.cryo.a, COMPS.cryo.r - 2.2);
          Object.assign(p, { state: 'alive', hp: 100, dose: 0, suit: false, suitO2: 300, deck: 3, x: cp.x, z: cp.z, item: null, tp: p.tp + 1, lastCause: '' });
          log(S, `${p.name}: backup crew member thawed from cryo (${S.pods} pod${S.pods === 1 ? '' : 's'} left).`, 'warn');
        } else {
          p.state = 'spectator';
          log(S, `${p.name} has no backup crew left. Spectating.`, 'bad');
        }
      }
    }
  }
  // cryo pods need power
  if (eff(S, 'cryo') <= 0 && S.pods > 0) {
    S.cryoOffT = (S.cryoOffT || 0) + dt;
    if (S.cryoOffT > 90) { S.cryoOffT = 0; S.pods--; log(S, 'Cryo bay unpowered — a backup crew member has died in their pod!', 'bad'); }
  } else S.cryoOffT = 0;
}

export function airlockInside() { return polar(AIRLOCK.a, ROOM_R - 1.6); }

// ---------- fabricator, drones, magazine ----------
function updateWorkshops(S, dt) {
  const F = S.fab;
  if (F.queue.length) {
    const job = F.queue[0];
    job.p += (dt * eff(S, 'fabricator')) / job.t;
    if (job.p >= 1) {
      F.queue.shift();
      if (job.item === 'suppressant') S.life.suppressant += job.qty;
      else S.stores[job.item] = (S.stores[job.item] || 0) + job.qty;
      log(S, `Fabricator: ${job.name} complete`, 'good');
    }
  }
  const Dr = S.drones;
  for (const j of Dr.jobs) j.t -= dt * Math.max(0.15, eff(S, 'dronebay'));
  for (const j of Dr.jobs.filter((j) => j.t <= 0)) {
    if (j.target === 'hull') { S.hull = Math.min(100, S.hull + 6); log(S, 'Drones: hull plating patched (+6%)', 'good'); }
    else { S.comps[j.target].hp = Math.min(100, S.comps[j.target].hp + 50); log(S, `Drones: ${COMPS[j.target].name} repaired`, 'good'); }
  }
  Dr.jobs = Dr.jobs.filter((j) => j.t > 0);
  for (const t of S.weap.tubes) {
    if (t.load > 0) {
      t.load += (dt * eff(S, 'magazine')) / 8;
      if (t.load >= 1) { t.load = 0; t.loaded = true; log(S, 'Torpedo tube loaded', 'good'); }
    }
  }
}

// ---------- alert & end conditions ----------
function updateAlert(S) {
  const hf = heatFrac(S);
  const anyFire = INTERNAL.some((id) => S.comps[id].fire > 0);
  const hostile = S.enc && S.enc.enemies.some((e) => !e.dead && !e.gone);
  const downed = Object.values(S.players).some((p) => p.state === 'downed');
  let a = 'green';
  if (INTERNAL.some((id) => S.comps[id].hp < 25) || hf > 0.75 || S.effects.stormWarn > 0 || (S.power.deficit > 0.5) || S.life.sat > 0.85 || S.decks.some((d) => d.co2 > 1.5)) a = 'yellow';
  if (hostile || anyFire || S.breaches.length || S.reactor.stab < 0.3 || hf > 0.92 || S.hull < 25 || S.effects.stormT > 0 || downed) a = 'red';
  if (a !== S.alert) { S.alert = a; fx(S, 'alert', { level: a }); }
}
function checkEnd(S, dt) {
  if (S.phase !== 'play') return;
  if (S.hull <= 0) { S.hull = 0; S.phase = 'lost'; S.endReason = 'Structural failure. The Wolfram broke apart.'; return; }
  const ps = Object.values(S.players).filter((p) => p.connected);
  if (ps.length && ps.every((p) => p.state === 'spectator')) { S.phase = 'lost'; S.endReason = 'All crew lost and no backup crew left in cryo.'; return; }
  const N = S.nav;
  if (N.state === 'transit' && S.mass.rmass <= 0 && Math.abs(N.L - N.x) > 5e8) {
    N.adriftT += dt;
    if (N.adriftT > 90) { S.phase = 'lost'; S.endReason = 'Out of reaction mass. The Wolfram drifts on a trajectory nobody can reach in time.'; }
  } else N.adriftT = 0;
}
