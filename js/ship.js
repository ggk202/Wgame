// Exterior of the CSV Wolfram: a long-spine D-He3 torch freighter in an ISS-era engineering style.
// Bow to stern (-z to +z): docking port, command and habitation modules, centrifuge hub and ring, engineering and
// cargo modules (starboard airlock), the spine truss with propellant tanks and radiator wings, drive bus, shadow
// shield and the magnetic nozzle. Mostly symmetric, with the practical asymmetries a working ship collects.
import * as THREE from 'three';
import { COMPS, COMP_IDS, EXT, RING } from './config.js';
import { SL, extNormal } from './hull.js';
import { PAL, mat, metal, emis, texMat, mliTex, goldMat, radiatorTex, grateTex, decalTex, screenTex, textSprite, struts } from './models.js';
import { bakeStatic, hazardTex, RING_WINDOWS } from './interior.js';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
let SM = null;
function smats() {
  if (SM) return SM;
  SM = {
    mli: texMat(mliTex([10, 3]), { roughness: 0.85 }),
    mliS: texMat(mliTex([3, 2]), { roughness: 0.85 }),
    white: mat(PAL.white, { roughness: 0.6 }),
    off: mat(PAL.off, { roughness: 0.7 }),
    grey: metal(0xa7adb4, { roughness: 0.45, metalness: 0.6 }),
    steel: metal(0x7c838b, { roughness: 0.35 }),
    dark: mat(0x2c3137, { roughness: 0.6, metalness: 0.3 }),
    black: mat(0x14171a, { roughness: 0.5 }),
    rail: metal(0xd8ae46, { roughness: 0.35, metalness: 0.6 }),
    gold: goldMat([3, 2]),
    goldL: goldMat([8, 4]),
    blue: mat(PAL.blue, { roughness: 0.55 }),
    red: mat(0xb8342a, { roughness: 0.55 }),
    truss: metal(0xc5cad0, { roughness: 0.4, metalness: 0.55 }),
    shield: metal(0x55595f, { roughness: 0.55, metalness: 0.8 }),
    tungsten: metal(0x8e8f8c, { roughness: 0.3, metalness: 0.9 }),
    copper: metal(0xb8743a, { roughness: 0.35, metalness: 0.9 }),
    glassD: new THREE.MeshPhysicalMaterial({ color: 0x223040, roughness: 0.05, metalness: 0.6, clearcoat: 1 }),
    winLit: emis(0xffe9c8, 0.85),
    hazard: texMat(hazardTex([6, 1]), { roughness: 0.6 }),
    radiator: new THREE.MeshStandardMaterial({ map: radiatorTex([1, 3]), emissive: 0x000000, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide }),
    grate: texMat(grateTex([2, 10])),
  };
  return SM;
}

function shipAdder(g) {
  return (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
}
// a solid of revolution about the ship axis (z) from (radius, z) pairs
function latheZ(pts, m, segs = 64) {
  const geo = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), segs);
  geo.rotateX(Math.PI / 2); // lathe axis y -> z (after the rotation, +y of the profile maps to +z)
  return new THREE.Mesh(geo, m);
}
const cylZ = (r, z0, z1, m, segs = 64, open = false) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, z1 - z0, segs, 1, open), m); o.rotation.x = Math.PI / 2; o.position.z = (z0 + z1) / 2; return o; };
const shipScreen = (w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: screenTex(), color: 0xffffff }));

