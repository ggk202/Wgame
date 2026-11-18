// All player-initiated state changes. Executed on the host only.
import { COMPS, COMP_IDS, ITEMS, RECIPES, LOCKERS, STATION_PRICES, SHIP, DECKS, WAYPOINTS, ROOM_R, EXT_DECK, RING_DECK, deckName } from './config.js';
import { clamp, polar, compPos, compDeck, log, fx, rand } from './util.js';
import { eff, startFlip, depart, scram, maxG, igniteComp } from './sim.js';
import { startApproach, sasModes } from './attitude.js';
import { fireRail, launchTorpedo, launchSRM, deployChaff, startEncounter, applyHit, addBreach } from './combat.js';
import { castVote, pirateDemand, fireEvent } from './story.js';
import { EVENTS } from './events.js';
import { PARTS, PART_IDS, repairNeeds, missingParts, moduleOf } from './repair.js';
import { beginRendezvous, ORBIT } from './flight.js';
import { BUNKS, bunkPos, BUNK_REACH, EXPERIMENTS, SCI_COST, BAY_IDS, replyHail, podState, POD, POD_CRADLE, deliverCargo, SCOUT } from './crew.js';
import { EXT, AIRLOCK } from './config.js';

const toast = (S, p, text) => fx(S, 'toast', { to: p.id, text });
const dist2 = (p, x, z, y = 0) => Math.hypot(p.x - x, p.z - z, Math.max(0, Math.abs((p.y || 0) - y) - 1.2));
function nearComp(p, id, extra = 2.2) {
  const c = COMPS[id];
  if (!c || compDeck(id) !== p.deck) return false;
  const cp = compPos(id);
  return dist2(p, cp.x, cp.z, cp.y) < c.fp + extra;
}
// Console guard: player must be seated at one of the listed consoles and it must work.
function at(S, p, ids) {
  ids = Array.isArray(ids) ? ids : [ids];
  if (!ids.includes(p.seat)) return null;
  if (eff(S, p.seat) <= 0) { toast(S, p, 'Console offline'); return null; }
  return p.seat;
}

