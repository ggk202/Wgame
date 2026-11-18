// Combat encounters: realistic-ish engagement at hundreds to thousands of km.
import { COMPS, COMP_IDS, DECKS, ROOM_R } from './config.js';
import { clamp, rand, randi, chance, pick, weightedPick, polar, log, fx, startVote } from './util.js';
import { eff, igniteComp, compsOnDeck, PDCS } from './sim.js';

export const ENEMY_TYPES = {
  corvette: { name: 'Pirate corvette', hp: 80, missiles: 6, rail: true, railCd: [30, 45], slugs: 8, pdc: 2, evade: 0.18, pref: 700, accel: 0.02, loot: 1, hail: true },
  frigate: { name: 'Pirate frigate', hp: 150, missiles: 10, rail: true, railCd: [22, 32], slugs: 12, pdc: 3, evade: 0.1, pref: 1000, accel: 0.012, loot: 2, hail: true },
  gunship: { name: 'Separatist gunship', hp: 110, missiles: 4, rail: true, railCd: [18, 26], slugs: 14, pdc: 2, evade: 0.15, pref: 1300, accel: 0.015, loot: 1, hail: true },
  drone: { name: 'Rogue mining drone', hp: 22, missiles: 0, rail: false, pdc: 0, evade: 0.3, pref: 0, accel: 0.08, loot: 0, kamikaze: true, dmg: 38 },
};
const NAMES = ['Kestrel', 'Black Tern', 'Mercy of Vesta', 'Lucky Strike', 'Rustbucket', 'Hachiman', 'Iron Lotus', 'Gallowglass', 'Ninth Wave', 'Saltpeter'];

let _pid = 0;
export function startEncounter(S, kind, pts) {
  pts = Math.max(40, pts);
  const enemies = [];
  const scale = clamp(Math.sqrt(pts / 100), 0.7, 1.8);
  const add = (type, extra = {}) => {
    const T = ENEMY_TYPES[type];
    const hp = Math.round(T.hp * scale);
    enemies.push({
      id: 'e' + (++_pid) + Math.random().toString(36).slice(2, 5), type, name: type === 'drone' ? `Drone ${String.fromCharCode(65 + enemies.length)}` : `${T.name} “${pick(NAMES)}”`,
      hp, maxHp: hp, range: rand(2600, 3600), vr: type === 'drone' ? -10 : -8, missiles: Math.round(T.missiles * scale),
      missileCd: rand(8, 20), railT: rand(10, 25), slugs: T.slugs || 0, dead: false, gone: false, fleeing: false, ...extra,
    });
  };
  let name;
  if (kind === 'drones') {
    const n = clamp(Math.round(pts / 28), 2, 7);
    for (let i = 0; i < n; i++) add('drone', { range: rand(1800, 3000) });
    name = 'Rogue drone swarm';
  } else if (kind === 'blockade') {
    add('frigate'); add('corvette', { range: rand(3500, 4200) });
    if (pts > 220) add('gunship');
    name = 'Separatist blockade';
  } else if (kind === 'gunship') {
    add('gunship'); name = 'Separatist gunship';
  } else {
    if (pts > 190) { add('frigate'); name = 'Pirate frigate'; }
    else if (pts > 130) { add('corvette'); add('corvette', { range: rand(3400, 4000) }); name = 'Pirate pack'; }
    else { add('corvette'); name = 'Pirate corvette'; }
  }
  S.enc = { kind, name, t: 0, enemies, proj: [], hailed: false, loot: 0, pts };
  S.sensors.lock = null; S.sensors.q = 0;
  S.weap.focus = [];
  log(S, `CONTACT: ${name} — ${enemies.length} hostile drive plume${enemies.length > 1 ? 's' : ''} on intercept!`, 'bad');
  fx(S, 'alarm', { kind: 'contact' });
}

export function endEncounter(S, why) {
  const E = S.enc;
  if (!E) return;
  S.enc = null;
  S.sensors.lock = null; S.sensors.q = 0; S.weap.charging = false;
  S.drive.evasive = false; S.drive.maneuver = 'hold';
  log(S, `Engagement over: ${why}`, 'good');
  S.story.tension = Math.min(1, S.story.tension + 0.3);
  if (E.loot > 0) {
    startVote(S, 'salvage', 'Salvage the wrecks?', `The ${E.name} left debris with intact components on a near-matching trajectory. Recovering them costs about 30 t of reaction mass.`,
      [{ id: 'yes', label: 'Send the drones (−30 t reaction mass)' }, { id: 'no', label: 'Leave it', default: true }], { loot: E.loot });
  }
}

