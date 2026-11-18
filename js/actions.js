// All player-initiated state changes. Executed on the host only.
import { COMPS, COMP_IDS, ITEMS, RECIPES, LOCKERS, STATION_PRICES, SHIP, DECKS, WAYPOINTS, ROOM_R } from './config.js';
import { clamp, polar, compPos, log, fx, rand } from './util.js';
import { eff, startFlip, depart, scram, maxG, igniteComp } from './sim.js';
import { fireRail, launchTorpedo, deployChaff, startEncounter, applyHit, addBreach } from './combat.js';
import { castVote, pirateDemand, fireEvent } from './story.js';
import { EVENTS } from './events.js';

const toast = (S, p, text) => fx(S, 'toast', { to: p.id, text });
const dist2 = (p, x, z) => Math.hypot(p.x - x, p.z - z);
function nearComp(p, id, extra = 2.2) {
  const c = COMPS[id];
  if (!c || c.ext || c.deck !== p.deck) return false;
  const cp = compPos(id);
  return dist2(p, cp.x, cp.z) < c.fp + extra;
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
  if (p.state !== 'alive') return;
  const err = (t) => toast(S, p, t);
  const R = S.reactor, D = S.drive, N = S.nav, W = S.weap;

  switch (a) {
    // ----- presence -----
    case 'seat': p.seat = args.id && COMPS[args.id] && nearComp(p, args.id, 3) ? args.id : null; return;

    // ----- physical work (sent repeatedly while holding the key; each call = 0.25 s of work) -----
    case 'work': return doWork(S, p, args);

    // ----- items -----
    case 'item.drop':
      if (!p.item) return;
      S.items.push({ id: 'i' + Math.random().toString(36).slice(2, 8), type: p.item.type, charge: p.item.charge, deck: p.deck, x: clamp(+args.x || p.x, -ROOM_R, ROOM_R), z: clamp(+args.z || p.z, -ROOM_R, ROOM_R) });
      p.item = null; return;
    case 'item.pickup': {
      const it = S.items.find((i) => i.id === args.id);
      if (!it || p.item || it.deck !== p.deck || dist2(p, it.x, it.z) > 3) return;
      p.item = { type: it.type, charge: it.charge };
      S.items = S.items.filter((i) => i !== it); return;
    }
    case 'locker.suit': {
      const lk = LOCKERS.find((l) => l.deck === p.deck);
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
      if (a === 'locker.take' && !['ext', 'patch', 'medkit'].includes(t)) return;
      if (a === 'stores.take' && !nearComp(p, 'stores', 3)) return;
      if (t !== 'ext') { if ((S.stores[t] || 0) <= 0) return err(`No ${ITEMS[t].name} in stores`); S.stores[t]--; }
      p.item = { type: t, charge: 100 }; return;
    }
    case 'stores.return': {
      if (!p.item) return;
      if (p.item.type !== 'ext' && p.item.charge >= 50) S.stores[p.item.type] = (S.stores[p.item.type] || 0) + 1;
      p.item = null; return;
    }

    // ----- helm -----
    case 'helm.ignite':
      if (!at(S, p, ['helm', 'drivectl', 'drivecore'])) return;
      if (N.state !== 'transit') return err('Undock first');
      if (S.comps.drivecore.hp <= 0) return err('Drive core destroyed');
      if (eff(S, 'injector') <= 0) return err('Pellet injector offline');
      if (S.mass.rmass <= 0) return err('No reaction mass');
      D.ignited = true; log(S, `${p.name}: drive ignition`, 'info'); fx(S, 'ignite'); return;
    case 'helm.cutoff': if (!at(S, p, ['helm', 'drivectl', 'drivecore'])) return; D.ignited = false; D.cmdG = 0; N.autopilot = false; log(S, `${p.name}: drive cut-off`, 'info'); return;
    case 'helm.g': if (!at(S, p, ['helm', 'drivectl', 'drivecore'])) return; D.cmdG = clamp(+args.g || 0, 0, maxG(S)); N.autopilot = false; return;
    case 'helm.flip': if (!at(S, p, ['helm', 'drivectl'])) return; N.autopilot = false; startFlip(S); return;
    case 'helm.autopilot':
      if (!at(S, p, 'helm')) return;
      if (!S.settings.autopilot) return err('No autopilot at this difficulty');
      if (eff(S, 'navcomp') <= 0) return err('Navigation computer offline');
      N.autopilot = !!args.on; log(S, `Autopilot ${N.autopilot ? 'ENGAGED' : 'disengaged'}`, 'info'); return;
    case 'helm.evasive': if (!at(S, p, 'helm')) return; D.evasive = !!args.on; return;
    case 'helm.maneuver': if (!at(S, p, 'helm')) return; D.maneuver = ['hold', 'open', 'close'].includes(args.m) ? args.m : 'hold'; return;
    case 'helm.dock':
      if (!at(S, p, ['helm', 'comms'])) return;
      if (N.state !== 'orbit') return err('Not in orbit');
      N.state = 'docking'; N.dockT = 15; log(S, 'Docking clearance granted. Station tugs closing.', 'info'); return;
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
      else { if (!COMPS[args.target] || !COMPS[args.target].ext) return; if (S.stores.spares <= 0) return err('Needs a spare kit in stores'); S.stores.spares--; }
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
    if (it && it.type === 'spares') {
      const amt = Math.min(4.5, 100 - c.hp);
      c.hp += amt; it.charge -= amt * 1.6;
      if (it.charge <= 0) { p.item = null; err('Spare parts kit used up'); }
    } else {
      if (c.hp <= 0) return err('Destroyed — needs a Spare Parts Kit (Stores, Cargo deck)');
      c.hp = Math.min(100, c.hp + 0.9);
    }
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
    case 'spares': st.spares += 2; break;
    case 'patch': st.patch += 2; break;
    case 'medkit': st.medkit += 2; break;
    case 'cartridge': st.cartridge += 2; break;
    case 'missiles': st.missiles += 2; break;
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
    case 'debug.resources': Object.assign(S.stores, { spares: 20, patch: 10, medkit: 10, cartridge: 6, feedstock: 500, missiles: 10, slugs: 40, pdcAmmo: 8000, chaff: 6 }); S.mass.rmass = SHIP.rmassMax; S.credits += 50; S.life.o2 = 1500; S.life.n2 = 3500; break;
    case 'debug.skip': if (S.nav.state === 'transit') { S.nav.x = S.nav.L * (args.f ?? 0.9); } break;
    case 'debug.arrive': if (S.nav.state === 'transit') { S.nav.x = S.nav.L - 1e8; S.nav.v = 0; } break;
    case 'debug.warp': S.settings.warpBase = clamp(+args.w || 420, 10, 20000); break;
    case 'debug.god': p.god = !p.god; break;
    case 'debug.hit': applyHit(S, 30, { deck: args.deck ?? null, label: 'Debug hit' }); break;
    case 'debug.breach': addBreach(S, p.deck, rand(-180, 180), 0.8); break;
    case 'debug.fire': igniteComp(S, args.id || 'reactor', 0.5); break;
    case 'debug.storyNext': S.story.nextAt = S.t; break;
    case 'debug.endEnc': if (S.enc) for (const e of S.enc.enemies) e.dead = true; break;
  }
}

export const EVENT_IDS = Object.keys(EVENTS).filter((k) => EVENTS[k].fire);
