// Three.js scene: five stacked decks of the CSV Wolfram, components, players and effects.
import * as THREE from 'three';
import { DECKS, COMPS, COMP_IDS, LOCKERS, LIFT_A, SHELTER, DECK_H, ROOM_R, ROOM_H, SHAFT_R, EYE, ITEMS, WAYPOINTS } from './config.js';
import { polar } from './util.js';

const SEG = 16;
const mat = (color, o = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...o });
const emis = (color, intensity = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });

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
  const h = (width * c.height) / c.width;
  sp.scale.set(width, h, 1);
  return sp;
}
function planeLabel(text, w, h, { color = '#e8eef5', bg = '#141c26', size = 64, accent = null } = {}) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = Math.round((1024 * h) / w);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  if (accent) { ctx.fillStyle = accent; ctx.fillRect(0, c.height - 14, c.width, 14); ctx.fillRect(0, 0, 18, c.height); }
  ctx.fillStyle = color; ctx.font = `700 ${size}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
  ctx.fillText(text, 44, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}
function gridTexture(base, line) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line; g.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.03)';
  for (let i = 0; i < 400; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------- component meshes (front faces +z) ----------------
export function buildComp(kind, accent) {
  const g = new THREE.Group();
  const body = mat(0x5a6675), dark = mat(0x2b333d), acc = mat(accent);
  const screenMat = emis(0x2ad0c0, 0.9);
  let screen = null, glow = null;
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, 0); g.add(o); return o; };
  switch (kind) {
    case 'console':
      add(new THREE.BoxGeometry(1.6, 0.9, 0.8), body, 0, 0.45, 0);
      add(new THREE.BoxGeometry(1.7, 0.08, 0.95), dark, 0, 0.92, 0.05);
      screen = add(new THREE.PlaneGeometry(1.4, 0.7), screenMat, 0, 1.35, -0.15, -0.35);
      add(new THREE.BoxGeometry(1.5, 0.8, 0.06), dark, 0, 1.35, -0.2, -0.35);
      add(new THREE.BoxGeometry(0.6, 0.5, 0.6), acc, 0, 0.25, 1.1); // acceleration couch
      add(new THREE.BoxGeometry(0.6, 0.8, 0.12), acc, 0, 0.7, 1.4, -0.2);
      break;
    case 'board':
      add(new THREE.BoxGeometry(3.2, 2.0, 0.2), dark, 0, 1.6, -0.2);
      screen = add(new THREE.PlaneGeometry(3.0, 1.8), screenMat, 0, 1.6, -0.08);
      break;
    case 'machine': case 'scrubber':
      add(new THREE.BoxGeometry(2.0, 2.2, 1.4), body, 0, 1.1, -0.2);
      add(new THREE.CylinderGeometry(0.15, 0.15, 3.6, 8), acc, -0.7, 1.8, -0.6);
      add(new THREE.CylinderGeometry(0.15, 0.15, 3.6, 8), acc, 0.7, 1.8, -0.6);
      screen = add(new THREE.PlaneGeometry(0.8, 0.5), screenMat, 0, 1.5, 0.51);
      if (kind === 'scrubber') for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.25, 0.25, 1.2, 10), mat(0x50c8a0), -0.6 + i * 0.6, 0.6, 0.6);
      break;
    case 'tank':
      add(new THREE.CylinderGeometry(0.9, 0.9, 2.8, 14), body, 0, 1.4, -0.2);
      add(new THREE.TorusGeometry(0.92, 0.06, 6, 16), acc, 0, 0.6, -0.2, Math.PI / 2);
      add(new THREE.TorusGeometry(0.92, 0.06, 6, 16), acc, 0, 2.2, -0.2, Math.PI / 2);
      screen = add(new THREE.PlaneGeometry(0.5, 0.35), screenMat, 0, 1.4, 0.72);
      break;
    case 'hydro':
      for (let i = 0; i < 3; i++) {
        add(new THREE.BoxGeometry(2.6, 0.08, 1.0), body, 0, 0.5 + i * 0.9, 0);
        add(new THREE.BoxGeometry(2.4, 0.3, 0.8), mat(0x3fa04a), 0, 0.7 + i * 0.9, 0);
        add(new THREE.PlaneGeometry(2.4, 0.06), emis(0xff66dd, 1), 0, 1.25 + i * 0.9, 0, Math.PI / 2);
      }
      screen = add(new THREE.PlaneGeometry(0.5, 0.3), screenMat, 1.45, 1.4, 0.3, 0, -0.5);
      break;
    case 'bed':
      add(new THREE.BoxGeometry(1.0, 0.7, 2.1), body, 0, 0.35, 0);
      add(new THREE.BoxGeometry(0.9, 0.12, 1.9), mat(0xd8e4ee), 0, 0.76, 0);
      add(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), dark, -0.6, 1.2, -0.8);
      add(new THREE.BoxGeometry(1.0, 0.1, 0.4), dark, -0.2, 2.35, -0.8);
      screen = add(new THREE.PlaneGeometry(0.6, 0.4), screenMat, 0.7, 1.4, -0.9, 0, -0.4);
      break;
    case 'cryo':
      for (let i = 0; i < 4; i++) {
        const x = -1.2 + i * 0.8;
        add(new THREE.CylinderGeometry(0.33, 0.33, 2.1, 10), dark, x, 1.05, -0.2);
        const pod = add(new THREE.CylinderGeometry(0.28, 0.28, 1.9, 10), emis(0x66c8ff, 0.6), x, 1.05, -0.05);
        pod.userData.pod = i;
      }
      screen = add(new THREE.PlaneGeometry(0.6, 0.3), screenMat, 1.6, 1.4, 0.2, 0, -0.5);
      break;
    case 'reactor': {
      add(new THREE.CylinderGeometry(2.0, 2.3, 0.6, 16), dark, 0, 0.3, 0);
      add(new THREE.TorusGeometry(1.5, 0.45, 10, 24), acc, 0, 1.7, 0, Math.PI / 2);
      glow = add(new THREE.SphereGeometry(0.75, 16, 12), emis(0x88ddff, 1), 0, 1.7, 0);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(new THREE.BoxGeometry(0.3, 2.8, 0.3), body, Math.cos(a) * 2.0, 1.6, Math.sin(a) * 2.0); }
      add(new THREE.CylinderGeometry(0.5, 0.5, 1.0, 10), body, 0, 3.3, 0);
      screen = add(new THREE.PlaneGeometry(0.8, 0.45), screenMat, 1.6, 1.0, 1.7, -0.2, 0.6);
      break;
    }
    case 'cabinet':
      add(new THREE.BoxGeometry(1.6, 2.4, 0.6), body, 0, 1.2, -0.1);
      for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.2, 0.3, 0.05), i % 2 ? acc : dark, -0.5 + i * 0.25, 1.8, 0.22);
      screen = add(new THREE.PlaneGeometry(1.1, 0.6), screenMat, 0, 1.1, 0.21);
      break;
    case 'battery':
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) add(new THREE.BoxGeometry(0.6, 0.6, 0.9), i === 1 && j === 1 ? acc : body, -0.65 + i * 0.65, 0.35 + j * 0.65, 0);
      screen = add(new THREE.PlaneGeometry(0.5, 0.3), screenMat, 0, 2.2, 0.3);
      break;
    case 'pump':
      add(new THREE.CylinderGeometry(0.55, 0.55, 2.0, 12), body, 0, 0.7, 0, 0, 0).rotation.z = Math.PI / 2;
      add(new THREE.BoxGeometry(0.9, 0.9, 0.9), dark, 0, 0.7, 0.4);
      add(new THREE.CylinderGeometry(0.18, 0.18, 3.2, 8), mat(0x3a8fd0), -0.9, 2.0, -0.2);
      add(new THREE.CylinderGeometry(0.18, 0.18, 3.2, 8), mat(0xd05a3a), 0.9, 2.0, -0.2);
      screen = add(new THREE.PlaneGeometry(0.5, 0.3), screenMat, 0, 1.4, 0.4);
      break;
    case 'fab':
      add(new THREE.BoxGeometry(2.2, 2.0, 1.6), body, 0, 1.0, -0.2);
      add(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshLambertMaterial({ color: 0x223040, transparent: true, opacity: 0.6 }), 0, 1.2, 0.61);
      glow = add(new THREE.BoxGeometry(0.3, 0.3, 0.3), emis(0xffa040, 1), 0, 1.0, 0.1);
      screen = add(new THREE.PlaneGeometry(0.5, 0.3), screenMat, 0.85, 1.7, 0.61);
      break;
    case 'shelves':
      for (let j = 0; j < 3; j++) {
        add(new THREE.BoxGeometry(2.2, 0.08, 0.8), body, 0, 0.4 + j * 0.8, 0);
        for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.5, 0.45, 0.5), mat([0xf0b030, 0x9aa7b8, 0x50c8a0][(i + j) % 3]), -0.7 + i * 0.7, 0.68 + j * 0.8, 0);
      }
      screen = add(new THREE.PlaneGeometry(0.5, 0.3), screenMat, 1.2, 1.3, 0.3, 0, -0.5);
      break;
    case 'magazine':
      add(new THREE.BoxGeometry(2.2, 0.3, 1.0), dark, 0, 0.15, 0);
      for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 10), mat(0xc8ccd2), -0.6 + i * 0.6, 0.5, 0).rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(2.2, 2.2, 0.2), body, 0, 1.1, -0.6);
      screen = add(new THREE.PlaneGeometry(0.6, 0.35), screenMat, 0, 1.6, -0.49);
      break;
    case 'dronebay':
      add(new THREE.CylinderGeometry(1.4, 1.4, 0.15, 6), dark, 0, 0.08, 0);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const d = add(new THREE.BoxGeometry(0.4, 0.15, 0.4), acc, Math.cos(a) * 0.8, 0.3, Math.sin(a) * 0.8); d.userData.drone = i; }
      add(new THREE.BoxGeometry(2.4, 2.6, 0.3), body, 0, 1.3, -1.2);
      screen = add(new THREE.PlaneGeometry(0.8, 0.45), screenMat, 0, 1.6, -1.04);
      break;
    case 'drive': {
      add(new THREE.CylinderGeometry(1.0, 2.2, 3.2, 16), body, 0, 1.6, 0);
      for (let i = 0; i < 3; i++) add(new THREE.TorusGeometry(1.25 + i * 0.35, 0.12, 6, 20), acc, 0, 2.6 - i * 0.8, 0, Math.PI / 2);
      glow = add(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 12), emis(0xffa060, 1), 0, 3.25, 0);
      screen = add(new THREE.PlaneGeometry(0.7, 0.4), screenMat, 1.6, 1.0, 1.6, -0.2, 0.7);
      break;
    }
    case 'tanks':
      add(new THREE.SphereGeometry(1.0, 14, 10), body, -0.6, 1.2, -0.2);
      add(new THREE.SphereGeometry(0.8, 14, 10), body, 0.9, 1.0, 0.1);
      add(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8), acc, 0.2, 2.2, -0.2).rotation.z = Math.PI / 2;
      screen = add(new THREE.PlaneGeometry(0.5, 0.3), screenMat, 0.2, 0.8, 0.95);
      break;
    default:
      add(new THREE.BoxGeometry(1, 1, 1), body, 0, 0.5, 0);
  }
  const bb = new THREE.Box3().setFromObject(g);
  const light = add(new THREE.SphereGeometry(0.07, 8, 6), emis(0x40ff80), 0, 0, 0);
  light.position.set(bb.max.x - 0.15, bb.max.y + 0.08, bb.min.z + 0.15);
  return { group: g, screen, glow, light, height: bb.max.y };
}

export function buildFire() {
  const g = new THREE.Group();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff8030, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(2.6, 2.6, 1); glow.position.y = 1.0; g.add(glow);
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0.55, depthWrite: false }));
  smoke.position.y = 2.6; smoke.scale.set(1.6, 0.5, 1.6); smoke.userData.smoke = true; g.add(smoke);
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

export function buildAvatar(color) {
  const g = new THREE.Group();
  const suitMat = mat(color);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.9, 4, 8), suitMat); body.position.y = 0.85; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(0xe0c0a0)); head.position.y = 1.6; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), mat(0x101820)); visor.position.set(0, 1.63, 0.18); g.add(visor);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshLambertMaterial({ color: 0xaaddff, transparent: true, opacity: 0.35 }));
  helmet.position.y = 1.6; g.add(helmet);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.2), mat(0x8090a0)); pack.position.set(0, 1.05, -0.3); g.add(pack);
  const item = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.35), mat(0xffffff)); item.position.set(0.32, 0.9, 0.3); g.add(item);
  return { group: g, helmet, pack, item, body };
}

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000002);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 2000);
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x30302a, 0.9);
    this.scene.add(this.hemi);
    this.point = new THREE.PointLight(0xffffff, 40, 30, 1.6);
    this.scene.add(this.point);
    this.point2 = new THREE.PointLight(0xffffff, 15, 18, 1.6);
    this.scene.add(this.point2);
    this.decks = [];
    this.comps = {};
    this.avatars = {};
    this.itemMeshes = {};
    this.breachMeshes = {};
    this.shake = 0;
    this.flash = 0;
    this.buildStars();
    for (const d of DECKS) this.buildDeck(d);
    this.buildHandItem();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  buildStars() {
    const n = 2500, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(900);
      pos.set([v.x, v.y + 4 * DECK_H, v.z], i * 3);
      const t = Math.random();
      col.set(t < 0.1 ? [1, 0.8, 0.6] : t < 0.2 ? [0.7, 0.8, 1] : [1, 1, 1], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, sizeAttenuation: false }));
    this.scene.add(this.stars);
    const glowTex = (inner, outer) => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
      gr.addColorStop(0, inner); gr.addColorStop(0.25, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    };
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#ffffff', 'rgba(255,230,180,0.5)'), blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sun.scale.set(90, 90, 1);
    this.scene.add(this.sun);
    this.dest = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#ffe0c0', 'rgba(200,140,90,0.35)'), blending: THREE.AdditiveBlending, depthWrite: false }));
    this.dest.scale.set(14, 14, 1);
    this.scene.add(this.dest);
    this.battleFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#ffffff', 'rgba(255,200,120,0.6)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.battleFlash.scale.set(60, 60, 1);
    this.scene.add(this.battleFlash);
  }
  buildDeck(d) {
    const g = new THREE.Group();
    g.position.y = d.id * DECK_H;
    const accent = d.color;
    const floorMat = new THREE.MeshLambertMaterial({ map: gridTexture('#2a3038', '#1c2026') });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ROOM_R + 0.3, SEG), floorMat);
    floor.rotation.x = -Math.PI / 2; g.add(floor);
    const ceil = new THREE.Mesh(new THREE.CircleGeometry(ROOM_R + 0.3, SEG), mat(0x3a424c, { side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = ROOM_H; g.add(ceil);
    // floor accent ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(ROOM_R - 1.4, ROOM_R - 1.25, 48), emis(accent, 0.5));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; g.add(ring);
    // walls
    const segW = 2 * ROOM_R * Math.sin(Math.PI / SEG) + 0.05;
    const apo = ROOM_R * Math.cos(Math.PI / SEG);
    const wallMat = mat(0x4b5562), panelMat = mat(0x404954), glass = new THREE.MeshLambertMaterial({ color: 0x88aacc, transparent: true, opacity: 0.12, depthWrite: false });
    for (let i = 0; i < SEG; i++) {
      const aDeg = (i + 0.5) * (360 / SEG);
      const p = polar(aDeg, apo);
      const isWindow = d.id === 4 && (aDeg < 70 || aDeg > 290);
      const isPort = d.id === 3 && (aDeg > 100 && aDeg < 125);
      const w = new THREE.Group();
      w.position.set(p.x, 0, p.z); w.rotation.y = -(aDeg * Math.PI) / 180;
      if (isWindow || isPort) {
        const bot = new THREE.Mesh(new THREE.BoxGeometry(segW, 1.0, 0.2), wallMat); bot.position.y = 0.5; w.add(bot);
        const top = new THREE.Mesh(new THREE.BoxGeometry(segW, 0.6, 0.2), wallMat); top.position.y = ROOM_H - 0.3; w.add(top);
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(segW, ROOM_H - 1.6), glass); gl.position.set(0, 1.0 + (ROOM_H - 1.6) / 2, 0); w.add(gl);
      } else {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(segW, ROOM_H, 0.2), wallMat); wall.position.y = ROOM_H / 2; w.add(wall);
        const pn = new THREE.Mesh(new THREE.BoxGeometry(segW * 0.7, 1.4, 0.05), panelMat); pn.position.set(0, 1.9, 0.12); w.add(pn);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(segW, 0.08, 0.05), emis(accent, 0.6)); stripe.position.set(0, 0.35, 0.12); w.add(stripe);
      }
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.3, ROOM_H, 0.4), mat(0x2c333c));
      const rp = polar(i * (360 / SEG), ROOM_R - 0.15); rib.position.set(rp.x, ROOM_H / 2, rp.z); rib.rotation.y = -(i * 2 * Math.PI) / SEG;
      g.add(rib);
      g.add(w);
      // ceiling light panels
      const lp = polar(aDeg, ROOM_R - 3.5);
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), emis(0xdfe8ff, 0.9));
      lamp.rotation.x = Math.PI / 2; lamp.rotation.z = (aDeg * Math.PI) / 180; lamp.position.set(lp.x, ROOM_H - 0.02, lp.z);
      lamp.userData.lamp = true; g.add(lamp);
    }
    // lift shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, ROOM_H, 16), mat(0x56606c));
    shaft.position.y = ROOM_H / 2; g.add(shaft);
    const lp = polar(LIFT_A, SHAFT_R + 0.02);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, 0.1), mat(0x2a3440));
    door.position.set(lp.x, 1.15, lp.z); door.rotation.y = -(LIFT_A * Math.PI) / 180; g.add(door);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.12), emis(accent, 1));
    frame.position.set(lp.x, 2.35, lp.z); frame.rotation.y = door.rotation.y; g.add(frame);
    const sign = planeLabel(d.full, 2.9, 0.42, { size: 54, accent: '#' + accent.toString(16).padStart(6, '0') });
    const sp = polar(LIFT_A, SHAFT_R + 0.06);
    sign.position.set(sp.x, 2.85, sp.z); sign.rotation.y = Math.PI - (LIFT_A * Math.PI) / 180; g.add(sign);
    // also signage on the far side
    const sign2 = sign.clone(); const sp2 = polar(LIFT_A + 180, SHAFT_R + 0.06);
    sign2.position.set(sp2.x, 2.85, sp2.z); sign2.rotation.y = Math.PI - ((LIFT_A + 180) * Math.PI) / 180; g.add(sign2);
    const liftLabel = textSprite('LIFT', { width: 0.6, size: 30 }); liftLabel.position.set(polar(LIFT_A, SHAFT_R + 0.5).x, 2.6, polar(LIFT_A, SHAFT_R + 0.5).z); g.add(liftLabel);

    // emergency locker
    const lk = LOCKERS.find((l) => l.deck === d.id);
    const lkp = polar(lk.a, lk.r);
    const locker = new THREE.Group();
    const lb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.6), mat(0xb83030)); lb.position.y = 1.1; locker.add(lb);
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), emis(0xffffff, 1)); cross.position.set(0, 1.6, 0.31); locker.add(cross);
    for (let i = 0; i < 2; i++) { const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 8), mat(0xe03030)); ex.position.set(-0.3 + i * 0.6, 0.6, 0.4); locker.add(ex); }
    locker.position.set(lkp.x, 0, lkp.z); locker.rotation.y = -(lk.a * Math.PI) / 180;
    g.add(locker);
    const ll = textSprite('EMERGENCY LOCKER', { width: 1.5, size: 26, color: '#ffd0d0' }); ll.position.set(lkp.x * 0.97, 2.55, lkp.z * 0.97); g.add(ll);

    // storm shelter (habitation)
    if (d.id === SHELTER.deck) {
      const c = polar(SHELTER.a, SHELTER.r);
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(SHELTER.rad, SHELTER.rad, ROOM_H, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0x3060a0, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
      sh.position.set(c.x, ROOM_H / 2, c.z); g.add(sh);
      const fl = new THREE.Mesh(new THREE.CircleGeometry(SHELTER.rad, 16), emis(0x2050a0, 0.5)); fl.rotation.x = -Math.PI / 2; fl.position.set(c.x, 0.02, c.z); g.add(fl);
      const sl = textSprite('STORM SHELTER (water-walled)', { width: 2.2, size: 26, color: '#bcd8ff' }); sl.position.set(c.x, 2.9, c.z); g.add(sl);
    }
    // decorative crates on cargo deck / airlock
    if (d.id === 1) {
      for (let i = 0; i < 6; i++) { const cp = polar(150 + i * 9, 9.6 - (i % 2) * 0.9); const cr = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat([0x6a5a3a, 0x4a5a6a][i % 2])); cr.position.set(cp.x, 0.45 + (i > 3 ? 0.9 : 0), cp.z); cr.rotation.y = i; g.add(cr); }
      const ap = polar(200, ROOM_R - 0.3);
      const al = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.6, 0.3), mat(0x707a86)); al.position.set(ap.x, 1.3, ap.z); al.rotation.y = -(200 * Math.PI) / 180; g.add(al);
      const alw = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12), emis(0x80a0c0, 0.4)); alw.position.set(ap.x * 0.97, 1.7, ap.z * 0.97); alw.rotation.y = Math.PI - (200 * Math.PI) / 180; g.add(alw);
      const at = textSprite('AIRLOCK', { width: 0.9, size: 28 }); at.position.set(ap.x * 0.95, 2.9, ap.z * 0.95); g.add(at);
    }

    // components
    for (const id of COMP_IDS) {
      const c = COMPS[id];
      if (c.ext || c.deck !== d.id) continue;
      const built = buildComp(c.mesh, accent);
      const p = polar(c.a, c.r);
      built.group.position.set(p.x, 0, p.z);
      built.group.rotation.y = -(c.a * Math.PI) / 180;
      g.add(built.group);
      const label = textSprite(c.name, { width: Math.min(1.9, 0.065 * c.name.length + 0.3), size: 30 });
      label.position.set(p.x * 0.97, Math.min(ROOM_H - 0.35, Math.max(2.6, built.height + 0.45)), p.z * 0.97);
      g.add(label);
      const fire = buildFire();
      const fp2 = polar(c.a, c.r - c.fp * 0.75);
      fire.position.set(fp2.x, 0, fp2.z); fire.rotation.y = -(c.a * Math.PI) / 180;
      g.add(fire);
      this.comps[id] = { ...built, fire, label };
    }
    this.scene.add(g);
    this.decks.push(g);
  }
  buildHandItem() {
    this.hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.hand.position.set(0.3, -0.26, -0.55);
    this.hand.rotation.set(0.2, -0.3, 0);
    this.hand.visible = false;
    this.camera.add(this.hand);
  }

  // ---------------- per-frame update ----------------
  update(S, me, dt, now) {
    if (!S || !me) return;
    const deck = me.deck;
    this.decks.forEach((g, i) => { g.visible = i === deck; });
    const baseY = deck * DECK_H;
    // camera
    const bob = me.moving ? Math.sin(now * 9) * 0.035 : 0;
    const crouch = me.state === 'downed' ? -1.2 : 0;
    this.camera.position.set(me.x, baseY + EYE + bob + crouch, me.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(me.pitch, me.yaw, me.state === 'downed' ? 0.6 : 0);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.08;
      this.camera.position.x += (Math.random() - 0.5) * s; this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.rotation.z += (Math.random() - 0.5) * s * 0.5;
    }
    // lights follow deck; alert tint
    this.point.position.set(0, baseY + ROOM_H - 0.4, 0);
    this.point2.position.set(-Math.sin(me.yaw) * 4, baseY + ROOM_H - 0.5, -Math.cos(me.yaw) * 4);
    const red = S.alert === 'red', yel = S.alert === 'yellow';
    const pulse = 0.5 + 0.5 * Math.sin(now * 4);
    const powerDim = S.power && S.power.gen <= 0 && S.battery.charge <= 0.01 ? 0.35 : 1;
    const lc = red ? new THREE.Color(1, 0.35 + 0.3 * (1 - pulse), 0.3 + 0.3 * (1 - pulse)) : yel ? new THREE.Color(1, 0.9, 0.7) : new THREE.Color(1, 1, 1);
    this.point.color.copy(lc); this.point.intensity = 40 * powerDim;
    this.point2.color.copy(lc); this.point2.intensity = 15 * powerDim;
    this.hemi.intensity = 0.9 * powerDim;
    const dg = this.decks[deck];
    dg.traverse((o) => { if (o.userData.lamp) o.material.color.setRGB(lc.r * 0.9 * powerDim, lc.g * 0.9 * powerDim, lc.b * 0.9 * powerDim); });
    // space view (only visible through bridge windows / hab port)
    this.stars.position.y = baseY - 4 * DECK_H;
    const leg = Math.min(S.nav.leg + (S.nav.state === 'docked' ? 0 : 1), WAYPOINTS.length - 1);
    const dpos = WAYPOINTS[leg].pos;
    const f = S.nav.state === 'transit' ? Math.min(1, S.nav.x / S.nav.L) : 1;
    const distAU = Math.max(0.01, Math.hypot(dpos[0] - WAYPOINTS[S.nav.leg].pos[0], dpos[1] - WAYPOINTS[S.nav.leg].pos[1]) * (1 - f));
    this.dest.position.set(0, baseY + 40, -400);
    const ds = Math.min(120, 6 / distAU);
    this.dest.scale.set(ds, ds, 1);
    this.sun.position.set(-500, baseY + 120, 300);
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 1.5); }
    this.battleFlash.material.opacity = this.flash;
    this.battleFlash.position.set(Math.sin(now) * 200, baseY + 30, -300);

    // components
    for (const id in this.comps) {
      const v = this.comps[id], c = S.comps[id];
      if (!c) continue;
      const onDeck = COMPS[id].deck === deck;
      if (!onDeck) continue;
      const lp = v.label.position;
      v.label.visible = Math.hypot(lp.x - me.x, lp.z - me.z) > 3.2;
      const hp = c.hp;
      const col = hp <= 0 ? 0x111111 : c.fire > 0 ? (Math.sin(now * 12) > 0 ? 0xff3010 : 0x401000) : c.fault ? 0xff40ff : hp < 25 ? 0xff3030 : hp < 60 ? 0xffb020 : 0x40ff80;
      v.light.material.color.setHex(col);
      if (v.screen) {
        const off = hp <= 0 || c.pw <= 0 || !c.on;
        v.screen.material.color.setHex(off ? 0x050608 : c.fault ? (Math.sin(now * 6) > 0 ? 0x803080 : 0x200820) : hp < 25 ? 0x902020 : 0x2ad0c0);
      }
      v.fire.visible = c.fire > 0.02;
      if (v.fire.visible) {
        const s = 0.5 + c.fire * 1.3;
        v.fire.scale.set(s, s * (0.9 + 0.2 * Math.sin(now * 15)), s);
        v.fire.children.forEach((ch) => { if (ch.userData.flame) ch.scale.y = 0.7 + 0.5 * Math.abs(Math.sin(now * 8 + ch.userData.ph)); });
      }
    }
    // special glows
    const R = S.reactor;
    if (this.comps.reactor && deck === 2) {
      const g = this.comps.reactor.glow;
      const k = R.state === 'running' ? 0.4 + R.actual * 0.8 : R.state === 'preheat' ? 0.2 + 0.2 * pulse : 0.02;
      const unstable = R.state === 'running' && R.stab < 0.4;
      g.material.color.setRGB((unstable ? 1 : 0.55) * k, (unstable ? 0.4 : 0.85) * k, 1 * k);
      g.scale.setScalar(0.9 + 0.1 * Math.sin(now * (unstable ? 20 : 3)));
    }
    if (this.comps.drivecore && deck === 0) {
      const g = this.comps.drivecore.glow, t = S.drive.ignited ? 0.3 + S.drive.throttle : 0.05;
      g.material.color.setRGB(t, t * 0.6, t * 0.3);
    }
    if (this.comps.fabricator && deck === 1) {
      const g = this.comps.fabricator.glow;
      g.visible = S.fab.queue.length > 0; g.rotation.y += dt * 3;
    }
    if (this.comps.cryo && deck === 3) {
      this.comps.cryo.group.children.forEach((ch) => { if (ch.userData.pod !== undefined) ch.material.color.setHex(ch.userData.pod < S.pods ? 0x4aa0d8 : 0x101418); });
    }
    if (this.comps.dronebay && deck === 1) {
      const busy = S.drones.jobs.length;
      this.comps.dronebay.group.children.forEach((ch) => { if (ch.userData.drone !== undefined) ch.visible = ch.userData.drone >= busy; });
    }

    this.updateBreaches(S, deck, now);
    this.updateItems(S, deck);
    this.updateAvatars(S, me, deck, dt, now);
    // hand item
    if (me.item) { this.hand.visible = true; this.hand.material.color.setHex(ITEMS[me.item.type].color); }
    else this.hand.visible = false;
  }
  updateBreaches(S, deck, now) {
    const seen = new Set();
    for (const b of S.breaches) {
      seen.add(b.id);
      let m = this.breachMeshes[b.id];
      if (!m) {
        m = new THREE.Group();
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.25 + b.size * 0.3, 7), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        m.add(hole);
        const rim = new THREE.Mesh(new THREE.RingGeometry(0.25 + b.size * 0.3, 0.4 + b.size * 0.35, 7), mat(0x8a5030));
        m.add(rim);
        const vapor = new THREE.Mesh(new THREE.ConeGeometry(0.6 + b.size * 0.4, 2.2, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xddeeff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
        vapor.rotation.x = -Math.PI / 2; vapor.position.z = 1.1; m.add(vapor);
        m.userData.vapor = vapor;
        const lab = textSprite('HULL BREACH', { width: 1.1, size: 26, color: '#ffb0a0' }); lab.position.set(0, 0.7, 0.3); m.add(lab);
        const p = polar(b.a, ROOM_R - 0.32);
        m.position.set(p.x, b.deck * DECK_H + b.y, p.z);
        m.rotation.y = -(b.a * Math.PI) / 180;
        this.scene.add(m);
        this.breachMeshes[b.id] = m;
      }
      m.visible = b.deck === deck;
      const d = S.decks[b.deck];
      const P = d.o2 + d.n2 + d.co2;
      m.userData.vapor.visible = P > 3;
      m.userData.vapor.material.opacity = Math.min(0.4, P / 250) * (0.7 + 0.3 * Math.sin(now * 30));
    }
    for (const id in this.breachMeshes) if (!seen.has(id)) { this.scene.remove(this.breachMeshes[id]); delete this.breachMeshes[id]; }
  }
  updateItems(S, deck) {
    const seen = new Set();
    for (const it of S.items) {
      seen.add(it.id);
      let m = this.itemMeshes[it.id];
      if (!m) {
        m = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.45), mat(ITEMS[it.type].color));
        const lab = textSprite(ITEMS[it.type].name, { width: 1.0, size: 26 }); lab.position.y = 0.55; m.add(lab);
        this.scene.add(m);
        this.itemMeshes[it.id] = m;
      }
      m.position.set(it.x, it.deck * DECK_H + 0.15, it.z);
      m.visible = it.deck === deck;
    }
    for (const id in this.itemMeshes) if (!seen.has(id)) { this.scene.remove(this.itemMeshes[id]); delete this.itemMeshes[id]; }
  }
  updateAvatars(S, me, deck, dt, now) {
    const seen = new Set();
    for (const p of Object.values(S.players)) {
      if (p.id === me.id || !p.connected) continue;
      seen.add(p.id);
      let a = this.avatars[p.id];
      if (!a) {
        a = buildAvatar(p.color);
        a.label = textSprite(p.name, { width: 0.6, size: 30, color: p.color });
        a.label.position.y = 2.2; a.group.add(a.label);
        a.x = p.x; a.z = p.z; a.yaw = p.yaw;
        this.scene.add(a.group);
        this.avatars[p.id] = a;
      }
      const k = Math.min(1, dt * 12);
      a.x += (p.x - a.x) * k; a.z += (p.z - a.z) * k;
      let dy = p.yaw - a.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      a.yaw += dy * k;
      a.group.position.set(a.x, p.deck * DECK_H, a.z);
      a.group.rotation.set(0, a.yaw + Math.PI, 0);
      a.group.visible = p.deck === deck && p.state !== 'dead' && p.state !== 'spectator';
      a.helmet.visible = p.suit; a.pack.visible = p.suit;
      a.item.visible = !!p.item; if (p.item) a.item.material.color.setHex(ITEMS[p.item.type].color);
      if (p.state === 'downed') { a.group.rotation.x = -Math.PI / 2; a.group.position.y += 0.3; a.label.material.color.setHex(Math.sin(now * 6) > 0 ? 0xff4040 : 0xffffff); }
      else { a.group.rotation.x = 0; a.label.material.color.setHex(0xffffff); }
    }
    for (const id in this.avatars) if (!seen.has(id)) { this.scene.remove(this.avatars[id].group); delete this.avatars[id]; }
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