export function applyAction(S, pid, a, args = {}) {
  const p = S.players[pid];
  if (!p) return;
  if (a === 'vote') { castVote(S, pid, args.opt); return; }
  if (a === 'chat') return;
  if (a.startsWith('debug.')) return debugAction(S, p, a, args);
  if (a === 'ghost.mode') { // dead or spectating crew: free camera, a scout drone, or the external camera net
    if (p.state !== 'dead' && p.state !== 'spectator') return;
    const m = ['free', 'scout', 'cams'].includes(args.m) ? args.m : 'free';
    p.ghost = m;
    if (m === 'scout') Object.assign(p, { deck: EXT_DECK, x: EXT.hatch.x + 6, y: EXT.hatch.y + 4, z: EXT.hatch.z, tp: p.tp + 1 });
    else if (m === 'free' && p.deck === EXT_DECK) Object.assign(p, { deck: 3, x: 0, y: 0, z: 3, tp: p.tp + 1 });
    return;
  }
  if (p.state !== 'alive') return;
  if (p.sleep && a !== 'wake') return; // asleep: nothing until you wake
  const err = (t) => toast(S, p, t);
  const R = S.reactor, D = S.drive, N = S.nav, W = S.weap;

  switch (a) {
    // ----- presence -----
    case 'seat': p.seat = args.id && COMPS[args.id] && nearComp(p, args.id, 3) ? args.id : null; return;

    // ----- physical work (sent repeatedly while holding the key; each call = 0.25 s of work) -----
    case 'work': return doWork(S, p, args);

    // ----- sleep -----
    case 'sleep': {
      const b = BUNKS.find((x) => x.id === args.bunk);
      if (!b || b.deck !== p.deck) return;
      const bp = bunkPos(b); if (Math.hypot(p.x - bp.x, p.z - bp.z) > BUNK_REACH + 1) return err('Too far from the bunk');
      if (Object.values(S.players).some((q) => q !== p && q.sleep && q.sleep.bunk === b.id)) return err('Someone is asleep in that bunk');
      if (S.alert === 'red') return err('Not with the alarm going');
      if ((p.fatigue || 0) < 15) return err('You are not tired');
      p.sleep = { bunk: b.id, t: 0 }; p.seat = null; p.work = null;
      log(S, `${p.name} turns in (${b.label})`, 'info'); return;
    }
    case 'wake': if (p.sleep && !(p.sleep.forced && p.sleep.t < 10)) p.sleep = null; return;

    // ----- science (ring bays) -----
    case 'sci.start': {
      const ex = EXPERIMENTS[args.ex];
      if (!ex || !BAY_IDS.includes(args.bay) || p.deck !== RING_DECK) return;
      S.sci = S.sci || { bays: {}, done: {} };
      if (S.sci.bays[args.bay]) return err('That rack is busy');
      if (Object.values(S.sci.bays).some((r) => r && r.ex === args.ex)) return err('That experiment is already running in another bay');
      if ((S.stores.feedstock || 0) < SCI_COST.feedstock) return err(`Needs ${SCI_COST.feedstock} kg of fabricator feedstock for the payload`);
      S.stores.feedstock -= SCI_COST.feedstock;
      S.sci.bays[args.bay] = { ex: args.ex, p: 0, by: p.name };
      log(S, `${p.name} started ${ex.name} in ${args.bay.replace('bay', 'science bay ')}`, 'info'); return;
    }
    case 'sci.stop': if (S.sci && S.sci.bays[args.bay] && p.deck === RING_DECK) { S.sci.bays[args.bay] = null; log(S, 'Experiment aborted', 'warn'); } return;

    // ----- comms -----
    case 'comms.reply':
      if (!at(S, p, ['comms', 'helm'])) return;
      if (!replyHail(S, args.id, args.opt)) return err('Cannot reply to that');
      log(S, `${p.name}: reply transmitted`, 'info'); return;

    // ----- the work pod -----
    case 'pod.board': {
      const P = podState(S);
      if (p.deck !== EXT_DECK || P.at === 'lost' || P.pilot) return;
      if (Math.hypot(p.x - P.x, (p.y || 0) + 1.6 - P.y, p.z - P.z) > 4.5) return err('Get closer to the pod');
      P.pilot = p.id; P.at = 'out'; p.pod = true; p.item = p.item || null;
      Object.assign(p, { x: P.x, y: P.y - 1.0, z: P.z, tp: p.tp + 1 });
      log(S, `${p.name} boards the work pod`, 'info'); return;
    }
    case 'pod.exit': {
      const P = podState(S);
      if (P.pilot !== p.id) return;
      const dc = Math.hypot(P.x - POD_CRADLE.x, P.y - POD_CRADLE.y, P.z - POD_CRADLE.z);
      const dh = Math.hypot(P.x - EXT.hatch.x, P.y - EXT.hatch.y, P.z - EXT.hatch.z);
      if (dc > POD.deliver && dh > EXT.tether - 5) return err('Too far from the hatch to clip on a tether. Fly back first.');
      if (dc <= POD.deliver) {
        if (P.carry) { const c = (S.cargo || []).find((x) => x.id === P.carry); P.carry = null; if (c) deliverCargo(S, c); }
        P.at = 'cradle'; Object.assign(P, { x: POD_CRADLE.x, y: POD_CRADLE.y, z: POD_CRADLE.z, vz: 0 });
      }
      P.pilot = null; p.pod = false;
      Object.assign(p, { x: P.x + 1.6, y: P.y - 1.6, z: P.z, tp: p.tp + 1 });
      log(S, `${p.name} leaves the work pod${P.at === 'cradle' ? ' (docked in its cradle)' : ''}`, 'info'); return;
    }
    case 'pod.grab': {
      const P = podState(S);
      if (P.pilot !== p.id) return;
      if (P.carry) {
        const c = (S.cargo || []).find((x) => x.id === P.carry); P.carry = null;
        if (c && Math.hypot(P.x - POD_CRADLE.x, P.y - POD_CRADLE.y, P.z - POD_CRADLE.z) <= POD.deliver) deliverCargo(S, c);
        else if (c) { c.vz = 0; toast(S, p, 'Released'); }
        return;
      }
      const c = (S.cargo || []).map((x) => ({ x, d: Math.hypot(x.x - P.x, x.y - P.y, x.z - P.z) })).sort((a, b) => a.d - b.d)[0];
      if (!c || c.d > POD.grab) return err('Nothing within reach of the arm');
      P.carry = c.x.id; log(S, `${p.name} grapples the ${c.x.kind === 'drone' ? 'damaged drone' : 'container'}. Bring it to the pod cradle by the EVA hatch.`, 'good'); return;
    }

    // ----- items -----
    case 'item.drop':
      if (!p.item) return;
      { const big = p.deck === EXT_DECK || p.deck === RING_DECK ? 400 : ROOM_R;
        S.items.push({ id: 'i' + Math.random().toString(36).slice(2, 8), type: p.item.type, charge: p.item.charge, deck: p.deck, x: clamp(+args.x || p.x, -big, big), y: clamp(+args.y || 0, -60, 60), z: clamp(+args.z || p.z, -big, big) }); }
      p.item = null; return;
    case 'item.pickup': {
      const it = S.items.find((i) => i.id === args.id);
      if (!it || p.item || it.deck !== p.deck || dist2(p, it.x, it.z) > 3) return;
      p.item = { type: it.type, charge: it.charge };
      S.items = S.items.filter((i) => i !== it); return;
    }
    case 'repair.complete': { // the minigame was finished: consume the parts and restore the module
      const id = args.id, c = S.comps[id];
      if (!c || !COMPS[id]) return;
      if (!nearComp(p, id, p.pod ? POD.reach : 3.4)) return err('Too far away');
      if (c.fire > 0.05) return err('Put the fire out first');
      const need = repairNeeds(S, id);
      if (!need) { if (c.hp < 100) c.hp = 100; return; }
      if (args.key !== need.issues.map((i) => i.label).join('|')) return err('That fault was already dealt with');
      const miss = missingParts(S, need.parts);
      if (miss.length) return err(`Missing parts: ${miss.join(', ')}`);
      for (const [k, n] of Object.entries(need.parts)) S.stores[k] -= n;
      const was = c.hp;
      c.hp = was <= 0 ? 70 : 100; c.issue = null; c.issue2 = null; c.dead = false;
      log(S, `${p.name} repaired ${COMPS[id].name} (${need.issues.map((i) => i.label.toLowerCase()).join(', ')})${was <= 0 ? ' — back online at 70%' : ''}`, 'good');
      fx(S, 'repaired', { id });
      return;
    }
    case 'impact': { const v = clamp(+args.v || 0, 0, 30); if (v > 5.5 && p.state === 'alive' && !p.god) { p.hp -= (v - 5.5) * 9; log(S, `${p.name} hit ${p.deck === EXT_DECK ? 'the hull' : 'the deck'} hard (${v.toFixed(1)} m/s)`, 'warn'); fx(S, 'hit', { deck: p.deck, power: 0.2 }); } return; }
    case 'eva': log(S, args.out ? `${p.name} cycled out through the airlock for EVA` : `${p.name} is back inside`, 'info'); return;
    case 'locker.suit': {
      const lk = LOCKERS.find((l) => l.deck === p.deck);
      if (!lk) return;
      const lp = polar(lk.a, lk.r);
      if (dist2(p, lp.x, lp.z) > 3.5) return;
      p.suit = !p.suit; p.suitO2 = 300;
      log(S, `${p.name} ${p.suit ? 'suited up' : 'took off the vacuum suit'}`, 'info'); return;
    }
    case 'locker.refill': p.suitO2 = 300; if (p.item && p.item.type === 'ext') p.item.charge = 100; return;
    case 'locker.take': case 'stores.take': {
      if (p.item) return err('Hands full — drop or return your item first (G)');
      const t = args.type;
      if (!ITEMS[t]) return;
      if (a === 'locker.take' && !['ext', 'patch', 'medkit', 'tablet'].includes(t)) return;
      if (a === 'stores.take' && !nearComp(p, 'stores', 3)) return;
      if (t !== 'ext' && t !== 'tablet') { if ((S.stores[t] || 0) <= 0) return err(`No ${ITEMS[t].name} in stores`); S.stores[t]--; }
      p.item = { type: t, charge: 100 }; return;
    }
    case 'stores.return': {
      if (!p.item) return;
      if (p.item.type !== 'ext' && p.item.type !== 'tablet' && p.item.charge >= 50) S.stores[p.item.type] = (S.stores[p.item.type] || 0) + 1;
      p.item = null; return;
    }

    // ----- helm -----
    case 'helm.ignite':
      if (!at(S, p, ['helm', 'drivectl', 'drivecore'])) return;
      if (!['transit', 'capture', 'orbit', 'rendezvous'].includes(N.state)) return err(N.state === 'approach' ? 'Main drive locked out during proximity operations' : 'Undock first');
      if (S.comps.drivecore.hp <= 0) return err('Drive core destroyed');
      if (eff(S, 'injector') <= 0) return err('Pellet injector offline');
      if (S.mass.rmass <= 0) return err('No reaction mass');
      D.ignited = true; log(S, `${p.name}: drive ignition`, 'info'); fx(S, 'ignite'); return;
    case 'helm.cutoff': if (!at(S, p, ['helm', 'drivectl', 'drivecore'])) return; D.ignited = false; D.cmdG = 0; N.autopilot = false; log(S, `${p.name}: drive cut-off`, 'info'); return;
    case 'helm.g': if (!at(S, p, ['helm', 'drivectl', 'drivecore'])) return; D.cmdG = clamp(+args.g || 0, 0, maxG(S)); N.autopilot = false; return;
    case 'helm.flip': { if (!at(S, p, ['helm', 'drivectl'])) return; N.autopilot = false; const e = startFlip(S); if (e) err(e); return; }
    case 'att.mode':
      if (!at(S, p, ['helm', 'drivectl'])) return;
      if (!sasModes(S).includes(args.m)) return err('That SAS mode is not available at this difficulty');
      if (args.m === 'target' && !S.sensors.lock) return err('No target lock: lock a contact at Sensors or Fire Control first');
      S.att.mode = args.m; if (N.autopilot && args.m !== 'pro' && args.m !== 'retro') N.autopilot = false; return;
    case 'att.cmd': {
      if (!at(S, p, 'helm')) return;
      const r = (args.r || [0, 0, 0]).map((x) => clamp(+x || 0, -1, 1)), t = (args.t || [0, 0, 0]).map((x) => clamp(+x || 0, -1, 1));
      if (r.some((x) => x) && N.autopilot) { N.autopilot = false; log(S, 'Autopilot disengaged: manual attitude control', 'warn'); }
      S.att.cmd = r; S.att.tcmd = t; S.att.cmdT = S.t; return;
    }
    case 'helm.autopilot':
      if (!at(S, p, 'helm')) return;
      if (!S.settings.autopilot) return err('No autopilot at this difficulty');
      if (eff(S, 'navcomp') <= 0) return err('Navigation computer offline');
      N.autopilot = !!args.on; log(S, `Autopilot ${N.autopilot ? 'ENGAGED' : 'disengaged'}`, 'info'); return;
    case 'helm.manual':
      if (!at(S, p, ['helm', 'navcomp'])) return;
      N.manual = !!args.on; if (N.manual) N.autopilot = false;
      log(S, N.manual ? `${p.name}: manual burns — the flight computer will advise, the pilot flies` : `${p.name}: burn advice off`, 'info'); return;
    case 'helm.evasive': if (!at(S, p, 'helm')) return; D.evasive = !!args.on; return;
    case 'helm.maneuver': if (!at(S, p, 'helm')) return; D.maneuver = ['hold', 'open', 'close'].includes(args.m) ? args.m : 'hold'; return;
    case 'helm.dock':
      if (!at(S, p, ['helm', 'comms'])) return;
      if (N.state !== 'orbit') return err('Not in orbit');
      if (S.tutorial) { startApproach(S); return; }
      if ((N.ecc || 0) > ORBIT.ecc) return err(`Orbit too eccentric (e=${(N.ecc || 0).toFixed(2)}). Burn retrograde at periapsis to circularise first.`);
      if (N.holdT > 0) return err(`Traffic control: hold for ${Math.ceil(N.holdT)} s`);
      if (N.trafficLate) { N.trafficLate = false; N.holdT = 120; log(S, 'Traffic control: no flight plan on file for Wolfram. Hold 2 minutes for slot allocation.', 'warn'); return; }
      beginRendezvous(S); return;
    case 'helm.reapproach':
      if (!at(S, p, 'helm')) return;
      if (N.state !== 'approach') return;
      startApproach(S); log(S, 'Approach reset: backing out to the 400 m hold point', 'info'); return;
    case 'helm.depart':
      if (!at(S, p, ['helm', 'comms'])) return;
      if (!depart(S)) err('Cannot depart'); return;
    case 'nav.plan':
      if (!at(S, p, ['navcomp', 'helm'])) return;
      N.plan.cruise = clamp(+args.cruise || N.plan.cruise, 50, 2000);
      N.plan.g = clamp(+args.g || N.plan.g, 0.05, 1.5); return;

    // ----- sensors / tactical / comms -----
    case 'sensors.ping':
      if (!at(S, p, ['sensors', 'tactical'])) return;
      if (S.sensors.pingCd > 0) return err('Active array recharging');
      S.sensors.pingCd = 20; S.sensors.pingT = 3;
      if (S.sensors.lock) S.sensors.q = Math.min(1, S.sensors.q + 0.35 * eff(S, 'sensorArray'));
      log(S, 'Active radar/lidar ping', 'info'); return;
    case 'sensors.lock': if (!at(S, p, ['sensors', 'tactical'])) return; if (S.sensors.lock !== args.id) { S.sensors.lock = args.id; S.sensors.q = 0; } return;
    case 'tac.charge': if (!at(S, p, 'tactical')) return; W.charging = !!args.on; return;
    case 'tac.rail': { if (!at(S, p, 'tactical')) return; const e = fireRail(S); if (e) err(e); return; }
    case 'tac.torp': { if (!at(S, p, 'tactical')) return; const e = launchTorpedo(S); if (e) err(e); return; }
    case 'ring.target': if (!at(S, p, 'centrifuge')) return; S.ring.target = clamp(+args.g || 0, 0, 0.5); S.ring.brake = false; log(S, `${p.name}: centrifuge set to ${S.ring.target.toFixed(2)} g`, 'info'); return;
    case 'ring.brake': if (!at(S, p, 'centrifuge')) return; S.ring.brake = !!args.on; if (args.on) { S.ring.target = 0; log(S, `${p.name}: centrifuge emergency brake`, 'warn'); } return;
    case 'tac.srm': { if (!at(S, p, 'tactical')) return; const e = launchSRM(S, args.n || 1); if (e) err(e); return; }
    case 'tac.chaff': { if (!at(S, p, 'tactical')) return; const e = deployChaff(S); if (e) err(e); return; }
    case 'tac.pdc':
      if (!at(S, p, 'tactical')) return;
      if (args.mode === 'auto' && !S.settings.autoPDC) return err('No automatic fire control at this difficulty');
      if (['auto', 'manual', 'off'].includes(args.mode)) W.pdcMode = args.mode; return;
    case 'tac.focus': if (!at(S, p, 'tactical')) return; if (!W.focus.includes(args.id)) W.focus.push(args.id); return;
    case 'comms.hail': { if (!at(S, p, 'comms')) return; if (eff(S, 'antenna') <= 0 && eff(S, 'comms') < 0.5) return err('Antenna damaged'); const e = pirateDemand(S); if (e) err(e); return; }
    case 'station.buy': return stationBuy(S, p, args.item);

    // ----- reboot any computer from its own console -----
    case 'reboot': {
      const id = p.seat;
      if (!id || !COMPS[id].computer || !S.comps[id].fault || S.comps[id].hp <= 0) return;
      if (S.comps[id].reboot > 0) return;
      S.comps[id].reboot = 15; log(S, `${p.name} rebooting ${COMPS[id].name} (15 s)`, 'info'); return;
    }

    // ----- reactor -----
    case 'reactor.target': if (!at(S, p, 'reactor')) return; if (S.settings.autoPower) return err('Automatic load following is active'); R.target = clamp(+args.v, 0, 1); return;
    case 'reactor.field': if (!at(S, p, 'reactor')) return; R.field = clamp(+args.v, -1, 1); return;
    case 'reactor.scram': if (!at(S, p, ['reactor', 'powerdist'])) return; scram(S, `manual (${p.name})`); return;
    case 'reactor.preheat':
      if (!at(S, p, 'reactor')) return;
      if (R.state !== 'scram') return err('Reactor must be shut down (SCRAMmed) first');
      if (S.comps.reactor.hp <= 10) return err('Reactor too damaged to restart (repair above 10%)');
      if (S.battery.charge < 0.1) return err('Battery too low to energise the magnets');
      R.state = 'preheat'; R.preheat = 0; log(S, 'Reactor pre-heat: energising confinement magnets…', 'info'); return;
    case 'reactor.ignite':
      if (!at(S, p, 'reactor')) return;
      if (R.state !== 'ready') return err('Pre-heat first');
      R.state = 'running'; R.actual = 0.1; R.target = Math.max(R.target, 0.4); R.stab = 0.6; R.field = R.drift + rand(-0.15, 0.15);
      log(S, 'Reactor IGNITION — fusion sustained', 'good'); fx(S, 'ignite'); return;

    // ----- power & thermal -----
    case 'power.breaker': if (!at(S, p, ['powerdist', 'battery'])) return; if (S.comps[args.id]) S.comps[args.id].on = !!args.on; return;
    case 'power.prio': if (!at(S, p, ['powerdist', 'battery'])) return; if (S.comps[args.id]) S.comps[args.id].prio = clamp(Math.round(+args.p), 1, 3); return;
    case 'thermal.radiators':
      if (!at(S, p, ['thermal', 'coolpump'])) return;
      if (S.settings.autoRadiators) return err('Radiators are under automatic control');
      S.heat.radExt = !!args.ext; log(S, `Radiators ${S.heat.radExt ? 'extending' : 'retracting'}`, 'info'); return;

    // ----- life support -----
    case 'life.vent': if (!at(S, p, 'lifesupport')) return; S.decks[args.deck].vent = true; S.decks[args.deck].force = false; log(S, `Venting ${DECKS[args.deck].name} deck to space!`, 'warn'); return;
    case 'life.seal': if (!at(S, p, 'lifesupport')) return; S.decks[args.deck].vent = false; return;
    case 'life.force': if (!at(S, p, 'lifesupport')) return; S.decks[args.deck].force = !!args.on; return;
    case 'life.isolate': if (!at(S, p, 'lifesupport')) return; S.decks[args.deck].isolate = !!args.on; return;
    case 'life.suppress':
      if (!at(S, p, 'lifesupport')) return;
      if (S.life.suppressant <= 0) return err('No suppressant charges — fabricate more');
      S.life.suppressant--;
      for (const id of COMP_IDS) if (!COMPS[id].ext && COMPS[id].deck === args.deck) S.comps[id].fire = 0;
      S.decks[args.deck].o2 = Math.max(0, S.decks[args.deck].o2 - 6); S.decks[args.deck].n2 += 6;
      log(S, `Fire suppression flooded ${DECKS[args.deck].name} deck`, 'info'); return;
    case 'life.electrolysis': if (!at(S, p, 'lifesupport')) return; S.life.electrolysis = !!args.on; return;
    case 'scrub.regen': if (!at(S, p, 'scrubbers')) return; if (S.life.regen > 0) return; S.life.regen = 60; log(S, 'Scrubber bake-out started (60 s, scrubbing offline)', 'warn'); return;
    case 'med.rad':
      if (!at(S, p, 'medbay')) return;
      if (S.stores.medkit <= 0) return err('Needs a medkit from stores');
      if (p.dose < 0.2) return err('No significant radiation dose');
      S.stores.medkit--; p.dose = Math.max(0, p.dose - 1.2); log(S, `${p.name} received radiation countermeasures`, 'info'); return;

    // ----- cargo -----
    case 'fab.queue': {
      if (!at(S, p, 'fabricator')) return;
      const r = RECIPES[args.item];
      if (!r) return;
      if (S.fab.queue.length >= 6) return err('Queue full');
      if (S.stores.feedstock < r.kg) return err('Not enough feedstock');
      S.stores.feedstock -= r.kg;
      S.fab.queue.push({ item: args.item, name: r.name, qty: r.qty, t: r.t, p: 0 }); return;
    }
    case 'fab.cancel': {
      if (!at(S, p, 'fabricator')) return;
      const j = S.fab.queue[args.i];
      if (!j) return;
      S.stores.feedstock += RECIPES[j.item].kg; S.fab.queue.splice(args.i, 1); return;
    }
    case 'drones.send': {
      if (!at(S, p, 'dronebay')) return;
      if (S.drones.jobs.length >= S.drones.total) return err('All drones busy');
      if (S.drones.jobs.some((j) => j.target === args.target)) return err('Already being repaired');
      if (args.target === 'hull') { if (S.stores.patch <= 0) return err('Needs a hull patch in stores'); S.stores.patch--; }
      else {
        if (!COMPS[args.target] || !COMPS[args.target].ext) return;
        const need = repairNeeds(S, args.target);
        if (need) { const miss = missingParts(S, need.parts); if (miss.length) return err(`Drone needs parts: ${miss.join(', ')}`); for (const [k, n] of Object.entries(need.parts)) S.stores[k] -= n; }
      }
      S.drones.jobs.push({ target: args.target, t: 35 });
      log(S, `Drone dispatched: ${args.target === 'hull' ? 'hull plating' : COMPS[args.target].name}`, 'info'); return;
    }
    case 'mag.load': {
      if (!at(S, p, 'magazine')) return;
      const t = S.weap.tubes[args.i];
      if (!t || t.loaded || t.load > 0) return;
      if (S.stores.missiles <= 0) return err('No torpedoes in stock');
      S.stores.missiles--; t.load = 0.001; return;
    }
    // ----- drive deck -----
    case 'drive.override': if (!at(S, p, ['drivectl', 'drivecore'])) return; if (D.locked > 0) { D.locked = 0; log(S, 'Throttle valve manually overridden', 'good'); } return;
    case 'tanks.purge':
      if (!at(S, p, ['tanks', 'injector'])) return;
      if (S.mass.contam <= 0.01) return err('Reaction mass is clean');
      S.mass.rmass = Math.max(0, S.mass.rmass - 0.04 * SHIP.rmassMax); S.mass.contam = 0;
      log(S, 'Contaminated reaction mass purged (−88 t)', 'info'); return;
  }
}