// ---------------- external components ----------------
// Each faces local +y away from the hull. Returns the handles the world animates.
export function buildExtComp(kind) {
  const M = smats();
  const g = new THREE.Group(), add = shipAdder(g);
  let screen = null, glow = null, wing = null, spin = null, gat = null, lids = null, extra = {};
  const panel = (w, h, x, y, z, ry = 0) => { add(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.06), M.black, x, y, z, 0, ry); screen = shipScreen(w, h); screen.position.set(x + Math.sin(ry) * 0.035, y, z + Math.cos(ry) * 0.035); screen.rotation.y = ry; g.add(screen); };
  switch (kind) {
    case 'pdc': { // 6-barrel 30 mm gatling on a two-axis mount, with a fire-control sensor pod and an ammunition feed
      add(new THREE.CylinderGeometry(1.15, 1.35, 0.5, 24), M.mliS, 0, 0.25, 0);
      add(new THREE.TorusGeometry(1.1, 0.07, 8, 24), M.steel, 0, 0.52, 0, Math.PI / 2);
      const yaw = new THREE.Group(); yaw.position.y = 0.55; g.add(yaw);
      const ya = shipAdder(yaw);
      ya(new THREE.CylinderGeometry(0.85, 0.95, 0.4, 20), M.white, 0, 0.2, 0);
      for (const s of [-1, 1]) ya(new THREE.BoxGeometry(0.16, 0.95, 0.75), M.white, s * 0.62, 0.8, 0);
      ya(new THREE.BoxGeometry(0.5, 0.42, 0.4), M.grey, -1.0, 0.75, 0.05); // sensor pod
      ya(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 12), M.glassD, -1.0, 0.8, -0.24, Math.PI / 2);
      ya(new THREE.BoxGeometry(0.34, 0.24, 1.0), M.dark, 0.95, 0.55, 0.35, 0.35); // ammunition feed chute
      const pitch = new THREE.Group(); pitch.position.y = 1.0; yaw.add(pitch);
      const pa = shipAdder(pitch);
      pa(new THREE.BoxGeometry(0.98, 0.62, 0.95), M.grey, 0, 0, 0.1);
      pa(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 16), M.dark, 0, 0, -0.55, Math.PI / 2);
      const barrels = new THREE.Group(); barrels.position.set(0, 0, -0.8); pitch.add(barrels);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 2.2, 8), M.steel); b.rotation.x = Math.PI / 2; b.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, -1.1); barrels.add(b); }
      for (const z of [-0.5, -1.6, -2.15]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 16), M.dark); c.rotation.x = Math.PI / 2; c.position.z = z; barrels.add(c); }
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex(), color: 0xffd090, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      flash.position.z = -2.5; flash.scale.set(1.4, 1.4, 1); flash.visible = false; barrels.add(flash);
      gat = { yaw, pitch, barrels, flash };
      panel(0.42, 0.25, 0, 0.3, 1.2);
      break;
    }
    case 'launcher': { // 8-cell vertical launcher: armoured box, hinged cell lids, exhaust uptakes
      add(new THREE.BoxGeometry(3.4, 1.7, 6.2), M.white, 0, 0.85, 0);
      add(new THREE.BoxGeometry(3.5, 0.12, 6.3), M.grey, 0, 1.72, 0);
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.16, 1.2, 5.8), M.dark, s * 1.62, 0.9, 0);
      add(new THREE.BoxGeometry(3.42, 0.1, 6.22), M.hazard, 0, 0.12, 0);
      lids = [];
      for (let i = 0; i < 8; i++) {
        const cx = (i % 2 ? 0.75 : -0.75), cz = -2.25 + Math.floor(i / 2) * 1.5;
        add(new THREE.BoxGeometry(1.25, 0.02, 1.25), M.black, cx, 1.79, cz);
        const hinge = new THREE.Group(); hinge.position.set(cx - 0.62 * Math.sign(cx), 1.8, cz); g.add(hinge);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.07, 1.22), M.off); lid.position.x = 0.61 * Math.sign(cx); hinge.add(lid);
        hinge.userData.side = Math.sign(cx); lids.push(hinge);
      }
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.3), new THREE.MeshBasicMaterial({ map: labelTex('KESTREL MK 4 · 8-CELL · DANGER — EXHAUST', '#1a1d22', '#e6e3da'), transparent: true }));
      lab.position.set(0, 1.0, 3.11); g.add(lab);
      panel(0.5, 0.3, 1.0, 0.6, 3.12);
      break;
    }
    case 'railgun': { // capacitor bank and breech housing at the aft end of the ventral rails (the rails run to the bow)
      add(new THREE.BoxGeometry(3.0, 1.6, 6.5), M.mliS, 0, 0.8, 0);
      for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(3.1, 1.7, 0.18), M.grey, 0, 0.85, -2.8 + i * 1.4);
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 14), M.blue, s * 1.7, 0.75, -2.2 + i * 1.5);
      glow = add(new THREE.BoxGeometry(0.9, 0.5, 0.9), emis(0x66aaff, 1), 0, 1.72, -3.4);
      panel(0.6, 0.35, 0, 0.9, 3.27);
      break;
    }
    case 'radiator': { // rotary joint and wing: four big panels on a deployable beam (scale.x = extension)
      add(new THREE.CylinderGeometry(0.85, 0.85, 1.6, 20), M.grey, 0, 0.8, 0);
      add(new THREE.CylinderGeometry(1.0, 1.0, 0.3, 20), M.dark, 0, 1.7, 0);
      for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.09, 0.09, 1.8, 8), [M.copper, M.rail, M.copper][i], -0.45 + i * 0.45, 0.9, 0.9);
      wing = new THREE.Group(); wing.position.set(0, 1.85, 0); g.add(wing);
      const wa = shipAdder(wing);
      wa(new THREE.BoxGeometry(0.36, 0.36, SL.rad.z1 - SL.rad.z0), M.grey, 0, 0, 0); // root beam along the ship; the wing deploys along local +y
      const span = SL.rad.x1 - SL.rad.x0 - 1.2;
      for (let i = 0; i < 4; i++) {
        const y0 = 1.0 + i * (span / 4);
        const p = wa(new THREE.BoxGeometry(0.07, span / 4 - 0.5, SL.rad.z1 - SL.rad.z0 - 0.4), M.radiator, 0, y0 + span / 8, 0);
        p.userData.panel = true;
        wa(new THREE.BoxGeometry(0.14, 0.16, SL.rad.z1 - SL.rad.z0 - 0.2), M.grey, 0, y0, 0);
        for (const zz of [-(SL.rad.z1 - SL.rad.z0) / 2 + 0.1, (SL.rad.z1 - SL.rad.z0) / 2 - 0.1]) wa(new THREE.BoxGeometry(0.14, span / 4 - 0.3, 0.12), M.grey, 0, y0 + span / 8, zz);
      }
      wing.userData.mat = M.radiator;
      panel(0.42, 0.26, 0, 0.9, 0.87);
      break;
    }
    case 'antenna': { // high-gain dish on a two-axis gimbal at the top of a mast
      add(new THREE.CylinderGeometry(0.16, 0.24, 4.2, 12), M.grey, 0, 2.1, 0);
      spin = new THREE.Group(); spin.position.y = 4.3; g.add(spin);
      const sa = shipAdder(spin);
      const dish = sa(new THREE.SphereGeometry(2.0, 32, 10, 0, Math.PI * 2, 0, 0.85), new THREE.MeshStandardMaterial({ color: PAL.white, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.15 }), 0, 0.6, 0, Math.PI * 0.72);
      void dish;
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; sa(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 6), M.dark, Math.cos(a) * 0.5, 0.95, 0.5 + Math.sin(a) * 0.5, -0.6, 0, 0); }
      sa(new THREE.BoxGeometry(0.6, 0.6, 0.6), M.gold, 0, -0.1, 0);
      panel(0.42, 0.26, 0, 1.0, 0.27);
      break;
    }
    case 'sensorarray': { // the combat telescope (gimballed optical tube), a phased-array radar face and a lidar dome
      add(new THREE.CylinderGeometry(0.22, 0.32, 2.4, 12), M.grey, 0, 1.2, 0);
      add(new THREE.BoxGeometry(1.6, 0.9, 1.0), M.gold, 0, 1.9, 0);
      add(new THREE.SphereGeometry(0.45, 16, 12), M.white, 0.95, 2.7, 0);
      const tube = add(new THREE.CylinderGeometry(0.42, 0.42, 2.4, 20), M.white, -0.9, 2.65, -0.3, Math.PI / 2 - 0.2); void tube;
      add(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 20), M.glassD, -0.9, 2.88, -1.48, Math.PI / 2 - 0.2);
      spin = new THREE.Group(); spin.position.y = 3.4; g.add(spin);
      spin.add(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.6, 0.14), mat(0x22262c)));
      panel(0.42, 0.26, 0, 1.0, 0.52);
      break;
    }
    default: add(new THREE.BoxGeometry(1, 1, 1), M.white, 0, 0.5, 0);
  }
  const bb = new THREE.Box3().setFromObject(g);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), emis(0x40ff80)); g.add(light);
  light.position.set(bb.max.x - 0.15, Math.min(bb.max.y, 3) + 0.1, bb.max.z - 0.15);
  if (wing) light.position.set(0.9, 1.75, 0.9);
  return { group: g, screen, glow, light, wing, spin, gat, lids, height: Math.min(4, bb.max.y), ...extra };
}

