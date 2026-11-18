// Repairs: what can break in each kind of module, which parts each fix consumes, and which hands-on procedure
// (minigame) it takes. Shared by the simulation (host) and the minigame (client); no three.js here.
import { COMPS } from './config.js';

// Ship's stock of spare parts (S.stores[key]). There is no universal spare any more.
export const PARTS = {
  board:   { name: 'Circuit cards', short: 'CARD', kg: 6, t: 30, cost: 2, start: 6 },
  wire:    { name: 'Wiring & splice kits', short: 'WIRE', kg: 3, t: 12, cost: 1, start: 8 },
  seal:    { name: 'Seals & gaskets', short: 'SEAL', kg: 4, t: 15, cost: 1, start: 6 },
  bearing: { name: 'Bearings & actuators', short: 'BRG', kg: 10, t: 25, cost: 2, start: 4 },
  cell:    { name: 'Power cells & HV fuses', short: 'CELL', kg: 12, t: 30, cost: 2, start: 5 },
  filler:  { name: 'Weld filler rod', short: 'ROD', kg: 3, t: 10, cost: 1, start: 8 },
  optic:   { name: 'Optics & sensor heads', short: 'OPTIC', kg: 5, t: 40, cost: 3, start: 3 },
};
export const PART_IDS = Object.keys(PARTS);

// Procedures (each is its own minigame), with the faults they fix:
//  circuit  - unscrew the access panel, pull scorched cards with tweezers, seat spares, cut out and splice/tape burnt wiring, close up, test
//  coolant  - close the isolation valve, unbolt the flange, replace the gasket, torque the bolts in a star pattern, reopen, leak-check
//  bearing  - unscrew the cover, take off the retaining nut, swap the bearing/actuator, refit, test-run
//  hv       - lock out the breaker, discharge the capacitors with the grounding probe, swap blown fuses/cells, restore, test
//  weld     - weld the crack closed along its whole length with the compact welder, then inspect the bead
//  optics   - unbolt the sensor head, fit a new one, then peak the alignment
export const PROCS = {
  circuit: { name: 'Circuit repair' }, coolant: { name: 'Seal replacement' }, bearing: { name: 'Bearing / actuator swap' },
  hv: { name: 'High-voltage fuse & cell swap' }, weld: { name: 'Crack weld' }, optics: { name: 'Sensor head swap & alignment' },
};

