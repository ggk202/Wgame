// Routes: before each departure the nav console offers a few ways to get to the next port, FTL-style. Each route
// changes the leg's length, the storyteller's mix of events (and which ones), the danger level, and the payoff.
// Host-side and pure.
import { WAYPOINTS } from './config.js';

// bias: multiplies the storyteller's category weights; ev: multiplies specific events' weights inside a category
export const ROUTE_TYPES = {
  direct: {
    name: 'Direct burn', short: 'DIRECT', len: 1.0, danger: 2, color: '#ffc27a',
    text: 'The plotted minimum-energy line. No surprises, no favours.',
    bias: {}, ev: {}, perks: [],
  },
  navy: {
    name: 'Patrolled shipping lane', short: 'PATROL', len: 1.18, danger: 1, color: '#6bd0ff',
    text: 'A Navy-patrolled corridor: an escort frigate shadows you for part of the leg, traffic control is friendly, pirates stay away. Longer, and customs are thorough.',
    bias: { major: 0.45, opportunity: 1.2 }, ev: { pirates: 0.15, gunship: 0.2, drone_swarm: 0.6, hail_customs: 3, hail_traffic: 2, navy_escort: 4 },
    perks: ['escort'],
  },
  sun: {
    name: 'Inner slingshot', short: 'SLINGSHOT', len: 0.82, danger: 3, color: '#ffe070',
    text: 'Dive sunward and use the gravity well: a shorter, faster leg, but hotter radiators and a higher chance of proton storms. Science pays well this close to the Sun.',
    bias: { major: 1.1 }, ev: { solar_storm: 4, radiator_puncture: 2, power_surge: 1.6, pirates: 0.5 },
    perks: ['hot', 'science'],
  },
  belt: {
    name: 'Belt detour', short: 'BELT', len: 1.28, danger: 3, color: '#c8a070',
    text: 'Thread through a mining belt: salvage, traders and drifting cargo for the work pod, but rocks, debris and claim-jumpers.',
    bias: { opportunity: 2.2, minor: 1.3 }, ev: { debris_field: 3, rock: 3, micrometeoroid: 2, meteor_shower: 2, pirates: 1.5, salvage_container: 4, trader: 3, comet_ice: 3, distress_call: 1.5 },
    perks: ['salvage'],
  },
  dark: {
    name: 'Dark run', short: 'DARK', len: 0.95, danger: 4, color: '#ff6a4a',
    text: 'Transponder off, outside the lanes: no customs or traffic fees and a smuggler\'s bonus on arrival, but no help either. Pirates and separatists hunt these routes.',
    bias: { major: 1.7, opportunity: 0.7, flavor: 0.4 }, ev: { pirates: 2.2, gunship: 2, drone_swarm: 1.5, hail_customs: 0, hail_traffic: 0, navy_escort: 0, supply_drone: 0 },
    perks: ['bounty'],
  },
};
// which routes are on offer for a leg (deterministic per run and leg, so all clients agree)
export function routeOptions(S, leg) {
  const seed = (S.seed || 7) * 31 + leg * 17;
  const extra = ['sun', 'belt', 'dark', 'navy'];
  const pick = [];
  for (let i = 0; i < extra.length; i++) if (((seed >> i) ^ (seed * (i + 3))) % 3 !== 0) pick.push(extra[i]);
  while (pick.length < 2) pick.push(extra.find((x) => !pick.includes(x)));
  return ['direct', ...pick.slice(0, 3)];
}
export function routeOf(S) { return ROUTE_TYPES[S.nav.route] || ROUTE_TYPES.direct; }
export function routeEventWeight(S, cat, id) {
  const R = routeOf(S);
  return (R.bias[cat] ?? 1) * (id && R.ev[id] !== undefined ? R.ev[id] : 1);
}
export function routeThreat(S) { return [0, 0.6, 1, 1.2, 1.5][routeOf(S).danger] || 1; }
// map geometry for the nav display: a gentle curve per route between the two ports
export function routeCurve(S, id, leg) {
  const a = WAYPOINTS[leg].pos, b = WAYPOINTS[leg + 1].pos;
  const bend = { direct: 0, navy: 0.12, sun: -0.22, belt: 0.3, dark: -0.08 }[id] || 0;
  // sunward bend points toward the origin; others to the side
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  let nx = -dy / L, ny = dx / L;
  if (id === 'sun') { const r = Math.hypot(mx, my) || 1; nx = -mx / r; ny = -my / r; }
  const k = id === 'sun' ? Math.abs(bend) * L : bend * L;
  return [a, [mx + nx * k, my + ny * k], b];
}
