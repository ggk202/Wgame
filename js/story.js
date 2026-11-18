// The storyteller: paces events RimWorld-style, plus scripted campaign beats per leg.
import { STORYTELLERS, DECKS } from './config.js';
import { clamp, rand, randi, chance, weightedPick, log, fx, startVote } from './util.js';
import { EVENTS } from './events.js';
import { applyHit } from './combat.js';
import { PDCS, eff } from './sim.js';
import { streamExposure } from './flight.js';

// Semi-scripted beats: fire once when leg progress passes `p`.
export const BEATS = [
  { id: 'l0-scrub', leg: 0, p: 0.06, ev: 'scrubber_clog' },
  { id: 'l0-distress', leg: 0, p: 0.35, ev: 'distress_call' },
  { id: 'l0-rock', leg: 0, p: 0.7, ev: 'micrometeoroid' },
  { id: 'l1-trader', leg: 1, p: 0.15, ev: 'trader' },
  { id: 'l1-pirates', leg: 1, p: 0.5, ev: 'pirates' },
  { id: 'l1-leak', leg: 1, p: 0.8, ev: 'coolant_leak' },
  { id: 'l2-storm', leg: 2, p: 0.25, ev: 'solar_storm' },
  { id: 'l2-drones', leg: 2, p: 0.55, ev: 'drone_swarm' },
  { id: 'l2-blockade', leg: 2, p: 0.9, ev: 'blockade' },
];

export function threatPoints(S) {
  const ST = STORYTELLERS[S.settings.storyteller];
  return (60 + (S.t / 60) * 3 + S.nav.leg * 35) * S.settings.threat * ST.threat * (S.effects.escortT > 0 ? 0.5 : 1);
}

export function fireEvent(S, id, pts) {
  const ev = EVENTS[id];
  if (!ev || !ev.fire) return false;
  if (ev.can && !ev.can(S)) return false;
  ev.fire(S, pts ?? threatPoints(S));
  S.story.history.push({ t: Math.round(S.t), id });
  if (S.story.history.length > 50) S.story.history.shift();
  S.stats.events++;
  S.story.tension = clamp(S.story.tension + (ev.tension || 0.1), 0, 1);
  if (ev.cat === 'major' || ev.cat === 'scripted') S.story.lastMajor = S.t;
  return true;
}

export function storyStep(S, dt) {
  const st = S.story, ST = STORYTELLERS[S.settings.storyteller];
  if (S.tutorial) { st.nextAt = Math.max(st.nextAt, S.t + 60); return; } // the instructor is in charge
  st.tension = Math.max(0, st.tension - dt * 0.003);
  if (S.nav.state !== 'transit') { st.nextAt = Math.max(st.nextAt, S.t + 40); return; }
  const prog = S.nav.x / S.nav.L;
  for (const b of BEATS) {
    if (b.leg !== S.nav.leg || st.beats[b.id] || prog < b.p) continue;
    const ev = EVENTS[b.ev];
    if (S.enc && (ev.cat === 'major' || ev.cat === 'scripted')) continue;
    if (S.vote && ev.resolve) continue;
    st.beats[b.id] = true;
    fireEvent(S, b.ev);
    st.nextAt = Math.max(st.nextAt, S.t + 45);
    return;
  }
  if (S.enc || S.effects.stormT > 0 || S.effects.stormWarn > 0) return;
  if (S.t < st.nextAt) return;
  const sinceMajor = S.t - st.lastMajor;
  let cat;
  if (sinceMajor > ST.majorGap && st.tension < 0.5 && S.effects.escortT <= 0 && chance(ST.majorChance)) cat = 'major';
  else cat = weightedPick(Object.keys(ST.weights), (k) => ST.weights[k] * (k === 'minor' || k === 'malfunction' ? 1 - st.tension * 0.5 : 1));
  const pool = Object.keys(EVENTS).filter((id) => EVENTS[id].cat === cat && (!EVENTS[id].can || EVENTS[id].can(S)));
  const recent = st.history.slice(-4).map((h) => h.id);
  const id = weightedPick(pool, (id) => (recent.includes(id) ? 0.2 : 1));
  if (id) fireEvent(S, id);
  st.nextAt = S.t + rand(ST.interval[0], ST.interval[1]) * (cat === 'major' ? 1.7 : 1);
}

