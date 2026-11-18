// NPC ships and orbital stations (units: metres; ships point their nose along -Z, stations' docking port faces +Z at the origin).
import * as THREE from 'three';
import { PAL, mat, metal, texMat, goldMat, mliTex, solarTex, radiatorTex, struts, textSprite } from './models.js';

const glowMat = (c, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) });
function npcAdd(g) { return (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; }; }
function plumeMesh(len, rad, color = 0xffb27a) {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(rad, len, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  outer.rotation.x = -Math.PI / 2; outer.position.z = len / 2; g.add(outer);
  const core = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.35, len * 0.6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.rotation.x = -Math.PI / 2; core.position.z = len * 0.3; g.add(core);
  g.visible = false;
  return g;
}

// ---------------- ships ----------------
// Hull plating: panel seams, rivet rows, scorch and grime, tinted per faction (cached per tint)
const NPC_TEX = {};
function plateTex(tint, grime = 0.25, key = '') {
  const k = tint + grime + key; if (NPC_TEX[k]) return NPC_TEX[k];
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = tint; g.fillRect(0, 0, 256, 256);
  const r = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${r(0.03, 0.09)})`; g.fillRect(Math.floor(r(0, 8)) * 32, Math.floor(r(0, 8)) * 32, 32 * Math.ceil(r(1, 3)), 32 * Math.ceil(r(1, 3))); }
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5;
  for (let x = 0; x <= 256; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (let y = 0; y <= 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 4; y < 256; y += 32) for (let x = 4; x < 256; x += 8) g.fillRect(x, y, 1.5, 1.5);
  for (let i = 0; i < 40 * grime; i++) { const gr = g.createRadialGradient(0, 0, 0, 0, 0, r(8, 30)); gr.addColorStop(0, `rgba(20,14,8,${r(0.2, 0.5) * grime})`); gr.addColorStop(1, 'rgba(20,14,8,0)'); g.save(); g.translate(r(0, 256), r(0, 256)); g.fillStyle = gr; g.fillRect(-30, -30, 60, 60); g.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return (NPC_TEX[k] = t);
}
const plate = (tint, rep = [2, 2], o = {}) => { const t = plateTex(tint, o.grime ?? 0.25, o.key || '').clone(); t.needsUpdate = true; t.repeat.set(rep[0], rep[1]); return new THREE.MeshStandardMaterial({ map: t, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0.35 }); };
function hullNumberTex(text, fg = '#e8eef5') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = fg; g.font = 'bold 64px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// small fittings reused by every ship
function rcsQuad(add, m, x, y, z, s = 1) { add(new THREE.BoxGeometry(0.9 * s, 0.9 * s, 0.9 * s), m, x, y, z); for (const [dx, dy, dz] of [[0.6, 0, 0], [-0.6, 0, 0], [0, 0.6, 0], [0, 0, 0.6]]) add(new THREE.ConeGeometry(0.18 * s, 0.4 * s, 8, 1, true), m, x + dx * s, y + dy * s, z + dz * s, dz ? Math.PI / 2 : 0, 0, dx ? -Math.sign(dx) * Math.PI / 2 : 0); }
function turret(add, base, barrel, x, y, z, flip = false, s = 1) {
  const sg = flip ? -1 : 1;
  add(new THREE.CylinderGeometry(1.4 * s, 1.6 * s, 0.5 * s, 16), base, x, y + sg * 0.25 * s, z);
  add(new THREE.SphereGeometry(1.15 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), base, x, y + sg * 0.5 * s, z, flip ? Math.PI : 0);
  for (const dx of [-0.25, 0.25]) add(new THREE.CylinderGeometry(0.14 * s, 0.14 * s, 2.6 * s, 8), barrel, x + dx * s, y + sg * 1.0 * s, z - 1.6 * s, Math.PI / 2);
}
function dish(add, m, mast, x, y, z, r = 1.6, tilt = 0.6) {
  add(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8), mast, x, y + 1.1, z);
  const d = add(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), m, x, y + 2.3, z, Math.PI - tilt); d.material.side = THREE.DoubleSide;
  add(new THREE.CylinderGeometry(0.05, 0.05, r * 0.8, 6), mast, x, y + 2.3 - Math.cos(tilt) * 0.4, z + Math.sin(tilt) * 0.4, -tilt);
}
function driveBell(add, g, plumes, m, ring, x, y, z, r, len, color) {
  add(new THREE.CylinderGeometry(r * 0.45, r, len, 20, 1, true), m, x, y, z + len / 2, Math.PI / 2).material.side = THREE.DoubleSide;
  add(new THREE.TorusGeometry(r * 0.5, 0.12 * r, 8, 20), ring, x, y, z + 0.2);
  for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; add(new THREE.CylinderGeometry(0.08 * r, 0.08 * r, len * 0.7, 6), ring, x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, z + len * 0.3, Math.PI / 2 - 0.25 * Math.cos(a), 0, 0.25 * Math.sin(a)); }
  const glow = add(new THREE.CircleGeometry(r * 0.42, 20), glowMat(color, 0.6), x, y, z + 0.25); glow.rotation.y = Math.PI;
  const p = plumeMesh(len * 9, r * 1.1, color); p.position.set(x, y, z + len); g.add(p); plumes.push(p);
}
function navLights(add, L, W) {
  add(new THREE.SphereGeometry(0.35, 8, 6), glowMat(0xff3030), -W, 0, -L * 0.1).userData.blink = true;
  add(new THREE.SphereGeometry(0.35, 8, 6), glowMat(0x30ff60), W, 0, -L * 0.1).userData.blink = true;
  add(new THREE.SphereGeometry(0.3, 8, 6), glowMat(0xffffff), 0, 0, L * 0.5).userData.blink = true;
}
export function buildShip(type) {
  const g = new THREE.Group();
  const add = npcAdd(g);
  const plumes = [];
  const muzzle = new THREE.Object3D();
  const dark = mat(0x22262b, { roughness: 0.7, metalness: 0.4 }), steel = metal(0x8a9098), black = mat(0x111316);
  const radM = new THREE.MeshStandardMaterial({ map: radiatorTex([1, 3]), color: 0xb8bcbf, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
  if (type === 'drone') { // autonomous mining drone: hopper body, drill head, sensor eye, four thrusters
    const yel = plate('#c99a24', [1, 2], { grime: 0.7, key: 'drn' });
    add(new THREE.BoxGeometry(4, 3, 7), yel, 0, 0, 0);
    add(new THREE.BoxGeometry(4.3, 0.35, 7.3), dark, 0, 1.1, 0);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.2, 2.6, 6.4), black, s * 2.05, 0, 0);
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(4.1, 0.12, 0.25), black, 0, -0.6 + 0.3 * (i % 2), -2.6 + i * 1.3);
    const drill = add(new THREE.ConeGeometry(1.4, 4, 14), steel, 0, 0, -5.5, -Math.PI / 2);
    for (let i = 0; i < 6; i++) add(new THREE.TorusGeometry(1.2 - i * 0.18, 0.08, 6, 16), dark, 0, 0, -4.2 - i * 0.5);
    add(new THREE.SphereGeometry(0.45, 12, 8), glowMat(0xff3020, 1.2), 0, 0.9, -3.6).userData.blink = true;
    for (const [x, y] of [[-1.6, -1.1], [1.6, -1.1], [-1.6, 1.1], [1.6, 1.1]]) { add(new THREE.CylinderGeometry(0.4, 0.6, 1.2, 10, 1, true), dark, x, y, 3.9, Math.PI / 2).material.side = THREE.DoubleSide; const p = plumeMesh(10, 0.6, 0xffd090); p.position.set(x, y, 4.5); g.add(p); plumes.push(p); }
    add(new THREE.BoxGeometry(3, 2, 0.1), texMat(solarTex([1, 1])), 0, 2.4, 0.5, -0.3);
    rcsQuad(add, dark, 2.1, 1.4, -3.2, 0.6); rcsQuad(add, dark, -2.1, 1.4, -3.2, 0.6);
    void drill; muzzle.position.set(0, 0, -7.5);
  } else if (type === 'gunship') { // separatist gunship: faceted wedge, olive with yellow chevrons
    const L = 80, R = 8;
    const olive = plate('#56603f', [3, 6], { key: 'gs' }), yel = mat(0xd8b030);
    const prof = new THREE.Shape(); prof.moveTo(-R * 1.2, -R * 0.45); prof.lineTo(R * 1.2, -R * 0.45); prof.lineTo(R * 0.8, R * 0.55); prof.lineTo(-R * 0.8, R * 0.55); prof.closePath();
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: L * 0.75, bevelEnabled: true, bevelSize: 0.6, bevelThickness: 0.6, bevelSegments: 1 }), olive); body.position.z = -L * 0.35; g.add(body);
    const nose = add(new THREE.ConeGeometry(R * 1.1, L * 0.32, 4), olive, 0, 0, -L * 0.5, -Math.PI / 2, 0, Math.PI / 4); nose.scale.set(1.45, 1, 0.6);
    for (let i = 0; i < 4; i++) { const c = add(new THREE.BoxGeometry(R * 1.6, 0.2, 1.2), yel, 0, R * 0.58, -L * 0.25 + i * 3.2); c.rotation.y = i % 2 ? 0.5 : -0.5; }
    add(new THREE.BoxGeometry(R * 0.9, R * 0.4, L * 0.16), dark, 0, R * 0.8, L * 0.05); // armoured bridge
    for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.9, 0.18, 0.08), glowMat(0x8ad0ff, 0.9), -2 + i * 0.8, R * 0.95, L * 0.05 - L * 0.08);
    add(new THREE.BoxGeometry(1.8, 1.8, L * 0.65), steel, 0, R * 0.95, -L * 0.55);
    for (let i = 0; i < 8; i++) add(new THREE.TorusGeometry(1.5, 0.25, 6, 12), dark, 0, R * 0.95, -L * 0.35 - i * 3.6);
    muzzle.position.set(0, R * 0.95, -L * 0.88);
    turret(add, olive, steel, R * 0.7, R * 0.55, -L * 0.05); turret(add, olive, steel, -R * 0.7, R * 0.55, -L * 0.05); turret(add, olive, steel, 0, -R * 0.45, 0, true);
    for (const s of [-1, 1]) { const fin = add(new THREE.BoxGeometry(0.25, R * 2.6, L * 0.3), radM, s * R * 1.35, 0, L * 0.18); fin.rotation.z = s * 0.4; }
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(1.3, 0.25, 1.3), black, (i % 2 ? 1 : -1) * 3, R * 0.56, -L * 0.15 + Math.floor(i / 2) * 2.4);
    for (const s of [-1, 1]) driveBell(add, g, plumes, metal(0x3a3d42), steel, s * R * 0.55, 0, L * 0.4, R * 0.42, L * 0.1, 0xffb27a);
    rcsQuad(add, dark, R * 1.1, 0, -L * 0.3); rcsQuad(add, dark, -R * 1.1, 0, -L * 0.3); rcsQuad(add, dark, R * 1.1, 0, L * 0.3); rcsQuad(add, dark, -R * 1.1, 0, L * 0.3);
    navLights(add, L, R * 1.3);
  } else if (type === 'navy' || type === 'frigate' || type === 'corvette') {
    // navy escort: clean grey-blue, hull number; pirates: the same lineage bolted together, rusty, mismatched plating
    const navy = type === 'navy', L = type === 'corvette' ? 58 : navy ? 120 : 110, R = type === 'corvette' ? 5.5 : 9;
    const main = navy ? plate('#59646f', [4, 10], { grime: 0.05, key: 'nv', rough: 0.5 }) : plate(type === 'frigate' ? '#4a4844' : '#3e4248', [4, 10], { grime: 0.8, key: type });
    const patch = plate(navy ? '#4c5661' : '#6b4a32', [1, 2], { grime: navy ? 0.05 : 0.9, key: 'p' + type });
    const stripeM = mat(navy ? 0x2e5b96 : 0xa8321e);
    // spine: three hexagonal sections of slightly different radius, with collars between them
    const secs = [[-0.42, -0.12, 0.92], [-0.12, 0.16, 1.0], [0.16, 0.36, 0.86]];
    for (const [a, b, k] of secs) { add(new THREE.CylinderGeometry(R * k, R * k, (b - a) * L, 8), main, 0, 0, ((a + b) / 2) * L, Math.PI / 2, 0, Math.PI / 8); add(new THREE.CylinderGeometry(R * k * 1.05, R * k * 1.05, 1.2, 8), dark, 0, 0, a * L, Math.PI / 2, 0, Math.PI / 8); }
    add(new THREE.ConeGeometry(R * 0.92, L * 0.18, 8), main, 0, 0, -L * 0.51, -Math.PI / 2, 0, Math.PI / 8);
    add(new THREE.CylinderGeometry(R * 1.04, R * 1.04, 2.4, 8), stripeM, 0, 0, -L * 0.2, Math.PI / 2, 0, Math.PI / 8);
    // bridge with lit windows, sensor mast, comms dish
    add(new THREE.BoxGeometry(R * 0.9, R * 0.55, L * 0.14), main, 0, R * 0.95, -L * 0.3);
    for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(0.7, 0.3, 0.1), glowMat(0xffd38a, 0.9), -R * 0.36 + i * (R * 0.12), R * 1.0, -L * 0.37 - 0.06);
    add(new THREE.CylinderGeometry(0.2, 0.25, R * 1.1, 8), steel, 0, R * 1.7, -L * 0.25);
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(R * 0.6 - i * 1.2, 0.12, 0.12), steel, 0, R * 1.5 + i * 0.6, -L * 0.25);
    dish(add, mat(0xe0e2e4, { roughness: 0.5 }), steel, R * 0.6, R * 0.86, -L * 0.05, navy ? 2.4 : 1.8);
    // weapons: spinal rail with coil rings, gatlings, torpedo cells
    add(new THREE.BoxGeometry(1.6, 1.6, L * 0.55), steel, 0, 0, -L * 0.62);
    for (let i = 0; i < 7; i++) add(new THREE.TorusGeometry(1.4, 0.3, 6, 12), dark, 0, 0, -L * 0.45 - i * (L * 0.06));
    muzzle.position.set(0, 0, -L * 0.9);
    const tur = [[0, R, -L * 0.08, false], [0, -R, L * 0.1, true], ...(type !== 'corvette' ? [[R * 0.75, R * 0.62, L * 0.02, false], [-R * 0.75, -R * 0.62, -L * 0.02, true]] : [])];
    for (const [x, y, z, f] of tur) turret(add, navy ? main : patch, steel, x, y, z, f);
    for (let i = 0; i < (type === 'corvette' ? 4 : 8); i++) add(new THREE.BoxGeometry(1.2, 0.2, 1.2), black, (i % 2 ? 1 : -1) * R * 0.45, R * 0.93, -L * 0.15 + Math.floor(i / 2) * 2.2);
    // radiators: navy gets proper deployed wings; pirates make do with fins and a jury-rigged panel
    if (navy) for (const s of [-1, 1]) { add(new THREE.BoxGeometry(R * 3.2, 0.25, L * 0.24), radM, s * R * 2.5, 0, L * 0.12); add(new THREE.CylinderGeometry(0.4, 0.4, R * 0.9, 8), steel, s * R * 0.95, 0, L * 0.12, 0, 0, Math.PI / 2); }
    else for (const s of [-1, 1]) { const fin = add(new THREE.BoxGeometry(0.3, R * 2.2, L * 0.3), radM, s * R * 1.3, 0, L * 0.14); fin.rotation.z = s * 0.25; }
    if (!navy) { // welded-on extras: cargo pods, armour plates, an external tank on a frame
      for (const [x, y, z] of [[R * 0.95, -R * 0.4, -L * 0.05], [-R, R * 0.2, L * 0.02]]) { add(new THREE.BoxGeometry(R * 0.7, R * 0.7, L * 0.12), patch, x, y, z); add(new THREE.BoxGeometry(R * 0.72, 0.15, L * 0.122), stripeM, x, y + R * 0.2, z); }
      for (let i = 0; i < 5; i++) { const pl = add(new THREE.BoxGeometry(R * 0.8, 0.3, R * 0.9), patch, (i % 2 ? 1 : -1) * R * 0.3, R * 0.88, -L * 0.15 + i * L * 0.06); pl.rotation.set(0.05 * (i - 2), 0.15 * (i % 3 - 1), 0.08 * (i % 2 ? 1 : -1)); }
      add(new THREE.CylinderGeometry(R * 0.4, R * 0.4, L * 0.16, 14), mat(0x8a8070), -R * 1.35, -R * 0.6, L * 0.14, Math.PI / 2);
      g.add(struts([[-R * 0.8, -R * 0.4, L * 0.08, -R * 1.2, -R * 0.55, L * 0.08, 0.15], [-R * 0.8, -R * 0.4, L * 0.2, -R * 1.2, -R * 0.55, L * 0.2, 0.15]], steel));
    } else {
      const num = new THREE.Mesh(new THREE.PlaneGeometry(R * 1.4, R * 0.52), new THREE.MeshBasicMaterial({ map: hullNumberTex('FFG-41'), transparent: true, depthWrite: false }));
      for (const s of [-1, 1]) { const n = num.clone(); n.position.set(s * (R * 0.93 + 0.05), 0, -L * 0.33); n.rotation.y = s * Math.PI / 2; g.add(n); }
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.1, R * 0.5, L * 0.3), stripeM, s * R * 0.94, -R * 0.25, -L * 0.05);
    }
    const nEng = type === 'corvette' ? 1 : 3;
    for (let i = 0; i < nEng; i++) { const x = nEng === 1 ? 0 : (i - 1) * R * 0.62; driveBell(add, g, plumes, metal(0x34373c), steel, x, 0, L * 0.36, R * (nEng === 1 ? 0.6 : 0.38), L * 0.1, navy ? 0xa8c8ff : 0xffb27a); }
    for (const z of [-L * 0.4, L * 0.3]) for (const s of [-1, 1]) rcsQuad(add, dark, s * R * 0.92, 0, z, R / 7);
    navLights(add, L, R * 1.1);
  } else if (type === 'freighter' || type === 'hauler') {
    // independent freighter: a long truss spine carrying stacked containers, a cab up front, one big drive
    const L = type === 'hauler' ? 70 : 95, cabM = plate('#d9d2c2', [2, 3], { grime: 0.5, key: 'cab' });
    g.add(struts([[-2, -2, -L * 0.35, -2, -2, L * 0.35, 0.3], [2, -2, -L * 0.35, 2, -2, L * 0.35, 0.3], [-2, 2, -L * 0.35, -2, 2, L * 0.35, 0.3], [2, 2, -L * 0.35, 2, 2, L * 0.35, 0.3]], steel));
    for (let i = 0; i < 9; i++) g.add(struts([[-2, -2, -L * 0.35 + i * L * 0.0875, 2, 2, -L * 0.35 + i * L * 0.0875, 0.15], [2, -2, -L * 0.35 + i * L * 0.0875, -2, 2, -L * 0.35 + i * L * 0.0875, 0.15]], steel));
    const cols = ['#a83a2a', '#2e5b96', '#d8a43a', '#3c7a4a', '#7a7f86', '#c86a2a'];
    const nC = type === 'hauler' ? 6 : 12;
    for (let i = 0; i < nC; i++) { const z = -L * 0.28 + Math.floor(i / 4) * 12 * (type === 'hauler' ? 1.6 : 1), a = (i % 4) * Math.PI / 2; add(new THREE.BoxGeometry(5, 5, 11), plate(cols[i % cols.length], [1, 2], { grime: 0.5, key: 'c' + i }), Math.cos(a) * 5, Math.sin(a) * 5, z, 0, 0, a); }
    add(new THREE.BoxGeometry(8, 6, 10), cabM, 0, 0, -L * 0.42);
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(1.1, 0.5, 0.1), glowMat(0xffe0a0, 0.9), -2.4 + i * 1.2, 1.4, -L * 0.42 - 5.05);
    dish(add, mat(0xe0e2e4), steel, 2.5, 3, -L * 0.42, 1.4);
    add(new THREE.SphereGeometry(4.2, 18, 12), mat(0xb8b0a0, { roughness: 0.5 }), 0, 0, L * 0.38);
    driveBell(add, g, plumes, metal(0x34373c), steel, 0, 0, L * 0.44, 2.8, 7, 0xffc890);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.2, 9, 14), radM, s * 4.6, 0, L * 0.3);
    if (type === 'hauler') { // crippled: dark windows, a vented, scorched cargo stack, a slow tumble handled in world.js
      g.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshBasicMaterial) o.material.color.multiplyScalar(0.15); });
      add(new THREE.SphereGeometry(3, 10, 8), mat(0x15100c, { roughness: 1 }), 4, 3, -L * 0.1);
    }
    rcsQuad(add, dark, 4.2, 3.2, -L * 0.42); rcsQuad(add, dark, -4.2, 3.2, -L * 0.42);
    navLights(add, L, 5.5);
    muzzle.position.set(0, 0, -L * 0.5);
  } else if (type === 'courier') { // a supply courier drone: compact, bright orange, solar wings
    const o = plate('#e07a2a', [1, 1], { grime: 0.1, key: 'cr' });
    add(new THREE.CylinderGeometry(1.6, 1.6, 6, 12), o, 0, 0, 0, Math.PI / 2);
    add(new THREE.SphereGeometry(1.6, 12, 8), o, 0, 0, -3);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(7, 0.1, 2.4), texMat(solarTex([2, 1])), s * 5.2, 0, 0.5);
    driveBell(add, g, plumes, metal(0x34373c), steel, 0, 0, 3, 0.9, 1.5, 0xffd090);
    navLights(add, 6, 2);
  }
  g.add(muzzle);
  g.userData = { plumes, muzzle, type };
  g.traverse((o) => { if (o.isMesh && !(o.material && o.material.isMeshBasicMaterial)) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------- stations ----------------
// Centreline docking target (ISS style): a black cross on a standoff in front of a white backplate.
// Aligned when the cross sits in the middle of the plate's circle as seen from our docking camera (port + 1.5 m up).
export function dockingTarget() {
  const g = new THREE.Group();
  const add = npcAdd(g);
  add(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }), 0, 0, 0);
  add(new THREE.RingGeometry(0.3, 0.33, 32), new THREE.MeshBasicMaterial({ color: 0x111111 }), 0, 0, 0.005);
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), new THREE.MeshBasicMaterial({ color: 0x222222 }), 0, 0, 0.25, Math.PI / 2);
  const cross = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
  add(new THREE.BoxGeometry(0.34, 0.05, 0.02), cross, 0, 0, 0.5);
  add(new THREE.BoxGeometry(0.05, 0.34, 0.02), cross, 0, 0, 0.5);
  add(new THREE.BoxGeometry(0.06, 0.06, 0.06), glowMat(0xffffff), 0, 0.17, 0.5);
  return g;
}
const STATIONS = {
  luna: { name: 'SHACKLETON YARD', ring: 0, yard: true, mods: 5, color: 0x2e5b96 },
  phobos: { name: 'PHOBOS STATION', ring: 0, yard: false, mods: 4, color: 0xc0392b },
  ceres: { name: 'PIAZZI DOCK', ring: 46, yard: false, mods: 3, color: 0xd8a420 },
  ganymede: { name: 'NICHOLSON PORT', ring: 70, yard: false, mods: 6, color: 0x3aa060, ring2: true },
};
export function buildStation(id) {
  const P = STATIONS[id] || STATIONS.luna;
  const g = new THREE.Group();
  const add = npcAdd(g);
  const white = mat(PAL.white), grey = mat(PAL.grey), dark = mat(PAL.dark), rail = mat(PAL.rail), acc = mat(P.color);
  const mli = (rx, ry) => texMat(mliTex([rx, ry]));
  // docking port module: axis along +Z, mating face at z = 0
  add(new THREE.CylinderGeometry(1.7, 1.7, 7, 24), mli(2, 1), 0, 0, -3.5, Math.PI / 2);
  add(new THREE.TorusGeometry(1.75, 0.18, 8, 28), metal(0x9aa0a8), 0, 0, -0.05);
  add(new THREE.CircleGeometry(1.55, 24), metal(0x7a8088), 0, 0, -0.02);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + Math.PI / 2; add(new THREE.BoxGeometry(0.25, 0.5, 0.45), metal(0xc8ccd0), Math.cos(a) * 1.55, Math.sin(a) * 1.55, 0.18); } // guide petals
  const tgt = dockingTarget(); tgt.position.set(0, 1.5, -0.04); g.add(tgt);
  const blink = [];
  for (const [x, y, c] of [[-1.9, -0.9, 0xff2a20], [1.9, -0.9, 0x20ff60], [0, -2.0, 0xffffff]]) { const b = add(new THREE.SphereGeometry(0.12, 8, 6), glowMat(c), x, y, -0.3); b.userData.blink = c; blink.push(b); }
  // core node and modules
  add(new THREE.SphereGeometry(4.2, 24, 16), mli(3, 2), 0, 0, -11);
  add(new THREE.CylinderGeometry(3.6, 3.6, 18, 28), mli(4, 2), 0, 0, -24, Math.PI / 2);
  for (let i = 0; i < P.mods; i++) {
    const a = (i / P.mods) * Math.PI * 2;
    const m = add(new THREE.CylinderGeometry(2.6, 2.6, 14, 24), mli(3, 1), Math.cos(a) * 10, Math.sin(a) * 10, -11 - (i % 2) * 5, 0, 0, a + Math.PI / 2);
    m.rotation.set(0, 0, a - Math.PI / 2);
    add(new THREE.CylinderGeometry(2.62, 2.62, 1.0, 24), acc, Math.cos(a) * 14, Math.sin(a) * 14, -11 - (i % 2) * 5, 0, 0, a - Math.PI / 2);
  }
  // main truss with solar arrays and radiators
  const tL = 90, S = [];
  for (let z = -33; z > -33 - tL; z -= 6) for (const [x, y] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) S.push([x, y, z, x, y, z - 6, 0.25]);
  for (let z = -33; z > -33 - tL; z -= 6) { S.push([-2, -2, z, 2, 2, z - 6, 0.15]); S.push([2, -2, z, -2, 2, z - 6, 0.15]); }
  g.add(struts(S, mat(0xc8ccd0)));
  for (const zz of [-50, -90]) for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.3, 0.3, 30, 8), grey, s * 17, 0, zz, 0, 0, Math.PI / 2);
    for (const dz of [-3.3, 3.3]) add(new THREE.BoxGeometry(30, 0.06, 5.8), texMat(solarTex([4, 1]), { metalness: 0.4, roughness: 0.35 }), s * 18, 0, zz + dz);
  }
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.15, 18, 12), new THREE.MeshStandardMaterial({ map: radiatorTex([1, 2]), roughness: 0.55 }), s * 3, s * 11, -72);
  if (P.yard) { // shipyard: an open construction cage with a hull being built
    const C = [];
    for (let z = -120; z > -200; z -= 10) for (const [x, y] of [[-14, -14], [14, -14], [14, 14], [-14, 14]]) { C.push([x, y, z, x, y, z - 10, 0.45]); }
    for (let z = -120; z >= -200; z -= 10) { C.push([-14, -14, z, 14, -14, z, 0.35]); C.push([14, -14, z, 14, 14, z, 0.35]); C.push([14, 14, z, -14, 14, z, 0.35]); C.push([-14, 14, z, -14, -14, z, 0.35]); }
    g.add(struts(C, mat(0xd8b040)));
    add(new THREE.CylinderGeometry(8, 8, 50, 24, 1, true), mli(6, 3), 0, 0, -165, Math.PI / 2);
    for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.6, 0.6, 0.6), glowMat(0xffe0a0), -13 + (i % 2) * 26, -13 + Math.floor(i / 2) * 13, -150 - i * 6);
  }
  if (P.ring) { // spin gravity ring on spokes
    const ring = new THREE.Group(); ring.position.z = -60; g.add(ring);
    const tor = new THREE.Mesh(new THREE.TorusGeometry(P.ring, 4.5, 14, 72), mli(24, 2)); ring.add(tor);
    for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, P.ring, 8), grey); sp.rotation.z = (i / 4) * Math.PI * 2; sp.position.set(Math.cos((i / 4) * Math.PI * 2 + Math.PI / 2) * P.ring / 2, Math.sin((i / 4) * Math.PI * 2 + Math.PI / 2) * P.ring / 2, 0); ring.add(sp); }
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const w = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.1), glowMat(0xffe6b0, 0.9)); w.position.set(Math.cos(a) * P.ring, Math.sin(a) * P.ring, 4.55); ring.add(w); }
    if (P.ring2) { const t2 = new THREE.Mesh(new THREE.TorusGeometry(P.ring * 0.62, 3.5, 12, 60), mli(18, 2)); t2.position.z = -40; ring.add(t2); }
    g.userData.ring = ring;
  }
  const label = textSprite(P.name, { width: 26, size: 40, color: '#ffe0a0' }); label.position.set(0, 14, -20); g.add(label);
  g.traverse((o) => { if (o.isMesh && o.material && !o.material.isMeshBasicMaterial) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.blink = blink; g.userData.name = P.name;
  g.userData.tick = (now) => { if (g.userData.ring) g.userData.ring.rotation.z = now * 0.08; for (const b of blink) b.visible = b.userData.blink === 0xffffff ? Math.sin(now * 9) > 0.7 : Math.sin(now * 2.2) > 0; };
  return g;
}