function doWork(S, p, { kind, target }) {
  const err = (t) => toast(S, p, t);
  const it = p.item;
  if (kind === 'repair') {
    if (!nearComp(p, target, 2.2)) return;
    const c = S.comps[target];
    if (c.fire > 0.05) return err('Put the fire out first');
    if (c.hp >= 100) return;
    // light wear can still be tended by hand; real faults need the repair procedure (and parts)
    if (c.issue !== null && c.issue !== undefined) return err(`${moduleOf(target).name}: ${repairNeeds(S, target).issues.map((i) => i.label).join(' + ')} — press R for the repair procedure`);
    c.hp = Math.min(100, c.hp + 0.9);
    if (c.hp > 0 && c.dead) c.dead = false;
    return;
  }
  if (kind === 'ext') {
    if (!it || it.type !== 'ext' || it.charge <= 0) return err('Extinguisher empty — refill at an emergency locker');
    if (!nearComp(p, target, 3.6)) return;
    const c = S.comps[target];
    if (c.fire <= 0) return;
    c.fire = Math.max(0, c.fire - 0.2); it.charge -= 4;
    if (c.fire <= 0) log(S, `${p.name} put out the fire on ${COMPS[target].name}`, 'good');
    return;
  }
  if (kind === 'patch') {
    if (!it || it.type !== 'patch') return;
    const b = S.breaches.find((x) => x.id === target);
    if (!b || b.deck !== p.deck) return;
    const bp = polar(b.a, ROOM_R);
    if (dist2(p, bp.x, bp.z) > 3.4) return;
    b.patch += 0.25 / 4 / Math.max(0.6, b.size);
    if (b.patch >= 1) { S.breaches = S.breaches.filter((x) => x !== b); p.item = null; log(S, `${p.name} patched a hull breach on ${DECKS[b.deck].name} deck`, 'good'); fx(S, 'chime'); }
    return;
  }
  if (kind === 'medkit') {
    if (!it || it.type !== 'medkit') return;
    const t = target && S.players[target] ? S.players[target] : p;
    if (t !== p && (t.deck !== p.deck || dist2(p, t.x, t.z) > 2.8)) return;
    if (t.state === 'downed') { t.state = 'alive'; t.hp = 40; log(S, `${p.name} revived ${t.name}`, 'good'); }
    else if (t.state === 'alive') t.hp = Math.min(t.maxHp || 100, t.hp + 45);
    else return;
    p.item = null; return;
  }
  if (kind === 'hull') {
    if (!it || it.type !== 'patch' || p.deck !== EXT_DECK) return;
    if (S.hull >= 100) return err('Hull plating is intact');
    p.hullWork = (p.hullWork || 0) + 0.25 / 5;
    if (p.hullWork >= 1) { p.hullWork = 0; S.hull = Math.min(100, S.hull + 7); p.item = null; log(S, `${p.name} welded new hull plating (+7%)`, 'good'); fx(S, 'chime'); }
    return;
  }
  if (kind === 'cartridge') {
    if (!it || it.type !== 'cartridge' || !nearComp(p, 'scrubbers', 2.4)) return;
    S.life.sat = 0; p.item = null; log(S, `${p.name} swapped a scrubber cartridge`, 'good'); return;
  }
}

