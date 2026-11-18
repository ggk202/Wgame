// WOLFRAM models: ISS-era, NASA-style look built procedurally (geometry + canvas textures, no image files).
import * as THREE from 'three';
import { COMPS, COMP_IDS } from './config.js';

// ---------------- palette ----------------
export const PAL = {
  white: 0xeceae3, off: 0xd9d5c9, beige: 0xcfc4a8, grey: 0x9aa1a9, steel: 0x6d747d, dark: 0x30353c, black: 0x15181c,
  blue: 0x2e5b96, rail: 0xd2a948, gold: 0xc9962c, red: 0xc23a2a, orange: 0xe07a2a,
};
export const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08, ...o });
export const metal = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.75, ...o });
export const emis = (color, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });

// ---------------- procedural textures (cached) ----------------
const TEX = {};
function canvasTex(key, w, h, draw, repeat = [1, 1], wrap = true) {
  const k = key + ':' + repeat.join('x');
  if (TEX[k]) return TEX[k];
  let base = TEX[key + ':base'];
  if (!base) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    base = TEX[key + ':base'] = c;
  }
  const t = new THREE.CanvasTexture(base);
  t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return (TEX[k] = t);
}
const rnd = (a, b) => a + Math.random() * (b - a);

// Multi-layer insulation blanket (white quilted beta cloth)
export const mliTex = (r = [1, 1], tint = '#ecebe5') => canvasTex('mli' + tint, 256, 256, (g, w, h) => {
  g.fillStyle = tint; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) {
    const gr = g.createRadialGradient(x + 32, y + 32, 4, x + 32, y + 32, 46);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(120,115,100,0.22)');
    g.fillStyle = gr; g.fillRect(x, y, 64, 64);
  }
  g.strokeStyle = 'rgba(110,105,95,0.55)'; g.lineWidth = 2; g.setLineDash([4, 3]);
  for (let i = 0; i <= w; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  g.setLineDash([]);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(90,90,80,${rnd(0.04, 0.1)})`; g.lineWidth = rnd(1, 3); g.beginPath(); const x = rnd(0, w), y = rnd(0, h); g.moveTo(x, y); g.quadraticCurveTo(x + rnd(-20, 20), y + rnd(-20, 20), x + rnd(-40, 40), y + rnd(-40, 40)); g.stroke(); }
}, r);
// Crinkled gold Kapton foil
export const goldTex = (r = [1, 1]) => canvasTex('gold', 256, 256, (g, w, h) => {
  g.fillStyle = '#b8892a'; g.fillRect(0, 0, w, h);
  const cols = ['#f0d27a', '#d9ad45', '#a97b22', '#7d5a16', '#e8c45e', '#c99a33'];
  for (let i = 0; i < 520; i++) {
    g.fillStyle = cols[i % cols.length]; g.globalAlpha = rnd(0.35, 0.8);
    g.beginPath(); const x = rnd(-10, w), y = rnd(-10, h);
    g.moveTo(x, y); g.lineTo(x + rnd(5, 30), y + rnd(-15, 15)); g.lineTo(x + rnd(-10, 20), y + rnd(8, 30)); g.fill();
  }
  g.globalAlpha = 1;
}, r);
// ISS rack front (off-white panels, fasteners, placards)
export const rackTex = (r = [1, 1]) => canvasTex('rack', 256, 512, (g, w, h) => {
  g.fillStyle = '#dcd8cd'; g.fillRect(0, 0, w, h);
  const panels = [[8, 8, 240, 120], [8, 136, 116, 180], [132, 136, 116, 180], [8, 324, 240, 90], [8, 422, 240, 82]];
  for (const [x, y, pw, ph] of panels) {
    g.fillStyle = '#e6e3da'; g.fillRect(x, y, pw, ph);
    g.strokeStyle = '#a9a69c'; g.lineWidth = 2; g.strokeRect(x, y, pw, ph);
    g.fillStyle = '#8f8c83'; for (const [fx, fy] of [[x + 6, y + 6], [x + pw - 6, y + 6], [x + 6, y + ph - 6], [x + pw - 6, y + ph - 6]]) { g.beginPath(); g.arc(fx, fy, 3, 0, 7); g.fill(); }
  }
  g.fillStyle = '#2e5b96'; g.fillRect(20, 24, 90, 16); g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif'; g.fillText('CSV-W  RACK', 24, 36);
  g.fillStyle = '#15181c'; g.fillRect(150, 24, 80, 12); g.fillRect(20, 160, 60, 8); g.fillRect(150, 160, 70, 8);
  g.fillStyle = '#c9a23e'; g.fillRect(24, 430, 210, 6);
  g.fillStyle = '#2e5b96'; g.fillRect(20, 340, 40, 40); g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif'; g.fillText('⚡', 28, 370);
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.font = '9px monospace'; for (let i = 0; i < 6; i++) g.fillText('P/N 683-' + (10000 + Math.floor(rnd(0, 89999))), 140, 210 + i * 14);
  g.fillStyle = '#c0bdb3'; for (let i = 0; i < 8; i++) g.fillRect(150, 60 + i * 7, 80, 3);
}, r);
export const floorTex = (r = [6, 6]) => canvasTex('floor', 256, 256, (g, w, h) => {
  g.fillStyle = '#7d8790'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#5e666e'; g.lineWidth = 3;
  for (let i = 0; i <= w; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  g.fillStyle = 'rgba(40,46,52,0.35)'; for (let y = 8; y < h; y += 12) for (let x = 8; x < w; x += 12) g.fillRect(x, y, 3, 3);
  g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 300; i++) g.fillRect(rnd(0, w), rnd(0, h), 2, 2);
}, r);
export const screenTex = () => canvasTex('screen', 256, 160, (g, w, h) => {
  g.fillStyle = '#04101a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1d4f86'; g.fillRect(0, 0, w, 16); g.fillStyle = '#e8f2ff'; g.font = 'bold 10px monospace'; g.fillText('WOLFRAM C&W  ·  PCS 4.2', 6, 12);
  const cols = ['#7fe0ff', '#9effa8', '#e8f2ff', '#ffd27a'];
  for (let i = 0; i < 9; i++) { g.fillStyle = cols[i % 4]; g.fillRect(8, 24 + i * 12, rnd(30, 110), 5); g.fillRect(130, 24 + i * 12, rnd(15, 40), 5); }
  g.strokeStyle = '#9effa8'; g.lineWidth = 2; g.beginPath(); for (let x = 0; x < 90; x += 6) g.lineTo(160 + x, 120 - Math.sin(x / 9) * 14 - rnd(0, 8)); g.stroke();
  g.strokeStyle = '#2b5f8a'; g.strokeRect(156, 90, 94, 60);
  g.fillStyle = '#ff6a5a'; g.fillRect(8, 140, 10, 10); g.fillStyle = '#9effa8'; g.fillRect(22, 140, 10, 10);
}, [1, 1], false);
export const radiatorTex = (r = [1, 1]) => canvasTex('radiator', 256, 256, (g, w, h) => {
  g.fillStyle = '#f1f1ec'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d3d5d4'; for (let x = 6; x < w; x += 16) g.fillRect(x, 0, 4, h);
  g.fillStyle = '#b9bcbd'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
  g.fillStyle = 'rgba(120,120,110,0.08)'; for (let i = 0; i < 30; i++) g.fillRect(rnd(0, w), rnd(0, h), rnd(10, 60), rnd(2, 6));
}, r);
export const solarTex = (r = [1, 1]) => canvasTex('solar', 256, 256, (g, w, h) => {
  g.fillStyle = '#1c1d4a'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { g.fillStyle = `rgb(${40 + rnd(0, 20)},${36 + rnd(0, 16)},${110 + rnd(0, 40)})`; g.fillRect(x + 1, y + 1, 14, 14); }
  g.fillStyle = '#c8c8d8'; for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 2);
  g.fillStyle = '#c9962c'; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h);
}, r);
export const grateTex = (r = [3, 14]) => canvasTex('grate', 128, 128, (g, w, h) => {
  g.fillStyle = '#9aa2aa'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#4a5058'; for (let y = 4; y < h; y += 16) for (let x = 4; x < w; x += 16) g.fillRect(x, y, 10, 10);
  g.fillStyle = '#c4cad0'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
}, r);
export const decalTex = () => canvasTex('decal', 1024, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  // original mission patch: navy disc, gold ring, white ship silhouette, three stars for the three legs
  const cx = 128, cy = 128;
  g.fillStyle = '#1d3f73'; g.beginPath(); g.arc(cx, cy, 110, 0, 7); g.fill();
  g.strokeStyle = '#d2a948'; g.lineWidth = 12; g.stroke();
  g.fillStyle = '#e8eef5'; g.fillRect(cx - 70, cy - 8, 120, 16); g.beginPath(); g.arc(cx - 70, cy, 22, 0, 7); g.fill();
  g.beginPath(); g.moveTo(cx + 50, cy - 18); g.lineTo(cx + 80, cy - 34); g.lineTo(cx + 80, cy + 34); g.lineTo(cx + 50, cy + 18); g.fill();
  g.fillStyle = '#ffdc6a'; for (const [sx, sy] of [[cx - 40, cy - 60], [cx + 10, cy - 70], [cx + 50, cy - 56]]) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, r = i % 2 ? 6 : 14; g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } g.fill(); }
  g.fillStyle = '#d2a948'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillText('LUNA · MARS · CERES · JOVE', cx, cy + 82);
  g.textAlign = 'left';
  g.fillStyle = '#1a1d22'; g.font = 'bold 92px Helvetica, Arial, sans-serif'; g.fillText('CSV WOLFRAM', 270, 120);
  g.fillStyle = '#2e5b96'; g.fillRect(270, 140, 720, 14);
  g.fillStyle = '#1a1d22'; g.font = 'bold 48px Helvetica, Arial, sans-serif'; g.fillText('MTV-W1  ·  D–³He TORCH FREIGHTER', 270, 205);
}, [1, 1], false);
export const texMat = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0.04, ...o });
export const goldMat = (r) => new THREE.MeshStandardMaterial({ map: goldTex(r), roughness: 0.32, metalness: 0.85 });

// ---------------- labels ----------------
export function textSprite(text, { size = 28, color = '#e8eef5', bg = 'rgba(10,16,24,0.78)', width = 1.8, pad = 10 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  c.width = w; c.height = size + pad * 2;
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  if (bg) { ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(0, 0, w, c.height, 8) : ctx.rect(0, 0, w, c.height); ctx.fill(); }
  ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, pad, c.height / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(width, (width * c.height) / c.width, 1);
  return sp;
}
export function planeLabel(text, w, h, { color = '#1a1d22', bg = '#e6e3da', size = 64, accent = null } = {}) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = Math.round((1024 * h) / w);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  if (accent) { ctx.fillStyle = accent; ctx.fillRect(0, c.height - 14, c.width, 14); ctx.fillRect(0, 0, 18, c.height); }
  ctx.fillStyle = color; ctx.font = `700 ${size}px Helvetica, Arial, sans-serif`; ctx.textBaseline = 'middle';
  ctx.fillText(text, 44, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

// ---------------- helpers ----------------
function adder(g) {
  return (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
}
// instanced struts between point pairs: [[x1,y1,z1,x2,y2,z2,thickness], ...]
export function struts(list, material) {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  list.forEach(([x1, y1, z1, x2, y2, z2, t], i) => {
    a.set(x1, y1, z1); b.set(x2, y2, z2); d.subVectors(b, a); const len = d.length(); d.normalize();
    q.setFromUnitVectors(up, d); p.addVectors(a, b).multiplyScalar(0.5); s.set(t, len, t);
    m.compose(p, q, s); im.setMatrixAt(i, m);
  });
  return im;
}
function handrail(add, x1, z1, x2, z2, y, railMat) {
  const len = Math.hypot(x2 - x1, z2 - z1), ang = Math.atan2(x2 - x1, z2 - z1);
  add(new THREE.CylinderGeometry(0.03, 0.03, len, 6), railMat, (x1 + x2) / 2, y, (z1 + z2) / 2, Math.PI / 2, ang);
  for (const t of [0.08, 0.92]) add(new THREE.BoxGeometry(0.05, 0.08, 0.05), railMat, x1 + (x2 - x1) * t, y - 0.06, z1 + (z2 - z1) * t);
}
const screenMesh = (add, w, h, x, y, z, rx = 0, ry = 0) => add(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: screenTex(), color: 0xffffff }), x, y, z, rx, ry);

// ---------------- components (front faces +z, toward the room centre) ----------------
export function buildComp(kind, accent) {
  const g = new THREE.Group();
  const add = adder(g);
  const white = mat(PAL.white), off = mat(PAL.off), grey = mat(PAL.grey), dark = mat(PAL.dark), black = mat(PAL.black), blue = mat(PAL.blue), rail = mat(PAL.rail);
  const rack = texMat(rackTex()), mli = texMat(mliTex([1, 1])), acc = mat(accent);
  let screen = null, glow = null, wing = null, spin = null;
  switch (kind) {
    case 'console': { // workstation: rack pedestal, laptop on an articulated arm, crew restraint seat
      add(new THREE.BoxGeometry(1.6, 0.9, 0.7), rack, 0, 0.45, -0.1);
      add(new THREE.BoxGeometry(1.7, 0.06, 0.9), grey, 0, 0.93, 0.05);
      add(new THREE.BoxGeometry(0.06, 0.5, 0.06), dark, 0, 1.2, -0.25);
      add(new THREE.BoxGeometry(1.15, 0.04, 0.75), black, 0, 1.0, 0.1, 0.05); // laptop base
      add(new THREE.BoxGeometry(1.15, 0.72, 0.04), black, 0, 1.38, -0.28, -0.32);
      screen = screenMesh(add, 1.05, 0.62, 0, 1.38, -0.255, -0.32);
      add(new THREE.BoxGeometry(1.7, 0.08, 0.06), acc, 0, 0.92, 0.5);
      // seat with blue cushions and yellow restraint straps
      add(new THREE.BoxGeometry(0.62, 0.12, 0.6), blue, 0, 0.5, 1.15);
      add(new THREE.BoxGeometry(0.62, 0.8, 0.12), blue, 0, 0.92, 1.45, -0.18);
      add(new THREE.CylinderGeometry(0.05, 0.07, 0.45, 6), grey, 0, 0.22, 1.15);
      for (const x of [-0.18, 0.18]) add(new THREE.BoxGeometry(0.05, 0.75, 0.02), rail, x, 0.95, 1.38, -0.18);
      break;
    }
    case 'helm': {
      const deskW = 2.6;
      add(new THREE.BoxGeometry(deskW, 0.85, 0.75), rack, 0, 0.43, -0.15);
      add(new THREE.BoxGeometry(deskW + 0.1, 0.07, 1.0), grey, 0, 0.88, 0.02);
      for (const sgn of [-1, 1]) { // angled wing desks
        const w = add(new THREE.BoxGeometry(1.0, 0.85, 0.7), rack, sgn * 1.65, 0.43, 0.25, 0, -sgn * 0.6);
        add(new THREE.BoxGeometry(1.05, 0.07, 0.85), grey, sgn * 1.66, 0.88, 0.32, 0, -sgn * 0.6);
      }
      // main screen (interactive) and two side screens
      add(new THREE.BoxGeometry(1.62, 1.04, 0.06), black, 0, 1.55, -0.38, -0.12);
      screen = screenMesh(add, 1.5, 0.95, 0, 1.55, -0.345, -0.12);
      const extras = [];
      for (const sgn of [-1, 1]) {
        add(new THREE.BoxGeometry(0.92, 0.62, 0.05), black, sgn * 1.58, 1.36, -0.02, -0.15, -sgn * 0.6);
        extras.push(screenMesh(add, 0.84, 0.54, sgn * 1.565, 1.36, 0.005, -0.15, -sgn * 0.6));
      }
      g.userData.extras = extras;
      // switch panel strip with lit toggles
      for (let i = 0; i < 12; i++) add(new THREE.BoxGeometry(0.05, 0.03, 0.08), i % 4 === 0 ? mat(PAL.orange) : dark, -0.62 + i * 0.11, 0.935, 0.28);
      add(new THREE.BoxGeometry(1.4, 0.02, 0.18), black, 0, 0.925, 0.3);
      // pilot couch
      add(new THREE.BoxGeometry(0.72, 0.14, 0.7), blue, 0, 0.52, 1.25);
      add(new THREE.BoxGeometry(0.72, 0.62, 0.14), blue, 0, 0.86, 1.56, -0.3);
      add(new THREE.BoxGeometry(0.46, 0.2, 0.12), blue, 0, 1.24, 1.67, -0.3);
      add(new THREE.CylinderGeometry(0.07, 0.1, 0.45, 8), grey, 0, 0.22, 1.25);
      for (const x of [-0.2, 0.2]) add(new THREE.BoxGeometry(0.05, 0.56, 0.02), rail, x, 0.88, 1.48, -0.3);
      // armrests with hand controllers: RHC (rotation, right) and THC (translation, left)
      const sticks = {};
      for (const [sgn, key] of [[1, 'rhc'], [-1, 'thc']]) {
        add(new THREE.BoxGeometry(0.14, 0.1, 0.6), grey, sgn * 0.45, 0.78, 1.18);
        add(new THREE.BoxGeometry(0.16, 0.06, 0.16), black, sgn * 0.45, 0.85, 0.98);
        const piv = new THREE.Group(); piv.position.set(sgn * 0.45, 0.88, 0.98); g.add(piv);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.16, 8), dark); shaft.position.y = 0.08; piv.add(shaft);
        const grip = new THREE.Mesh(key === 'rhc' ? new THREE.CapsuleGeometry(0.045, 0.1, 3, 8) : new THREE.BoxGeometry(0.08, 0.12, 0.1), mat(key === 'rhc' ? 0x22262c : 0x3a3f46)); grip.position.y = 0.2; piv.add(grip);
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 8), mat(PAL.red)); btn.position.set(0, 0.29, 0.02); piv.add(btn);
        sticks[key] = piv;
      }
      g.userData.sticks = sticks;
      add(new THREE.BoxGeometry(deskW + 0.2, 0.06, 0.06), acc, 0, 0.9, 0.52);
      break;
    }
    case 'board':
      add(new THREE.BoxGeometry(3.3, 2.1, 0.18), off, 0, 1.6, -0.2);
      add(new THREE.BoxGeometry(3.1, 1.9, 0.04), black, 0, 1.6, -0.1);
      screen = screenMesh(add, 3.0, 1.8, 0, 1.6, -0.07);
      handrail(add, -1.5, 0.05, 1.5, 0.05, 0.55, rail);
      break;
    case 'machine': case 'scrubber': {
      add(new THREE.BoxGeometry(2.0, 2.3, 1.3), rack, 0, 1.15, -0.2);
      add(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 8), grey, -0.75, 1.8, -0.75);
      add(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 8), mat(PAL.blue), 0.75, 1.8, -0.75);
      add(new THREE.BoxGeometry(0.9, 0.55, 0.05), black, 0, 1.55, 0.46);
      screen = screenMesh(add, 0.8, 0.46, 0, 1.55, 0.49);
      handrail(add, -0.9, 0.48, 0.9, 0.48, 0.95, rail);
      if (kind === 'scrubber') for (let i = 0; i < 3; i++) { add(new THREE.CylinderGeometry(0.24, 0.24, 1.0, 12), white, -0.6 + i * 0.6, 0.55, 0.62); add(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 12), blue, -0.6 + i * 0.6, 1.08, 0.62); }
      break;
    }
    case 'tank':
      add(new THREE.CylinderGeometry(0.9, 0.9, 2.6, 18), mli, 0, 1.4, -0.2);
      add(new THREE.SphereGeometry(0.9, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mli, 0, 2.7, -0.2);
      for (const y of [0.5, 2.3]) add(new THREE.TorusGeometry(0.92, 0.05, 6, 20), grey, 0, y, -0.2, Math.PI / 2);
      add(new THREE.BoxGeometry(0.5, 0.35, 0.05), black, 0, 1.4, 0.72);
      screen = screenMesh(add, 0.46, 0.3, 0, 1.4, 0.75);
      break;
    case 'hydro': // plant growth chambers with pink-magenta LED light
      for (let i = 0; i < 3; i++) {
        add(new THREE.BoxGeometry(2.7, 0.75, 1.0), off, 0, 0.45 + i * 0.85, -0.05);
        add(new THREE.BoxGeometry(2.5, 0.55, 0.05), new THREE.MeshBasicMaterial({ color: 0x3a1438 }), 0, 0.47 + i * 0.85, 0.46);
        for (let k = 0; k < 7; k++) add(new THREE.ConeGeometry(0.13, 0.35, 5), mat(0x4fae4a), -1.05 + k * 0.35, 0.33 + i * 0.85, 0.3);
        add(new THREE.PlaneGeometry(2.5, 0.05), emis(0xff5ce0, 1), 0, 0.72 + i * 0.85, 0.48);
      }
      add(new THREE.BoxGeometry(0.45, 0.3, 0.05), black, 1.15, 2.85, 0.46);
      screen = screenMesh(add, 0.42, 0.27, 1.15, 2.85, 0.49);
      break;
    case 'bed':
      add(new THREE.BoxGeometry(1.0, 0.65, 2.1), off, 0, 0.33, 0);
      add(new THREE.BoxGeometry(0.92, 0.12, 1.95), blue, 0, 0.71, 0);
      add(new THREE.BoxGeometry(0.85, 0.1, 0.4), white, 0, 0.82, -0.75);
      for (const z of [-0.3, 0.4]) add(new THREE.BoxGeometry(0.96, 0.03, 0.08), rail, 0, 0.78, z);
      add(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6), grey, -0.6, 1.15, -0.9);
      add(new THREE.BoxGeometry(0.7, 0.45, 0.05), black, 0.75, 1.45, -0.9, 0, -0.4);
      screen = screenMesh(add, 0.65, 0.4, 0.76, 1.45, -0.87, 0, -0.4);
      add(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat(0xf0f0f0), -0.55, 1.6, 0.2).add(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.06), emis(PAL.red)));
      break;
    case 'cryo':
      for (let i = 0; i < 4; i++) {
        const x = -1.2 + i * 0.8;
        add(new THREE.CylinderGeometry(0.34, 0.34, 2.1, 14), white, x, 1.05, -0.2);
        const pod = add(new THREE.CylinderGeometry(0.2, 0.2, 1.5, 12, 1, true, -0.9, 1.8), emis(0x66c8ff, 0.7), x, 1.1, -0.02);
        pod.userData.pod = i;
        add(new THREE.TorusGeometry(0.35, 0.03, 5, 16), blue, x, 1.95, -0.2, Math.PI / 2);
      }
      add(new THREE.BoxGeometry(0.55, 0.32, 0.05), black, 1.65, 1.4, 0.15, 0, -0.5);
      screen = screenMesh(add, 0.5, 0.28, 1.66, 1.4, 0.18, 0, -0.5);
      break;
    case 'reactor': {
      add(new THREE.CylinderGeometry(2.1, 2.4, 0.5, 20), dark, 0, 0.25, 0);
      add(new THREE.TorusGeometry(1.5, 0.48, 12, 28), mli, 0, 1.7, 0, Math.PI / 2);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(new THREE.BoxGeometry(0.22, 0.6, 0.6), blue, Math.cos(a) * 1.5, 1.7 + Math.sin(a) * 1.5 * 0, Math.sin(a) * 1.5, 0, -a); }
      glow = add(new THREE.SphereGeometry(0.62, 16, 12), emis(0x88ddff, 1), 0, 1.7, 0);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(new THREE.BoxGeometry(0.22, 3.0, 0.22), grey, Math.cos(a) * 2.05, 1.7, Math.sin(a) * 2.05); }
      add(new THREE.CylinderGeometry(0.55, 0.55, 1.0, 14), mli, 0, 3.4, 0);
      for (const y of [0.9, 2.5]) add(new THREE.TorusGeometry(2.08, 0.04, 6, 30), rail, 0, y, 0, Math.PI / 2);
      add(new THREE.BoxGeometry(0.85, 0.5, 0.05), black, 1.6, 1.0, 1.7, -0.2, 0.6);
      screen = screenMesh(add, 0.8, 0.45, 1.62, 1.0, 1.73, -0.2, 0.6);
      break;
    }
    case 'cabinet':
      add(new THREE.BoxGeometry(1.6, 2.4, 0.6), rack, 0, 1.2, -0.1);
      for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.16, 0.26, 0.05), i % 3 === 0 ? mat(PAL.orange) : dark, -0.55 + i * 0.22, 1.95, 0.22);
      add(new THREE.BoxGeometry(1.15, 0.65, 0.04), black, 0, 1.15, 0.21);
      screen = screenMesh(add, 1.1, 0.6, 0, 1.15, 0.235);
      handrail(add, -0.7, 0.25, 0.7, 0.25, 0.6, rail);
      break;
    case 'battery':
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        add(new THREE.BoxGeometry(0.6, 0.6, 0.85), grey, -0.65 + i * 0.65, 0.33 + j * 0.65, 0);
        add(new THREE.BoxGeometry(0.4, 0.04, 0.04), rail, -0.65 + i * 0.65, 0.5 + j * 0.65, 0.44);
      }
      add(new THREE.BoxGeometry(0.5, 0.3, 0.05), black, 0, 2.2, 0.3);
      screen = screenMesh(add, 0.46, 0.27, 0, 2.2, 0.33);
      break;
    case 'pump':
      add(new THREE.CylinderGeometry(0.5, 0.5, 2.0, 14), white, 0, 0.7, 0, 0, 0, Math.PI / 2);
      add(new THREE.BoxGeometry(0.9, 0.9, 0.9), rack, 0, 0.7, 0.4);
      add(new THREE.CylinderGeometry(0.16, 0.16, 3.2, 8), mat(0x3a7fc0), -0.9, 2.0, -0.2);
      add(new THREE.CylinderGeometry(0.16, 0.16, 3.2, 8), mat(0xc05a3a), 0.9, 2.0, -0.2);
      add(new THREE.BoxGeometry(0.5, 0.3, 0.05), black, 0, 1.4, 0.4);
      screen = screenMesh(add, 0.46, 0.27, 0, 1.4, 0.43);
      break;
    case 'fab':
      add(new THREE.BoxGeometry(2.2, 2.0, 1.5), rack, 0, 1.0, -0.2);
      add(new THREE.PlaneGeometry(1.3, 0.85), new THREE.MeshStandardMaterial({ color: 0x334455, transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.3 }), 0, 1.2, 0.56);
      glow = add(new THREE.BoxGeometry(0.3, 0.3, 0.3), emis(0xffa040, 1), 0, 1.0, 0.1);
      add(new THREE.BoxGeometry(0.5, 0.3, 0.05), black, 0.8, 1.75, 0.56);
      screen = screenMesh(add, 0.46, 0.27, 0.8, 1.75, 0.59);
      break;
    case 'shelves': { // cargo transfer bags strapped to racks
      const bag = texMat(mliTex([1, 1], '#d8cdb2'));
      for (let j = 0; j < 3; j++) {
        add(new THREE.BoxGeometry(2.3, 0.06, 0.85), grey, 0, 0.4 + j * 0.8, 0);
        for (let i = 0; i < 3; i++) { add(new THREE.BoxGeometry(0.62, 0.5, 0.62), bag, -0.72 + i * 0.72, 0.7 + j * 0.8, 0); add(new THREE.BoxGeometry(0.64, 0.04, 0.05), mat(PAL.blue), -0.72 + i * 0.72, 0.8 + j * 0.8, 0.31); }
      }
      add(new THREE.BoxGeometry(0.5, 0.3, 0.05), black, 1.25, 1.3, 0.3, 0, -0.5);
      screen = screenMesh(add, 0.46, 0.27, 1.26, 1.3, 0.33, 0, -0.5);
      break;
    }
    case 'magazine':
      add(new THREE.BoxGeometry(2.2, 0.3, 1.0), dark, 0, 0.15, 0);
      for (let i = 0; i < 3; i++) { const t = add(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 12), white, -0.6 + i * 0.6, 0.5, 0, Math.PI / 2); t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.15, 12), mat(PAL.orange))); }
      add(new THREE.BoxGeometry(2.2, 2.2, 0.2), rack, 0, 1.1, -0.6);
      add(new THREE.BoxGeometry(0.65, 0.4, 0.04), black, 0, 1.6, -0.49);
      screen = screenMesh(add, 0.6, 0.35, 0, 1.6, -0.47);
      break;
    case 'dronebay': // free-flying cube robots on their docks
      add(new THREE.CylinderGeometry(1.4, 1.4, 0.15, 6), grey, 0, 0.08, 0);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const d = add(new THREE.BoxGeometry(0.34, 0.34, 0.34), white, Math.cos(a) * 0.8, 0.4, Math.sin(a) * 0.8);
        d.add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.2), mat([PAL.blue, PAL.orange, 0x3aa060, 0xc8a040][i])));
        d.userData.drone = i;
      }
      add(new THREE.BoxGeometry(2.4, 2.6, 0.3), rack, 0, 1.3, -1.2);
      add(new THREE.BoxGeometry(0.85, 0.5, 0.04), black, 0, 1.6, -1.03);
      screen = screenMesh(add, 0.8, 0.45, 0, 1.6, -1.0);
      break;
    case 'drive': { // drive bus: shadow-shield housing over the torch drive's injector end
      add(new THREE.CylinderGeometry(1.1, 2.2, 3.2, 20), mli, 0, 1.6, 0);
      for (let i = 0; i < 3; i++) add(new THREE.TorusGeometry(1.3 + i * 0.33, 0.1, 6, 24), mat(PAL.grey), 0, 2.6 - i * 0.8, 0, Math.PI / 2);
      glow = add(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 14), emis(0xffa060, 1), 0, 3.25, 0);
      add(new THREE.BoxGeometry(0.75, 0.42, 0.05), black, 1.6, 1.0, 1.6, -0.2, 0.7);
      screen = screenMesh(add, 0.7, 0.4, 1.62, 1.0, 1.63, -0.2, 0.7);
      break;
    }
    case 'tanks':
      add(new THREE.SphereGeometry(1.0, 18, 12), mli, -0.6, 1.2, -0.2);
      add(new THREE.SphereGeometry(0.8, 18, 12), mli, 0.9, 1.0, 0.1);
      add(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 8), grey, 0.2, 2.2, -0.2, 0, 0, Math.PI / 2);
      add(new THREE.BoxGeometry(0.5, 0.3, 0.05), black, 0.2, 0.8, 0.95);
      screen = screenMesh(add, 0.46, 0.27, 0.2, 0.8, 0.98);
      break;
    // ---------- exterior hardware ----------
    case 'radiator': { // ISS-style heat rejection: hinge/rotary joint + three white radiator panels
      add(new THREE.BoxGeometry(1.0, 1.3, 3.6), mli, 0, 0.65, 0);
      add(new THREE.CylinderGeometry(0.42, 0.42, 3.8, 14), grey, 0, 1.2, 0, Math.PI / 2);
      add(new THREE.BoxGeometry(0.55, 0.32, 0.05), black, 0, 0.8, 1.81);
      screen = screenMesh(add, 0.5, 0.28, 0, 0.8, 1.84);
      wing = new THREE.Group(); wing.position.set(-0.5, 1.2, 0); g.add(wing);
      const wm = new THREE.MeshStandardMaterial({ map: radiatorTex([1, 3]), emissive: 0x000000, roughness: 0.55, metalness: 0.15 });
      const beam = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 0.3), grey); beam.position.x = -11; wing.add(beam);
      for (let i = 0; i < 3; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.08, 13), wm); p.position.set(-1.2 - 3.5 - i * 7.0, 0, 0); p.rotation.x = 0.06 * (i - 1); wing.add(p);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.14, 0.16), grey); edge.position.set(-4.7 - i * 7.0, 0, 6.5); wing.add(edge);
        const edge2 = edge.clone(); edge2.position.z = -6.5; wing.add(edge2);
      }
      wing.userData.mat = wm;
      break;
    }
    case 'pdc': {
      add(new THREE.CylinderGeometry(0.9, 1.1, 0.6, 16), mli, 0, 0.3, 0);
      spin = new THREE.Group(); spin.position.y = 0.6; g.add(spin);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), white); spin.add(head);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.9), grey); housing.position.set(0, 0.45, -0.2); spin.add(housing);
      for (const x of [-0.16, 0.16]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), black); b.rotation.x = -(Math.PI / 2 - 0.5); b.position.set(x, 0.85, -0.9); spin.add(b); }
      add(new THREE.BoxGeometry(0.45, 0.28, 0.04), black, 0, 0.35, 1.02);
      screen = screenMesh(add, 0.4, 0.24, 0, 0.35, 1.05);
      break;
    }
    case 'railgun': {
      add(new THREE.BoxGeometry(2.4, 1.8, 3.4), mli, 0, 0.9, 0);
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.3, 2.4, 0.5), grey, 0, 1.2, -4 - i * 6.5);
      add(new THREE.BoxGeometry(0.9, 0.9, 27), white, 0, 2.6, -13.5);
      add(new THREE.BoxGeometry(1.25, 0.22, 27), grey, 0, 3.1, -13.5);
      add(new THREE.BoxGeometry(1.25, 0.22, 27), grey, 0, 2.1, -13.5);
      for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(1.4, 1.4, 0.25), mat(PAL.blue), 0, 2.6, -2 - i * 3);
      glow = add(new THREE.BoxGeometry(1.0, 1.0, 1.0), emis(0x66aaff, 1), 0, 2.6, 0.6);
      add(new THREE.BoxGeometry(0.85, 0.48, 0.04), black, 0, 1.0, 1.71);
      screen = screenMesh(add, 0.8, 0.45, 0, 1.0, 1.74);
      break;
    }
    case 'antenna': {
      add(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 10), grey, 0, 1.6, 0);
      spin = new THREE.Group(); spin.position.y = 3.3; g.add(spin);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 8, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: PAL.white, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.2 }));
      dish.rotation.x = Math.PI * 0.75; spin.add(dish);
      const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), dark); feed.rotation.x = -Math.PI / 4; feed.position.set(0, 0.4, 0.4); spin.add(feed);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), goldMat()); box.position.y = -0.2; spin.add(box);
      add(new THREE.BoxGeometry(0.45, 0.28, 0.04), black, 0, 0.8, 0.22);
      screen = screenMesh(add, 0.4, 0.24, 0, 0.8, 0.25);
      break;
    }
    case 'sensorarray': {
      add(new THREE.CylinderGeometry(0.16, 0.24, 3.6, 10), grey, 0, 1.8, 0);
      add(new THREE.BoxGeometry(1.4, 0.8, 0.8), goldMat(), 0, 2.2, 0);
      add(new THREE.SphereGeometry(0.42, 12, 10), white, 0.9, 2.9, 0);
      add(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 10), black, -0.85, 2.6, 0.1, Math.PI / 2);
      spin = new THREE.Group(); spin.position.y = 3.8; g.add(spin);
      spin.add(new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.55, 0.12), mat(0x22262c)));
      add(new THREE.BoxGeometry(0.45, 0.28, 0.04), black, 0, 1.0, 0.27);
      screen = screenMesh(add, 0.4, 0.24, 0, 1.0, 0.3);
      break;
    }
    default:
      add(new THREE.BoxGeometry(1, 1, 1), white, 0, 0.5, 0);
  }
  const bb = new THREE.Box3().setFromObject(g);
  const light = add(new THREE.SphereGeometry(0.06, 8, 6), emis(0x40ff80), 0, 0, 0);
  light.position.set(bb.max.x - 0.15, bb.max.y + 0.06, bb.min.z + 0.15);
  if (wing) light.position.set(0.3, 1.45, 1.6);
  return { group: g, screen, glow, light, wing, spin, height: kind === 'radiator' ? 1.6 : bb.max.y };
}

export function buildFire() {
  const g = new THREE.Group();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff8030, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(2.6, 2.6, 1); glow.position.y = 1.0; g.add(glow);
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0.55, depthWrite: false }));
  smoke.position.y = 2.6; smoke.scale.set(1.6, 0.5, 1.6); g.add(smoke);
  const m1 = new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const m2 = new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.3, 6), i % 2 ? m2 : m1);
    c.position.set((Math.random() - 0.5) * 1.4, 0.65 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6);
    c.userData.ph = Math.random() * 10; c.userData.flame = true;
    g.add(c);
  }
  g.visible = false;
  return g;
}

// ---------------- crew: ISS-style casual clothes, or an EMU-style spacesuit ----------------
export function buildAvatar(color) {
  const g = new THREE.Group();
  const col = new THREE.Color(color);
  const limb = (parent, r, len, m, x, y, z) => { const pivot = new THREE.Group(); pivot.position.set(x, y, z); const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 8), m); mesh.position.y = -len / 2 - r * 0.6; pivot.add(mesh); parent.add(pivot); return pivot; };

  // casual: polo shirt in the player's colour, khaki trousers, dark shoes
  const casual = new THREE.Group(); g.add(casual);
  const polo = mat(col), khaki = mat(0xb9a57e), skin = mat(0xd9b08c), hair = mat(0x3a2a20), shoe = mat(PAL.dark);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.42, 3, 10), polo); torso.position.y = 1.2; torso.scale.set(1.15, 1, 0.8); casual.add(torso);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 5, 10), mat(col.clone().multiplyScalar(0.7))); collar.rotation.x = Math.PI / 2; collar.position.y = 1.5; casual.add(collar);
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), mat(PAL.blue)); patch.position.set(0.12, 1.36, 0.19); casual.add(patch);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skin); head.position.y = 1.68; casual.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, 1.4), hair); hairM.position.y = 1.7; hairM.rotation.x = -0.25; casual.add(hairM);
  const cLegL = limb(casual, 0.09, 0.62, khaki, -0.11, 0.92, 0), cLegR = limb(casual, 0.09, 0.62, khaki, 0.11, 0.92, 0);
  for (const L of [cLegL, cLegR]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.26), shoe); s.position.set(0, -0.86, 0.05); L.add(s); }
  const cArmL = limb(casual, 0.065, 0.5, polo, -0.3, 1.42, 0), cArmR = limb(casual, 0.065, 0.5, polo, 0.3, 1.42, 0);
  for (const A of [cArmL, cArmR]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), skin); h.position.y = -0.68; A.add(h); }

  // EMU: white hard upper torso, life-support backpack, display & control module,
  // gold sun visor, helmet lights, and colour-coded identification stripes on the legs
  const suit = new THREE.Group(); g.add(suit);
  const sw = mat(0xf2f1ec), joint = mat(0xc8c6be), stripe = mat(col);
  const hut = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.42, 3, 12), sw); hut.position.y = 1.2; hut.scale.set(1.15, 1, 0.9); suit.add(hut);
  const plss = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.32), sw); plss.position.set(0, 1.25, -0.36); suit.add(plss);
  const plssTop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.26), mat(PAL.grey)); plssTop.position.set(0, 1.7, -0.36); suit.add(plssTop);
  const dcm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.14), mat(0x9aa1a9)); dcm.position.set(0, 1.0, 0.3); suit.add(dcm);
  for (const [x, c] of [[-0.1, PAL.red], [0, PAL.blue], [0.1, 0xffffff]]) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8), mat(c)); k.rotation.x = Math.PI / 2; k.position.set(x, 1.0, 0.38); suit.add(k); }
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.09), mat(PAL.blue)); flag.position.set(-0.32, 1.46, 0.06); flag.rotation.y = -Math.PI / 2; suit.add(flag);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 })); helmet.position.y = 1.72; suit.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.255, 18, 12, -Math.PI * 0.42, Math.PI * 0.84, 0.35, 1.25), new THREE.MeshStandardMaterial({ color: 0xe0b040, emissive: 0x1a1004, roughness: 0.08, metalness: 1.0 }));
  visor.position.y = 1.72; suit.add(visor);
  const evvaShell = new THREE.Mesh(new THREE.SphereGeometry(0.265, 16, 10, 0, Math.PI * 2, 0, 0.75), sw); evvaShell.position.y = 1.72; suit.add(evvaShell);
  for (const x of [-0.2, 0.2]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.12), mat(PAL.grey)); l.position.set(x, 1.86, 0.1); suit.add(l); const e = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), emis(0xfff4d0)); e.position.set(x, 1.86, 0.165); suit.add(e); }
  const neck = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 16), joint); neck.rotation.x = Math.PI / 2; neck.position.y = 1.5; suit.add(neck);
  const sLegL = limb(suit, 0.13, 0.58, sw, -0.14, 0.92, 0), sLegR = limb(suit, 0.13, 0.58, sw, 0.14, 0.92, 0);
  for (const L of [sLegL, sLegR]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.08, 12), stripe); band.position.y = -0.25; L.add(band);
    const knee = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 5, 12), joint); knee.rotation.x = Math.PI / 2; knee.position.y = -0.46; L.add(knee);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.32), mat(0xe2e0d8)); boot.position.set(0, -0.86, 0.04); L.add(boot);
  }
  const sArmL = limb(suit, 0.1, 0.46, sw, -0.38, 1.42, 0), sArmR = limb(suit, 0.1, 0.46, sw, 0.38, 1.42, 0);
  for (const A of [sArmL, sArmR]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.06, 10), stripe); band.position.y = -0.18; A.add(band);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0xd8d4c8)); glove.position.y = -0.66; A.add(glove);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 5, 12), joint); ring.rotation.x = Math.PI / 2; ring.position.y = -0.58; A.add(ring);
  }
  suit.visible = false;
  const item = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.32), mat(0xffffff)); item.position.set(0.36, 0.9, 0.3); g.add(item);
  const api = {
    group: g, item, suit, casual,
    // kept for older callers
    helmet: { set visible(v) { api.setSuit(v); } }, pack: { set visible(v) {} },
    setSuit(on) { suit.visible = !!on; casual.visible = !on; },
    animate(phase, amt) {
      const s = Math.sin(phase) * 0.6 * amt;
      for (const [L, R, A, B] of [[cLegL, cLegR, cArmL, cArmR], [sLegL, sLegR, sArmL, sArmR]]) { L.rotation.x = s; R.rotation.x = -s; A.rotation.x = -s * 0.7; B.rotation.x = s * 0.7; }
    },
  };
  return api;
}

