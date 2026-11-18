// WOLFRAM — shared constants and game data
export const VERSION = '0.1.0';

// ---- Geometry (metres) ----
export const DECK_H = 7;      // vertical spacing between deck floors
export const ROOM_R = 11;     // deck radius
export const ROOM_H = 3.8;    // ceiling height
export const SHAFT_R = 1.5;   // central lift shaft radius
export const EYE = 1.65;

// ---- Physics ----
export const AU = 1.496e11;
export const G0 = 9.81;
export const C_LIGHT = 299792458;

export const SHIP = {
  name: 'CSV Wolfram',
  dry: 1800,            // tonnes
  rmassMax: 2200,       // tonnes of reaction mass (water/hydrogen)
  thrust: 3.9e7,        // newtons at full throttle
  ve: 2.5e6,            // exhaust velocity m/s (torch drive)
  reactorMW: 40,        // electrical output at 100%
  batteryMWh: 3,
  battMaxDis: 25,       // MW
  battMaxChg: 10,       // MW
  heatCap: 30000,       // MJ heat-sink capacity
  radExt: 50,           // MW dumped per radiator wing when extended
  radRet: 8,            // MW per wing when retracted
  habLoad: 3,           // MW base hotel load (lights, fans, computers)
  deckVol: 1200,        // m^3 per deck
  pellets: 600,         // kg D-He3 fuel pellets
};

// kg per kPa in one deck volume (ideal gas, 293 K, 1200 m^3)
export const KG_PER_KPA = { o2: 15.8, n2: 13.8, co2: 21.7 };

export const DECKS = [
  { id: 0, name: 'Drive', full: 'DECK 0 — DRIVE & PROPELLANT', color: 0xff7a3d },
  { id: 1, name: 'Cargo', full: 'DECK 1 — CARGO & FABRICATION', color: 0xe6c84a },
  { id: 2, name: 'Engineering', full: 'DECK 2 — REACTOR & POWER', color: 0x4ad0e6 },
  { id: 3, name: 'Habitation', full: 'DECK 3 — LIFE SUPPORT & MEDICAL', color: 0x6be675 },
  { id: 4, name: 'Bridge', full: 'DECK 4 — COMMAND', color: 0xb58cff },
];

