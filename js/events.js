// Event library used by the storyteller. Each event: cat, title, can(S), fire(S, pts), optional resolve(S, opt, data).
import { COMPS, COMP_IDS, DECKS, WAYPOINTS, AU, C_LIGHT, SHIP } from './config.js';
import { clamp, rand, randi, chance, pick, weightedPick, log, fx, startVote, msg } from './util.js';
import { eff, igniteComp, compsOnDeck } from './sim.js';
import { startEncounter, applyHit, addBreach } from './combat.js';

const internalIds = () => COMP_IDS.filter((id) => !COMPS[id].ext);
const computerIds = () => COMP_IDS.filter((id) => COMPS[id].computer);
const isTransit = (S) => S.nav.state === 'transit';

// Light-lag from Earth: rough heliocentric distance from current ship position to Earth
export function lightLag(S) {
  const N = S.nav;
  const a = WAYPOINTS[Math.min(N.leg, WAYPOINTS.length - 1)].pos, b = WAYPOINTS[Math.min(N.leg + 1, WAYPOINTS.length - 1)].pos;
  const f = N.state === 'transit' ? clamp(N.x / N.L, 0, 1) : 0;
  const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
  const d = Math.hypot(x - 1, y) * AU;
  return d / C_LIGHT;
}
const lagText = (s) => (s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);