let _flash = null;
function flashTex() {
  if (_flash) return _flash;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 1, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, 'rgba(255,200,120,0.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (_flash = new THREE.CanvasTexture(c));
}
function labelTex(text, fg, bg) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 120; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 120); g.fillStyle = fg; g.font = 'bold 64px Helvetica, Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText(text, 24, 62);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export { flashTex };

// ---------------- external cameras (cycled at the Helm and Fire Control) ----------------
export const EXT_CAMS = [
  { name: 'BOW · DOCKING PORT', pos: [3.4, 4.2, -99.5], look: [0, 0, -140], fov: 55 },
  { name: 'DORSAL · LOOKING AFT', pos: [0, 16.5, -96], look: [0, 0, 10], fov: 50 },
  { name: 'CENTRIFUGE RING', pos: [10, 14, -44], look: [0, 0, -66], fov: 62 },
  { name: 'PDC GATLING 2', pos: [12.8, 11.8, -46], look: [8.8, 9.5, -53], fov: 58 },
  { name: 'MISSILE LAUNCHER', pos: [-4.5, 17.0, -32], look: [0, 13.2, -42], fov: 55 },
  { name: 'STARBOARD AIRLOCK', pos: [24, 5, -30], look: [15.5, 0, -42], fov: 55 },
  { name: 'RADIATOR WING B', pos: [6, 14, 18], look: [24, 0, -9], fov: 62 },
  { name: 'VENTRAL · RAILGUN', pos: [4.5, -19, -40], look: [0, -13.5, -97], fov: 52 },
  { name: 'DRIVE · NOZZLE', pos: [15, 9, 26], look: [0, 0, 46], fov: 60 },
];