// What can go wrong, per module type (COMPS[id].mesh). Each issue: label, procedure, the faults the minigame builds,
// and the parts it consumes. "s" = screws on the access panel, "b" = flange/mount bolts.
const I = (label, proc, f, parts) => ({ label, proc, f, parts });
export const MODULES = {
  console: { name: 'Workstation', issues: [
    I('Shorted logic card', 'circuit', { s: 6, cards: 5, bad: 1, wires: 2, cut: 0 }, { board: 1 }),
    I('Burnt display harness', 'circuit', { s: 6, cards: 5, bad: 0, wires: 3, cut: 2 }, { wire: 1 }),
    I('Power supply card blown', 'circuit', { s: 6, cards: 6, bad: 2, wires: 2, cut: 1 }, { board: 2, wire: 1 }),
  ] },
  helm: { name: 'Helm station', issues: [
    I('Hand-controller interface card fried', 'circuit', { s: 8, cards: 6, bad: 1, wires: 3, cut: 1 }, { board: 1, wire: 1 }),
    I('Gimbal actuator seized', 'bearing', { s: 6, b: 4 }, { bearing: 1 }),
  ] },
  board: { name: 'Status board', issues: [I('Display driver card failed', 'circuit', { s: 4, cards: 3, bad: 1, wires: 2, cut: 0 }, { board: 1 })] },
  machine: { name: 'Process machine', issues: [
    I('Stack seal leaking', 'coolant', { b: 6 }, { seal: 1 }),
    I('Controller card shorted', 'circuit', { s: 6, cards: 4, bad: 1, wires: 2, cut: 1 }, { board: 1, wire: 1 }),
  ] },
  scrubber: { name: 'CO₂ scrubber', issues: [I('Sorbent bed seal leaking', 'coolant', { b: 6 }, { seal: 1 }), I('Fan bearing worn out', 'bearing', { s: 4, b: 3 }, { bearing: 1 })] },
  tank: { name: 'Recycler', issues: [I('Distiller flange leaking', 'coolant', { b: 8 }, { seal: 1 }), I('Pump controller card failed', 'circuit', { s: 4, cards: 3, bad: 1, wires: 2, cut: 0 }, { board: 1 })] },
  hydro: { name: 'Hydroponics', issues: [I('Nutrient line seal split', 'coolant', { b: 6 }, { seal: 1 }), I('Grow-light driver burnt', 'circuit', { s: 4, cards: 4, bad: 1, wires: 3, cut: 2 }, { board: 1, wire: 1 })] },
  bed: { name: 'Medbay', issues: [I('Monitor card failed', 'circuit', { s: 4, cards: 4, bad: 1, wires: 2, cut: 0 }, { board: 1 })] },
  cryo: { name: 'Cryo bay', issues: [I('Cryocooler HV fuse blown', 'hv', { s: 6, cells: 4, bad: 1 }, { cell: 1 }), I('Pod controller card shorted', 'circuit', { s: 6, cards: 6, bad: 1, wires: 3, cut: 1 }, { board: 1, wire: 1 })] },
  reactor: { name: 'Fusion reactor', issues: [
    I('Field-coil HV fuses blown', 'hv', { s: 8, cells: 6, bad: 2 }, { cell: 2 }),
    I('Primary coolant flange leaking', 'coolant', { b: 8 }, { seal: 1 }),
    I('Cracked first-wall tile mount', 'weld', { len: 3 }, { filler: 2 }),
  ] },
  cabinet: { name: 'Power distribution', issues: [I('Bus fuses blown', 'hv', { s: 6, cells: 6, bad: 2 }, { cell: 2 }), I('Breaker logic card burnt', 'circuit', { s: 6, cards: 5, bad: 1, wires: 3, cut: 2 }, { board: 1, wire: 1 })] },
  battery: { name: 'Battery bank', issues: [I('Cells failed', 'hv', { s: 8, cells: 8, bad: 3 }, { cell: 3 })] },
  pump: { name: 'Coolant pumps', issues: [I('Impeller bearing failed', 'bearing', { s: 6, b: 4 }, { bearing: 1 }), I('Pump-head seal leaking', 'coolant', { b: 6 }, { seal: 1 })] },
  fab: { name: 'Fabricator', issues: [I('Gantry actuator jammed', 'bearing', { s: 6, b: 4 }, { bearing: 1 }), I('Motion-control card failed', 'circuit', { s: 6, cards: 5, bad: 1, wires: 2, cut: 1 }, { board: 1, wire: 1 })] },
  shelves: { name: 'Stores', issues: [I('Rack latch actuator stuck', 'bearing', { s: 4, b: 3 }, { bearing: 1 })] },
  magazine: { name: 'Magazine', issues: [I('Loader actuator seized', 'bearing', { s: 6, b: 4 }, { bearing: 1 }), I('Interlock card shorted', 'circuit', { s: 6, cards: 4, bad: 1, wires: 2, cut: 1 }, { board: 1, wire: 1 })] },
  dronebay: { name: 'Drone bay', issues: [I('Dock clamp actuator failed', 'bearing', { s: 4, b: 3 }, { bearing: 1 }), I('Charging card burnt', 'circuit', { s: 4, cards: 4, bad: 1, wires: 2, cut: 1 }, { board: 1, wire: 1 })] },
  drive: { name: 'Torch drive', issues: [
    I('Ignition capacitor fuses blown', 'hv', { s: 8, cells: 6, bad: 2 }, { cell: 2 }),
    I('Injector manifold seal leaking', 'coolant', { b: 8 }, { seal: 1 }),
    I('Cracked thrust-frame bracket', 'weld', { len: 4 }, { filler: 3 }),
  ] },
  tanks: { name: 'Reaction mass tanks', issues: [I('Feed-line flange leaking', 'coolant', { b: 8 }, { seal: 1 }), I('Cracked tank saddle', 'weld', { len: 3 }, { filler: 2 })] },
  radiator: { name: 'Radiator wing', issues: [I('Panel manifold leaking', 'coolant', { b: 6 }, { seal: 1 }), I('Cracked panel hinge', 'weld', { len: 3 }, { filler: 2 })] },
  pdc: { name: 'Gatling PDC', issues: [I('Barrel-drive bearing failed', 'bearing', { s: 6, b: 4 }, { bearing: 1 }), I('Fire-control card shorted', 'circuit', { s: 6, cards: 4, bad: 1, wires: 3, cut: 1 }, { board: 1, wire: 1 })] },
  railgun: { name: 'Railgun', issues: [I('Capacitor-bank fuses blown', 'hv', { s: 8, cells: 8, bad: 2 }, { cell: 2 }), I('Cracked rail mount', 'weld', { len: 4 }, { filler: 3 })] },
  launcher: { name: 'Missile launcher', issues: [I('Cell-lid actuator jammed', 'bearing', { s: 6, b: 4 }, { bearing: 1 }), I('Launch sequencer card failed', 'circuit', { s: 6, cards: 4, bad: 1, wires: 2, cut: 1 }, { board: 1, wire: 1 })] },
  antenna: { name: 'High-gain antenna', issues: [I('Feed horn damaged', 'optics', { b: 4 }, { optic: 1 }), I('Gimbal bearing worn', 'bearing', { s: 4, b: 3 }, { bearing: 1 })] },
  sensorarray: { name: 'Sensor array', issues: [I('Optical sensor head damaged', 'optics', { b: 4 }, { optic: 1 }), I('Signal processor card failed', 'circuit', { s: 6, cards: 5, bad: 1, wires: 2, cut: 1 }, { board: 1, wire: 1 })] },
};
export const moduleOf = (id) => MODULES[COMPS[id].mesh] || MODULES.console;
export function issueOf(id, key) { const m = moduleOf(id); return m.issues[key] || m.issues[0]; }
// a destroyed module needs its issue fixed plus a second one (the damage spread); parts add up
export function repairNeeds(S, id) {
  const c = S.comps[id];
  if (!c || c.issue === undefined || c.issue === null) return null;
  const list = [issueOf(id, c.issue)];
  if (c.issue2 !== undefined && c.issue2 !== null && c.issue2 !== c.issue) list.push(issueOf(id, c.issue2));
  const parts = {};
  for (const i of list) for (const [k, n] of Object.entries(i.parts)) parts[k] = (parts[k] || 0) + n;
  return { issues: list, parts };
}
export function missingParts(S, parts) { return Object.entries(parts).filter(([k, n]) => (S.stores[k] || 0) < n).map(([k, n]) => `${n - (S.stores[k] || 0)}× ${PARTS[k].name}`); }
// host: assign a fault once a module is damaged enough to need hands-on work
export function assignIssue(S, id, rnd = Math.random) {
  const c = S.comps[id], m = moduleOf(id);
  if (c.issue === undefined || c.issue === null) c.issue = Math.floor(rnd() * m.issues.length);
  if (c.hp <= 0 && (c.issue2 === undefined || c.issue2 === null) && m.issues.length > 1) { let k = Math.floor(rnd() * m.issues.length); if (k === c.issue) k = (k + 1) % m.issues.length; c.issue2 = k; }
}