export const EVENTS = {
  // ---------------- minor hazards ----------------
  micrometeoroid: {
    cat: 'minor', title: 'Micrometeoroid strike', tension: 0.15,
    fire(S) { applyHit(S, rand(14, 28), { extBias: 0.4, fireP: 0.1, breachP: 0.85, label: 'Micrometeoroid strike' }); },
  },
  electrical_fire: {
    cat: 'minor', title: 'Electrical fire', tension: 0.15,
    fire(S) {
      const c = pick(internalIds().filter((id) => COMPS[id].power >= 0.3 && S.comps[id].hp > 0 && S.comps[id].fire <= 0));
      if (c) { igniteComp(S, c, 0.3); fx(S, 'alarm', { kind: 'fire' }); }
    },
  },
  debris_field: {
    cat: 'minor', title: 'Debris field', tension: 0.2, can: isTransit,
    fire(S) {
      S.effects.debris = 45;
      log(S, 'NAV WARNING: debris from a shattered rock crosses our track in 45 s. Evasive burn at the helm and active PDCs will reduce impacts.', 'warn');
      fx(S, 'alarm', { kind: 'warn' });
    },
  },
  hull_fatigue: {
    cat: 'minor', title: 'Weld seam failure', tension: 0.15, can: (S) => S.hull < 80,
    fire(S) { addBreach(S, randi(0, 4), rand(-180, 180), rand(0.3, 0.6)); },
  },
  power_surge: {
    cat: 'minor', title: 'Power surge', tension: 0.12,
    fire(S) {
      S.comps.battery.hp = Math.max(0, S.comps.battery.hp - 25);
      const tripped = [];
      for (let i = 0; i < 3; i++) { const id = pick(internalIds().filter((x) => S.comps[x].on && COMPS[x].prio > 1)); if (id) { S.comps[id].on = false; tripped.push(COMPS[id].name); } }
      log(S, `Power surge! Breakers tripped: ${tripped.join(', ') || 'none'}. Reset them at Power Distribution.`, 'warn');
    },
  },
  radiator_puncture: {
    cat: 'minor', title: 'Radiator puncture', tension: 0.12,
    fire(S) { const id = pick(['radA', 'radB']); S.comps[id].hp = Math.max(0, S.comps[id].hp - rand(35, 55)); log(S, `${COMPS[id].name} punctured — coolant venting. Dispatch drones from the Cargo deck.`, 'warn'); },
  },
  // ---------------- malfunctions ----------------
  comp_failure: {
    cat: 'malfunction', title: 'Component failure', tension: 0.1,
    fire(S) {
      const id = weightedPick(internalIds(), (id) => 120 - S.comps[id].hp);
      if (!id) return;
      S.comps[id].hp = Math.max(0, S.comps[id].hp - rand(35, 65));
      log(S, `Malfunction: ${COMPS[id].name} (${DECKS[COMPS[id].deck].name} deck) — integrity ${Math.round(S.comps[id].hp)}%`, 'warn');
    },
  },
  scrubber_clog: {
    cat: 'malfunction', title: 'Scrubber saturation', tension: 0.08,
    fire(S) { S.life.sat = Math.min(1, S.life.sat + 0.4); log(S, 'CO2 scrubber cartridges saturating fast. Swap a cartridge (Stores, Cargo deck) or run a bake-out.', 'warn'); },
  },
  coolant_leak: {
    cat: 'malfunction', title: 'Coolant leak', tension: 0.15,
    fire(S) {
      S.comps.coolpump.hp = Math.max(0, S.comps.coolpump.hp - 40);
      S.effects.leakT = 70;
      log(S, 'Primary coolant loop leak on Engineering deck — activated coolant, elevated radiation. Fix the pumps, keep exposure short.', 'warn');
    },
  },
  containment_wobble: {
    cat: 'malfunction', title: 'Plasma instability', tension: 0.15, can: (S) => S.reactor.state === 'running',
    fire(S) { S.reactor.drift = clamp(S.reactor.drift + (chance(0.5) ? 1 : -1) * rand(0.35, 0.6), -1, 1); log(S, 'Reactor: plasma instability, magnetic field needs retuning!', 'warn'); fx(S, 'alarm', { kind: 'warn' }); },
  },
  software_fault: {
    cat: 'malfunction', title: 'Software fault', tension: 0.08,
    fire(S) { const id = pick(computerIds().filter((x) => !S.comps[x].fault)); if (id) { S.comps[id].fault = 1; log(S, `Software fault: ${COMPS[id].name} crashed. Reboot it from its console.`, 'warn'); } },
  },
  rmass_contamination: {
    cat: 'malfunction', title: 'Reaction mass contamination', tension: 0.1, can: (S) => S.mass.contam < 0.5,
    fire(S) { S.mass.contam = Math.min(1, S.mass.contam + 0.35); log(S, 'Particulates in reaction mass — drive efficiency dropping and nozzle wearing. Purge at the tanks (Drive deck).', 'warn'); },
  },
  stuck_valve: {
    cat: 'malfunction', title: 'Throttle valve stuck', tension: 0.12, can: (S) => S.drive.ignited && S.drive.throttle > 0.05,
    fire(S) { S.drive.locked = 60; S.drive.lockedThr = S.drive.throttle; log(S, 'Throttle valve stuck open! Use manual override at Drive Control.', 'warn'); },
  },
  injector_jam: {
    cat: 'malfunction', title: 'Pellet injector jam', tension: 0.12,
    fire(S) { S.comps.injector.hp = Math.max(0, S.comps.injector.hp - rand(40, 60)); log(S, 'Pellet injector jamming — reactor and drive fuel feed at risk. Repair on the Drive deck.', 'warn'); },
  },
  // ---------------- major ----------------
  pirates: {
    cat: 'major', title: 'Pirate ambush', tension: 0.6, can: (S) => !S.enc,
    fire(S, pts) { startEncounter(S, 'pirates', pts); },
  },
  drone_swarm: {
    cat: 'major', title: 'Rogue drone swarm', tension: 0.5, can: (S) => !S.enc,
    fire(S, pts) { startEncounter(S, 'drones', pts); msg(S, 'Ceres Traffic', 'Autonomous mining drones have been hijacked and are targeting traffic in your sector. Weapons free.', lightLag(S)); },
  },
  gunship: {
    cat: 'major', title: 'Separatist gunship', tension: 0.6, can: (S) => !S.enc && S.nav.leg >= 1,
    fire(S, pts) { startEncounter(S, 'gunship', pts); },
  },
  solar_storm: {
    cat: 'major', title: 'Solar particle event', tension: 0.5, can: (S) => S.effects.stormT <= 0 && S.effects.stormWarn <= 0,
    fire(S, pts) {
      S.effects.stormWarn = 50; S.effects.stormLen = clamp(50 + pts / 4, 60, 110);
      msg(S, 'Sol Weather Service', `X-class flare observed. Proton front arriving at your position in under a minute. Shelter your crew. (Light-lag ${lagText(lightLag(S))} — warning relayed by L4 monitor.)`, 0);
      log(S, 'SOLAR STORM WARNING: proton storm in 50 s. Get to the storm shelter on Habitation deck!', 'bad');
      fx(S, 'alarm', { kind: 'storm' });
    },
  },
  meteor_shower: {
    cat: 'major', title: 'Meteoroid stream', tension: 0.5, can: isTransit,
    fire(S, pts) { S.effects.shower = clamp(Math.round(pts / 35), 3, 7); S.effects.showerT = 6; log(S, 'Crossing a dense meteoroid stream — multiple impacts expected!', 'bad'); fx(S, 'alarm', { kind: 'warn' }); },
  },
  reactor_crisis: {
    cat: 'major', title: 'Reactor crisis', tension: 0.5, can: (S) => S.reactor.state === 'running',
    fire(S) {
      S.reactor.drift = clamp(S.reactor.drift + (chance(0.5) ? 1 : -1) * 0.8, -1, 1);
      S.comps.coolpump.hp = Math.max(0, S.comps.coolpump.hp - 35);
      S.comps.reactor.hp = Math.max(0, S.comps.reactor.hp - 20);
      S.heat.stored += 4000;
      log(S, 'REACTOR CRISIS: containment field failing and coolant pumps damaged. Retune the field now or SCRAM!', 'bad');
      fx(S, 'alarm', { kind: 'scram' });
    },
  },
  blockade: {
    cat: 'scripted', title: 'Blockade', tension: 0.7, can: (S) => !S.enc,
    fire(S, pts) {
      msg(S, 'Unknown', 'Freighter Wolfram, this is the Free Jovian Navy. Cut your drive and prepare to be boarded. Your cargo is forfeit.', 0);
      startEncounter(S, 'blockade', Math.max(pts, 180));
    },
  },
  // ---------------- opportunities ----------------
  distress_call: {
    cat: 'opportunity', title: 'Distress call', tension: 0.05, can: (S) => isTransit(S) && !S.vote,
    fire(S) {
      msg(S, 'MV Anansi (distress)', 'Mayday, mayday. Drive failure, life support on batteries, six souls aboard. Anyone in range, please respond.', 2);
      startVote(S, 'distress_call', 'Answer the distress call?', 'A crippled ore hauler is close to our track. Matching velocity costs reaction mass. It could also be a trap.',
        [{ id: 'help', label: 'Divert and assist (−90 t reaction mass)' }, { id: 'relay', label: 'Relay their position to the nearest station', default: true }]);
    },
    resolve(S, opt) {
      if (opt === 'help') {
        S.mass.rmass = Math.max(0, S.mass.rmass - 90);
        if (chance(0.28)) { log(S, 'It was a trap! Pirates were hiding in the hauler\'s shadow!', 'bad'); startEncounter(S, 'pirates', 110 * S.settings.threat); }
        else {
          S.credits += 25; S.stores.spares += 3; S.stores.medkit += 2;
          msg(S, 'MV Anansi', 'We owe you our lives, Wolfram. Take these spares, and the Belt Mutual reward is on its way to your account.', 2);
          log(S, 'Rescue complete: +25 credits, +3 spare kits, +2 medkits', 'good');
        }
      } else log(S, 'Distress position relayed. A tug from the nearest station will respond in a few days.', 'info');
    },
  },
  trader: {
    cat: 'opportunity', title: 'Passing trader', tension: 0.02, can: (S) => !S.vote && !S.enc,
    fire(S) {
      msg(S, 'Indie trader “Pelican”', 'Wolfram! We\'re on a near-parallel track. Want to do some business by drone?', 1);
      const opts = [];
      if (S.credits >= 10) opts.push({ id: 'spares', label: 'Buy 4 spare kits (10 credits)' });
      if (S.stores.feedstock >= 80) opts.push({ id: 'torps', label: 'Trade 80 kg feedstock for 2 torpedoes' });
      opts.push({ id: 'sell', label: 'Sell 2 spare kits (+7 credits)' });
      opts.push({ id: 'no', label: 'No deal', default: true });
      startVote(S, 'trader', 'Trade offer', 'A small independent trader offers a drone-to-drone exchange.', opts);
    },
    resolve(S, opt) {
      if (opt === 'spares' && S.credits >= 10) { S.credits -= 10; S.stores.spares += 4; log(S, 'Trade: +4 spare kits', 'good'); }
      else if (opt === 'torps' && S.stores.feedstock >= 80) { S.stores.feedstock -= 80; S.stores.missiles += 2; log(S, 'Trade: +2 torpedoes', 'good'); }
      else if (opt === 'sell' && S.stores.spares >= 2) { S.stores.spares -= 2; S.credits += 7; log(S, 'Trade: sold 2 spare kits (+7 credits)', 'good'); }
      else log(S, 'The trader drifts out of range.', 'info');
    },
  },
  comet_ice: {
    cat: 'opportunity', title: 'Comet fragment', tension: 0.02, can: (S) => isTransit(S) && !S.vote && !S.enc,
    fire(S) {
      startVote(S, 'comet_ice', 'Harvest a comet fragment?', 'Sensors show a small ice body near our trajectory. Drones could cut ice for reaction mass and water. Comet debris could hit the hull.',
        [{ id: 'mine', label: 'Harvest ice (+180 t reaction mass, +600 L water)' }, { id: 'no', label: 'Stay on course', default: true }]);
    },
    resolve(S, opt) {
      if (opt !== 'mine') return;
      S.mass.rmass = Math.min(SHIP.rmassMax, S.mass.rmass + 180); S.life.water += 600;
      log(S, 'Ice harvested: +180 t reaction mass, +600 L water', 'good');
      if (chance(0.35)) applyHit(S, 15, { label: 'Comet debris strike', extBias: 0.6, fireP: 0 });
    },
  },
  supply_drone: {
    cat: 'opportunity', title: 'Supply courier', tension: 0, can: isTransit,
    fire(S) {
      S.stores.spares += 2; S.stores.patch += 2; S.stores.medkit += 1;
      msg(S, 'Mission Control', `A courier drone carrying supplies has matched velocity with you. Fly safe. (Sent ${lagText(lightLag(S))} ago.)`, lightLag(S));
      log(S, 'Supply courier docked: +2 spare kits, +2 hull patches, +1 medkit', 'good');
    },
  },
  navy_escort: {
    cat: 'opportunity', title: 'Navy escort', tension: 0, can: (S) => isTransit(S) && S.effects.escortT <= 0,
    fire(S) {
      S.effects.escortT = 420;
      msg(S, 'UNN Tachi', 'Wolfram, this is the UNN Tachi. We\'re heading your way and will run escort for a while.', 1);
      log(S, 'Navy escort: major threats are suppressed for about 7 minutes', 'good');
    },
  },
  salvage: {
    cat: 'hidden', title: 'Salvage',
    resolve(S, opt, data) {
      if (opt !== 'yes') return;
      S.mass.rmass = Math.max(0, S.mass.rmass - 30);
      const n = data.loot || 1;
      S.stores.spares += 2 * n; S.stores.feedstock += 60 * n; S.stores.missiles += n; S.credits += 8 * n;
      log(S, `Salvage recovered: +${2 * n} spare kits, +${60 * n} kg feedstock, +${n} torpedo, +${8 * n} credits`, 'good');
    },
  },
  // ---------------- flavor ----------------
  mission_update: {
    cat: 'flavor', title: 'Mission update', tension: 0,
    fire(S) {
      const lines = [
        'The Ganymede reactor consortium confirms delivery window. Every day early saves a city block of rolling blackouts.',
        'Reminder: hull insurance excludes acts of piracy beyond the Mars trojans. Fly carefully.',
        'Flight dynamics recommends keeping at least 15% reaction mass margin on arrival.',
        'Your families send their love. The kids drew the Wolfram with way too many guns.',
        'Belt Authority reports increased separatist activity near the Jovian approaches.',
      ];
      msg(S, 'Mission Control (Earth)', pick(lines) + ` (Light-lag ${lagText(lightLag(S))}.)`, lightLag(S));
    },
  },
  quiet_watch: {
    cat: 'flavor', title: 'Quiet watch', tension: -0.1,
    fire(S) { log(S, pick(['A quiet watch. The drive hums. Somewhere far behind, Earth is a blue dot.', 'Hydroponics reports a good tomato harvest.', 'The stars do not twinkle out here.']), 'info'); },
  },
};
