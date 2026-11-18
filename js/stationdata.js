// Station concourses: what is where in each port's public deck, who works there, what they sell, and the contracts
// on offer. Host-side and pure; the 3D side is in stationview.js. Coordinates: x east, z south, metres; the docking
// tunnel from the Wolfram opens in the middle of the south wall.
import { WAYPOINTS, STATION_PRICES } from './config.js';
import { EXPERIMENTS } from './crew.js';

export const ST = { W: 38, D: 28, H: 6.2, g: 0.38 };
export const ST_SPAWN = { x: 0, z: ST.D / 2 - 2.2 };
export const ST_EXIT = { x: 0, z: ST.D / 2 - 0.6 };
// obstacles (axis-aligned boxes in x/z): counters, the bar, crates, the kiosk, planters
export const ST_BOXES = [
  [-18.4, -11, -15.6, 11],            // west market counters (one long run)
  [9.5, -13.8, 18.6, -11.2],          // the bar (north-east)
  [10.5, 6.5, 18.6, 9],               // shipyard office desk (south-east)
  [-17.6, -13.6, -9.5, -9.5],         // lost & found crates (north-west)
  [-1.2, -1.2, 1.2, 1.2],             // info kiosk (centre)
  [5, -6.5, 7, -4.5], [5, 3.5, 7, 5.5], [-7, -6.5, -5, -4.5], [-7, 3.5, -5, 5.5], // planters
  [11.5, -8, 13, -6.5], [15, -8, 16.5, -6.5], [11.5, -4.5, 13, -3], // bar tables
];
export const ST_ITEM_SPOTS = [[-12.5, -8.6], [-11.2, -8.4], [-13.6, -8.2], [-10.2, -8.8]];
const N_ = { luna: ['Hollis', 'Mae', 'Dr. Okafor', 'Petrov', 'Sunny', 'Ines'], phobos: ['Ravi', 'Kat', 'Gruber', 'Lin', 'Dutch', 'Amara'], ceres: ['Tomas', 'Yuki', 'Big Erik', 'Sol', 'Nadia', 'Juno'], ganymede: ['Ade', 'Wren', 'Marchetti', 'Hal', 'Priya', 'Cass'] };
export function stationNpcs(wid) {
  const nm = N_[wid] || N_.luna, lines = { luna: 'Shackleton Yard', phobos: 'Phobos Station', ceres: 'Piazzi Dock', ganymede: 'Nicholson Port' }[wid] || 'the station';
  return [
    { id: 'parts', name: nm[0], role: 'vendor', title: 'Parts & spares', x: -16.6, z: -7, yaw: Math.PI / 2, color: 0x3a6a9a, shop: ['board', 'wire', 'seal', 'bearing', 'cell', 'filler', 'optic'], line: `Cards, seals, bearings, HV fuses. Genuine ${lines} stock, mostly.` },
    { id: 'chandler', name: nm[1], role: 'vendor', title: 'Ship chandler', x: -16.6, z: 0, yaw: Math.PI / 2, color: 0x6a8a3a, shop: ['patch', 'medkit', 'cartridge', 'gas', 'water', 'feedstock', 'pellets'], line: 'Air, water, food, scrubber cans, patches. Everything that keeps you breathing.' },
    { id: 'arms', name: nm[3], role: 'vendor', title: 'Ordnance', x: -16.6, z: 7, yaw: Math.PI / 2, color: 0x8a3a2a, shop: ['missiles', 'srm', 'slugs', 'pdcAmmo'], line: 'Licensed defensive ordnance only. Wink.' },
    { id: 'mechanic', name: nm[2], role: 'vendor', title: 'Dockyard office', x: 14.5, z: 10.3, yaw: Math.PI, color: 0xd88a2a, shop: ['hull', 'yard'], line: 'My crews can patch your plating or go through the whole boat, if you can pay.' },
    { id: 'fixer', name: nm[4], role: 'quest', title: 'Contracts (the bar)', x: 14, z: -14.9, yaw: 0, color: 0x9a4a9a, line: 'Looking for work? I have people who need things moved, found or shot.' },
    { id: 'walker1', name: nm[5], role: 'ambient', title: 'Dock worker', x: 3, z: 8, yaw: 0, color: 0xc8a020, line: 'Mind the cargo lanes, spacer.' },
    { id: 'walker2', name: 'Traveller', role: 'ambient', title: 'Passenger', x: -3, z: -8, yaw: 0, color: 0x5a7a8a, line: 'Waiting on the Ganymede liner. Third day now.' },
  ];
}
export const SHOPS_OF = (wid) => Object.fromEntries(stationNpcs(wid).filter((n) => n.shop).map((n) => [n.id, n.shop]));
export function nearNpc(p, wid, id, r = 4.2) { const n = stationNpcs(wid).find((x) => x.id === id); return n && Math.hypot(p.x - n.x, p.z - n.z) < r ? n : null; }
export function vendorFor(p, wid, item) { return stationNpcs(wid).find((n) => n.shop && n.shop.includes(item) && Math.hypot(p.x - n.x, p.z - n.z) < 4.2); }