// Timed environmental effects started by events
export function updateEffects(S, dt) {
  const E = S.effects;
  if (E.stormWarn > 0) {
    E.stormWarn -= dt;
    if (E.stormWarn <= 0) { E.stormWarn = 0; E.stormT = E.stormLen || 80; log(S, 'PROTON STORM ARRIVING — radiation levels spiking!', 'bad'); fx(S, 'alarm', { kind: 'storm' }); }
  }
  if (E.stormT > 0) {
    E.stormT -= dt;
    if (chance(dt * 0.04)) { const id = weightedPick(['sensors', 'navcomp', 'comms', 'tactical'], () => 1); if (!S.comps[id].fault) { S.comps[id].fault = 1; log(S, `Radiation upset: ${id === 'navcomp' ? 'Navigation Computer' : id} crashed — reboot required`, 'warn'); } }
    if (E.stormT <= 0) { E.stormT = 0; log(S, 'Proton storm has passed. Radiation back to background.', 'good'); }
  }
  if (E.debris > 0) {
    E.debris -= dt;
    if (E.debris <= 0) {
      E.debris = 0;
      let n = 4;
      if (S.drive.evasive && S.drive.ignited) n -= 2;
      if (S.weap.pdcMode !== 'off') n -= PDCS.reduce((s, id) => s + eff(S, id) * 0.6, 0);
      const ex = E.debrisFrom ? streamExposure(S, E.debrisFrom) : 1;
      n = Math.max(0, Math.round(n * ex + rand(-0.5, 0.5)));
      if (ex < 0.4) log(S, 'The shadow shield took most of the debris.', 'good');
      if (n === 0) log(S, 'Debris field cleared without impacts', 'good');
      for (let i = 0; i < n; i++) applyHit(S, rand(10, 22), { label: 'Debris impact', fireP: 0.1, breachP: 0.6, extBias: 0.5 });
    }
  }
  if (E.shower > 0) {
    E.showerT -= dt;
    if (E.showerT <= 0) { E.shower--; E.showerT = rand(4, 9); const ex = E.showerFrom ? streamExposure(S, E.showerFrom) : 1; if (chance(ex)) applyHit(S, rand(14, 30) * (0.5 + ex * 0.5), { label: 'Meteoroid strike', fireP: 0.15, breachP: 0.75 * ex, extBias: 0.4 }); else log(S, 'Meteoroid strike absorbed by the shadow shield', 'info'); }
  }
  for (const k of ['leakT', 'escortT', 'reactorRadT']) if (E[k] > 0) E[k] = Math.max(0, E[k] - dt);
  // Nanite breach sealing (Recruit)
  if (S.settings.naniteBreach) for (const b of S.breaches) if (b.size < 0.7) { b.patch += dt / 40; }
  const sealed = S.breaches.filter((b) => b.patch >= 1);
  if (sealed.length) { S.breaches = S.breaches.filter((b) => b.patch < 1); log(S, `Breach sealed on ${DECKS[sealed[0].deck].name} deck`, 'good'); }
}

export function castVote(S, pid, opt) {
  const V = S.vote;
  if (!V || !V.options.some((o) => o.id === opt)) return;
  V.votes[pid] = opt;
}
export function updateVote(S) {
  const V = S.vote;
  if (!V) return;
  const voters = Object.values(S.players).filter((p) => p.connected && p.state !== 'spectator');
  const all = voters.length > 0 && voters.every((p) => V.votes[p.id]);
  if (!all && S.t < V.ends) return;
  const tally = {};
  for (const o of Object.values(V.votes)) tally[o] = (tally[o] || 0) + 1;
  let best = null, bestN = 0;
  for (const o of V.options) if ((tally[o.id] || 0) > bestN) { best = o.id; bestN = tally[o.id]; }
  if (!best) best = (V.options.find((o) => o.default) || V.options[V.options.length - 1]).id;
  S.vote = null;
  const label = V.options.find((o) => o.id === best).label;
  log(S, `Crew decision — ${V.title}: ${label}`, 'info');
  const ev = EVENTS[V.ev];
  if (ev && ev.resolve) ev.resolve(S, best, V.data || {});
  else if (V.ev === 'pirate_demand') resolvePirateDemand(S, best);
  if (!S.vote && S.voteQueue && S.voteQueue.length) { S.vote = S.voteQueue.shift(); S.vote.ends = S.t + S.vote.dur; fx(S, 'vote'); }
}

export function pirateDemand(S) {
  const E = S.enc;
  if (!E || E.hailed) return 'Already hailed';
  E.hailed = true;
  if (E.kind === 'drones') { log(S, 'No response — the drones are automated.', 'info'); return null; }
  if (E.kind === 'blockade') { log(S, 'Blockade: "Cut your drive. This is not a negotiation."', 'warn'); return null; }
  startVote(S, 'pirate_demand', 'Pirates answer the hail', `“Half your feedstock and spare parts and we let you go, Wolfram. Or we take it off your wreck.”`,
    [{ id: 'pay', label: `Pay (−${Math.floor(S.stores.feedstock / 2)} kg feedstock, half of every spare part)` }, { id: 'bribe', label: 'Offer 20 credits instead' }, { id: 'fight', label: 'Refuse — fight', default: true }], {}, 25);
  return null;
}
function resolvePirateDemand(S, opt) {
  const E = S.enc;
  if (!E) return;
  if (opt === 'pay' || (opt === 'bribe' && S.credits >= 20 && chance(0.55))) {
    if (opt === 'pay') { S.stores.feedstock = Math.ceil(S.stores.feedstock / 2); for (const k of ['board', 'wire', 'seal', 'bearing', 'cell', 'filler', 'optic']) S.stores[k] = Math.ceil(S.stores[k] / 2); }
    else S.credits -= 20;
    for (const e of E.enemies) e.fleeing = true;
    E.proj = E.proj.filter((p) => p.from === 'us');
    log(S, 'The pirates take the payment and burn away.', 'warn');
  } else {
    if (opt === 'bribe') log(S, '“Twenty? You insult us.” They open fire.', 'bad');
    for (const e of E.enemies) e.missileCd = Math.min(e.missileCd, 3);
  }
}