function stationBuy(S, p, item) {
  const N = S.nav;
  if (N.state !== 'docked') return toast(S, p, 'Only while docked');
  if (!at(S, p, ['comms', 'helm'])) return;
  const pr = STATION_PRICES[item];
  if (!pr) return;
  if (S.credits < pr.cost) return toast(S, p, 'Not enough credits');
  S.credits -= pr.cost;
  const st = S.stores;
  switch (item) {
    case 'board': st.board += 4; break;
    case 'wire': st.wire += 6; break;
    case 'seal': st.seal += 6; break;
    case 'bearing': st.bearing += 4; break;
    case 'cell': st.cell += 4; break;
    case 'filler': st.filler += 8; break;
    case 'optic': st.optic += 2; break;
    case 'patch': st.patch += 2; break;
    case 'medkit': st.medkit += 2; break;
    case 'cartridge': st.cartridge += 2; break;
    case 'missiles': st.missiles += 2; break;
    case 'srm': st.srm += 8; break;
    case 'slugs': st.slugs += 10; break;
    case 'pdcAmmo': st.pdcAmmo += 2000; break;
    case 'feedstock': st.feedstock += 100; break;
    case 'gas': S.life.o2 += 400; S.life.n2 += 1000; break;
    case 'water': S.life.water += 1000; S.life.food += 60; break;
    case 'pellets': S.mass.pellets += 150; break;
    case 'hull': S.hull = Math.min(100, S.hull + 15); break;
    case 'yard': for (const id of COMP_IDS) S.comps[id].hp = Math.min(100, S.comps[id].hp + 40); break;
  }
  log(S, `Purchased: ${pr.name}`, 'info');
}