// Components. a = angle (deg, 0 = north), r = radius from centre, fp = collision footprint radius.
// power = base MW, wear = hp lost per real minute at wear x1, prio = default power priority (1 = critical)
export const COMPS = {
  // Bridge
  helm:       { name: 'Helm Station', deck: 4, a: 0, r: 8.6, mesh: 'console', fp: 0.9, panel: 'helm', power: 0.3, wear: 0.3, prio: 1, computer: true },
  navcomp:    { name: 'Navigation Computer', deck: 4, a: 45, r: 8.6, mesh: 'console', fp: 0.9, panel: 'nav', power: 0.5, wear: 0.3, prio: 2, computer: true },
  tactical:   { name: 'Fire Control', deck: 4, a: -45, r: 8.6, mesh: 'console', fp: 0.9, panel: 'tactical', power: 0.4, wear: 0.3, prio: 2, computer: true },
  sensors:    { name: 'Sensor Suite', deck: 4, a: 100, r: 8.6, mesh: 'console', fp: 0.9, panel: 'sensors', power: 2, wear: 0.4, prio: 2, computer: true },
  comms:      { name: 'Comms Station', deck: 4, a: -100, r: 8.6, mesh: 'console', fp: 0.9, panel: 'comms', power: 0.6, wear: 0.3, prio: 2, computer: true },
  status:     { name: 'Ship Status Board', deck: 4, a: 180, r: 9.6, mesh: 'board', fp: 0.7, panel: 'status', power: 0.1, wear: 0.15, prio: 3, computer: true },
  // Habitation
  lifesupport:{ name: 'Atmosphere Control & Electrolysis', deck: 3, a: 0, r: 8.4, mesh: 'machine', fp: 1.2, panel: 'life', power: 3, wear: 0.6, prio: 1 },
  scrubbers:  { name: 'CO2 Scrubbers', deck: 3, a: 50, r: 8.6, mesh: 'scrubber', fp: 1.0, panel: 'scrubbers', power: 1, wear: 0.6, prio: 1 },
  recycler:   { name: 'Water Recycler', deck: 3, a: 100, r: 8.6, mesh: 'tank', fp: 1.0, panel: 'recycler', power: 0.8, wear: 0.5, prio: 2 },
  hydro:      { name: 'Hydroponics Bay', deck: 3, a: 150, r: 8.4, mesh: 'hydro', fp: 1.5, panel: 'hydro', power: 1.5, wear: 0.4, prio: 3 },
  medbay:     { name: 'Medbay', deck: 3, a: 210, r: 8.4, mesh: 'bed', fp: 1.2, panel: 'med', power: 0.5, wear: 0.3, prio: 2 },
  cryo:       { name: 'Cryo Bay (backup crew)', deck: 3, a: 262, r: 8.6, mesh: 'cryo', fp: 1.4, panel: 'cryo', power: 1.5, wear: 0.3, prio: 1 },
  // Engineering
  reactor:    { name: 'Fusion Reactor', deck: 2, a: 0, r: 7.2, mesh: 'reactor', fp: 2.4, panel: 'reactor', power: 0, wear: 0.5, prio: 1 },
  powerdist:  { name: 'Power Distribution', deck: 2, a: 75, r: 9.4, mesh: 'cabinet', fp: 0.8, panel: 'power', power: 0.2, wear: 0.4, prio: 1 },
  battery:    { name: 'Battery Bank', deck: 2, a: 125, r: 8.8, mesh: 'battery', fp: 1.1, panel: 'power', power: 0, wear: 0.3, prio: 1 },
  thermal:    { name: 'Thermal Control', deck: 2, a: -75, r: 9.2, mesh: 'console', fp: 0.9, panel: 'thermal', power: 0.2, wear: 0.3, prio: 1, computer: true },
  coolpump:   { name: 'Coolant Pumps', deck: 2, a: -125, r: 8.7, mesh: 'pump', fp: 1.1, panel: 'thermal', power: 1, wear: 0.7, prio: 1 },
  // Cargo
  fabricator: { name: 'Fabricator', deck: 1, a: 0, r: 8.4, mesh: 'fab', fp: 1.3, panel: 'fab', power: 0.2, wear: 0.5, prio: 3 },
  stores:     { name: 'Stores & Spares', deck: 1, a: 60, r: 9.0, mesh: 'shelves', fp: 1.1, panel: 'stores', power: 0.1, wear: 0.1, prio: 3 },
  magazine:   { name: 'Munitions Magazine', deck: 1, a: 120, r: 8.8, mesh: 'magazine', fp: 1.1, panel: 'magazine', power: 0.3, wear: 0.3, prio: 2 },
  dronebay:   { name: 'Repair Drone Bay', deck: 1, a: -60, r: 8.4, mesh: 'dronebay', fp: 1.4, panel: 'drones', power: 0.5, wear: 0.4, prio: 2 },
  // Drive
  drivecore:  { name: 'Fusion Torch Drive', deck: 0, a: 0, r: 7.0, mesh: 'drive', fp: 2.4, panel: 'drive', power: 2, wear: 0.4, prio: 1 },
  drivectl:   { name: 'Drive Control', deck: 0, a: 75, r: 9.2, mesh: 'console', fp: 0.9, panel: 'drive', power: 0.3, wear: 0.3, prio: 1, computer: true },
  tanks:      { name: 'Reaction Mass Tanks', deck: 0, a: -75, r: 8.6, mesh: 'tanks', fp: 1.6, panel: 'tanks', power: 0.2, wear: 0.2, prio: 2 },
  injector:   { name: 'Pellet Injector', deck: 0, a: 140, r: 8.8, mesh: 'machine', fp: 1.1, panel: 'tanks', power: 0.4, wear: 0.5, prio: 1 },
  // External (repaired by drones)
  // External (hull exterior, reached by EVA through the Cargo airlock, or repaired by drones)
  // ex/ez = position on the dorsal equipment spine (x across, z along the ship; -z toward the bow)
  radA:       { name: 'Radiator Wing A', ext: true, ex: -6.4, ez: 4, fp: 0.8, mesh: 'radiator', power: 0.3, wear: 0.25, prio: 1 },
  radB:       { name: 'Radiator Wing B', ext: true, ex: 6.4, ez: 4, fp: 0.8, mesh: 'radiator', power: 0.3, wear: 0.25, prio: 1 },
  pdc1:       { name: 'PDC Turret 1', ext: true, ex: -4.4, ez: -22, fp: 1.0, mesh: 'pdc', power: 0.5, wear: 0.15, prio: 1 },
  pdc2:       { name: 'PDC Turret 2', ext: true, ex: 4.4, ez: -22, fp: 1.0, mesh: 'pdc', power: 0.5, wear: 0.15, prio: 1 },
  pdc3:       { name: 'PDC Turret 3', ext: true, ex: 0, ez: 27, fp: 1.0, mesh: 'pdc', power: 0.5, wear: 0.15, prio: 1 },
  railgun:    { name: 'Spinal Railgun', ext: true, ex: 0, ez: -11, fp: 1.4, mesh: 'railgun', power: 0.3, wear: 0.15, prio: 2 },
  antenna:    { name: 'High-Gain Antenna', ext: true, ex: -4.4, ez: 18, fp: 1.0, mesh: 'antenna', power: 0.3, wear: 0.15, prio: 3 },
  sensorArray:{ name: 'External Sensor Array', ext: true, ex: 4.4, ez: -31, fp: 1.0, mesh: 'sensorarray', power: 0.5, wear: 0.2, prio: 2 },
};
export const COMP_IDS = Object.keys(COMPS);