// Damage to our ship from any source.
export function applyHit(S, dmg, o = {}) {
  const { extBias = 0.35, deck = null, breachP = 0.55, fireP = 0.35, label = 'Impact' } = o;
  dmg *= S.settings.dmg;
  S.stats.hits++;
  if (deck === null && chance(extBias)) {
    const ext = COMP_IDS.filter((id) => COMPS[id].ext);
    const id = weightedPick(ext, (id) => (id === 'radA' || id === 'radB' ? (S.heat.radExt ? 3 : 0.6) : id === 'antenna' ? 0.8 : 1));
    S.comps[id].hp = clamp(S.comps[id].hp - dmg * rand(0.8, 1.4), 0, 100);
    S.hull = Math.max(0, S.hull - dmg * 0.06);
    log(S, `${label}: ${COMPS[id].name} hit (external)`, 'bad');
    fx(S, 'hit', { deck: -1, power: 0.5 });
    return;
  }
  const dk = deck ?? randi(0, 4);
  S.hull = Math.max(0, S.hull - dmg * 0.15 * rand(0.7, 1.3));
  const here = compsOnDeck(dk);
  const victim = pick(here);
  S.comps[victim].hp = clamp(S.comps[victim].hp - dmg * rand(0.7, 1.3), 0, 100);
  const a = rand(-180, 180);
  if (chance(breachP)) addBreach(S, dk, a, clamp((dmg / 50) * rand(0.5, 1.2), 0.25, 1.5));
  if (chance(fireP)) igniteComp(S, pick(here), 0.25);
  const ip = polar(a, ROOM_R);
  for (const p of Object.values(S.players)) {
    if (p.state !== 'alive' || p.deck !== dk) continue;
    const dist = Math.hypot(p.x - ip.x, p.z - ip.z);
    if (dist < 6) p.hp -= dmg * 0.5 * (1 - dist / 6) * (p.suit ? 0.7 : 1);
  }
  log(S, `${label} on ${DECKS[dk].name} deck! ${COMPS[victim].name} damaged.`, 'bad');
  fx(S, 'hit', { deck: dk, power: dmg / 40, a });
}
export function addBreach(S, deck, a, size) {
  S.breaches.push({ id: 'b' + Math.random().toString(36).slice(2, 8), deck, a, y: rand(0.7, 2.6), size, patch: 0 });
  log(S, `HULL BREACH on ${DECKS[deck].name} deck — decompression!`, 'bad');
}

function pdcIntercept(S, pr, base) {
  const W = S.weap;
  if (W.pdcMode === 'off') return false;
  const focused = W.focus.includes(pr.id);
  let pSurvive = 1, engaged = 0;
  for (const id of PDCS) {
    const e = eff(S, id);
    if (e <= 0 || S.stores.pdcAmmo < 100) continue;
    const pk = W.pdcMode === 'auto' ? base : focused ? base * 1.6 : base * 0.3;
    pSurvive *= 1 - clamp(pk * e, 0, 0.95);
    S.stores.pdcAmmo = Math.max(0, S.stores.pdcAmmo - 120);
    S.heat.stored += 15;
    engaged++;
  }
  if (engaged) fx(S, 'pdc');
  return engaged > 0 && !chance(pSurvive);
}

export function updateWeapons(S, dt) {
  const W = S.weap, Sn = S.sensors;
  if (W.charging && W.rail < 1 && S.comps.railgun.pw > 0 && S.comps.railgun.hp > 0) W.rail = Math.min(1, W.rail + (dt / 12) * eff(S, 'railgun'));
  if (W.chaffT > 0) W.chaffT -= dt;
  if (Sn.pingCd > 0) Sn.pingCd -= dt;
  if (Sn.pingT > 0) Sn.pingT -= dt;
  const E = S.enc;
  if (Sn.lock) {
    const tgt = E && E.enemies.find((e) => e.id === Sn.lock && !e.dead && !e.gone);
    if (!tgt) { Sn.lock = null; Sn.q = 0; }
    else {
      const se = eff(S, 'sensors') * (0.3 + 0.7 * eff(S, 'sensorArray'));
      if (se <= 0) Sn.q = Math.max(0, Sn.q - 0.1 * dt);
      else Sn.q = Math.min(1, Sn.q + 0.07 * se * dt * (S.effects.stormT > 0 ? 0.4 : 1) * clamp(2500 / tgt.range, 0.3, 1.5));
    }
  }
}