// ---------------- contracts ----------------
const QUEST_KINDS = {
  deliver: (S, leg, dest) => ({ title: `Sealed cargo for ${dest}`, text: `Carry a sealed medical shipment to ${dest}. No questions, no inspections.`, reward: 18 + 8 * leg }),
  pilot: (S, leg, dest) => ({ title: 'Prove your pilot', text: `The harbourmaster at ${dest} is taking bets: dock there with a contact speed under 0.15 m/s.`, reward: 20 }),
  science: (S, leg, dest) => { const keys = Object.keys(EXPERIMENTS); const ex = keys[(S.seed + leg * 7) % keys.length]; return { title: `Data run: ${EXPERIMENTS[ex].name}`, text: `A university lab will pay for fresh ${EXPERIMENTS[ex].name.toLowerCase()} data, completed before you reach ${dest}.`, reward: 26, ex }; },
  salvage: (S, leg, dest) => ({ title: 'Salvage recovery', text: `Recover a drifting container with your work pod before you reach ${dest}. The insurer pays on top of what's inside.`, reward: 24 }),
  bounty: (S, leg, dest) => ({ title: 'Pirate bounty', text: `Belt Mutual posts a bounty: destroy two hostile ships before ${dest}.`, reward: 40, n: 2 }),
  rescue: (S, leg, dest) => ({ title: 'Good Samaritan clause', text: 'Answer a distress call on the way and help them. The Seafarers\' Fund pays for every rescue.', reward: 16 }),
};
export function questOffers(S) {
  const leg = S.nav.leg; if (leg >= WAYPOINTS.length - 1) return [];
  const dest = WAYPOINTS[leg + 1].name.split(',')[0], kinds = Object.keys(QUEST_KINDS);
  const out = [];
  for (let i = 0; i < 3; i++) { const k = kinds[(S.seed + leg * 5 + i * 3) % kinds.length]; if (out.some((q) => q.kind === k)) continue; out.push({ id: `q${leg}-${k}`, kind: k, leg, ...QUEST_KINDS[k](S, leg, dest) }); }
  return out;
}
export function acceptQuest(S, id) {
  S.quests = S.quests || { active: [], done: 0 };
  const q = questOffers(S).find((x) => x.id === id);
  if (!q || S.quests.active.some((a) => a.id === id)) return null;
  const a = { ...q, kills0: S.stats.kills, sci0: (S.sci && S.sci.done[q.ex]) || 0, salv0: (S.qc && S.qc.salvage) || 0, resc0: (S.qc && S.qc.rescue) || 0 };
  S.quests.active.push(a);
  return a;
}
// evaluated when we dock at the next port
export function settleQuests(S, dockV) {
  if (!S.quests) return [];
  const res = [];
  for (const q of S.quests.active) {
    if (q.leg !== S.nav.leg - 1) continue;
    let ok = false;
    switch (q.kind) {
      case 'deliver': ok = true; break;
      case 'pilot': ok = dockV !== null && dockV < 0.15; break;
      case 'science': ok = ((S.sci && S.sci.done[q.ex]) || 0) > q.sci0; break;
      case 'salvage': ok = ((S.qc && S.qc.salvage) || 0) > q.salv0; break;
      case 'bounty': ok = S.stats.kills - q.kills0 >= (q.n || 2); break;
      case 'rescue': ok = ((S.qc && S.qc.rescue) || 0) > q.resc0; break;
    }
    if (ok) { S.credits += q.reward; S.quests.done++; }
    res.push({ q, ok });
  }
  S.quests.active = S.quests.active.filter((q) => q.leg >= S.nav.leg);
  return res;
}
export const stationId = (S) => WAYPOINTS[S.nav.leg].id;
export { STATION_PRICES };
