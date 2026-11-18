// Headless simulation soak test: node tools/simtest.js
import { createState, newPlayer } from '../js/state.js';
import { step, eff, depart } from '../js/sim.js';
import { applyAction } from '../js/actions.js';
import { EVENTS } from '../js/events.js';
import { fireEvent } from '../js/story.js';
import { DIFFICULTY } from '../js/config.js';

function checkNaN(obj, path = 'S') {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Non-finite at ' + path + '.' + k + ' = ' + v);
    if (v && typeof v === 'object') checkNaN(v, path + '.' + k);
  }
}
function run(diff, minutes, { god = true, fireAll = false } = {}) {
  const S = createState({ difficulty: diff, storyteller: 'kessler', length: 'short' });
  S.debug = true;
  S.players.p1 = newPlayer('p1', 'Tester', '#fff');
  S.players.p1.god = god;
  depart(S);
  if (!S.settings.autopilot) { S.settings.autopilot = true; }
  S.nav.autopilot = true;
  if (fireAll) for (const id of Object.keys(EVENTS)) if (EVENTS[id].fire) { try { fireEvent(S, id, 150); } catch (e) { console.error('event', id, e); throw e; } }
  const dt = 0.1; let legs = 0, lastLog = 0;
  for (let i = 0; i < minutes * 600; i++) {
    step(S, dt);
    if (S.vote) { for (const p of Object.values(S.players)) applyAction(S, p.id, 'vote', { opt: S.vote.options[0].id }); }
    if (S.nav.state === 'orbit') { S.players.p1.seat = 'helm'; applyAction(S, 'p1', 'helm.dock'); }
    if (S.nav.state === 'approach' && S.prox.t > 5 && (S.prox.dbg || 0) < S.prox.t - 15) { applyAction(S, 'p1', 'debug.dock'); S.prox.dbg = S.prox.t; }
    if (S.nav.state === 'docked' && S.phase === 'play') { legs++; S.players.p1.seat = 'helm'; applyAction(S, 'p1', 'helm.depart'); S.nav.autopilot = true; }
    // keep ship alive-ish for soak: auto-repair everything slowly in god mode
    if (god && i % 600 === 0) { for (const c of Object.values(S.comps)) { c.hp = Math.min(100, c.hp + 30); c.fire = 0; c.fault = 0; } S.breaches = []; S.hull = Math.max(S.hull, 60); }
    S.fx.length = 0;
    if (i % 600 === 0) checkNaN(S);
    if (S.phase !== 'play') break;
  }
  checkNaN(S);
  return { diff, phase: S.phase, reason: S.endReason, realMin: (S.t / 60).toFixed(1), gameDays: (S.gameTime / 86400).toFixed(1), leg: S.nav.leg, navState: S.nav.state,
    prog: (S.nav.x / S.nav.L).toFixed(3), v: (S.nav.v / 1000).toFixed(0) + 'km/s', rmass: S.mass.rmass.toFixed(0), heat: (S.heat.stored / 300).toFixed(0) + '%', events: S.stats.events, hits: S.stats.hits, hist: S.story.history.map(h => h.id).join(','), log: S.log.slice(-6).map(l => l.text) };
}
console.log(JSON.stringify(run('spacer', 5, { fireAll: true }), null, 1));
for (const d of Object.keys(DIFFICULTY)) console.log(JSON.stringify(run(d, 120), null, 1));