function debugAction(S, p, a, args) {
  if (!S.debug) return;
  switch (a) {
    case 'debug.event': fireEvent(S, args.id); break;
    case 'debug.heal': for (const q of Object.values(S.players)) { q.hp = 100; q.dose = 0; if (q.state !== 'alive' && q.state !== 'spectator') q.state = 'alive'; } break;
    case 'debug.repair': for (const id of COMP_IDS) { S.comps[id].hp = 100; S.comps[id].fire = 0; S.comps[id].fault = 0; } S.breaches = []; S.hull = 100; break;
    case 'debug.resources': Object.assign(S.stores, { board: 20, wire: 20, seal: 20, bearing: 20, cell: 20, filler: 20, optic: 10, srm: 24, patch: 10, medkit: 10, cartridge: 6, feedstock: 500, missiles: 10, slugs: 40, pdcAmmo: 8000, chaff: 6 }); S.mass.rmass = SHIP.rmassMax; S.credits += 50; S.life.o2 = 1500; S.life.n2 = 3500; break;
    case 'debug.skip': if (S.nav.state === 'transit') { S.nav.x = S.nav.L * (args.f ?? 0.9); } break;
    case 'debug.arrive': if (S.nav.state === 'transit') { S.nav.x = S.nav.L - 1e8; S.nav.v = 0; } break;
    case 'debug.warp': S.settings.warpBase = clamp(+args.w || 420, 10, 20000); break;
    case 'debug.god': p.god = !p.god; break;
    case 'debug.hit': applyHit(S, 30, { deck: args.deck ?? null, label: 'Debug hit' }); break;
    case 'debug.breach': addBreach(S, p.deck, rand(-180, 180), 0.8); break;
    case 'debug.fire': igniteComp(S, args.id || 'reactor', 0.5); break;
    case 'debug.storyNext': S.story.nextAt = S.t; break;
    case 'debug.endEnc': if (S.enc) for (const e of S.enc.enemies) e.dead = true; break;
    case 'debug.dock': if (S.nav.state === 'approach') { S.prox.p = [0, 0, 0.5]; S.prox.v = [0, 0, -0.1]; S.att.q = [0, 0, 0, 1]; S.att.w = [0, 0, 0]; S.att.mode = 'off'; } else if (S.nav.state === 'orbit') startApproach(S); break;
    case 'debug.approach': if (S.nav.state === 'transit') { S.nav.x = S.nav.L - 1e8; S.nav.v = 0; } break;
  }
}

export const EVENT_IDS = Object.keys(EVENTS).filter((k) => EVENTS[k].fire);
