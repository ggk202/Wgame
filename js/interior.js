// Interior architecture: the five pressurised deck drums and the centrifuge ring.
// Decks are built for both thrust gravity (floors face the drive, so you walk on them under thrust) and
// zero-g (handrails at waist and head height, ceiling grab bars, an open trunk you can float through).
import * as THREE from 'three';
import { DECKS, COMPS, COMP_IDS, LOCKERS, LIFT_A, SHELTER, DECK_H, ROOM_R, ROOM_H, SHAFT_R, RAIL_H, AIRLOCK, RING, EXT_DECK } from './config.js';
import { polar } from './util.js';
import { BUNKS } from './crew.js';
import { PAL, mat, metal, emis, texMat, mliTex, rackTex, floorTex, grateTex, textSprite, planeLabel, buildComp, buildFire } from './models.js';

// ---------------- textures ----------------
const ITEX = {};
function ctex(key, w, h, draw, rep = [1, 1]) {
  const k = key + rep.join('x');
  if (ITEX[k]) return ITEX[k];
  let base = ITEX[key];
  if (!base) { base = ITEX[key] = document.createElement('canvas'); base.width = w; base.height = h; draw(base.getContext('2d'), w, h); }
  const t = new THREE.CanvasTexture(base); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8;
  return (ITEX[k] = t);
}
const r01 = () => Math.random();
// diamond tread plate floor panels with countersunk fasteners and wear
export const treadTex = (rep) => ctex('tread', 512, 512, (g, w, h) => {
  g.fillStyle = '#80888f'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) {
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(x + 2, y + 5, 10, 3);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 3, y + 8, 10, 2);
  }
  g.strokeStyle = '#4d545b'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  g.fillStyle = '#3c4248'; for (const x of [14, w / 2 - 14, w / 2 + 14, w - 14]) for (const y of [14, h / 2 - 14, h / 2 + 14, h - 14]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(30,30,30,${0.03 + r01() * 0.06})`; g.beginPath(); g.ellipse(r01() * w, r01() * h, 10 + r01() * 50, 4 + r01() * 16, r01() * 3, 0, 7); g.fill(); }
}, rep);
// acoustic ceiling panels (perforated, off-white) with access hatches
export const ceilTex = (rep) => ctex('ceil', 256, 256, (g, w, h) => {
  g.fillStyle = '#d9d6cd'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 6; y < h; y += 8) for (let x = 6; x < w; x += 8) g.fillRect(x, y, 2, 2);
  g.strokeStyle = '#a7a39a'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
  g.fillStyle = '#bdb9af'; g.fillRect(96, 96, 64, 64); g.strokeStyle = '#8e8a81'; g.lineWidth = 2; g.strokeRect(96, 96, 64, 64);
}, rep);
// black-and-yellow hazard striping
export const hazardTex = (rep) => ctex('hazard', 128, 32, (g, w, h) => {
  g.fillStyle = '#e8b822'; g.fillRect(0, 0, w, h); g.fillStyle = '#16181b';
  for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill(); }
}, rep);
// wall lining between racks: soft-goods closeouts and placards
export const closeoutTex = (rep) => ctex('closeout', 256, 256, (g, w, h) => {
  g.fillStyle = '#e4e0d4'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 64) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, y + 60, w, 4); }
  g.strokeStyle = 'rgba(80,76,68,0.3)'; g.setLineDash([3, 3]); for (let x = 32; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  g.setLineDash([]); g.fillStyle = '#c4bfb2'; for (let i = 0; i < 6; i++) g.fillRect(r01() * w, r01() * h, 14, 8);
}, rep);

// ---------------- static batching: merge non-interactive meshes by material ----------------
export function bakeStatic(root) {
  if (globalThis.__noBake) return root; // debug: keep every part separate (used by the floating-parts audit)
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(), dead = [];
  const kept = (o) => { for (let p = o; p && p !== root; p = p.parent) if (p.userData.keep) return true; return false; };
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || kept(o)) return;
    const m = o.material;
    if (Array.isArray(m) || m.transparent || m.isShaderMaterial) return;
    let geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (geo.index) geo = geo.toNonIndexed();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((geo.attributes.position.count) * 2), 2));
    if (!buckets.has(m)) buckets.set(m, []);
    buckets.get(m).push(geo); dead.push(o);
  });
  for (const o of dead) o.parent.remove(o);
  for (const [m, list] of buckets) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let i = 0;
    for (const g of list) { pos.set(g.attributes.position.array, i * 3); nor.set(g.attributes.normal.array, i * 3); uv.set(g.attributes.uv.array, i * 2); i += g.attributes.position.count; g.dispose(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.baked = true;
    root.add(mesh);
  }
}

// ---------------- shared materials ----------------
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    floor: texMat(treadTex([1, 1]), { roughness: 0.55, metalness: 0.55 }),
    sub: mat(0x2b3036, { roughness: 0.9 }),
    ceil: texMat(ceilTex([1, 1]), { roughness: 0.9 }),
    rack: texMat(rackTex([1, 1]), { roughness: 0.8 }),
    close: texMat(closeoutTex([1, 1]), { roughness: 0.95 }),
    frame: mat(0xcfcbbf, { roughness: 0.6, metalness: 0.15 }),
    rib: metal(0xa9adb2, { roughness: 0.45 }),
    dark: mat(PAL.dark, { roughness: 0.7 }),
    black: mat(PAL.black, { roughness: 0.6 }),
    steel: metal(0x8a9198, { roughness: 0.35 }),
    rail: metal(0xd8ae46, { roughness: 0.35, metalness: 0.6 }),
    hazard: texMat(hazardTex([24, 1]), { roughness: 0.6 }),
    blue: mat(PAL.blue, { roughness: 0.6 }),
    duct: mat(0xc9c5bb, { roughness: 0.75 }),
    bag: texMat(mliTex([1, 1], '#d8cdb2'), { roughness: 0.95 }),
    strap: mat(PAL.blue),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fbbd8, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0, depthWrite: false }),
    mli: texMat(mliTex([3, 2], '#e4e1d8')),
    cable: mat(0x3a3f45, { roughness: 0.8 }),
    pipeR: mat(0xb03a2e, { roughness: 0.5 }), pipeB: mat(0x2f5f9e, { roughness: 0.5 }), pipeG: mat(0x3d8a55, { roughness: 0.5 }),
  };
  return MATS;
}

// ---------------- deck builder ----------------
// returns { group, comps } where comps[id] = { group, screen, glow, light, label, fire, ... }
export function buildDeckInterior(d) {
  const M = mats();
  const g = new THREE.Group();
  g.position.y = d.id * DECK_H;
  const accent = d.color, accHex = '#' + accent.toString(16).padStart(6, '0');
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o; };
  const R = ROOM_R, H = ROOM_H, SEG = 16;
  const accMat = emis(accent, 0.7);

  // floor: tread-plate sectors around a hazard-striped trunk collar, a recessed light ring at the walkway edge
  const floor = add(new THREE.RingGeometry(SHAFT_R + 0.42, R + 0.3, 64, 6), M.floor, 0, 0, 0, -Math.PI / 2);
  { const uv = floor.geometry.attributes.uv, p = floor.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 2.2, p.getY(i) / 2.2); }
  add(new THREE.RingGeometry(SHAFT_R, SHAFT_R + 0.42, 48), M.hazard, 0, 0.004, 0, -Math.PI / 2);
  add(new THREE.RingGeometry(R - 1.46, R - 1.38, 96), accMat, 0, 0.006, 0, -Math.PI / 2);
  for (let i = 0; i < 8; i++) { const a = i * 45, p = polar(a, (R + SHAFT_R) / 2 + 0.2); add(new THREE.BoxGeometry(0.06, 0.012, R - SHAFT_R - 0.6), M.dark, p.x, 0.006, p.z, 0, -(a * Math.PI) / 180); }
  // kick plate at the wall base, in the deck colour
  add(new THREE.CylinderGeometry(R - 0.32, R - 0.32, 0.16, 96, 1, true), mat(accent, { roughness: 0.5, side: THREE.BackSide }), 0, 0.08, 0);

  // ceiling: perforated panels, eight radial beams, a ring duct and long LED panels (the lamps are tinted by alerts)
  const ceil = add(new THREE.RingGeometry(SHAFT_R + 0.15, R + 0.3, 64, 4), M.ceil, 0, H, 0, Math.PI / 2);
  { const uv = ceil.geometry.attributes.uv, p = ceil.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 1.6, p.getY(i) / 1.6); }
  for (let i = 0; i < 8; i++) {
    const a = i * 45 + 22.5, p = polar(a, (R + SHAFT_R) / 2), rot = -(a * Math.PI) / 180, len = R - SHAFT_R - 0.2;
    add(new THREE.BoxGeometry(0.28, 0.22, len), M.rib, p.x, H - 0.11, p.z, 0, rot);
    // ceiling grab bars along each beam for zero-g
    for (const t of [0.3, 0.62]) { const q = polar(a, SHAFT_R + len * t + 0.4); add(new THREE.BoxGeometry(0.05, 0.05, 1.0), M.rail, q.x, H - 0.33, q.z, 0, rot); for (const s of [-0.45, 0.45]) { const q2 = polar(a, SHAFT_R + len * t + 0.4 + s); add(new THREE.BoxGeometry(0.04, 0.12, 0.04), M.rail, q2.x, H - 0.27, q2.z, 0, rot); } }
  }
  add(new THREE.TorusGeometry(R - 0.85, 0.2, 10, 96), M.duct, 0, H - 0.34, 0, Math.PI / 2);
  add(new THREE.TorusGeometry(R - 0.42, 0.07, 6, 96), M.cable, 0, H - 0.2, 0, Math.PI / 2);
  add(new THREE.TorusGeometry(R - 0.56, 0.045, 6, 96), M.pipeB, 0, H - 0.18, 0, Math.PI / 2);
  add(new THREE.TorusGeometry(R - 0.66, 0.045, 6, 96), M.pipeR, 0, H - 0.16, 0, Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const a = i * 45, p = polar(a, 6.3), rot = -(a * Math.PI) / 180;
    add(new THREE.BoxGeometry(0.55, 0.06, 2.6), M.frame, p.x, H - 0.03, p.z, 0, rot);
    const lamp = add(new THREE.PlaneGeometry(0.42, 2.45), emis(0xf6f4ec, 0.95), p.x, H - 0.065, p.z, Math.PI / 2, 0, (a * Math.PI) / 180);
    lamp.userData.lamp = true; lamp.userData.keep = true;
  }
  // bridge: skylights in the ceiling (the nose is "up" under thrust) around the trunk
  if (d.id === 4) for (let i = 0; i < 8; i += 2) {
    const a = i * 45, p = polar(a, 3.4), rot = -(a * Math.PI) / 180;
    const win = add(new THREE.PlaneGeometry(1.3, 1.6), M.glass, p.x, H + 0.02, p.z, Math.PI / 2, 0, (a * Math.PI) / 180); win.userData.keep = true;
    add(new THREE.BoxGeometry(1.5, 0.12, 0.1), M.frame, polar(a, 2.6).x, H - 0.02, polar(a, 2.6).z, 0, rot); add(new THREE.BoxGeometry(1.5, 0.12, 0.1), M.frame, polar(a, 4.2).x, H - 0.02, polar(a, 4.2).z, 0, rot);
  }

  // walls: eight structural ribs, sixteen rack bays between them, two handrail lines (waist and head height)
  const segW = 2 * R * Math.sin(Math.PI / SEG) + 0.04, apo = R * Math.cos(Math.PI / SEG);
  const busy = [...COMP_IDS.filter((id) => !COMPS[id].ext && COMPS[id].deck === d.id).map((id) => COMPS[id].a), ...LOCKERS.filter((l) => l.deck === d.id).map((l) => l.a), ...(d.id === AIRLOCK.deck ? [AIRLOCK.a] : []), ...(d.id === SHELTER.deck ? [SHELTER.a] : [])];
  const near = (a) => busy.some((b) => Math.abs(((a - b + 540) % 360) - 180) < 24);
  for (let i = 0; i < SEG; i++) {
    const aDeg = (i + 0.5) * (360 / SEG);
    const p = polar(aDeg, apo);
    const w = new THREE.Group(); w.position.set(p.x, 0, p.z); w.rotation.y = -(aDeg * Math.PI) / 180; g.add(w);
    const isWindow = d.id === 4 && (aDeg < 62 || aDeg > 298);
    const isPort = d.id === 3 && (aDeg > 255 && aDeg < 290);
    if (isWindow || isPort) {
      add(new THREE.BoxGeometry(segW, 0.95, 0.3), M.frame, 0, 0.475, 0, 0, 0, 0, w);
      add(new THREE.BoxGeometry(segW, 0.75, 0.3), M.frame, 0, H - 0.375, 0, 0, 0, 0, w);
      const gl = add(new THREE.PlaneGeometry(segW - 0.2, H - 1.7), M.glass, 0, 0.95 + (H - 1.7) / 2, -0.02, 0, 0, 0, w); gl.userData.keep = true;
      add(new THREE.BoxGeometry(0.14, H - 1.7, 0.26), M.frame, -segW / 2 + 0.07, 0.95 + (H - 1.7) / 2, 0, 0, 0, 0, w);
      add(new THREE.BoxGeometry(segW - 0.1, 0.06, 0.34), M.dark, 0, 0.97, 0.06, 0, 0, 0, w); // sill
    } else {
      // rack face set into a closeout frame, with a soffit duct above and a kick panel below
      add(new THREE.BoxGeometry(segW, H, 0.2), M.close, 0, H / 2, -0.12, 0, 0, 0, w);
      add(new THREE.BoxGeometry(segW - 0.45, 2.25, 0.16), M.rack, 0, 1.33, 0.02, 0, 0, 0, w);
      add(new THREE.BoxGeometry(segW - 0.3, 0.32, 0.36), M.duct, 0, H - 0.62, 0.08, 0, 0, 0, w);
      add(new THREE.BoxGeometry(segW - 0.45, 0.04, 0.02), accMat, 0, 2.48, 0.11, 0, 0, 0, w); // status strip
      if (!near(aDeg) && (i + d.id) % 3 !== 1) for (let k = 0; k < 2 + (i % 2); k++) { // stowage bags strapped over the racks
        add(new THREE.BoxGeometry(0.72, 0.5, 0.42), M.bag, -0.85 + k * 0.85, 0.3 + (k === 2 ? 0.52 : 0), 0.3, 0, (k - 1) * 0.05, 0, w);
        add(new THREE.BoxGeometry(0.74, 0.05, 0.03), M.strap, -0.85 + k * 0.85, 0.38 + (k === 2 ? 0.52 : 0), 0.52, 0, 0, 0, w);
      }
    }
    for (const y of [1.1, 2.62]) { // handrails
      add(new THREE.CylinderGeometry(0.028, 0.028, segW * 0.82, 8), M.rail, 0, y, 0.3, 0, 0, Math.PI / 2, w);
      for (const x of [-segW * 0.38, segW * 0.38]) add(new THREE.BoxGeometry(0.05, 0.05, 0.18), M.rail, x, y, 0.21, 0, 0, 0, w);
    }
    // structural rib at every other seam (eight ribs)
    const rp = polar(i * (360 / SEG), R - 0.1);
    if (i % 2 === 0) { add(new THREE.BoxGeometry(0.36, H, 0.48), M.rib, rp.x, H / 2, rp.z, 0, -(i * 2 * Math.PI) / SEG); add(new THREE.BoxGeometry(0.4, 0.1, 0.62), M.dark, rp.x * 0.985, 0.05, rp.z * 0.985, 0, -(i * 2 * Math.PI) / SEG); }
    else add(new THREE.BoxGeometry(0.16, H, 0.34), M.frame, rp.x, H / 2, rp.z, 0, -(i * 2 * Math.PI) / SEG);
    // foot restraint loops on the floor in front of each bay (for working in zero-g)
    const fp = polar(aDeg, R - 1.0);
    if (!near(aDeg)) add(new THREE.TorusGeometry(0.16, 0.025, 6, 12, Math.PI), M.blue, fp.x, 0, fp.z, 0, -(aDeg * Math.PI) / 180);
  }

  // the trunk: an open 3 m shaft through every deck — float straight through in zero-g, ride the platform lift under thrust
  const trunk = new THREE.Group(); g.add(trunk);
  add(new THREE.TorusGeometry(SHAFT_R + 0.02, 0.09, 8, 48), M.steel, 0, 0.03, 0, Math.PI / 2, 0, 0, trunk);
  add(new THREE.TorusGeometry(SHAFT_R + 0.02, 0.09, 8, 48), M.steel, 0, H - 0.03, 0, Math.PI / 2, 0, 0, trunk);
  for (const y of [RAIL_H, 0.58]) add(new THREE.TorusGeometry(SHAFT_R + 0.14, y > 1 ? 0.04 : 0.03, 8, 48), y > 1 ? M.rail : M.steel, 0, y, 0, Math.PI / 2, 0, 0, trunk);
  for (let i = 0; i < 8; i++) { const p = polar(i * 45 + 22.5, SHAFT_R + 0.14); add(new THREE.CylinderGeometry(0.035, 0.035, RAIL_H, 8), M.steel, p.x, RAIL_H / 2, p.z, 0, 0, 0, trunk); }
  // the tunnel up to the next deck (and down from it), lined with MLI, with a light ring
  if (d.id < 4 || true) {
    const top = d.id === 4 ? 2.8 : DECK_H - H;
    const tun = add(new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, top, 32, 1, true), new THREE.MeshStandardMaterial({ map: mliTex([4, 1], '#e4e1d8'), side: THREE.BackSide, roughness: 0.9 }), 0, H + top / 2, 0, 0, 0, 0, trunk);
    add(new THREE.TorusGeometry(SHAFT_R - 0.05, 0.05, 6, 32), emis(0xfff3dc, 0.9), 0, H + top * 0.5, 0, Math.PI / 2, 0, 0, trunk).userData.keep = true;
    for (const y of [H + 0.2, H + top - 0.2]) add(new THREE.TorusGeometry(SHAFT_R - 0.04, 0.1, 8, 32), M.frame, 0, y, 0, Math.PI / 2, 0, 0, trunk);
    if (d.id === 4) { // bow docking hatch, sealed
      add(new THREE.CircleGeometry(SHAFT_R, 32), M.frame, 0, H + top, 0, Math.PI / 2, 0, 0, trunk);
      add(new THREE.TorusGeometry(0.42, 0.05, 6, 20), M.rail, 0, H + top - 0.06, 0, Math.PI / 2, 0, 0, trunk);
      const lab = textSprite('BOW DOCKING HATCH — sealed', { width: 1.5, size: 26 }); lab.position.set(0, H + top - 0.45, 0); trunk.add(lab);
    }
  }
  if (d.id === 0) { add(new THREE.CircleGeometry(SHAFT_R, 32), texMat(grateTex([3, 3])), 0, 0.01, 0, -Math.PI / 2, 0, 0, trunk); }
  // ladder (the far side from the lift gate) and the lift platform's guide rails
  { const la = LIFT_A + 180, lp = polar(la, SHAFT_R - 0.18), lr = -(la * Math.PI) / 180, y0 = d.id === 0 ? 0 : -(DECK_H - H), y1 = d.id === 4 ? H + 2.6 : H + (DECK_H - H);
    const ladder = new THREE.Group(); ladder.position.set(lp.x, 0, lp.z); ladder.rotation.y = lr; trunk.add(ladder);
    for (const x of [-0.24, 0.24]) add(new THREE.BoxGeometry(0.05, y1 - y0, 0.07), M.steel, x, (y0 + y1) / 2, 0, 0, 0, 0, ladder);
    for (let y = y0 + 0.15; y < y1; y += 0.32) add(new THREE.CylinderGeometry(0.018, 0.018, 0.48, 6), M.rail, 0, y, 0, 0, 0, Math.PI / 2, ladder);
    const gp = polar(LIFT_A, SHAFT_R - 0.1);
    for (const off of [-0.55, 0.55]) { const q = polar(LIFT_A + (off * 180) / Math.PI / SHAFT_R, SHAFT_R - 0.1); add(new THREE.BoxGeometry(0.09, y1 - y0, 0.09), M.dark, q.x, (y0 + y1) / 2, q.z, 0, 0, 0, trunk); }
    // lift gate in the railing and its call panel
    const gp2 = polar(LIFT_A, SHAFT_R + 0.16);
    add(new THREE.BoxGeometry(1.0, 0.08, 0.06), M.hazard, gp2.x, RAIL_H - 0.02, gp2.z, 0, -(LIFT_A * Math.PI) / 180, 0, trunk);
    const cp = polar(LIFT_A + 28, SHAFT_R + 0.2);
    add(new THREE.BoxGeometry(0.28, 0.4, 0.08), M.dark, cp.x, 1.25, cp.z, 0, -((LIFT_A + 28) * Math.PI) / 180, 0, trunk);
    add(new THREE.PlaneGeometry(0.16, 0.12), accMat, cp.x * 1.04, 1.32, cp.z * 1.04, 0, Math.PI - ((LIFT_A + 28) * Math.PI) / 180, 0, trunk).userData.keep = true;
    void gp;
  }
  { // the ladder gap in the railing: hazard bar and a sign
    const la = LIFT_A + 180, lp = polar(la, SHAFT_R + 0.16);
    add(new THREE.BoxGeometry(0.9, 0.08, 0.06), M.hazard, lp.x, RAIL_H - 0.02, lp.z, 0, -(la * Math.PI) / 180, 0, trunk);
    const ls = planeLabel('LADDER ▲▼', 1.0, 0.2, { size: 44, accent: accHex }); const sp = polar(la, SHAFT_R + 0.2); ls.position.set(sp.x, RAIL_H + 0.22, sp.z); ls.rotation.y = Math.PI - (la * Math.PI) / 180; ls.userData.keep = true; g.add(ls);
  }
  // deck signage on the trunk: what is up (nose) and down (drive) from here
  const sign = planeLabel(d.full, 2.6, 0.38, { size: 54, accent: accHex });
  const sp = polar(LIFT_A, SHAFT_R + 0.24); sign.position.set(sp.x, 1.62, sp.z); sign.rotation.y = Math.PI - (LIFT_A * Math.PI) / 180; sign.userData.keep = true; g.add(sign);
  const up = textSprite(`▲ ${d.id < 4 ? DECKS[d.id + 1].name.toUpperCase() + ' · NOSE' : 'BOW HATCH · NOSE'}   ▼ ${d.id > 0 ? DECKS[d.id - 1].name.toUpperCase() + ' · DRIVE' : 'SHADOW SHIELD · DRIVE'}`, { width: 1.9, size: 24, color: '#ffe6b0' });
  up.position.set(sp.x * 1.05, 2.5, sp.z * 1.05); g.add(up);

  // emergency locker: red stowage with PFE extinguishers, a breathing apparatus and a vacuum suit
  const lk = LOCKERS.find((l) => l.deck === d.id);
  if (lk) {
    const lkp = polar(lk.a, lk.r);
    const locker = new THREE.Group(); locker.position.set(lkp.x, 0, lkp.z); locker.rotation.y = -(lk.a * Math.PI) / 180; g.add(locker);
    add(new THREE.BoxGeometry(1.2, 2.3, 0.62), mat(0xb8342a, { roughness: 0.5 }), 0, 1.15, 0, 0, 0, 0, locker);
    add(new THREE.BoxGeometry(1.06, 2.12, 0.04), mat(0xc9443a, { roughness: 0.45 }), 0, 1.15, 0.32, 0, 0, 0, locker);
    const pl = add(new THREE.PlaneGeometry(0.8, 0.42), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 1.86, 0.345, 0, 0, 0, locker); pl.userData.keep = true;
    add(new THREE.PlaneGeometry(0.26, 0.08), emis(0xc0392b), 0, 1.86, 0.35, 0, 0, 0, locker).userData.keep = true;
    add(new THREE.PlaneGeometry(0.08, 0.26), emis(0xc0392b), 0, 1.86, 0.35, 0, 0, 0, locker).userData.keep = true;
    for (let i = 0; i < 2; i++) { add(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 12), mat(0xd8d8d0), -0.32 + i * 0.64, 0.62, 0.44, 0, 0, 0, locker); add(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 6), M.black, -0.32 + i * 0.64, 0.99, 0.44, 0, 0, 0, locker); }
    add(new THREE.BoxGeometry(0.5, 0.9, 0.16), mat(0xf2f1ec), 0, 1.1, 0.42, 0, 0, 0, locker);
    const ll = textSprite('EMERGENCY LOCKER · SUITS', { width: 1.6, size: 26, color: '#ffd0d0' }); ll.position.set(lkp.x * 0.96, 2.62, lkp.z * 0.96); g.add(ll);
  }

  // storm shelter: crew sleep stations walled with water bags
  if (d.id === SHELTER.deck) {
    const c = polar(SHELTER.a, SHELTER.r);
    const sh = add(new THREE.CylinderGeometry(SHELTER.rad, SHELTER.rad, H, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x4a7ab8, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }), c.x, H / 2, c.z); sh.userData.keep = true;
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; const fa = Math.atan2(-c.z, -c.x); if (Math.abs(((a - fa + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.55) continue; add(new THREE.BoxGeometry(0.95, 1.25, 0.36), texMat(mliTex([1, 1], '#b9cde0')), c.x + Math.cos(a) * SHELTER.rad, 0.63, c.z + Math.sin(a) * SHELTER.rad, 0, -a + Math.PI / 2); }
    add(new THREE.CircleGeometry(SHELTER.rad, 24), emis(0x2050a0, 0.45), c.x, 0.012, c.z, -Math.PI / 2).userData.keep = true;
    const sl = textSprite('STORM SHELTER (water-walled)', { width: 2.2, size: 26, color: '#bcd8ff' }); sl.position.set(c.x, 2.9, c.z); g.add(sl);
  }
  // cargo deck: bag stacks, and the inner airlock hatch to starboard
  if (d.id === AIRLOCK.deck) {
    for (let i = 0; i < 6; i++) { const cp = polar(150 - i * 7, 9.4 - (i % 2) * 0.9); if (Math.abs(150 - i * 7 - AIRLOCK.a) < 18) continue; add(new THREE.BoxGeometry(0.9, 0.7, 0.7), M.bag, cp.x, 0.35 + (i > 3 ? 0.7 : 0), cp.z, 0, i); }
    const ap = polar(AIRLOCK.a, R - 0.3), ar = -(AIRLOCK.a * Math.PI) / 180;
    add(new THREE.BoxGeometry(2.3, 2.8, 0.34), M.frame, ap.x, 1.4, ap.z, 0, ar);
    add(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 32), mat(0xe8e6df), ap.x * 0.985, 1.3, ap.z * 0.985, Math.PI / 2, ar, 0, g).rotation.set(Math.PI / 2, 0, ar, 'YXZ');
    add(new THREE.TorusGeometry(0.88, 0.07, 8, 32), M.rail, ap.x * 0.982, 1.3, ap.z * 0.982, 0, ar);
    add(new THREE.CircleGeometry(0.2, 16), emis(0x80a0c0, 0.5), ap.x * 0.975, 1.68, ap.z * 0.975, 0, Math.PI + ar).userData.keep = true;
    const at = textSprite('AIRLOCK → EVA (starboard)', { width: 1.5, size: 28 }); at.position.set(ap.x * 0.94, 3.0, ap.z * 0.94); g.add(at);
  }

  // components
  const comps = {};
  for (const id of COMP_IDS) {
    const c = COMPS[id];
    if (c.ext || c.deck !== d.id) continue;
    const built = buildComp(c.mesh, accent);
    const p = polar(c.a, c.r);
    built.group.position.set(p.x, 0, p.z);
    built.group.rotation.y = -(c.a * Math.PI) / 180;
    built.group.userData.keep = true;
    g.add(built.group);
    const label = textSprite(c.name, { width: Math.min(1.9, 0.065 * c.name.length + 0.3), size: 30 });
    label.position.set(p.x * 0.97, Math.min(H - 0.4, Math.max(2.6, built.height + 0.45)), p.z * 0.97);
    g.add(label);
    const fire = buildFire();
    const fp2 = polar(c.a, c.r - c.fp * 0.75);
    fire.position.set(fp2.x, 0, fp2.z); fire.rotation.y = -(c.a * Math.PI) / 180; fire.userData.keep = true;
    g.add(fire);
    comps[id] = { ...built, fire, label };
  }
  bakeStatic(g);
  if (d.id === 3) { // sleep stations: walk-in cubicles with a zip-up bag clipped to the wall for zero-g
    const bagM = mat(0x3a5f8a, 0.85), padM = mat(0xd8d2c4, 0.9);
    for (const b of BUNKS.filter((x) => x.deck === 3)) {
      const st = new THREE.Group(); const p = polar(b.a, b.r); st.position.set(p.x, 0, p.z); st.rotation.y = Math.PI - (b.a * Math.PI) / 180; g.add(st);
      add(new THREE.BoxGeometry(1.15, 2.3, 0.08), M.frame, 0, 1.15, -0.45, 0, 0, 0, st);
      for (const x of [-0.56, 0.56]) add(new THREE.BoxGeometry(0.06, 2.3, 0.9), M.frame, x, 1.15, 0, 0, 0, 0, st);
      add(new THREE.BoxGeometry(1.15, 0.08, 0.9), M.frame, 0, 2.3, 0, 0, 0, 0, st);
      add(new THREE.BoxGeometry(1.0, 0.18, 0.75), padM, 0, 0.55, 0.0, 0, 0, 0, st); // fold-down cot for thrust
      add(new THREE.CapsuleGeometry(0.24, 1.2, 6, 12), bagM, 0, 1.45, -0.28, 0, 0, 0, st); // zero-g sleeping bag on the wall
      for (const y of [0.85, 2.05]) add(new THREE.BoxGeometry(0.5, 0.04, 0.04), M.rail, 0, y, -0.38, 0, 0, 0, st);
      add(new THREE.BoxGeometry(0.16, 0.06, 0.06), emis(0xfff0c8, 1.2), 0.38, 2.1, -0.36, 0, 0, 0, st).userData.keep = true;
      const lab = planeLabel(b.label.toUpperCase(), 0.9, 0.14, { size: 30 }); lab.position.set(0, 2.42, 0.47); lab.rotation.y = Math.PI; lab.userData.keep = true; st.add(lab);
    }
  }
  return { group: g, comps };
}

// ---------------- centrifuge ring interior ----------------
// Corridor coordinates (x across, y up from the floor, z along the ring) are wrapped onto the ring:
// world = centre + Rx(theta) * (x, -(R - y), 0) with theta = -z / R. "Up" always points at the hub.
export const RING_CENTER = new THREE.Vector3(0, -400, 0);
// viewports in corridor coordinates (shared with the exterior so the lit panes line up)
export const RING_WINDOWS = (() => { const C = 2 * Math.PI * RING.R; return {
  side: [0, 1, 2, 3, 4, 5].map((k) => (k / 6) * C), sideLen: 8, y0: 0.9, y1: 3.1,
  floor: [0, 1, 2, 3, 4, 5].map((k) => ((k + 0.5) / 6) * C + 4.5), floorLen: 5, floorHalfW: 1.2,
}; })();
export function ringPlace(o, x, y, z) {
  const th = -z / RING.R;
  o.position.set(x, -(RING.R - y) * Math.cos(th), -(RING.R - y) * Math.sin(th));
  o.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), th);
  return o;
}
export function buildRingInterior() {
  const M = mats();
  const g = new THREE.Group(); g.position.copy(RING_CENTER);
  const R = RING.R, W = RING.W, H = RING.H, C = 2 * Math.PI * R;
  const SEGS = 192;
  // floor (the inside of a cylinder of radius R) and ceiling, with big viewports cut into both the floor and the side walls.
  // Built as arcs: a corridor span z0..z1 is a cylinder sector starting at theta = z0/R - pi/2 (floor) and a ring sector
  // starting at -z1/R - pi/2 (side walls), which is where ringPlace() puts the same corridor coordinates.
  const floorMat = (len, wid) => new THREE.MeshStandardMaterial({ map: treadTex([Math.max(1, Math.round(len / 3.3)), Math.max(1, Math.round(wid / 3.2))]), side: THREE.BackSide, roughness: 0.55, metalness: 0.5 });
  const floorArc = (z0, z1, x0, x1) => {
    const geo = new THREE.CylinderGeometry(R, R, x1 - x0, Math.max(2, Math.ceil(z1 - z0)), 1, true, z0 / R - Math.PI / 2, (z1 - z0) / R);
    const m = new THREE.Mesh(geo, floorMat(z1 - z0, x1 - x0)); m.rotation.z = Math.PI / 2; m.position.x = (x0 + x1) / 2; g.add(m); return m;
  };
  const wallMat = new THREE.MeshStandardMaterial({ map: closeoutTex([1, 1]), roughness: 0.9, side: THREE.DoubleSide });
  const wallArc = (side, z0, z1, r0, r1) => {
    const geo = new THREE.RingGeometry(r0, r1, Math.max(2, Math.ceil((z1 - z0) / 1.0)), 1, -z1 / R - Math.PI / 2, (z1 - z0) / R);
    const m = new THREE.Mesh(geo, wallMat); m.rotation.y = Math.PI / 2; m.position.x = side * W / 2; g.add(m); return m;
  };
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fb8d0, transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
  const spans = (wins) => { // complementary spans around the circumference for a list of [z0, z1] windows
    const out = []; let z = 0; for (const [a, b] of wins) { if (a > z) out.push([z, a]); z = b; } if (z < C) out.push([z, C]); return out;
  };
  // floor: two full-length side strips and a centre strip broken by six 5 m viewports (stars wheel past beneath your feet)
  const FW = RING_WINDOWS.floor.map((zc) => [zc - RING_WINDOWS.floorLen / 2, zc + RING_WINDOWS.floorLen / 2]);
  floorArc(0, C, -W / 2, -RING_WINDOWS.floorHalfW); floorArc(0, C, RING_WINDOWS.floorHalfW, W / 2);
  for (const [z0, z1] of spans(FW)) floorArc(z0, z1, -RING_WINDOWS.floorHalfW, RING_WINDOWS.floorHalfW);
  for (const [z0, z1] of FW) {
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.01, R - 0.01, RING_WINDOWS.floorHalfW * 2, 12, 1, true, z0 / R - Math.PI / 2, (z1 - z0) / R), glass);
    gl.rotation.z = Math.PI / 2; gl.userData.keep = true; g.add(gl);
  }
  const ceil = new THREE.Mesh(new THREE.CylinderGeometry(R - H, R - H, W, SEGS, 1, true), new THREE.MeshStandardMaterial({ map: ceilTex([60, 3]), roughness: 0.9 }));
  ceil.rotation.z = Math.PI / 2; g.add(ceil);
  // side walls: solid below 0.9 m and above 3.1 m; between, 8 m-long windows between the science bays, both sides
  const SW = RING_WINDOWS.side.map((zc) => [zc - RING_WINDOWS.sideLen / 2, zc + RING_WINDOWS.sideLen / 2]);
  const yb = RING_WINDOWS.y0, yt = RING_WINDOWS.y1;
  for (const s of [-1, 1]) {
    wallArc(s, 0, C, R - yb, R); wallArc(s, 0, C, R - H, R - yt);
    for (const [z0, z1] of spans(SW)) wallArc(s, z0, z1, R - yt, R - yb);
    for (const [z0, z1] of SW) { const gl = new THREE.Mesh(new THREE.RingGeometry(R - yt, R - yb, 12, 1, -z1 / R - Math.PI / 2, (z1 - z0) / R), glass); gl.rotation.y = Math.PI / 2; gl.position.x = s * (W / 2 + 0.02); gl.userData.keep = true; g.add(gl); }
  }
  const add = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); ringPlace(o, x, y, z); parent.add(o); return o; };
  const accMat = emis(0x6be675, 0.7);
  // structure every 3 m: frames, floor seams, ceiling light panels and grab bars
  const n = Math.round(C / 3);
  for (let i = 0; i < n; i++) {
    const z = (i / n) * C;
    add(new THREE.BoxGeometry(W, 0.012, 0.08), M.dark, 0, 0.006, z);
    for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.22, H, 0.32), M.rib, s * (W / 2 - 0.1), H / 2, z); add(new THREE.BoxGeometry(0.4, 0.32, 0.4), M.duct, s * (W / 2 - 0.3), H - 0.2, z + 1.5); }
    add(new THREE.BoxGeometry(W, 0.18, 0.26), M.rib, 0, H - 0.09, z);
    const lamp = add(new THREE.PlaneGeometry(0.5, 2.2), emis(0xf6f4ec, 0.95), 0, H - 0.03, z + 1.5); lamp.rotateX(Math.PI / 2); lamp.userData.lamp = true; lamp.userData.keep = true;
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.028, 0.028, 2.4, 6), M.rail, s * (W / 2 - 0.32), 1.1, z + 1.5).rotateX(Math.PI / 2);
    add(new THREE.CylinderGeometry(0.028, 0.028, 2.2, 6), M.rail, 0.9, H - 0.35, z + 1.5).rotateX(Math.PI / 2);
  }
  // viewport frames: sills, headers and mullions on the side windows, a raised rim and a handrail round each floor viewport
  for (const [z0, z1] of SW) for (const sd of [-1, 1]) {
    const zc = (z0 + z1) / 2, x = sd * (W / 2 - 0.08);
    add(new THREE.BoxGeometry(0.22, 0.14, z1 - z0 + 0.3), M.frame, x, yb - 0.04, zc);
    add(new THREE.BoxGeometry(0.22, 0.14, z1 - z0 + 0.3), M.frame, x, yt + 0.04, zc);
    for (let k = 1; k < 4; k++) add(new THREE.BoxGeometry(0.16, yt - yb, 0.12), M.frame, x, (yb + yt) / 2, z0 + (k * (z1 - z0)) / 4);
    add(new THREE.BoxGeometry(0.34, 0.06, z1 - z0), M.dark, sd * (W / 2 - 0.2), yb + 0.02, zc);
  }
  for (const [z0, z1] of FW) {
    const zc = (z0 + z1) / 2, hw = RING_WINDOWS.floorHalfW;
    for (const sd of [-1, 1]) { add(new THREE.BoxGeometry(0.12, 0.06, z1 - z0 + 0.24), M.hazard, sd * (hw + 0.06), 0.03, zc); add(new THREE.CylinderGeometry(0.03, 0.03, z1 - z0, 8), M.rail, sd * (hw + 0.15), 0.85, zc).rotateX(Math.PI / 2); for (const zz of [z0 + 0.3, zc, z1 - 0.3]) add(new THREE.BoxGeometry(0.04, 0.85, 0.04), M.steel, sd * (hw + 0.15), 0.43, zz); }
    for (const zz of [z0 - 0.06, z1 + 0.06]) add(new THREE.BoxGeometry(hw * 2 + 0.24, 0.06, 0.12), M.hazard, 0, 0.03, zz);
    add(new THREE.BoxGeometry(hw * 2, 0.04, 0.1), M.dark, 0, 0.01, zc);
    const lab = textSprite('VIEWPORT · 4 PANES, 40 mm · DO NOT STAND IN THE GLASS', { width: 2.2, size: 24, color: '#bcd8ff' }); ringPlace(lab, 0, 1.25, z0 - 0.3); g.add(lab);
  }
  // accent light strips where floor meets the walls
  for (const s of [-1, 1]) { const strip = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.02, R - 0.02, 0.05, SEGS, 1, true), new THREE.MeshBasicMaterial({ color: 0x6be675, side: THREE.BackSide })); strip.rotation.z = Math.PI / 2; strip.position.x = s * (W / 2 - 0.05); strip.userData.keep = true; g.add(strip); }
  // bunks under the side windows: the best sleep on the ship, in spin gravity with the stars wheeling past
  { const bunkM = mat(0x3d4d5e, 0.8), mattM = mat(0xd8d2c4, 0.9), pillowM = mat(0xeeeeea, 0.95), blanketM = mat(0x2f6a8a, 0.9);
    for (const b of BUNKS.filter((x) => x.deck === RING.deck || x.id.startsWith('ring'))) {
      const bk = new THREE.Group(); ringPlace(bk, b.x, 0, b.z); g.add(bk);
      const o = (geo, m, x, y, zz) => { const q = new THREE.Mesh(geo, m); q.position.set(x, y, zz); bk.add(q); return q; };
      o(new THREE.BoxGeometry(0.85, 0.32, 2.15), bunkM, 0, 0.16, 0);
      o(new THREE.BoxGeometry(0.78, 0.12, 2.0), mattM, 0, 0.38, 0);
      o(new THREE.BoxGeometry(0.8, 0.06, 1.3), blanketM, 0, 0.46, 0.3);
      o(new THREE.BoxGeometry(0.5, 0.1, 0.3), pillowM, 0, 0.48, -0.78);
      const lab = textSprite(b.label.toUpperCase(), { width: 0.9, size: 24, color: '#bfffbe' }); lab.position.set(0, 0.85, -1.0); bk.add(lab);
    }
  }
  // science bays: empty experiment racks with power/data/coolant stubs, benches and labels (payloads come later)
  for (let i = 0; i < RING.bays; i++) {
    const z = ((i + 0.5) / RING.bays) * C;
    for (const s of [-1, 1]) {
      const bay = new THREE.Group(); ringPlace(bay, s * (W / 2 - 0.35), 0, z); g.add(bay);
      const rot = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      const inner = new THREE.Group(); inner.rotation.y = rot; bay.add(inner);
      const b = (geo, m, x, y, zz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, zz); inner.add(o); return o; };
      b(new THREE.BoxGeometry(2.6, 2.6, 0.12), M.frame, 0, 1.4, -0.05);
      b(new THREE.BoxGeometry(2.2, 2.2, 0.06), M.dark, 0, 1.45, 0.02);
      for (let k = 0; k < 4; k++) b(new THREE.BoxGeometry(2.1, 0.04, 0.5), M.steel, 0, 0.55 + k * 0.55, 0.25);
      b(new THREE.BoxGeometry(2.4, 0.08, 0.8), M.frame, 0, 0.92, 0.55);
      for (const [c, mm] of [[-0.8, M.pipeR], [-0.65, M.pipeB], [-0.5, M.pipeG]]) b(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), mm, c, 2.45, 0.2).rotation.x = Math.PI / 2;
      b(new THREE.BoxGeometry(0.3, 0.2, 0.1), M.blue, 0.85, 2.4, 0.1);
      const sl = textSprite(`SCIENCE BAY ${i * 2 + (s > 0 ? 2 : 1)} — EMPTY`, { width: 1.5, size: 26, color: '#bfffbe' }); sl.position.set(0, 2.95, 0.3); inner.add(sl);
    }
  }
  // spoke hatches in the ceiling, with ladders climbing toward the hub
  for (const a of RING.spokes) {
    const z = (a / 360) * C;
    const hatch = new THREE.Group(); ringPlace(hatch, 0, H, z); g.add(hatch);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.09, 8, 28), M.rail); ring.rotation.x = Math.PI / 2; hatch.add(ring);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 3.0, 24, 1, true), new THREE.MeshStandardMaterial({ map: mliTex([3, 2], '#e4e1d8'), side: THREE.BackSide })); shaft.position.y = 1.5; hatch.add(shaft);
    for (let y = -H + 0.3; y < 3; y += 0.32) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6), M.rail); r.rotation.z = Math.PI / 2; r.position.set(0, y, -0.55); hatch.add(r); }
    for (const x of [-0.26, 0.26]) { const rl = new THREE.Mesh(new THREE.BoxGeometry(0.05, H + 3, 0.06), M.steel); rl.position.set(x, (3 - H) / 2, -0.55); hatch.add(rl); }
    const lab = textSprite('SPOKE LADDER ▲ HUB', { width: 1.3, size: 26, color: '#ffe6b0' }); lab.position.set(0, -0.6, 0.5); hatch.add(lab);
  }
  // signage: the direction of spin, and what thrust will do in here
  for (let i = 0; i < 6; i++) { const s = textSprite('SPIN ⟶   ·   UNDER THRUST THE FLOOR TILTS TOWARD THE DRIVE', { width: 3.6, size: 24, color: '#bfffbe' }); ringPlace(s, 0, 2.6, (i / 6) * C + 7); g.add(s); }
  bakeStatic(g);
  return g;
}
