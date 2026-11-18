// Initial game state factory. The whole game state is plain JSON so it can be synced and saved.
import { COMPS, COMP_IDS, DECKS, SHIP, DIFFICULTY, STORYTELLERS, LENGTHS, WAYPOINTS, AU, VERSION } from './config.js';

export function legLength(leg) {
  const a = WAYPOINTS[leg].pos, b = WAYPOINTS[leg + 1].pos;
  return Math.hypot(b[0] - a[0], b[1] - a[1]) * AU;
}

export function createState(opts = {}) {
  const difficulty = DIFFICULTY[opts.difficulty] ? opts.difficulty : 'spacer';
  const storyteller = STORYTELLERS[opts.storyteller] ? opts.storyteller : 'cassiopeia';
  const length = LENGTHS[opts.length] ? opts.length : 'standard';
  const D = DIFFICULTY[difficulty];

  const comps = {};
  for (const id of COMP_IDS) {
    const c = COMPS[id];
    comps[id] = { id, hp: 100, fire: 0, on: true, pw: 1, prio: c.prio, fault: 0, reboot: 0 };
  }
  const decks = DECKS.map((d) => ({ id: d.id, o2: 21, n2: 79, co2: 0.1, temp: 21, rad: 0, vent: false, isolate: false, force: false }));
  decks.push(extDeck());

  return {
    v: VERSION,
    t: 0,                 // real seconds simulated
    gameTime: 0,          // voyage seconds
    warp: LENGTHS[length].warp,
    paused: false,
    phase: 'play',        // play | won | lost
    endReason: '',
    settings: { difficulty, storyteller, length, ...D, warpBase: LENGTHS[length].warp },
    comps,
    decks,
    breaches: [],         // {id, deck, a, y, size, patch}
    items: [],            // dropped items {id,type,deck,x,z,charge}
    players: {},
    pods: D.pods,
    credits: 10,
    hull: 100,
    alert: 'green',
    reactor: { state: 'running', target: 0.7, actual: 0.7, stab: 1, field: 0, drift: 0, lowStabT: 0, preheat: 0 },
    battery: { charge: SHIP.batteryMWh * 0.8 },
    power: { gen: 0, demand: 0, used: 0, deficit: 0, batt: 0 },
    heat: { stored: 6000, inMW: 0, outMW: 0, radExt: true },
    drive: { ignited: false, cmdG: 0, want: 0, throttle: 0, acc: 0, g: 0, orient: 1, flip: 0, evasive: false, maneuver: 'hold', locked: 0, lockedThr: 0 },
    mass: { rmass: SHIP.rmassMax, pellets: SHIP.pellets, contam: 0 },
    nav: { leg: 0, x: 0, v: 0, L: legLength(0), state: 'docked', autopilot: D.autopilot, plan: { cruise: 600, g: 0.3 }, dockT: 0, adriftT: 0 },
    life: { o2: 1200, n2: 3500, water: 3000, food: 160, electrolysis: true, sat: 0.15, regen: 0, suppressant: 4 },
    stores: { spares: 10, patch: 6, medkit: 6, cartridge: 3, feedstock: 300, missiles: 6, slugs: 30, pdcAmmo: 6000, chaff: 4 },
    fab: { queue: [] },
    drones: { total: 4, jobs: [] },
    weap: { rail: 0, charging: false, tubes: [{ loaded: true, load: 0 }, { loaded: false, load: 0 }], pdcMode: D.autoPDC ? 'auto' : 'manual', chaffT: 0, focus: [] },
    sensors: { lock: null, q: 0, pingCd: 0, pingT: 0 },
    enc: null,            // combat encounter
    vote: null,           // pending crew decision
    effects: { escortT: 0, stormT: 0, stormWarn: 0, debris: null },
    story: { nextAt: 75, lastMajor: -200, tension: 0, beats: {}, history: [] },
    log: [],
    msgs: [],             // comms inbox {t, from, text, lag}
    fx: [],
    stats: { kills: 0, podsUsed: 0, hits: 0, events: 0, startedAt: Date.now() },
  };
}

export function extDeck() { return { id: 5, ext: true, o2: 0, n2: 0, co2: 0, temp: -100, rad: 0, vent: false, isolate: true, force: false }; }

export function newPlayer(id, name, color) {
  return {
    id, name: name || 'Crew', color: color || '#ff8c42',
    deck: 3, x: 0, z: 3.2, yaw: Math.PI, pitch: 0,
    hp: 100, suit: false, suitO2: 300, dose: 0,
    item: null, state: 'alive', downT: 0, respawnT: 0, seat: null, tp: 1, connected: true, work: null,
  };
}