// One emergency locker per deck, plus the lift door
export const LOCKERS = [
  { deck: 0, a: -140, r: 9.6 }, { deck: 1, a: -120, r: 9.6 }, { deck: 2, a: 180, r: 9.6 },
  { deck: 3, a: 315, r: 9.6 }, { deck: 4, a: 140, r: 9.6 },
];
export const LIFT_A = 180;
// Exterior (EVA). Players outside have deck = EXT_DECK and walk the dorsal equipment spine with mag boots.
export const EXT_DECK = 5;
export const EXT = { w: 7.0, zMin: -37, zMax: 33, hatch: { x: 0, z: 10 }, maxG: 0.6 };
export const AIRLOCK = { deck: 1, a: 200 };            // inner airlock door on the Cargo deck
export const deckName = (d) => (d === EXT_DECK ? 'Exterior (EVA)' : (DECKS[d] ? DECKS[d].name : '?'));           // lift door faces south
export const SHELTER = { deck: 3, a: 315, r: 6.4, rad: 2.2 }; // storm shelter zone (water-wall cubicle)

export const ITEMS = {
  spares:    { name: 'Spare Parts Kit', color: 0xf0b030, short: 'SPARES' },
  patch:     { name: 'Hull Patch', color: 0x9aa7b8, short: 'PATCH' },
  ext:       { name: 'Extinguisher', color: 0xe03030, short: 'EXTING.' },
  medkit:    { name: 'Medkit', color: 0xf5f5f5, short: 'MEDKIT' },
  cartridge: { name: 'Scrubber Cartridge', color: 0x50c8a0, short: 'CARTRIDGE' },
};

export const RECIPES = {
  spares:     { name: 'Spare Parts Kit', kg: 20, t: 25, qty: 1 },
  patch:      { name: 'Hull Patch', kg: 10, t: 15, qty: 1 },
  medkit:     { name: 'Medkit', kg: 6, t: 20, qty: 1 },
  cartridge:  { name: 'Scrubber Cartridge', kg: 8, t: 15, qty: 1 },
  missiles:   { name: 'Torpedo', kg: 60, t: 60, qty: 1 },
  slugs:      { name: 'Railgun Slugs x5', kg: 15, t: 30, qty: 5 },
  pdcAmmo:    { name: 'PDC Ammo x500', kg: 10, t: 20, qty: 500 },
  chaff:      { name: 'Chaff Canister', kg: 8, t: 20, qty: 1 },
  suppressant:{ name: 'Fire Suppressant Charge', kg: 12, t: 30, qty: 1 },
};