export function updateCombat(S, dt) {
  const E = S.enc;
  if (!E) return;
  E.t += dt;
  const D = S.drive;
  const canBurn = D.ignited && eff(S, 'drivecore') > 0 && S.mass.rmass > 0;
  const manAcc = !canBurn ? 0 : D.maneuver === 'open' ? 0.02 : D.maneuver === 'close' ? -0.02 : 0;
  for (const e of E.enemies) {
    if (e.dead || e.gone) continue;
    const T = ENEMY_TYPES[e.type];
    if (!e.fleeing && !T.kamikaze && e.hp < e.maxHp * 0.3) { e.fleeing = true; log(S, `${e.name} is breaking off!`, 'good'); }
    if (!e.fleeing && !T.kamikaze && ((e.missiles <= 0 && e.slugs <= 0) || E.t > 240)) { e.fleeing = true; log(S, `${e.name} is out of munitions and breaking off`, 'good'); }
    let desire = 0;
    if (T.kamikaze) desire = -1;
    else if (e.fleeing) desire = 3;
    else desire = e.range > T.pref * 1.15 ? -1 : e.range < T.pref * 0.85 ? 1 : 0;
    if (desire === 0) e.vr += clamp(-e.vr, -T.accel * dt, T.accel * dt);
    else e.vr += desire * T.accel * dt;
    e.vr = clamp(e.vr + manAcc * dt, T.kamikaze ? -25 : -12, e.fleeing ? 30 : 12);
    e.range = Math.max(0.5, e.range + e.vr * dt);
    if (e.fleeing) e.fleeT = (e.fleeT || 0) + dt;
    if (e.range > 6000 || (e.fleeing && (e.fleeT > 50 || e.range > 2500))) { e.gone = true; log(S, `${e.name} has broken contact`, 'info'); continue; }
    if (T.kamikaze) {
      if (!e.pdcRolled && e.range < 40) {
        e.pdcRolled = true;
        if (pdcIntercept(S, e, 0.5)) { e.dead = true; log(S, `PDCs shredded ${e.name}`, 'good'); fx(S, 'boom', { far: true }); continue; }
      }
      if (e.range <= 2) { e.dead = true; applyHit(S, T.dmg, { label: `${e.name} impact` }); }
      continue;
    }
    e.missileCd -= dt;
    if (e.missiles > 0 && e.missileCd <= 0 && e.range < 4000 && !e.fleeing) {
      const n = Math.min(e.missiles, 1 + randi(0, E.pts > 150 ? 2 : 1));
      for (let i = 0; i < n; i++) E.proj.push({ id: 'p' + (++_pid), type: 'missile', from: 'them', src: e.id, range: e.range, speed: 10, dmg: 30 });
      e.missiles -= n; e.missileCd = rand(20, 32);
      log(S, `${e.name} launched ${n} torpedo${n > 1 ? 'es' : ''}!`, 'bad');
      fx(S, 'alarm', { kind: 'missile' });
    }
    if (T.rail) {
      e.railT -= dt;
      if (e.railT <= 0 && e.range < 3500 && !e.fleeing && e.slugs > 0) {
        e.slugs--;
        E.proj.push({ id: 'p' + (++_pid), type: 'slug', from: 'them', src: e.id, range: e.range, r0: e.range, speed: 60, dmg: 26 });
        e.railT = rand(T.railCd[0], T.railCd[1]);
        log(S, `Railgun flash from ${e.name} — slug inbound`, 'warn');
      }
    }
  }
  // projectiles
  for (const pr of E.proj) {
    if (pr.type === 'missile') pr.speed += 0.5 * dt;
    pr.range -= pr.speed * dt;
    if (pr.from === 'them' && pr.type === 'missile' && !pr.pdcRolled && pr.range < 40) {
      pr.pdcRolled = true;
      if (pdcIntercept(S, pr, 0.42)) { pr.done = true; log(S, 'PDCs splashed an incoming torpedo', 'good'); fx(S, 'boom', { far: true }); continue; }
    }
    if (pr.from === 'us' && pr.type === 'missile' && !pr.pdcRolled && pr.range < 30) {
      pr.pdcRolled = true;
      const tgt = E.enemies.find((e) => e.id === pr.target);
      const n = tgt ? ENEMY_TYPES[tgt.type].pdc : 0;
      if (tgt && chance(1 - Math.pow(0.67, n))) { pr.done = true; log(S, `Our torpedo was intercepted by ${tgt.name}'s PDCs`, 'warn'); continue; }
    }
    if (pr.range <= 0) {
      pr.done = true;
      if (pr.from === 'them') {
        let p = pr.type === 'missile' ? 0.9 * (pr.chaffed ? 0.45 : 1) : 0.5 * (S.drive.evasive && canBurn ? 0.45 : 1) * Math.max(0.35, 1 - pr.r0 / 4000);
        if (chance(p)) applyHit(S, pr.dmg, { label: pr.type === 'missile' ? 'Torpedo hit' : 'Railgun hit' });
        else log(S, pr.type === 'missile' ? 'Torpedo missed — decoyed' : 'Enemy slug went wide', 'good');
      } else {
        const tgt = E.enemies.find((e) => e.id === pr.target);
        if (!tgt || tgt.dead || tgt.gone) continue;
        if (chance(pr.p)) {
          tgt.hp -= pr.dmg;
          log(S, `${pr.type === 'missile' ? 'Torpedo' : 'Railgun slug'} hit ${tgt.name}! (${Math.max(0, Math.round((tgt.hp / tgt.maxHp) * 100))}% integrity)`, 'good');
          fx(S, 'boom', { far: true });
          if (tgt.hp <= 0) { tgt.dead = true; S.stats.kills++; E.loot += ENEMY_TYPES[tgt.type].loot; log(S, `${tgt.name} destroyed!`, 'good'); }
        } else log(S, `${pr.type === 'missile' ? 'Torpedo' : 'Slug'} missed ${tgt.name}`, 'warn');
      }
    }
  }
  E.proj = E.proj.filter((p) => !p.done);
  if (S.weap.focus.length) S.weap.focus = S.weap.focus.filter((id) => E.proj.some((p) => p.id === id));
  const active = E.enemies.filter((e) => !e.dead && !e.gone);
  if (!active.length && !E.proj.some((p) => p.from === 'them')) {
    const killed = E.enemies.filter((e) => e.dead).length;
    endEncounter(S, killed ? `${killed} hostile${killed > 1 ? 's' : ''} destroyed` : 'contacts withdrew');
  }
}

