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
  const M_ = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; parent.add(o); return o; };
  // a limb hangs from a pivot (hip or shoulder): upper segment, a joint, lower segment, then whatever goes at the end
  const limb = (parent, r, len, m, x, y, z, joint) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, z); parent.add(pivot);
    const up = len * 0.52, lo = len * 0.48;
    M_(new THREE.CapsuleGeometry(r, up, 4, 10), m, 0, -up / 2 - r * 0.4, 0, 0, 0, 0, pivot);
    if (joint) M_(new THREE.SphereGeometry(r * 1.05, 10, 8), joint, 0, -up - r * 0.6, 0, 0, 0, 0, pivot);
    M_(new THREE.CapsuleGeometry(r * 0.9, lo, 4, 10), m, 0, -up - lo / 2 - r * 1.2, 0, 0, 0, 0, pivot);
    pivot.userData.end = -len - r * 1.4;
    return pivot;
  };
  const lathe = (pts, m, y, sx = 1, sz = 1, parent) => { const o = M_(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 20), m, 0, y, 0, 0, 0, 0, parent); o.scale.set(sx, 1, sz); return o; };

  // ---- casual: shipboard jumpsuit jacket in the player's colour, cargo trousers, deck shoes, headset ----
  const casual = new THREE.Group(); g.add(casual);
  const polo = mat(col, { roughness: 0.85 }), polo2 = mat(col.clone().multiplyScalar(0.72), { roughness: 0.85 }), khaki = mat(0x9b8c6c, { roughness: 0.9 }), skin = mat(0xd9b08c, { roughness: 0.65 }), hair = mat(0x3a2a20, { roughness: 0.9 }), shoe = mat(0x23262b, { roughness: 0.6 }), sole = mat(0x111111);
  lathe([[0.001, 0], [0.17, 0.02], [0.2, 0.18], [0.215, 0.36], [0.24, 0.5], [0.22, 0.58], [0.12, 0.64], [0.06, 0.66]], polo, 0.9, 1.15, 0.78, casual);
  M_(new THREE.BoxGeometry(0.006, 0.5, 0.01), polo2, 0, 1.19, 0.175, 0, 0, 0, casual);                       // zip
  M_(new THREE.BoxGeometry(0.1, 0.08, 0.01), polo2, 0.12, 1.32, 0.17, 0, 0, 0, casual);                     // chest pocket
  M_(new THREE.BoxGeometry(0.05, 0.07, 0.006), mat(0xf2f2f2), -0.12, 1.33, 0.178, 0, 0, 0, casual);         // ID badge
  M_(new THREE.CircleGeometry(0.035, 14), mat(PAL.blue), 0.23, 1.38, 0.0, 0, Math.PI / 2, 0, casual);       // shoulder patch
  M_(new THREE.TorusGeometry(0.075, 0.025, 6, 14), polo2, 0, 1.52, 0, Math.PI / 2, 0, 0, casual);           // collar
  M_(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 18), mat(0x2a2c30), 0, 0.92, 0, 0, 0, 0, casual).scale.set(1.12, 1, 0.8); // belt
  M_(new THREE.BoxGeometry(0.06, 0.04, 0.01), metal(0xc0c4c8), 0, 0.92, 0.155, 0, 0, 0, casual);
  M_(new THREE.CylinderGeometry(0.055, 0.06, 0.08, 10), skin, 0, 1.56, 0, 0, 0, 0, casual);                 // neck
  const head = M_(new THREE.SphereGeometry(0.13, 18, 14), skin, 0, 1.69, 0, 0, 0, 0, casual); head.scale.set(0.92, 1.1, 1);
  M_(new THREE.SphereGeometry(0.136, 16, 10, 0, Math.PI * 2, 0, 1.25), hair, 0, 1.71, -0.01, -0.3, 0, 0, casual).scale.set(0.95, 1.1, 1.02);
  for (const x of [-0.045, 0.045]) { M_(new THREE.SphereGeometry(0.016, 8, 6), mat(0x1b1410), x, 1.71, 0.118, 0, 0, 0, casual); M_(new THREE.BoxGeometry(0.04, 0.008, 0.01), hair, x, 1.738, 0.118, 0, 0, x > 0 ? -0.1 : 0.1, casual); }
  M_(new THREE.ConeGeometry(0.018, 0.045, 6), skin, 0, 1.68, 0.135, Math.PI / 2, 0, 0, casual);             // nose
  M_(new THREE.BoxGeometry(0.045, 0.006, 0.006), mat(0x8a4a3a), 0, 1.635, 0.12, 0, 0, 0, casual);         // mouth
  for (const x of [-0.12, 0.12]) M_(new THREE.SphereGeometry(0.025, 8, 6), skin, x, 1.69, 0, 0, 0, 0, casual).scale.set(0.5, 1, 0.8);
  // headset: band, ear cup, mic boom
  M_(new THREE.TorusGeometry(0.135, 0.008, 6, 20, Math.PI), mat(0x1c1e22), 0, 1.71, 0, 0, Math.PI / 2, 0, casual);
  M_(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), mat(0x1c1e22), 0.13, 1.69, 0, 0, 0, Math.PI / 2, casual);
  M_(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), mat(0x1c1e22), 0.1, 1.65, 0.07, 0.9, 0, -0.4, casual);
  const cLegL = limb(casual, 0.085, 0.66, khaki, -0.1, 0.9, 0), cLegR = limb(casual, 0.085, 0.66, khaki, 0.1, 0.9, 0);
  for (const L of [cLegL, cLegR]) { M_(new THREE.BoxGeometry(0.05, 0.12, 0.1), khaki, -0.08 * Math.sign(L.position.x || 1) * -1, -0.32, 0.0, 0, 0, 0, L); M_(new THREE.BoxGeometry(0.11, 0.07, 0.24), shoe, 0, -L.position.y + 0.055, 0.05, 0, 0, 0, L); M_(new THREE.BoxGeometry(0.115, 0.02, 0.25), sole, 0, -L.position.y + 0.012, 0.05, 0, 0, 0, L); }
  const cArmL = limb(casual, 0.058, 0.52, polo, -0.27, 1.42, 0, polo2), cArmR = limb(casual, 0.058, 0.52, polo, 0.27, 1.42, 0, polo2);
  for (const A of [cArmL, cArmR]) { const e = A.userData.end; M_(new THREE.BoxGeometry(0.06, 0.08, 0.035), skin, 0, e + 0.02, 0, 0, 0, 0, A); for (let f = 0; f < 4; f++) M_(new THREE.CapsuleGeometry(0.008, 0.03, 2, 4), skin, -0.022 + f * 0.015, e - 0.04, 0, 0, 0, 0, A); M_(new THREE.CapsuleGeometry(0.009, 0.025, 2, 4), skin, 0.035 * Math.sign(A.position.x), e, 0.012, 0, 0, 0.6 * Math.sign(A.position.x), A); }

  // ---- EMU-style suit: hard upper torso, bearings at shoulder/waist/wrist, PLSS with jet pack, bubble helmet ----
  const suit = new THREE.Group(); g.add(suit);
  const sw = mat(0xf2f1ec, { roughness: 0.78 }), swd = mat(0xe2e0d8, { roughness: 0.85 }), joint = metal(0xa8adb3), stripe = mat(col), grey = mat(PAL.grey), dk = mat(0x2a2d31);
  lathe([[0.001, 0], [0.22, 0.02], [0.25, 0.2], [0.29, 0.42], [0.31, 0.56], [0.25, 0.64], [0.16, 0.68], [0.15, 0.7]], sw, 0.92, 1.12, 0.92, suit);   // HUT
  M_(new THREE.TorusGeometry(0.22, 0.03, 8, 20), joint, 0, 0.94, 0, Math.PI / 2, 0, 0, suit).scale.set(1.12, 0.92, 1); // waist bearing
  lathe([[0.001, 0], [0.18, 0.02], [0.22, 0.14], [0.23, 0.26]], swd, 0.68, 1.1, 0.9, suit);                // lower torso / brief
  // PLSS backpack with vents, antenna and the SAFER jet pack underneath
  M_(new THREE.BoxGeometry(0.6, 0.74, 0.3), sw, 0, 1.28, -0.37, 0, 0, 0, suit);
  for (let i = 0; i < 5; i++) M_(new THREE.BoxGeometry(0.4, 0.02, 0.01), dk, 0, 1.12 + i * 0.05, -0.525, 0, 0, 0, suit);
  M_(new THREE.BoxGeometry(0.5, 0.12, 0.26), grey, 0, 1.71, -0.37, 0, 0, 0, suit);
  M_(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6), grey, 0.24, 1.88, -0.42, 0, 0, 0, suit);
  M_(new THREE.SphereGeometry(0.018, 8, 6), emis(0xff3030), 0.24, 2.06, -0.42, 0, 0, 0, suit).userData.blink = true;
  M_(new THREE.BoxGeometry(0.62, 0.2, 0.34), mat(0xd8d4c8), 0, 0.86, -0.4, 0, 0, 0, suit);                // SAFER
  for (const [x, y] of [[-0.28, 0.8], [0.28, 0.8], [-0.28, 0.93], [0.28, 0.93]]) M_(new THREE.CylinderGeometry(0.018, 0.026, 0.05, 8), dk, x, y, -0.58, Math.PI / 2, 0, 0, suit);
  M_(new THREE.BoxGeometry(0.03, 0.12, 0.08), grey, 0.33, 0.86, -0.25, 0, 0, 0, suit);                     // hand controller
  // display & control module, its knobs and umbilical hoses
  M_(new THREE.BoxGeometry(0.34, 0.15, 0.14), grey, 0, 1.0, 0.31, 0, 0, 0, suit);
  M_(new THREE.PlaneGeometry(0.12, 0.05), emis(0x7fe0ff, 0.6), -0.06, 1.04, 0.381, -0.5, 0, 0, suit);
  for (const [x, c] of [[0.05, PAL.red], [0.1, PAL.blue], [0.15, 0xffffff]]) M_(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 10), mat(c), x - 0.04, 0.98, 0.385, Math.PI / 2, 0, 0, suit);
  for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.14, 1.0, 0.36), new THREE.Vector3(s * 0.26, 1.08, 0.22), new THREE.Vector3(s * 0.3, 1.2, -0.05), new THREE.Vector3(s * 0.25, 1.28, -0.22)]), 12, 0.018, 6), dk); suit.add(h); }
  M_(new THREE.PlaneGeometry(0.14, 0.09), mat(PAL.blue), -0.33, 1.46, 0.06, 0, -Math.PI / 2, 0, suit);     // shoulder flag patch
  M_(new THREE.CircleGeometry(0.05, 16), mat(0x1d3f73), 0.17, 1.33, 0.27, -0.25, 0.3, 0, suit);            // mission patch
  M_(new THREE.TorusGeometry(0.05, 0.008, 6, 16), mat(0xd2a948), 0.17, 1.33, 0.272, -0.25, 0.3, 0, suit);
  M_(new THREE.BoxGeometry(0.12, 0.035, 0.005), stripe, -0.15, 1.36, 0.285, -0.25, -0.3, 0, suit);          // name-tag in your colour
  // helmet: neck ring, bubble, EVVA shell with gold visor, lights and camera
  M_(new THREE.TorusGeometry(0.17, 0.035, 8, 20), joint, 0, 1.6, 0, Math.PI / 2, 0, 0, suit);
  M_(new THREE.SphereGeometry(0.235, 22, 16), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0.3, roughness: 0.04, metalness: 0.1 }), 0, 1.76, 0.01, 0, 0, 0, suit);
  M_(new THREE.SphereGeometry(0.252, 22, 14, -Math.PI * 0.42, Math.PI * 0.84, 0.38, 1.2), new THREE.MeshStandardMaterial({ color: 0xe0b040, emissive: 0x1a1004, roughness: 0.06, metalness: 1.0 }), 0, 1.76, 0.01, 0, 0, 0, suit);
  M_(new THREE.SphereGeometry(0.262, 18, 10, 0, Math.PI * 2, 0, 0.72), sw, 0, 1.76, 0.01, 0, 0, 0, suit);
  M_(new THREE.TorusGeometry(0.255, 0.012, 6, 24, Math.PI * 0.95), swd, 0, 1.76, 0.01, 1.2, 0, Math.PI * 0.02, suit);
  for (const x of [-0.19, 0.19]) { M_(new THREE.BoxGeometry(0.07, 0.07, 0.12), grey, x, 1.9, 0.08, 0, 0, 0, suit); M_(new THREE.PlaneGeometry(0.05, 0.05), emis(0xfff4d0), x, 1.9, 0.141, 0, 0, 0, suit); }
  M_(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 10), dk, 0.19, 1.98, 0.08, Math.PI / 2, 0, 0, suit);
  // arms: shoulder bearing, upper arm, elbow, lower arm, wrist bearing, glove with fingers and a wrist checklist
  const sArmL = limb(suit, 0.095, 0.5, sw, -0.38, 1.44, 0, joint), sArmR = limb(suit, 0.095, 0.5, sw, 0.38, 1.44, 0, joint);
  for (const A of [sArmL, sArmR]) {
    const e = A.userData.end, sg = Math.sign(A.position.x);
    M_(new THREE.TorusGeometry(0.105, 0.025, 6, 14), joint, 0, 0.02, 0, Math.PI / 2, 0, 0, A);
    M_(new THREE.CylinderGeometry(0.103, 0.103, 0.06, 12), stripe, 0, -0.18, 0, 0, 0, 0, A);
    M_(new THREE.TorusGeometry(0.085, 0.022, 6, 14), joint, 0, e + 0.12, 0, Math.PI / 2, 0, 0, A);
    M_(new THREE.BoxGeometry(0.1, 0.11, 0.05), mat(0xd8d4c8), 0, e + 0.03, 0, 0, 0, 0, A);
    for (let f = 0; f < 4; f++) M_(new THREE.CapsuleGeometry(0.013, 0.04, 2, 4), mat(0xd8d4c8), -0.033 + f * 0.022, e - 0.05, 0, 0, 0, 0, A);
    M_(new THREE.CapsuleGeometry(0.014, 0.035, 2, 4), mat(0xd8d4c8), sg * 0.055, e, 0.018, 0, 0, sg * 0.6, A);
    M_(new THREE.BoxGeometry(0.09, 0.03, 0.07), grey, 0, e + 0.2, 0.06, 0, 0, 0, A);
  }
  // legs: thigh restraint, knee bearing, ankle ring, boot with sole and toe cap
  const sLegL = limb(suit, 0.125, 0.6, sw, -0.14, 0.82, 0, joint), sLegR = limb(suit, 0.125, 0.6, sw, 0.14, 0.82, 0, joint);
  for (const L of [sLegL, sLegR]) {
    const e = L.userData.end;
    M_(new THREE.CylinderGeometry(0.135, 0.135, 0.08, 14), stripe, 0, -0.2, 0, 0, 0, 0, L);
    M_(new THREE.TorusGeometry(0.115, 0.026, 6, 14), joint, 0, -L.position.y + 0.2, 0, Math.PI / 2, 0, 0, L);
    M_(new THREE.BoxGeometry(0.2, 0.15, 0.32), mat(0xe2e0d8), 0, -L.position.y + 0.11, 0.05, 0, 0, 0, L);
    M_(new THREE.BoxGeometry(0.21, 0.035, 0.34), mat(0x3a3d42), 0, -L.position.y + 0.018, 0.05, 0, 0, 0, L);
    M_(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe2e0d8), 0, -L.position.y + 0.09, 0.2, Math.PI / 2, 0, 0, L).scale.set(1, 0.7, 0.75);
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