// ---------------- the ship ----------------
export function buildShipExterior(compsOut) {
  const M = smats();
  const g = new THREE.Group(); const add = shipAdder(g);
  const R = SL.R;

  // bow: docking port collar, guide petals and a forward cap that tapers into the command module
  g.add(cylZ(2.0, SL.port[0], SL.port[1], M.white, 32));
  add(new THREE.TorusGeometry(2.05, 0.2, 10, 36), M.grey, 0, 0, SL.port[0] + 0.2);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.3; add(new THREE.BoxGeometry(0.5, 0.12, 1.0), M.grey, Math.cos(a) * 1.75, Math.sin(a) * 1.75, SL.port[0] - 0.35, 0.45 * Math.sin(a), 0, a + Math.PI / 2); }
  add(new THREE.CircleGeometry(1.7, 32), M.dark, 0, 0, SL.port[0] - 0.01, 0, Math.PI);
  add(new THREE.TorusGeometry(1.1, 0.08, 8, 28), M.rail, 0, 0, SL.port[0] - 0.05);
  const cap = latheZ([[2.0, SL.cap[0]], [SL.capR0 + 0.6, SL.cap[0] + 0.3], [7.5, SL.cap[0] + 1.6], [10.8, SL.cap[0] + 3.0], [R, SL.cap[1]]], M.mliS, 64); g.add(cap);
  // cupola-style forward windows in the cap (lit from inside)
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; if (i === 6) continue; const w = add(new THREE.PlaneGeometry(1.5, 1.0), M.glassD, Math.cos(a) * 6.4, Math.sin(a) * 6.4, SL.cap[0] + 1.25); w.lookAt(Math.cos(a) * 14, Math.sin(a) * 14, SL.cap[0] - 6); }

  // pressure modules: white MLI over micrometeoroid shielding, joint rings, handrails and windows
  for (const [z0, z1] of [[SL.cmd[0], SL.hab[1]], [SL.eng[0], SL.cargo[1]]]) {
    const body = cylZ(R, z0, z1, M.mli, 72, true); g.add(body);
    for (let z = z0; z <= z1 + 0.01; z += 10) add(new THREE.TorusGeometry(R + 0.06, 0.24, 8, 72), M.grey, 0, 0, z);
    for (let z = z0 + 5; z < z1; z += 10) add(new THREE.TorusGeometry(R + 0.03, 0.08, 6, 72), M.off, 0, 0, z);
    // longerons (8, not quite evenly loaded with kit)
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(new THREE.BoxGeometry(0.22, 0.12, z1 - z0), M.off, Math.cos(a) * (R + 0.05), Math.sin(a) * (R + 0.05), (z0 + z1) / 2, 0, 0, a + Math.PI / 2); }
    // EVA handrails: short yellow rails every 1.5 m along four lines
    for (const a of [Math.PI / 2, Math.PI / 2 + 0.55, Math.PI / 2 - 0.55, -Math.PI / 2]) for (let z = z0 + 1; z < z1 - 0.5; z += 1.5) {
      const x = Math.cos(a) * (R + 0.22), y = Math.sin(a) * (R + 0.22);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), M.rail, x, y, z + 0.45, Math.PI / 2);
      for (const dz of [0, 0.9]) add(new THREE.BoxGeometry(0.05, 0.05, 0.05), M.rail, Math.cos(a) * (R + 0.11), Math.sin(a) * (R + 0.11), z + dz);
    }
  }
  // end bulkheads facing the hub (so the gap reads as structure)
  for (const z of [SL.hab[1], SL.eng[0]]) add(new THREE.CircleGeometry(R, 64), M.mliS, 0, 0, z, 0, z === SL.hab[1] ? 0 : Math.PI);
  // bridge windows (match the interior's forward arc: interior "north" is dorsal)
  for (let i = -2; i <= 2; i++) { const a = Math.PI / 2 + i * 0.4; for (const z of [-87.5, -84.5]) { const w = add(new THREE.PlaneGeometry(1.4, 2.2), M.winLit, Math.cos(a) * (R + 0.08), Math.sin(a) * (R + 0.08), z); w.lookAt(Math.cos(a) * 40, Math.sin(a) * 40, z); w.userData.keep = true; } }
  // habitation porthole and the hab's crew-quarters window band (lit)
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 - 0.9 + i * 0.36; const w = add(new THREE.CircleGeometry(0.45, 20), M.winLit, Math.cos(a) * (R + 0.08), Math.sin(a) * (R + 0.08), -76); w.lookAt(Math.cos(a) * 40, Math.sin(a) * 40, -76); w.userData.keep = true; }
  // name and patch on both flanks
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshStandardMaterial({ map: decalTex(), transparent: true, roughness: 0.8 }));
  decal.position.set(R + 0.1, 3.2, -78); decal.rotation.y = Math.PI / 2; decal.userData.keep = true; g.add(decal);
  const decal2 = decal.clone(); decal2.position.x = -R - 0.1; decal2.rotation.y = -Math.PI / 2; g.add(decal2);
  g.add(cylZ(R + 0.04, -73.4, -72.4, M.blue, 72, true));

  // centrifuge hub: a narrower drum with two bearing races and the spin motor housings
  g.add(cylZ(SL.hubR, SL.hub[0], SL.hub[1], M.mliS, 48));
  for (const z of [SL.ringZ - 3.2, SL.ringZ + 3.2]) { add(new THREE.TorusGeometry(SL.hubR + 0.5, 0.45, 12, 48), M.steel, 0, 0, z); add(new THREE.TorusGeometry(SL.hubR + 0.95, 0.12, 8, 48), M.copper, 0, 0, z); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; add(new THREE.BoxGeometry(1.4, 1.2, 2.4), M.grey, Math.cos(a) * (SL.hubR + 0.6), Math.sin(a) * (SL.hubR + 0.6), SL.hub[0] + 2.2, 0, 0, a); }
  // the ring itself rotates (world spins it), so it lives in its own group
  const ring = new THREE.Group(); ring.position.z = SL.ringZ; g.add(ring);
  {
    const r0 = SL.ringR - SL.ringHR, r1 = SL.ringR + SL.ringHR, hw = SL.ringHW, rr = 0.6;
    const prof = [];
    const corner = (cr, cz, a0) => { for (let k = 0; k <= 4; k++) { const a = a0 + (k / 4) * (Math.PI / 2); prof.push([cr + Math.cos(a) * rr, cz + Math.sin(a) * rr]); } };
    corner(r0 + rr, -hw + rr, Math.PI); corner(r1 - rr, -hw + rr, -Math.PI / 2); corner(r1 - rr, hw - rr, 0); corner(r0 + rr, hw - rr, Math.PI / 2);
    prof.push(prof[0]);
    const shell = latheZ(prof.map(([r, z]) => [r, z]), M.mli, 144); ring.add(shell);
    const ra = shipAdder(ring);
    // frames, window rows (lit labs inside), and the outer rim conduit
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ra(new THREE.BoxGeometry(0.3, 0.3, hw * 2 + 0.1), M.grey, Math.cos(a) * (r1 + 0.05), Math.sin(a) * (r1 + 0.05), 0, 0, 0, a);

    }
    // big viewports: 8 m windows in both side faces between the labs, and 5 m floor viewports in the outer rim (lit from inside)
    const RF = RING.R, winMat = new THREE.MeshBasicMaterial({ color: 0xf0d9b0, side: THREE.DoubleSide }), frameM = M.dark;
    for (const zc of RING_WINDOWS.side) {
      const a0 = zc / RF, da = RING_WINDOWS.sideLen / RF, rIn = SL.ringR + (RF - SL.ringR) - RING_WINDOWS.y1, rOut = SL.ringR + (RF - SL.ringR) - RING_WINDOWS.y0;
      for (const sd of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 16, 1, a0 - da / 2, da), winMat); w.position.z = sd * (hw + 0.03); w.userData.keep = true; ring.add(w);
        const fr = new THREE.Mesh(new THREE.RingGeometry(rIn - 0.25, rOut + 0.25, 16, 1, a0 - da / 2 - 0.01, da + 0.02), frameM); fr.position.z = sd * (hw + 0.015); ring.add(fr);
        for (let k = 1; k < 4; k++) { const ak = a0 - da / 2 + (k * da) / 4, rm = (rIn + rOut) / 2; ra(new THREE.BoxGeometry(0.16, rOut - rIn, 0.08), frameM, Math.cos(ak) * rm, Math.sin(ak) * rm, sd * (hw + 0.05), 0, 0, ak - Math.PI / 2); }
      }
    }
    for (const zc of RING_WINDOWS.floor) {
      const a0 = zc / RF, da = RING_WINDOWS.floorLen / RF;
      const w = new THREE.Mesh(new THREE.CylinderGeometry(r1 + 0.04, r1 + 0.04, RING_WINDOWS.floorHalfW * 2, 10, 1, true, Math.PI / 2 - a0 - da / 2, da), winMat); w.rotation.x = Math.PI / 2; w.userData.keep = true; ring.add(w);
    }
    ra(new THREE.TorusGeometry(r1 + 0.32, 0.12, 8, 144), M.dark, 0, 0, 1.6);
    ra(new THREE.TorusGeometry(r1 + 0.32, 0.12, 8, 144), M.copper, 0, 0, -1.6);
    // three spokes (the third carries the main power and coolant trunk, so it is fatter), plus a cable truss
    RING.spokes.forEach((deg, i) => {
      const a = (deg * Math.PI) / 180 + Math.PI / 2, len = r0 - SL.hubR - 0.3, mid = SL.hubR + 0.3 + len / 2;
      const sp = ra(new THREE.CylinderGeometry(i === 2 ? 1.35 : 1.1, i === 2 ? 1.35 : 1.1, len, 20), M.mliS, Math.cos(a) * mid, Math.sin(a) * mid, 0, 0, 0, a - Math.PI / 2);
      void sp;
      for (let k = 1; k < 4; k++) ra(new THREE.TorusGeometry(i === 2 ? 1.4 : 1.15, 0.1, 6, 20), M.grey, Math.cos(a) * (SL.hubR + 0.3 + (len * k) / 4), Math.sin(a) * (SL.hubR + 0.3 + (len * k) / 4), 0, 0, 0, a).rotation.set(Math.PI / 2, 0, a, 'ZXY');
      for (const s of [-1, 1]) ra(new THREE.CylinderGeometry(0.06, 0.06, len, 6), M.rail, Math.cos(a) * mid + Math.cos(a + Math.PI / 2) * 1.3 * s, Math.sin(a) * mid + Math.sin(a + Math.PI / 2) * 1.3 * s, 0.6, 0, 0, a - Math.PI / 2);
    });
    { const a = Math.PI / 2 + Math.PI / 3, len = r0 - SL.hubR - 0.3, mid = SL.hubR + 0.3 + len / 2;
      ring.add(struts([[Math.cos(a) * (SL.hubR + 0.4), Math.sin(a) * (SL.hubR + 0.4), -1.6, Math.cos(a) * (r0 - 0.1), Math.sin(a) * (r0 - 0.1), -1.6, 0.16], [Math.cos(a) * (SL.hubR + 0.4), Math.sin(a) * (SL.hubR + 0.4), 1.6, Math.cos(a) * (r0 - 0.1), Math.sin(a) * (r0 - 0.1), 1.6, 0.16], [Math.cos(a) * (SL.hubR + 0.4), Math.sin(a) * (SL.hubR + 0.4), -1.6, Math.cos(a) * mid, Math.sin(a) * mid, 1.6, 0.1], [Math.cos(a) * mid, Math.sin(a) * mid, 1.6, Math.cos(a) * (r0 - 0.1), Math.sin(a) * (r0 - 0.1), -1.6, 0.1]], M.truss)); }
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), emis(0xffffff, 1)); blink.position.set(0, r1 + 0.4, 0); blink.userData.blink = true; blink.userData.keep = true; ring.add(blink);
  }
  bakeStatic(ring); ring.userData.keep = true;
  g.userData.ring = ring;

  // engineering and cargo: coolant manifolds, vent stacks, a work-pod parked on the port side, a folded crane
  for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(0.22, 0.22, 11, 10), M.copper, s * 9.2, -8.2, -53, Math.PI / 2); add(new THREE.CylinderGeometry(0.22, 0.22, 11, 10), M.blue, s * 9.6, -7.6, -53, Math.PI / 2); }
  { // work pod (port side), clamped to a berthing ring
    const pod = new THREE.Group(); pod.position.set(-R - 2.2, -2.5, -44); g.add(pod);
    const pa = shipAdder(pod);
    pa(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 20), M.grey, 0.9, 0, 0, 0, 0, Math.PI / 2);
    pa(new THREE.SphereGeometry(1.6, 24, 16), M.white, -0.9, 0, 0);
    pa(new THREE.CircleGeometry(0.75, 20), M.glassD, -2.35, 0.3, 0, 0, -Math.PI / 2);
    for (const s of [-1, 1]) { pa(new THREE.CylinderGeometry(0.08, 0.06, 1.6, 8), M.grey, -1.6, -0.7, s * 0.9, 0, 0, 0.7); pa(new THREE.BoxGeometry(0.3, 0.3, 0.3), M.dark, -2.2, -1.3, s * 0.9); }
    pa(new THREE.BoxGeometry(0.6, 0.6, 0.6), M.gold, -0.9, 1.6, 0);
  }
  { // folded crane boom, dorsal port quarter of the cargo module
    const base = new THREE.Vector3(-6.4, 10.8, -38.6);
    add(new THREE.CylinderGeometry(0.6, 0.7, 0.8, 16), M.grey, base.x, base.y, base.z, 0, 0, 0.5);
    g.add(struts([[base.x, base.y + 0.3, base.z, base.x + 1.5, base.y + 1.6, base.z - 9, 0.38], [base.x + 1.5, base.y + 1.6, base.z - 9, base.x + 0.8, base.y + 1.2, base.z - 2, 0.3]], M.white));
  }
  // starboard airlock: a short tunnel to the EVA hatch, with rails, floodlights and markings
  {
    const A = SL.airlock;
    const tube = add(new THREE.CylinderGeometry(A.r, A.r, A.x1 - A.x0, 32), M.mliS, (A.x0 + A.x1) / 2, 0, A.z, 0, 0, Math.PI / 2); void tube;
    add(new THREE.TorusGeometry(A.r + 0.08, 0.18, 8, 32), M.grey, A.x1, 0, A.z, 0, Math.PI / 2);
    add(new THREE.TorusGeometry(A.r + 0.08, 0.14, 8, 32), M.grey, A.x0 + 0.6, 0, A.z, 0, Math.PI / 2);
    const lid = add(new THREE.CylinderGeometry(A.r - 0.25, A.r - 0.25, 0.18, 32), M.white, A.x1 + 0.06, 0, A.z, 0, 0, Math.PI / 2); void lid;
    add(new THREE.TorusGeometry(0.5, 0.05, 6, 20), M.grey, A.x1 + 0.17, 0, A.z, 0, Math.PI / 2);
    add(new THREE.TorusGeometry(A.r - 0.05, 0.06, 6, 32), M.hazard, A.x1 + 0.12, 0, A.z, 0, Math.PI / 2);
    for (const [dy, dz] of [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) add(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 6), M.rail, A.x1 + 0.25, dy * 1.05, A.z + dz * 1.05, dz ? 0 : Math.PI / 2, 0, dz ? 0 : 0);
    for (const s of [-1, 1]) { const f = add(new THREE.BoxGeometry(0.3, 0.25, 0.4), M.dark, A.x1 - 0.4, 2.45, A.z + s * 1.3); void f; add(new THREE.PlaneGeometry(0.22, 0.16), emis(0xfff4d0, 1.2), A.x1 - 0.2, 2.45, A.z + s * 1.3, 0, Math.PI / 2).userData.keep = true; }
    const hl = textSprite('EVA HATCH · AIRLOCK → CARGO DECK', { width: 2.4, size: 28, color: '#ffe0a0' }); hl.position.set(A.x1 + 0.6, 3.3, A.z); g.add(hl);
    const tl = textSprite(`TETHER ${EXT.tether} m · ANY THRUST REELS YOU IN`, { width: 2.6, size: 26, color: '#ffd080' }); tl.position.set(A.x1 + 0.6, -3.0, A.z); g.add(tl);
  }

  // spine truss with diagonal bracing, utility trays and a crew translation path (handrails + foot restraints)
  {
    const tw = SL.tw, z0 = SL.truss[0], z1 = SL.truss[1], bay = 4;
    const S = [];
    const C = [[-tw, -tw], [tw, -tw], [tw, tw], [-tw, tw]];
    for (const [x, y] of C) S.push([x, y, z0, x, y, z1, 0.36]);
    for (let z = z0; z <= z1; z += bay) {
      for (let i = 0; i < 4; i++) { const a = C[i], b = C[(i + 1) % 4]; S.push([a[0], a[1], z, b[0], b[1], z, 0.22]); }
      if (z + bay <= z1) for (let i = 0; i < 4; i++) { const a = C[i], b = C[(i + 1) % 4]; const f = Math.round((z - z0) / bay) % 2; S.push(f ? [a[0], a[1], z, b[0], b[1], z + bay, 0.14] : [b[0], b[1], z, a[0], a[1], z + bay, 0.14]); }
    }
    g.add(struts(S, M.truss));
    add(new THREE.BoxGeometry(0.7, 0.32, z1 - z0), M.goldL, -tw + 0.5, -tw + 0.4, (z0 + z1) / 2);
    add(new THREE.BoxGeometry(0.7, 0.32, z1 - z0), M.dark, tw - 0.5, -tw + 0.4, (z0 + z1) / 2);
    add(new THREE.BoxGeometry(1.6, 0.1, z1 - z0), M.grate, 0, tw + 0.1, (z0 + z1) / 2);
    for (const x of [-0.95, 0.95]) add(new THREE.CylinderGeometry(0.035, 0.035, z1 - z0, 6), M.rail, x, tw + 0.85, (z0 + z1) / 2, Math.PI / 2);
    for (let z = z0 + 2; z < z1; z += 4) for (const x of [-0.95, 0.95]) add(new THREE.BoxGeometry(0.05, 0.75, 0.05), M.grey, x, tw + 0.48, z);
    for (const c of [[0.3, 0.3], [0.5, -0.4], [-0.2, 0.1]]) add(new THREE.CylinderGeometry(0.12, 0.12, z1 - z0, 8), [M.copper, M.blue, M.dark][Math.abs(Math.round(c[0] * 10)) % 3], c[0], c[1], (z0 + z1) / 2, Math.PI / 2);
  }
  // propellant: six spherical D-He3 / deuterium tanks, four long reaction-mass tanks in gold foil
  for (const [x, y] of [[-6.9, 3.9], [6.9, 3.9], [-6.9, -3.9], [6.9, -3.9], [0, 7.9], [0, -7.9]]) {
    add(new THREE.SphereGeometry(3.1, 32, 20), M.mliS, x, y, -29);
    add(new THREE.TorusGeometry(3.12, 0.1, 6, 32), M.grey, x, y, -29);
    g.add(struts([[x * 0.45, y * 0.45, -31.5, x * 0.8, y * 0.8, -29, 0.18], [x * 0.45, y * 0.45, -26.5, x * 0.8, y * 0.8, -29, 0.18]], M.truss));
  }
  for (const [x, y] of [[-6.6, 0], [6.6, 0], [0, 6.6], [0, -6.6]]) {
    { const t = cylZ(2.8, 6.8, 21.2, M.goldL, 40, true); t.position.set(x, y, 14); g.add(t); }
    for (const [zz, rot] of [[6.8, -Math.PI / 2], [21.2, Math.PI / 2]]) { const d = add(new THREE.SphereGeometry(2.8, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.mliS, x, y, zz, rot); d.scale.set(1, 0.42, 1); }
    for (const zz of [10, 14, 18]) add(new THREE.TorusGeometry(2.83, 0.1, 6, 32), M.grey, x, y, zz);
  }
  // drive bus, shadow shield and magnetic nozzle
  g.add(cylZ(SL.busR, SL.bus[0], SL.bus[1], M.mli, 48));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; add(new THREE.CylinderGeometry(0.16, 0.16, SL.bus[1] - SL.bus[0], 8), i % 3 ? M.copper : M.blue, Math.cos(a) * (SL.busR + 0.25), Math.sin(a) * (SL.busR + 0.25), (SL.bus[0] + SL.bus[1]) / 2, Math.PI / 2); }
  add(new THREE.BoxGeometry(3.2, 2.0, 4.0), M.grey, 0, SL.busR + 0.6, 28); // pellet injector housing
  const shield = latheZ([[0.1, SL.shield[0] - 0.6], [SL.shieldR * 0.6, SL.shield[0] - 0.3], [SL.shieldR, SL.shield[0]], [SL.shieldR, SL.shield[1]], [0.1, SL.shield[1]]], M.shield, 64); g.add(shield);
  for (let i = 0; i < 3; i++) { const t = i / 2, z = SL.nozzle[0] + 1 + t * (SL.nozzle[1] - SL.nozzle[0] - 2), r = SL.nozR0 + (SL.nozR1 - SL.nozR0) * Math.pow(t, 0.8); add(new THREE.TorusGeometry(r, 0.42 - t * 0.1, 12, 64), M.copper, 0, 0, z); add(new THREE.TorusGeometry(r + 0.5, 0.2, 8, 64), M.grey, 0, 0, z); }
  { const S = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; S.push([Math.cos(a) * SL.nozR0, Math.sin(a) * SL.nozR0, SL.nozzle[0], Math.cos(a) * (SL.nozR1 + 0.5), Math.sin(a) * (SL.nozR1 + 0.5), SL.nozzle[1] - 1, 0.24]); } g.add(struts(S, M.tungsten)); }
  g.add(cylZ(1.4, SL.nozzle[0] - 0.5, SL.nozzle[0] + 2.4, M.tungsten, 32));
  const chamber = add(new THREE.SphereGeometry(1.2, 16, 12), emis(0x9a7cff, 0.6), 0, 0, SL.nozzle[0] + 2.2); chamber.userData.keep = true;
  const plume = new THREE.Mesh(new THREE.ConeGeometry(10, 170, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xc8b0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  plume.rotation.x = -Math.PI / 2; plume.position.set(0, 0, SL.nozzle[1] + 83); plume.visible = false; g.add(plume);
  const core = new THREE.Mesh(new THREE.ConeGeometry(2.5, 120, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); core.rotation.x = -Math.PI / 2; core.position.set(0, 0, SL.nozzle[0] + 62); plume.userData.core = core; core.visible = false; g.add(core);
  g.userData.plume = plume; g.userData.chamber = chamber;

  // ventral spinal railgun: twin rails under the modules from the capacitor bank to a muzzle beside the bow port
  {
    const z0 = -98, z1 = -47, y = -13.3, len = z1 - z0;
    for (const x of [-0.55, 0.55]) add(new THREE.BoxGeometry(0.42, 1.2, len), M.steel, x, y, (z0 + z1) / 2);
    add(new THREE.BoxGeometry(1.6, 0.25, len), M.dark, 0, y + 0.72, (z0 + z1) / 2);
    for (let z = z0 + 1.5; z < z1; z += 3) add(new THREE.BoxGeometry(2.0, 1.7, 0.35), M.blue, 0, y, z);
    for (let z = z0 + 6; z < z1; z += 9) add(new THREE.BoxGeometry(0.4, 1.8, 0.6), M.grey, 0, -R + 0.2 - 0.4, z);
    add(new THREE.BoxGeometry(2.3, 2.2, 1.2), M.dark, 0, y, z0 - 0.4);
    const muz = add(new THREE.BoxGeometry(0.6, 0.6, 0.2), emis(0x66aaff, 0.6), 0, y, z0 - 1.05); muz.userData.keep = true; g.userData.railMuzzle = muz;
  }

  // navigation lights: red port, green starboard, white strobes on the ring and drive
  const navs = [];
  for (const [p, c] of [[[-R - 0.3, 0, -88], 0xff2020], [[R + 0.3, 0, -88], 0x20ff40], [[-SL.rad.x1, 0.4, SL.rad.z0], 0xff2020], [[SL.rad.x1, 0.4, SL.rad.z0], 0x20ff40], [[0, SL.shieldR, SL.shield[0]], 0xffffff], [[0, R + 0.3, -60], 0xffffff]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), emis(c, 1.4)); l.position.set(...p); l.userData.blink = c === 0xffffff; l.userData.keep = true; g.add(l); navs.push(l);
  }
  // external camera housings
  for (const c of EXT_CAMS) { const cam = new THREE.Group(); cam.position.set(...c.pos); g.add(cam); const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.5), M.white); cam.add(b); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12), M.glassD); l.rotation.x = Math.PI / 2; l.position.z = -0.3; cam.add(l); cam.lookAt(...c.look); }

  // external components
  for (const id of COMP_IDS) {
    const c = COMPS[id];
    if (!c.ext) continue;
    const built = buildExtComp(c.mesh);
    const n = new THREE.Vector3(...extNormal(id));
    built.group.position.set(c.ex, c.ey, c.ez);
    built.group.quaternion.setFromUnitVectors(Y, n);
    if (id === 'radA' || id === 'radB') { // the wing deploys outboard along the comp's +y; the beam root runs fore-aft
      built.group.quaternion.setFromUnitVectors(Y, n);
    }
    built.group.userData.keep = true;
    g.add(built.group);
    const label = textSprite(c.name, { width: Math.min(2.2, 0.07 * c.name.length + 0.3), size: 30 });
    label.position.copy(built.group.position).addScaledVector(n, built.height + 1.0);
    g.add(label);
    if (compsOut) compsOut[id] = { ...built, label };
  }
  g.userData.navs = navs;
  bakeStatic(g);
  return g;
}