export const DIFFICULTY = {
  recruit: {
    name: 'Recruit', desc: 'Heavy automation. Nanites repair components and seal small breaches. Plenty of backup crew.',
    autopilot: true, autoPower: true, autoReactor: 'full', autoRadiators: true, autoFire: true, autoPDC: true,
    nanites: 2.0, naniteBreach: true, wear: 0.45, threat: 0.6, pods: 8, dmg: 0.7,
  },
  spacer: {
    name: 'Spacer', desc: 'Autopilot, load balancing and reactor assist. Slow nanite maintenance. Fires are on you.',
    autopilot: true, autoPower: true, autoReactor: 'assist', autoRadiators: true, autoFire: false, autoPDC: true,
    nanites: 0.8, naniteBreach: false, wear: 0.75, threat: 0.85, pods: 5, dmg: 0.85,
  },
  veteran: {
    name: 'Veteran', desc: 'Manual flight, reactor and power. Point defence still runs itself. No nanites.',
    autopilot: false, autoPower: false, autoReactor: false, autoRadiators: false, autoFire: false, autoPDC: true,
    nanites: 0, naniteBreach: false, wear: 1.0, threat: 1.0, pods: 3, dmg: 1.0,
  },
  newtonian: {
    name: 'Newtonian', desc: 'Everything manual, faster wear, harder threats, one backup crew pod. Good luck.',
    autopilot: false, autoPower: false, autoReactor: false, autoRadiators: false, autoFire: false, autoPDC: false,
    nanites: 0, naniteBreach: false, wear: 1.3, threat: 1.3, pods: 1, dmg: 1.2,
  },
};

export const STORYTELLERS = {
  cassiopeia: { name: 'Cassiopeia', desc: 'Steady escalation with breathers after big threats.', interval: [70, 130], majorGap: 330, majorChance: 0.35, threat: 1.0,
    weights: { minor: 0.32, malfunction: 0.33, opportunity: 0.22, flavor: 0.13 } },
  halley: { name: 'Halley', desc: 'Merciful. Fewer and gentler threats, more opportunities.', interval: [110, 190], majorGap: 520, majorChance: 0.25, threat: 0.7,
    weights: { minor: 0.25, malfunction: 0.3, opportunity: 0.33, flavor: 0.12 } },
  kessler: { name: 'Kessler', desc: 'Chaotic. Anything, any time, in any order.', interval: [25, 200], majorGap: 160, majorChance: 0.4, threat: 1.1,
    weights: { minor: 0.35, malfunction: 0.35, opportunity: 0.2, flavor: 0.1 } },
};

export const LENGTHS = {
  short: { name: 'Short (~1 h)', warp: 720 },
  standard: { name: 'Standard (~1.5–2 h)', warp: 420 },
  long: { name: 'Long (~2.5 h)', warp: 260 },
};

// Heliocentric positions (AU) for the campaign route
export const WAYPOINTS = [
  { id: 'luna', name: 'Shackleton Yard, Luna', pos: [1.0, 0.0], color: '#c8d0dc' },
  { id: 'phobos', name: 'Phobos Station, Mars', pos: [1.2, 1.0], color: '#e0704a' },
  { id: 'ceres', name: 'Piazzi Dock, Ceres', pos: [0.5, 2.6], color: '#a8a090' },
  { id: 'ganymede', name: 'Nicholson Port, Ganymede', pos: [-1.6, 4.6], color: '#d8b080' },
];

export const STATION_PRICES = {
  spares:     { name: 'Spare Parts Kit x2', cost: 5 },
  patch:      { name: 'Hull Patch x2', cost: 4 },
  medkit:     { name: 'Medkit x2', cost: 3 },
  cartridge:  { name: 'Scrubber Cartridge x2', cost: 3 },
  missiles:   { name: 'Torpedo x2', cost: 8 },
  slugs:      { name: 'Railgun Slugs x10', cost: 4 },
  pdcAmmo:    { name: 'PDC Ammo x2000', cost: 4 },
  feedstock:  { name: 'Fab Feedstock 100 kg', cost: 5 },
  gas:        { name: 'O2 400 kg + N2 1000 kg', cost: 6 },
  water:      { name: 'Water 1000 L + Food 60 kg', cost: 4 },
  pellets:    { name: 'D-He3 pellets 150 kg', cost: 4 },
  hull:       { name: 'Hull plating repair +15%', cost: 8 },
  yard:       { name: 'Dockyard overhaul: all components +40', cost: 18 },
};

export const PLAYER_COLORS = ['#ff8c42', '#4ad0e6', '#b58cff', '#6be675', '#ff5a7a', '#f0e04a'];