// ---------- player-triggered weapons ----------
export function fireRail(S) {
  const E = S.enc, W = S.weap, Sn = S.sensors;
  if (!E) return 'No targets';
  const tgt = E.enemies.find((e) => e.id === Sn.lock && !e.dead && !e.gone);
  if (!tgt) return 'No target lock';
  if (Sn.q < 0.4) return 'Lock quality too low (need 40%)';
  if (W.rail < 1) return 'Railgun not charged';
  if (S.stores.slugs <= 0) return 'No slugs';
  if (eff(S, 'railgun') <= 0) return 'Railgun offline';
  const T = ENEMY_TYPES[tgt.type];
  const p = 0.92 * Sn.q * Math.max(0.25, 1 - tgt.range / 5000) * (1 - T.evade);
  E.proj.push({ id: 'p' + (++_pid), type: 'slug', from: 'us', target: tgt.id, range: tgt.range, speed: 60, dmg: 32, p });
  W.rail = 0; S.stores.slugs--; S.heat.stored += 450;
  log(S, `Railgun fired at ${tgt.name} (est. hit ${Math.round(p * 100)}%)`, 'info');
  fx(S, 'rail');
  return null;
}
export function launchTorpedo(S) {
  const E = S.enc, W = S.weap, Sn = S.sensors;
  if (!E) return 'No targets';
  const tgt = E.enemies.find((e) => e.id === Sn.lock && !e.dead && !e.gone);
  if (!tgt) return 'No target lock';
  if (Sn.q < 0.25) return 'Lock quality too low (need 25%)';
  const tube = W.tubes.find((t) => t.loaded);
  if (!tube) return 'No tube loaded — load at the Munitions Magazine';
  tube.loaded = false;
  const p = 0.9 * (1 - ENEMY_TYPES[tgt.type].evade * 0.5);
  E.proj.push({ id: 'p' + (++_pid), type: 'missile', from: 'us', target: tgt.id, range: tgt.range, speed: 10, dmg: 38, p });
  log(S, `Torpedo away — target ${tgt.name}`, 'info');
  fx(S, 'launch');
  return null;
}
export function deployChaff(S) {
  if (!S.enc) return 'Nothing to decoy';
  if (S.stores.chaff <= 0) return 'No chaff canisters';
  S.stores.chaff--; S.weap.chaffT = 20;
  let n = 0;
  for (const pr of S.enc.proj) if (pr.from === 'them' && pr.type === 'missile') { pr.chaffed = true; n++; }
  log(S, `Chaff and flares deployed (${n} torpedo${n === 1 ? '' : 'es'} spoofed)`, 'info');
  return null;
}
