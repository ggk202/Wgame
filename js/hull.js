// Ship layout in the exterior (ship) frame and a signed-distance model of the hull for EVA collisions.
// Frame: x = starboard, y = dorsal, z = aft (the bow points to -z, the drive to +z). Units: metres.
// No three.js here, so the controller (and node tests) can use it.
import { COMPS, RING } from './config.js';

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
// the centrifuge arms turn with the ring: the client keeps this angle up to date (world.js) so the hull field, the
// tether and EVA collisions see the arms where they are drawn
export const RING_STATE = { spin: 0 };
const SPOKE_R = [1.1, 1.1, 1.35];
export function sdSpokes(x, y, z) {
  const dz = z - SL.ringZ; if (Math.abs(dz) > 3) return 1e9;
  const r0 = SL.ringR - SL.ringHR, a0 = SL.hubR + 0.3;
  let d = 1e9;
  for (let i = 0; i < 4; i++) {
    const deg = i < 3 ? RING.spokes[i] : 60; // the fourth is the cable truss between the first two spokes
    const a = (deg * Math.PI) / 180 + Math.PI / 2 + RING_STATE.spin, cx = Math.cos(a), cy = Math.sin(a);
    const t = Math.max(a0, Math.min(r0, x * cx + y * cy));
    const rad = i < 3 ? SPOKE_R[i] : 0.35;
    d = Math.min(d, Math.hypot(x - cx * t, y - cy * t, dz) - rad);
  }
  return d;
}
export function hullSDF(x, y, z) {
  let d = 1e9;
  d = Math.min(d, sdSpokes(x, y, z));
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

// ---------------- external component mounts and PDC firing arcs ----------------
// outward normal (local +y) of an external component's mount
export function extNormal(id) {
  const c = COMPS[id];
  switch (id) {
    case 'radA': return [-1, 0, 0];
    case 'radB': return [1, 0, 0];
    case 'pdc3': case 'railgun': return [0, -1, 0];
    case 'launcher': case 'antenna': return [0, 1, 0];
    default: { const l = Math.hypot(c.ex, c.ey) || 1; return [c.ex / l, c.ey / l, 0]; }
  }
}
// muzzle position of a gatling (ship frame): the gun sits ~1.6 m out from its mount
export function pdcMuzzle(id) { const c = COMPS[id], n = extNormal(id); return [c.ex + n[0] * 1.6, c.ey + n[1] * 1.6, c.ez + n[2] * 1.6]; }
// can this turret bear on a target in direction d (unit, ship frame)? Above its own horizon and with no hull in the way.
export function pdcCanSee(id, d) {
  const n = extNormal(id);
  if (d[0] * n[0] + d[1] * n[1] + d[2] * n[2] < -0.12) return false;
  const p = pdcMuzzle(id);
  for (const s of [2, 4, 7, 11, 16, 24, 35, 50, 70]) if (hullSDF(p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s) < 0.15) return false;
  return true;
}

// ---------------- the spinning centrifuge ring, for collisions ----------------
export function ringSDF(x, y, z) { return Math.min(sdRing(x, y, z), sdSpokes(x, y, z)); }

// ---------------- tether attachment points ----------------
// Hard points with clip rings all along the hull. Anchor 0 is the airlock hatch. A crew member's tether runs from the
// last point they clipped to; to work further away they hop from point to point.
export const ANCHORS = (() => {
  const out = [{ x: 16.2 + 0.3, y: 1.4, z: -42, name: 'EVA hatch' }];
  const zs = [-93, -86, -77, -66.5, -53, -32, -20, -8, 4, 16, 29];
  const names = { 0: 'dorsal', 90: 'starboard', 180: 'ventral', 270: 'port' };
  zs.forEach((z, i) => {
    for (const a of i % 2 ? [90, 270] : [0, 180]) {
      const r = (a * Math.PI) / 180, dx = Math.sin(r), dy = Math.cos(r);
      let k = 0; while (k < 30 && hullSDF(dx * k, dy * k, z) < 0.35) k += 0.1;
      // keep clear of the ring and its arms
      if (Math.abs(z - SL.ringZ) < SL.ringHW + 1 && k > SL.hubR + 0.5) continue;
      out.push({ x: dx * k, y: dy * k, z, name: `${names[a]} · station ${Math.round(z)}` });
    }
  });
  return out;
})();
// first point on the segment a→b that is inside the hull (skipping the ends), pushed back out to the surface
export function tetherSnag(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
  if (L < 0.8) return null;
  const n = Math.ceil(L / 0.5);
  for (let i = 1; i < n; i++) {
    const t = i / n, x = a.x + dx * t, y = a.y + dy * t, z = a.z + dz * t;
    if (L * t < 0.5 || L * (1 - t) < 0.6) continue;
    if (hullSDF(x, y, z) < 0.05) { const p = { x, y, z }; hullPush(p, 0.35); return p; }
  }
  return null;
}
export const tetherClear = (a, b) => !tetherSnag(a, b);
// does the segment pass through the ring's swept volume?
export function tetherInRing(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz), n = Math.max(2, Math.ceil(L / 0.7));
  for (let i = 0; i <= n; i++) { const t = i / n; const x = a.x + dx * t, y = a.y + dy * t, z = a.z + dz * t; if (sdRing(x, y, z) < 0.45 || sdSpokes(x, y, z) < 0.3) return { x, y, z }; }
  return null;
}
