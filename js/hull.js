// Ship layout in the exterior (ship) frame and a signed-distance model of the hull for EVA collisions.
// Frame: x = starboard, y = dorsal, z = aft (the bow points to -z, the drive to +z). Units: metres.
// No three.js here, so the controller (and node tests) can use it.

export const SL = {
  R: 12.2,                         // pressure-module hull radius (the interior decks are 22 m drums)
  port: [-97.6, -95.2],            // bow docking port collar
  cap: [-95.2, -91], capR0: 3.6,   // forward cap: tapers from the port to the command module
  cmd: [-91, -81],                 // command module (Bridge, deck 4)
  hab: [-81, -71],                 // habitation module (deck 3)
  hub: [-71, -59], hubR: 6.2,      // centrifuge hub and bearings
  ringZ: -65, ringR: 24.1, ringHR: 2.9, ringHW: 3.6, // ring tube: centre radius, half-depth (radial), half-width (axial)
  eng: [-59, -47],                 // engineering module (reactor, deck 2)
  cargo: [-47, -37],               // cargo module (deck 1) with the starboard airlock
  truss: [-37, 24], tw: 3.6,       // square spine truss, half-width
  rad: { x0: 4.4, x1: 38, z0: -21, z1: 3 }, // radiator wings (one each side)
  bus: [24, 34], busR: 6.6,        // drive bus (deck 0)
  shield: [34, 35.8], shieldR: 10.2,
  nozzle: [36, 53], nozR0: 3.2, nozR1: 9.6,
  airlock: { x0: 11.6, x1: 16.0, r: 2.2, z: -42 },
  bowPort: [0, 0, -97.8],          // where the station's docking target meets us
};

const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
function sdBox(px, py, pz, cx, cy, cz, hx, hy, hz) {
  const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy, qz = Math.abs(pz - cz) - hz;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0);
}
function sdCylZ(px, py, pz, cx, cy, r, z0, z1) {
  const dr = Math.hypot(px - cx, py - cy) - r, dz = Math.max(z0 - pz, pz - z1);
  return Math.hypot(Math.max(dr, 0), Math.max(dz, 0)) + Math.min(Math.max(dr, dz), 0);
}
function sdCylX(px, py, pz, cy, cz, r, x0, x1) {
  const dr = Math.hypot(py - cy, pz - cz) - r, dx = Math.max(x0 - px, px - x1);
  return Math.hypot(Math.max(dr, 0), Math.max(dx, 0)) + Math.min(Math.max(dr, dx), 0);
}
function sdConeZ(px, py, pz, r0, r1, z0, z1) {
  const t = Math.min(1, Math.max(0, (pz - z0) / (z1 - z0))), r = r0 + (r1 - r0) * t;
  const k = Math.cos(Math.atan2(Math.abs(r1 - r0), z1 - z0));
  const dr = (Math.hypot(px, py) - r) * k, dz = Math.max(z0 - pz, pz - z1);
  return Math.hypot(Math.max(dr, 0), Math.max(dz, 0)) + Math.min(Math.max(dr, dz), 0);
}
function sdRing(px, py, pz) {
  const qx = Math.abs(Math.hypot(px, py) - SL.ringR) - SL.ringHR, qz = Math.abs(pz - SL.ringZ) - SL.ringHW;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - 0.3; // rounded edges
}
const TANK_SPHERES = [[-6.9, 3.9], [6.9, 3.9], [-6.9, -3.9], [6.9, -3.9], [0, 7.9], [0, -7.9]].map(([x, y]) => [x, y, -29, 3.1]);
const TANK_CYLS = [[-6.6, 0], [6.6, 0], [0, 6.6], [0, -6.6]].map(([x, y]) => [x, y, 2.8, 6, 22]);

// Signed distance from a point to the hull (negative = inside structure).
export function hullSDF(x, y, z) {
  let d = 1e9;
  d = Math.min(d, sdCylZ(x, y, z, 0, 0, SL.R, SL.cmd[0], SL.hab[1]));
  d = Math.min(d, sdCylZ(x, y, z, 0, 0, SL.R, SL.eng[0], SL.cargo[1]));
  d = Math.min(d, sdConeZ(x, y, z, SL.capR0, SL.R, SL.cap[0], SL.cap[1]));
  d = Math.min(d, sdCylZ(x, y, z, 0, 0, 2.0, SL.port[0], SL.port[1]));
  d = Math.min(d, sdCylZ(x, y, z, 0, 0, SL.hubR, SL.hub[0], SL.hub[1]));
  d = Math.min(d, sdRing(x, y, z));
  d = Math.min(d, sdBox(x, y, z, 0, 0, (SL.truss[0] + SL.truss[1]) / 2, SL.tw, SL.tw, (SL.truss[1] - SL.truss[0]) / 2));
  for (const s of [-1, 1]) d = Math.min(d, sdBox(x, y, z, s * (SL.rad.x0 + SL.rad.x1) / 2, 0, (SL.rad.z0 + SL.rad.z1) / 2, (SL.rad.x1 - SL.rad.x0) / 2, 0.25, (SL.rad.z1 - SL.rad.z0) / 2));
  for (const [cx, cy, cz, r] of TANK_SPHERES) d = Math.min(d, len3(x - cx, y - cy, z - cz) - r);
  for (const [cx, cy, r, z0, z1] of TANK_CYLS) d = Math.min(d, sdCylZ(x, y, z, cx, cy, r, z0, z1));
  d = Math.min(d, sdCylZ(x, y, z, 0, 0, SL.busR, SL.bus[0], SL.bus[1]));
  d = Math.min(d, sdCylZ(x, y, z, 0, 0, SL.shieldR, SL.shield[0], SL.shield[1]));
  d = Math.min(d, sdConeZ(x, y, z, SL.nozR0, SL.nozR1, SL.nozzle[0], SL.nozzle[1]));
  d = Math.min(d, sdCylX(x, y, z, 0, SL.airlock.z, SL.airlock.r, SL.airlock.x0, SL.airlock.x1));
  d = Math.min(d, sdBox(x, y, z, 0, 13.0, -42, 1.7, 0.9, 3.1));            // missile launcher
  d = Math.min(d, sdBox(x, y, z, 0, -13.3, -72, 1.1, 1.2, 25.5));          // railgun rails, ventral
  return d;
}

// Push a point out of the hull. Returns the distance to the hull surface after the push.
export function hullPush(p, rad = 0.6) {
  const d = hullSDF(p.x, p.y, p.z);
  if (d >= rad) return d;
  const e = 0.05;
  let nx = hullSDF(p.x + e, p.y, p.z) - hullSDF(p.x - e, p.y, p.z);
  let ny = hullSDF(p.x, p.y + e, p.z) - hullSDF(p.x, p.y - e, p.z);
  let nz = hullSDF(p.x, p.y, p.z + e) - hullSDF(p.x, p.y, p.z - e);
  const n = len3(nx, ny, nz) || 1; nx /= n; ny /= n; nz /= n;
  const k = rad - d;
  p.x += nx * k; p.y += ny * k; p.z += nz * k;
  return rad;
}
export function hullNormal(x, y, z) {
  const e = 0.05;
  const nx = hullSDF(x + e, y, z) - hullSDF(x - e, y, z), ny = hullSDF(x, y + e, z) - hullSDF(x, y - e, z), nz = hullSDF(x, y, z + e) - hullSDF(x, y, z - e);
  const n = len3(nx, ny, nz) || 1;
  return [nx / n, ny / n, nz / n];
}
