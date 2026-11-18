// Three.js scene: five stacked decks of the CSV Wolfram, the hull exterior, crew and effects.
// Models and textures live in models.js (ISS-era, NASA-style look).
import * as THREE from 'three';
import { DECKS, COMPS, COMP_IDS, DECK_H, ROOM_R, ROOM_H, SHAFT_R, EYE, ITEMS, WAYPOINTS, EXT, EXT_DECK, RING, RING_DECK, G0 } from './config.js';
import { polar, compDeck } from './util.js';
import { mat, textSprite, buildComp, buildFire, buildAvatar } from './models.js';
import { buildPlanet } from './planet.js';
import { buildStation } from './npc.js';
import { buildDeckInterior, buildRingInterior, ringPlace, RING_CENTER } from './interior.js';
import { buildShipExterior, buildExtComp, EXT_CAMS, flashTex } from './ship.js';
import { SL } from './hull.js';
import { qrot, qconj } from './attitude.js';
import { projBodyDir } from './combat.js';
import { podState, POD_CRADLE } from './crew.js';

// ---- small craft and cargo outside the hull ----
function buildWorkPod() {
  const g = new THREE.Group();
  const white = mat(0xe8e6df, 0.45, 0.2), dark = mat(0x2b2f35, 0.6, 0.4), orange = mat(0xff7a2a, 0.5), glass = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.55 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), white); body.scale.set(1, 0.95, 1.15); g.add(body);
  const win = new THREE.Mesh(new THREE.SphereGeometry(1.0, 24, 12, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.28, Math.PI * 0.42), glass); win.scale.set(1.04, 1.0, 1.2); win.rotation.y = Math.PI; g.add(win);
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 8, 32), orange); band.rotation.x = Math.PI / 2; g.add(band);
  for (const [x, y, z] of [[1, 0.6, 0.8], [-1, 0.6, 0.8], [1, -0.6, 0.8], [-1, -0.6, 0.8], [1, 0.6, -0.8], [-1, 0.6, -0.8], [1, -0.6, -0.8], [-1, -0.6, -0.8]]) { const q = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), dark); q.position.set(x * 0.85, y * 0.85, z * 0.85); g.add(q); }
  // manipulator arm with a claw, under the window
  const arm = new THREE.Group(); arm.position.set(0, -0.7, -0.9); g.add(arm);
  const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 10), dark); a1.rotation.x = Math.PI / 2 - 0.5; a1.position.set(0, -0.2, -0.4); arm.add(a1);
  for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.35), orange); c.position.set(s * 0.12, -0.45, -0.9); c.rotation.y = s * 0.3; arm.add(c); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 })); lamp.position.set(0, 1.08, 0); g.add(lamp); g.userData.lamp = lamp;
  g.userData.arm = arm;
  return g;
}
function buildCradle() {
  const g = new THREE.Group(), m = mat(0x9aa2aa, 0.5, 0.7), y = mat(0xe8c040, 0.5);
  for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.08, 8, 24, Math.PI), m); r.rotation.y = Math.PI / 2; r.position.x = s * 0.6; r.rotation.z = Math.PI; g.add(r); }
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 2.4), m); base.position.y = -1.35; g.add(base);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.05, 0.3), y); strip.position.set(0, -1.22, 1.0); g.add(strip);
  const lab = textSprite('WORK POD', { width: 1.2, size: 30 }); lab.position.set(0, -1.7, 0); g.add(lab);
  return g;
}
function buildContainer(kind) {
  const g = new THREE.Group();
  if (kind === 'drone') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), mat(0x6d7682, 0.5, 0.6)); g.add(b);
    for (const [x, z] of [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 6, 16), mat(0x2b2f35, 0.6)); r.rotation.x = Math.PI / 2; r.position.set(x, 0, z); g.add(r); }
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 })); l.position.y = 0.32; g.add(l); g.userData.lamp = l;
  } else {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 4.0), mat(0x4a7aa8, 0.6, 0.3)); g.add(b);
    for (const z of [-1.95, 1.95]) { const f = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, 0.12), mat(0xd0d4d8, 0.5, 0.6)); f.position.z = z; g.add(f); }
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd040 })); l.position.y = 1.3; g.add(l); g.userData.lamp = l;
    const lab = textSprite('CARGO — UNCLAIMED', { width: 1.8, size: 30 }); lab.position.y = 1.9; g.add(lab);
  }
  return g;
}
function buildScoutDrone(color) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), mat(0x30343a, 0.5, 0.5)); g.add(b);
  const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color })); l.position.z = -0.4; g.add(l);
  const lab = textSprite('SCOUT', { width: 0.6, size: 30, color }); lab.position.y = 0.9; g.add(lab);
  return g;
}

export { textSprite, buildComp, buildFire, buildAvatar, buildShipExterior, buildExtComp, buildRingInterior, buildDeckInterior };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const XAX = new THREE.Vector3(1, 0, 0), ZAX = new THREE.Vector3(0, 0, 1);
// Soft studio-style environment for PBR reflections (bright overhead panels, dim floor)
function makeEnvironment(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: 0x5a5e66, side: THREE.BackSide }));
  env.add(room);
  const panel = (w, h, x, y, z, rx, c = 0xffffff, k = 3) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.x = rx; env.add(m); };
  panel(12, 4, 0, 4.9, 0, Math.PI / 2); panel(4, 4, -9.9, 2, 0, 0, 0xfff0e0, 2); panel(6, 2, 0, 1, -9.9, 0, 0xcfe0ff, 1.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: 0x23262b })); floor.rotation.x = -Math.PI / 2; floor.position.y = -4.9; env.add(floor);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.04);
  pm.dispose();
  return rt.texture;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------- live console screens: retro amber/orange phosphor ----------
const BOOT_LEN = 2.2;
const BOOT_LINES = ['WOLFRAM PCS FIRMWARE 4.2.17', 'MTV-W1 SHIPYARD  LUNA  2131', 'MEM CHECK ......... 65536K OK', 'RELAY BUS ......... 24/24 SET', 'DATA LINK ......... OK', 'LOADING '];
function drawBoot(cv, name, t) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const F = (sz, b = '') => `${b}${sz}px "Share Tech Mono", ui-monospace, Menlo, monospace`;
  g.shadowBlur = 0; g.fillStyle = SBG; g.fillRect(0, 0, W, H);
  if (t < 0) return;
  if (t < 0.28) { // CRT warm-up: a bright line that opens vertically
    const k = t / 0.28, h = Math.max(2, H * k * k);
    g.fillStyle = `rgba(255,190,120,${1 - k * 0.6})`; g.fillRect(W * 0.5 * (1 - Math.min(1, k * 3)), H / 2 - h / 2, W * Math.min(1, k * 3), h);
    return;
  }
  const fs = Math.max(13, Math.round(W / 24));
  g.shadowColor = AMB; g.shadowBlur = 6; g.font = F(fs); g.fillStyle = AMB;
  const n = Math.min(BOOT_LINES.length, Math.floor((t - 0.28) / 0.17) + 1);
  for (let i = 0; i < n; i++) g.fillText(BOOT_LINES[i] + (i === BOOT_LINES.length - 1 ? name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 14) + '.SYS' : ''), 8, 8 + fs * (i + 1.1));
  if (t > 1.3) {
    const k = Math.min(1, (t - 1.3) / 0.6), y = 8 + fs * (BOOT_LINES.length + 1.6);
    g.strokeStyle = AMB; g.lineWidth = 2; g.strokeRect(8, y, W - 16, fs * 0.8);
    g.fillRect(10, y + 2, (W - 20) * k, fs * 0.8 - 4);
  }
  if (Math.floor(t * 4) % 2 === 0) g.fillRect(8, H - fs - 6, fs * 0.6, fs * 0.9); // cursor
  if (t > BOOT_LEN - 0.25) { g.fillStyle = `rgba(255,200,140,${(t - (BOOT_LEN - 0.25)) * 3})`; g.fillRect(0, 0, W, H); }
  g.shadowBlur = 0; g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let yy = 0; yy < H; yy += 3) g.fillRect(0, yy, W, 1);
}
const AMB = '#ff8a1e', AMB_D = '#a8581a', AMB_B = '#ffc27a', SRED = '#ff3b2f', SYEL = '#ffd23f', SBG = '#0a0400';
function drawScreen(cv, info, st, now) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const F = (sz, b = '') => `${b}${sz}px "Share Tech Mono", ui-monospace, Menlo, monospace`;
  g.shadowBlur = 0; g.fillStyle = SBG; g.fillRect(0, 0, W, H);
  if (st === 'off') { g.fillStyle = '#1c0b02'; g.font = F(20, 'bold '); g.textAlign = 'center'; g.fillText('— NO POWER —', W / 2, H / 2); g.textAlign = 'left'; return; }
  if (st === 'dead') {
    for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(255,${(120 + Math.random() * 90) | 0},40,${Math.random() * 0.4})`; g.fillRect(Math.random() * W, Math.random() * H, 3, 2); }
    g.fillStyle = SRED; g.font = F(22, 'bold '); g.textAlign = 'center'; g.fillText('// SIGNAL LOST //', W / 2, H / 2); g.textAlign = 'left'; return;
  }
  const fs = Math.max(14, Math.round(W / 21)), hh = fs + 10;
  g.fillStyle = AMB; g.fillRect(0, 0, W, hh);
  g.save(); g.beginPath(); g.rect(W - 90, 0, 90, hh); g.clip(); g.fillStyle = SBG;
  for (let x = W - 110; x < W + 20; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 8, 0); g.lineTo(x - 2, hh); g.lineTo(x - 10, hh); g.fill(); }
  g.restore();
  g.fillStyle = SBG; g.font = F(fs, 'bold '); g.fillText(String(info.title || '').slice(0, 24), 8, fs + 2);
  g.shadowColor = AMB; g.shadowBlur = 6;
  let y = hh + fs + 6; const lh = fs + 5;
  for (const [lab, val, c] of info.lines || []) {
    if (y > H - 4) break;
    g.font = F(fs - 1); g.fillStyle = AMB_D; g.fillText(lab, 8, y);
    g.fillStyle = c === 'bad' ? SRED : c === 'warn' ? SYEL : AMB_B; g.textAlign = 'right'; g.fillText(String(val), W - 8, y); g.textAlign = 'left';
    y += lh;
  }
  for (const [lab, v, c] of info.bars || []) {
    if (y + fs > H) break;
    g.font = F(fs - 2); g.fillStyle = AMB_D; g.fillText(lab, 8, y); y += 5;
    const n = 24, bw = (W - 16) / n, on = Math.round(clamp01(v) * n);
    for (let i = 0; i < n; i++) { g.fillStyle = i < on ? (c === 'bad' ? SRED : c === 'warn' ? SYEL : AMB) : '#2a1204'; g.fillRect(8 + i * bw, y, bw - 2, fs * 0.6); }
    y += fs * 0.6 + lh * 0.7;
  }
  const banner = (col, text) => { g.shadowBlur = 0; g.fillStyle = col; g.fillRect(0, H / 2 - fs, W, fs * 2); g.fillStyle = SBG; g.font = F(fs, 'bold '); g.textAlign = 'center'; g.fillText(text, W / 2, H / 2 + fs * 0.35); g.textAlign = 'left'; };
  if (st === 'fault' && Math.sin(now * 6) > 0) banner(SRED, 'SOFTWARE FAULT // REBOOT');
  if (st === 'fire') banner(Math.sin(now * 8) > 0 ? SRED : SYEL, '!! FIRE !!');
  g.shadowBlur = 0; g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let yy = 0; yy < H; yy += 3) g.fillRect(0, yy, W, 1);
  const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.6)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
}


export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.environment = makeEnvironment(this.renderer);
    this.scene.background = new THREE.Color(0x000002);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 9000);
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0xf2f4ff, 0x4a4a44, 1.0);
    this.scene.add(this.hemi);
    this.point = new THREE.PointLight(0xffffff, 40, 30, 1.6);
    this.scene.add(this.point);
    this.point2 = new THREE.PointLight(0xffffff, 15, 18, 1.6);
    this.scene.add(this.point2);
    this.sunlight = new THREE.DirectionalLight(0xfff6e8, 0);
    this.sunlight.position.set(-60, 40, 30);
    const sc = this.sunlight.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 500;
    this.sunlight.shadow.bias = -0.0004; this.sunlight.shadow.normalBias = 0.05;
    this.scene.add(this.sunlight); this.scene.add(this.sunlight.target);
    // ceiling key light for the current deck: soft contact shadows under consoles, crew and kit
    this.key = new THREE.SpotLight(0xfff8f0, 0, 24, 1.25, 0.6, 1.2);
    this.key.shadow.camera.near = 0.5; this.key.shadow.camera.far = 14; this.key.shadow.bias = -0.0006; this.key.shadow.normalBias = 0.03;
    this.scene.add(this.key); this.scene.add(this.key.target);
    this.decks = [];
    this.comps = {};
    this.avatars = {};
    this.itemMeshes = {};
    this.breachMeshes = {};
    this.shake = 0; this.flash = 0;
    this.planetKind = null; this.planet = null;
    this.buildStars();
    for (const d of DECKS) { const { group, comps } = buildDeckInterior(d); this.scene.add(group); this.decks.push(group); Object.assign(this.comps, comps); }
    this.exterior = buildShipExterior(this.comps);
    this.exterior.position.y = EXT_DECK * DECK_H + 60;
    this.scene.add(this.exterior);
    this.decks.push(this.exterior);
    this.ringInt = buildRingInterior();
    this.scene.add(this.ringInt);
    this.decks.push(this.ringInt);
    for (const g of this.decks) g.traverse((o) => { if (o.isMesh && !o.material.isMeshBasicMaterial && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
    this.stationId = null; this.station = null; this.earth = null;
    this.fxItems = []; // tracers, missiles, flashes on the hull
    this.buildFxPools();
    this.tether = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V()]), new THREE.LineBasicMaterial({ color: 0xffe08a }));
    this.tether.frustumCulled = false; this.scene.add(this.tether);
    this.setQuality('medium');
    this.buildHandItem();
    this.setupScreens();
    this.screenInfo = null; // set by the game: (S, compId) => { title, lines, bars }
    this.scrT = 0; this.focus = null; this.focusT = 0; this.focusDir = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  setQuality(q) {
    this.quality = q;
    const r = this.renderer, dpr = window.devicePixelRatio || 1;
    r.setPixelRatio(q === 'low' ? 1 : q === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 2));
    r.shadowMap.enabled = q !== 'low';
    const ms = q === 'high' ? 2048 : 1024;
    for (const L of [this.sunlight, this.key]) { L.castShadow = q !== 'low'; L.shadow.mapSize.set(ms, ms); if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } }
    this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); });
    this.resize();
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  buildStars() {
    const n = 3500, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(6000);
      pos.set([v.x, v.y, v.z], i * 3);
      const t = Math.random(), b = 0.5 + Math.random() * 0.5;
      col.set((t < 0.1 ? [1, 0.8, 0.6] : t < 0.2 ? [0.7, 0.8, 1] : [1, 1, 1]).map((c) => c * b), i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, sizeAttenuation: false }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
    const glowTex = (inner, outer) => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
      gr.addColorStop(0, inner); gr.addColorStop(0.25, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    };
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#ffffff', 'rgba(255,230,180,0.5)'), blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sun.scale.set(500, 500, 1);
    this.scene.add(this.sun);
    this.dest = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#ffe0c0', 'rgba(200,140,90,0.35)'), blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.dest);
    this.battleFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#ffffff', 'rgba(255,200,120,0.6)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.battleFlash.scale.set(400, 400, 1);
    this.scene.add(this.battleFlash);
  }
  setupScreens() {
    for (const id in this.comps) {
      const v = this.comps[id];
      if (!v.screen) continue;
      const p = v.screen.geometry.parameters;
      const W = 400, H = Math.max(120, Math.round(W / (p.width / p.height)));
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      v.screen.material = v.screen.material.clone(); v.screen.material.map = tex; v.screen.material.color.setHex(0xffffff); v.screen.material.needsUpdate = true;
      v.canvas = cv; v.tex = tex;
      drawScreen(cv, { title: COMPS[id].name.toUpperCase(), lines: [['BOOT', 'OK']] }, 'ok', 0);
      v.extras = (v.group.userData.extras || []).map((mesh, k) => {
        const pp = mesh.geometry.parameters, c2 = document.createElement('canvas'); c2.width = 320; c2.height = Math.round(320 / (pp.width / pp.height));
        const t2 = new THREE.CanvasTexture(c2); t2.colorSpace = THREE.SRGBColorSpace; mesh.material.map = t2; mesh.material.needsUpdate = true;
        return { canvas: c2, tex: t2, key: id + '#' + k };
      });
    }
  }
  drawScreens(S, me, now, onlyBooting = false) {
    for (const id in this.comps) {
      const v = this.comps[id];
      if (!v.canvas || compDeck(id) !== me.deck || id === this.focus) continue;
      const p = v.group.position;
      const dist = Math.hypot(p.x - me.x, p.z - me.z);
      if (dist > 16) continue;
      const c = S.comps[id];
      const st = c.hp <= 0 ? 'dead' : !c.on || c.pw <= 0 ? 'off' : c.fire > 0 ? 'fire' : COMPS[id].computer && c.fault ? 'fault' : 'ok';
      const live = st !== 'off' && st !== 'dead';
      if (v.wasLive === undefined) { v.wasLive = live; if (live) { v.bootAt = now + Math.random() * 1.6; v.bootSnd = false; } }
      else if (live && !v.wasLive) { v.bootAt = now + Math.random() * 0.8; v.bootSnd = false; }
      v.wasLive = live;
      const booting = live && v.bootAt !== undefined && now - v.bootAt < BOOT_LEN;
      if (onlyBooting && !booting) continue;
      if (booting) {
        if (!v.bootSnd && now >= v.bootAt && this.onScreenBoot) { v.bootSnd = true; this.onScreenBoot(id, dist); }
        drawBoot(v.canvas, COMPS[id].name, now - v.bootAt);
        v.tex.needsUpdate = true;
        continue;
      }
      let info;
      try { info = this.screenInfo ? this.screenInfo(S, id) : null; } catch (e) { info = null; }
      drawScreen(v.canvas, info || { title: COMPS[id].name.toUpperCase(), bars: [['INTEGRITY', c.hp / 100, '']] }, st, now);
      v.tex.needsUpdate = true;
      for (const x of v.extras || []) { let i2 = null; try { i2 = this.screenInfo ? this.screenInfo(S, x.key) : null; } catch (e) {} drawScreen(x.canvas, i2 || { title: '—' }, st, now); x.tex.needsUpdate = true; }
    }
  }
  // ---------- console focus: fly the camera square onto a screen ----------
  setFocus(id) {
    if (id && this.comps[id] && this.comps[id].screen) { this.focus = id; this.focusDir = 1; }
    else if (this.focus) this.focusDir = -1;
  }
  focusPose(mesh) {
    mesh.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    mesh.matrixWorld.decompose(pos, q, sc);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const p = mesh.geometry.parameters, sw = p.width * sc.x, sh = p.height * sc.y;
    const vw = window.innerWidth, vh = window.innerHeight;
    const inset = this.focusInset ? this.focusInset() : 0; // px reserved on the left (tutorial box)
    const targetH = Math.min((vh - 150) * 0.95, ((vw - inset) * 0.9) / (sw / sh));
    const tanH = Math.tan((this.camera.fov * Math.PI) / 360);
    const d = (sh * vh) / (2 * tanH * targetH);
    const shift = (34 / vh) * 2 * d * tanH; // lift the screen up a little to leave room for the exit button
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const target = pos.clone().addScaledVector(up, -shift).addScaledVector(right, -((inset / 2) / vh) * 2 * d * tanH);
    const eye = target.clone().addScaledVector(normal, d);
    const m = new THREE.Matrix4().lookAt(eye, target, up);
    return { pos: eye, quat: new THREE.Quaternion().setFromRotationMatrix(m) };
  }
  focusRect() {
    if (!this.focus || this.focusT < 0.05) return null;
    const mesh = this.comps[this.focus].screen;
    const p = mesh.geometry.parameters, w = p.width / 2, h = p.height / 2;
    this.camera.updateMatrixWorld();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of [[-w, -h], [w, -h], [w, h], [-w, h]]) {
      const v = new THREE.Vector3(x, y, 0).applyMatrix4(mesh.matrixWorld).project(this.camera);
      const sx = (v.x * 0.5 + 0.5) * window.innerWidth, sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
      x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, t: this.focusT };
  }
  buildHandItem() {
    this.hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.hand.position.set(0.24, -0.22, -0.6);
    this.hand.rotation.set(0.2, -0.3, 0);
    this.hand.visible = false;
    this.camera.add(this.hand);
  }

  // ---------------- spaces: where a (deck, x, y, z) is in the scene ----------------
  // returns world position for a point in a space; for the ring also the frame quaternion
  spacePos(deck, x, y, z, out = new THREE.Vector3()) {
    if (deck === RING_DECK) { const th = -z / RING.R, rr = RING.R - y; return out.set(x, -rr * Math.cos(th), -rr * Math.sin(th)).add(RING_CENTER); }
    if (deck === EXT_DECK) return out.set(x, y, z).add(this.exterior.position);
    return out.set(x, deck * DECK_H + y, z);
  }
  spaceQuat(deck, z, out = new THREE.Quaternion()) {
    if (deck === RING_DECK) return out.setFromAxisAngle(XAX, -z / RING.R);
    return out.identity();
  }

  // ---------------- per-frame update ----------------
  update(S, me, dt, now, ctl) {
    if (!S || !me) return;
    this._meId = me.id;
    if (!this.cockpit) { // the inside of the work pod, around the pilot's head
      const c = this.cockpit = new THREE.Group(), fm = new THREE.MeshBasicMaterial({ color: 0x3a4048 }), lm = new THREE.MeshBasicMaterial({ color: 0xff8a1e });
      for (const [x, y, rz] of [[-0.55, 0, 0.2], [0.55, 0, -0.2]]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1.4, 0.025), fm); st.position.set(x * 1.15, y, -0.7); st.rotation.z = rz; c.add(st); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.025, 0.025), fm); top.position.set(0, 0.5, -0.72); c.add(top);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.3), fm); dash.position.set(0, -0.5, -0.62); dash.rotation.x = -0.5; c.add(dash);
      for (const x of [-0.53, 0.53]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.005, 1.3, 0.005), lm); e.position.set(x * 1.13, 0, -0.68); e.rotation.z = x < 0 ? 0.2 : -0.2; c.add(e); }
      for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.015), i % 3 ? lm : new THREE.MeshBasicMaterial({ color: 0x40ff90 })); l.position.set(-0.18 + i * 0.06, -0.43, -0.55); l.rotation.x = -0.5; c.add(l); }
      c.visible = false; this.camera.add(c);
    }
    this.cockpit.visible = !!me.pod && me.deck === EXT_DECK;
    const deck = me.deck;
    const r = Math.hypot(me.x, me.z);
    const nearTrunk = deck <= 4 && r < 6.5;
    // every pressurised deck is drawn whenever you are inside the hull stack, so you can look (and climb, or float)
    // straight down the trunk to the drive deck; the ring and the exterior only when you are in them
    void nearTrunk;
    this.decks.forEach((g, i) => { g.visible = i === deck || (deck <= 4 && i <= 4); });
    const walking = ctl ? !ctl.fl : true;
    const bob = me.moving && walking && (me.y || 0) < 0.05 ? Math.sin(now * 9) * 0.035 : 0;
    const crouch = me.state === 'downed' ? -1.2 : 0;
    const cam = this.camera;
    const yawPitch = new THREE.Quaternion().setFromEuler(new THREE.Euler(me.pitch, me.yaw, me.state === 'downed' ? 0.6 : 0, 'YXZ'));
    this.spacePos(deck, me.x, (me.y || 0) + EYE + bob + crouch, me.z, cam.position);
    if (deck === RING_DECK) {
      const G = ctl && ctl.gm !== undefined ? [S.drive.g * G0, -(S.ring ? S.ring.g : 0) * G0] : [0, -1];
      const tilt = Math.abs(G[1]) > 0.3 || Math.abs(G[0]) > 0.3 ? Math.atan2(G[0], Math.abs(G[1]) + 1e-3) : 0;
      this.ringTilt = (this.ringTilt || 0) + (tilt - (this.ringTilt || 0)) * Math.min(1, dt * 2);
      cam.quaternion.copy(this.spaceQuat(deck, me.z)).multiply(new THREE.Quaternion().setFromAxisAngle(ZAX, this.ringTilt)).multiply(yawPitch);
    } else cam.quaternion.copy(yawPitch);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.08;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s;
      cam.rotateZ((Math.random() - 0.5) * s * 0.5);
    }
    const prevNow = this._fnow; this._fnow = now;
    if (this.focus) {
      const fdt = Math.min(0.12, Math.max(dt, now - (prevNow || now)));
      this.focusT = clamp01(this.focusT + (this.focusDir * fdt) / 0.45);
      if (this.focusT <= 0 && this.focusDir < 0) { this.focus = null; this.focusDir = 0; }
      else {
        const t = this.focusT, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const pose = this.focusPose(this.comps[this.focus].screen);
        cam.position.lerp(pose.pos, e);
        cam.quaternion.slerp(pose.quat, e);
      }
    }
    const cp = cam.position;
    const eva = deck === EXT_DECK, ring = deck === RING_DECK;
    const baseY = deck <= 4 ? deck * DECK_H : cp.y;
    this.key.position.set(0, baseY + ROOM_H - 0.15, 0); this.key.target.position.set(0, baseY, 0);
    this.sunlight.position.set(cp.x - 70, cp.y + 80, cp.z + 45); this.sunlight.target.position.copy(cp);
    if (ring) { const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.spaceQuat(deck, me.z)); this.point.position.copy(cp).addScaledVector(up, 1.6); this.point2.position.copy(cp).addScaledVector(up, 1.2).add(new THREE.Vector3(0, 0, 0).set(-Math.sin(me.yaw) * 4, 0, 0)); }
    else { this.point.position.set(0, baseY + ROOM_H - 0.4, 0); this.point2.position.set(cp.x - Math.sin(me.yaw) * 4, baseY + ROOM_H - 0.5, cp.z - Math.cos(me.yaw) * 4); }
    const red = S.alert === 'red', yel = S.alert === 'yellow';
    const pulse = 0.5 + 0.5 * Math.sin(now * 4);
    const blackout = S.power && S.power.gen <= 0 && S.battery.charge <= 0.01;
    const powerDim = blackout ? 0.22 : 1;
    const lc = blackout ? new THREE.Color(1, 0.42, 0.22) : red ? new THREE.Color(1, 0.35 + 0.3 * (1 - pulse), 0.3 + 0.3 * (1 - pulse)) : yel ? new THREE.Color(1, 0.93, 0.78) : new THREE.Color(1, 0.99, 0.96);
    this.point.color.copy(lc); this.point.intensity = eva ? 0 : (ring ? 30 : 26) * powerDim;
    this.point2.color.copy(lc); this.point2.intensity = eva ? 0 : 12 * powerDim;
    this.key.color.copy(lc); this.key.intensity = eva || ring ? 0 : 55 * powerDim;
    this.hemi.intensity = eva ? 0.22 : (ring ? 0.9 : 0.75) * powerDim;
    this.scene.environmentIntensity = eva ? 0.35 : 0.6 * powerDim;
    this.sunlight.intensity = eva ? 3.4 : 0;
    this.camDeck = deck;
    this.placeSpaceFx(deck, S);
    this.updateExterior(S, now, dt);
    const lampCol = new THREE.Color(lc.r * 0.95 * powerDim, lc.g * 0.95 * powerDim, lc.b * 0.95 * powerDim);
    for (const g of this.decks) if (g.visible && g !== this.exterior) g.traverse((o) => { if (o.userData.lamp) o.material.color.copy(lampCol); });

    // sky: stars, sun, destination, nearby planet or moon (all "at infinity" around the camera)
    this.stars.position.copy(cp);
    const N = S.nav;
    const leg = Math.min(N.leg + (N.state === 'docked' ? 0 : 1), WAYPOINTS.length - 1);
    const f = N.state === 'transit' ? Math.min(1, N.x / N.L) : 1;
    const distAU = Math.max(0.01, Math.hypot(WAYPOINTS[leg].pos[0] - WAYPOINTS[N.leg].pos[0], WAYPOINTS[leg].pos[1] - WAYPOINTS[N.leg].pos[1]) * (1 - f));
    this.dest.position.set(cp.x, cp.y + 300, cp.z - 3000);
    const ds = Math.min(700, 40 / distAU);
    this.dest.scale.set(ds, ds, 1);
    this.sun.position.set(cp.x - 2600, cp.y + 900, cp.z + 1500);
    let pk = null;
    if (N.state === 'docked') pk = WAYPOINTS[N.leg].id;
    else if (N.state !== 'transit') pk = WAYPOINTS[Math.min(N.leg + 1, WAYPOINTS.length - 1)].id;
    else if (f < 0.03) pk = WAYPOINTS[N.leg].id;
    else if (f > 0.97) pk = WAYPOINTS[Math.min(N.leg + 1, WAYPOINTS.length - 1)].id;
    if (pk !== this.planetKind) {
      if (this.planet) { this.scene.remove(this.planet); this.planet = null; }
      if (this.earth) { this.scene.remove(this.earth); this.earth = null; }
      this.planetKind = pk;
      if (pk) { this.planet = buildPlanet(pk); this.planet.scale.setScalar(pk === 'ganymede' ? 2600 : 1500); this.scene.add(this.planet); }
      if (pk === 'luna') { this.earth = buildPlanet('earth'); this.earth.scale.setScalar(260); this.scene.add(this.earth); }
    }
    this.placeSky(cp, now, ring && S.ring ? S.ring.spin : null);
    this.updateStation(S, now);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.5);
    this.battleFlash.material.opacity = this.flash;
    this.battleFlash.position.set(cp.x + Math.sin(now) * 1200, cp.y + 200, cp.z - 2500);

    // components
    for (const id in this.comps) {
      const v = this.comps[id], c = S.comps[id];
      if (!c) continue;
      const onDeck = compDeck(id) === deck;
      if (v.label) { const lp = v.label.position; v.label.visible = onDeck && Math.hypot(lp.x - me.x, lp.z - me.z) > 3.2; }
      const hp = c.hp;
      const col = hp <= 0 ? 0x111111 : c.fire > 0 ? (Math.sin(now * 12) > 0 ? 0xff3010 : 0x401000) : c.fault ? 0xff40ff : hp < 25 ? 0xff3030 : hp < 60 ? 0xffb020 : 0x40ff80;
      if (v.light) v.light.material.color.setHex(col);
      if (!v.fire || !onDeck) continue;
      v.fire.visible = c.fire > 0.02;
      if (v.fire.visible) {
        const s = 0.5 + c.fire * 1.3;
        v.fire.scale.set(s, s * (0.9 + 0.2 * Math.sin(now * 15)), s);
        v.fire.children.forEach((ch) => { if (ch.userData.flame) ch.scale.y = 0.7 + 0.5 * Math.abs(Math.sin(now * 8 + ch.userData.ph)); });
      }
    }
    const R = S.reactor;
    if (this.comps.reactor && deck === 2) {
      const g = this.comps.reactor.glow;
      const k = R.state === 'running' ? 0.4 + R.actual * 0.8 : R.state === 'preheat' ? 0.2 + 0.2 * pulse : 0.02;
      const unstable = R.state === 'running' && R.stab < 0.4;
      g.material.color.setRGB((unstable ? 1 : 0.55) * k, (unstable ? 0.4 : 0.85) * k, 1 * k);
      g.scale.setScalar(0.9 + 0.1 * Math.sin(now * (unstable ? 20 : 3)));
    }
    if (this.comps.drivecore && deck === 0) { const g = this.comps.drivecore.glow, t = S.drive.ignited ? 0.3 + S.drive.throttle : 0.05; g.material.color.setRGB(t, t * 0.6, t * 0.3); }
    if (this.comps.fabricator && deck === 1) { const g = this.comps.fabricator.glow; g.visible = S.fab.queue.length > 0; g.rotation.y += dt * 3; }
    if (this.comps.cryo && deck === 3) this.comps.cryo.group.children.forEach((ch) => { if (ch.userData.pod !== undefined) ch.material.color.setHex(ch.userData.pod < S.pods ? 0x4aa0d8 : 0x101418); });
    if (this.comps.helm && deck === 4) {
      const st = this.comps.helm.group.userData.sticks, c = S.att.cmd || [0, 0, 0], t = S.att.tcmd || [0, 0, 0];
      const k = Math.min(1, dt * 10);
      st.rhc.rotation.x += (c[0] * 0.35 - st.rhc.rotation.x) * k; st.rhc.rotation.z += (c[1] * 0.35 - st.rhc.rotation.z) * k; st.rhc.rotation.y += (c[2] * 0.4 - st.rhc.rotation.y) * k;
      st.thc.position.z += (0.98 - t[2] * 0.05 - st.thc.position.z) * k; st.thc.rotation.z += (-t[0] * 0.3 - st.thc.rotation.z) * k; st.thc.rotation.x += (t[1] * 0.3 - st.thc.rotation.x) * k;
    }
    if (this.comps.dronebay && deck === 1) { const busy = S.drones.jobs.length; this.comps.dronebay.group.children.forEach((ch) => { if (ch.userData.drone !== undefined) { ch.visible = ch.userData.drone >= busy; ch.position.y = 0.4 + 0.05 * Math.sin(now * 2 + ch.userData.drone); } }); }

    this.scrT -= dt;
    if (this.scrT <= 0) { this.scrT = 0.5; this.drawScreens(S, me, now); }
    else this.drawScreens(S, me, now, true);
    this.updateBreaches(S, deck, now);
    this.updateItems(S, deck);
    this.updateAvatars(S, me, deck, dt, now);
    // EVA safety tether from the hatch to your harness
    this.tether.visible = eva && !this.focus;
    if (this.tether.visible) {
      const a = this.spacePos(EXT_DECK, EXT.hatch.x + 0.3, EXT.hatch.y, EXT.hatch.z), b = cp.clone().add(new THREE.Vector3(0, -0.6, 0).applyQuaternion(cam.quaternion)).add(new THREE.Vector3(0.15, 0, 0).applyQuaternion(cam.quaternion));
      const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -Math.min(4, a.distanceTo(b) * 0.06), 0));
      const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector3().copy(a).multiplyScalar((1 - t) * (1 - t)).addScaledVector(mid, 2 * t * (1 - t)).addScaledVector(b, t * t)); }
      this.tether.geometry.setFromPoints(pts);
    }
    if (me.item && !this.focus) { this.hand.visible = true; this.hand.material.color.setHex(ITEMS[me.item.type].color); }
    else this.hand.visible = false;
  }
  // spin: inside the centrifuge the whole sky wheels past the windows (the ring's axis is x in the ring's space)
  placeSky(cp, now, spin = null) {
    const q = spin === null ? new THREE.Quaternion() : new THREE.Quaternion().setFromAxisAngle(XAX, -spin);
    const off = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(q).add(cp);
    const sunDir = new THREE.Vector3(-2600, 900, 1500).normalize().applyQuaternion(q);
    if (this.planet) { this.planet.position.copy(off(-2600, -900, -2200)); this.planet.userData.setSun(sunDir); this.planet.userData.tick(now); }
    if (this.earth) { this.earth.position.copy(off(1500, 600, -3600)); this.earth.userData.setSun(sunDir); this.earth.userData.tick(now); }
    this.stars.position.copy(cp); this.stars.quaternion.copy(q);
    this.sun.position.copy(off(-2600, 900, 1500));
    this.dest.position.copy(off(0, 300, -3000));
  }
  // Station visible from the hull and cameras during approach / docked (ship body frame; our port is at the bow)
  updateStation(S, now) {
    const N = S.nav;
    const near = N.state === 'orbit' || N.state === 'rendezvous' || N.state === 'approach' || N.state === 'docking' || N.state === 'docked';
    const wid = !near ? null : N.state === 'docked' ? WAYPOINTS[N.leg].id : WAYPOINTS[Math.min(N.leg + 1, WAYPOINTS.length - 1)].id;
    if (wid !== this.stationId) {
      if (this.station) this.exterior.remove(this.station);
      this.station = wid ? buildStation(wid) : null; this.stationId = wid;
      if (this.station) { this.station.traverse((o) => { if (o.isMesh && o.material && !o.material.isMeshBasicMaterial) o.castShadow = o.receiveShadow = true; }); this.exterior.add(this.station); }
    }
    if (!this.station) return;
    const PORT = new THREE.Vector3(...SL.bowPort);
    const q = new THREE.Quaternion(...(S.att.q || [0, 0, 0, 1])), qi = q.clone().invert();
    let rel = new THREE.Vector3(0, 0, -2000);
    if (N.state === 'approach' && S.prox) rel = new THREE.Vector3(-S.prox.p[0], -S.prox.p[1], -S.prox.p[2]);
    else if (N.state === 'rendezvous' && N.rv) rel = new THREE.Vector3(0, 0, -Math.max(250, N.rv.d));
    else if (N.state === 'docking' || N.state === 'docked') rel.set(0, 0, 0);
    this.station.position.copy(PORT).add(rel.applyQuaternion(qi));
    this.station.quaternion.copy(qi);
    this.station.userData.tick(now);
  }

  // ---------------- hull animation and weapon effects ----------------
  // Everything flying outside (tracers, missiles, torpedoes, explosions) lives in spaceFx, in ship-frame coordinates.
  // Each frame spaceFx is placed so it lines up with wherever the camera is: around the hull on EVA and for the external
  // cameras, or around the current deck or the spinning ring, so ordnance is seen through the windows.
  buildFxPools() {
    this.spaceFx = new THREE.Group(); this.scene.add(this.spaceFx);
    this.trMax = 1400;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.trMax * 6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.trMax * 6), 3));
    this.tracerMesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracerMesh.frustumCulled = false; this.spaceFx.add(this.tracerMesh);
    const hg = new THREE.BufferGeometry(); // bright heads so each round reads at any distance (lines are only 1 px)
    hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.trMax * 3), 3));
    hg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.trMax * 3), 3));
    this.tracerHeads = new THREE.Points(hg, new THREE.PointsMaterial({ size: 3.5, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracerHeads.frustumCulled = false; this.spaceFx.add(this.tracerHeads);
    this.tracers = []; this.missiles = []; this.torps = {};
    this.flashMat = new THREE.SpriteMaterial({ map: flashTex(), color: 0xffd090, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.sprites = [];
    const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0));
    this.qShipToDeck = new THREE.Quaternion().setFromRotationMatrix(M); // decks: the nose is "up", dorsal is "north"
    const MR = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    this.qShipToRing = new THREE.Quaternion().setFromRotationMatrix(MR); // ring: the ship's axis is the ring's axis
  }
  // which point of the ship frame sits at a deck's floor centre
  static DECK_Z = [33, -38, -48, -72, -82];
  placeSpaceFx(deck, S, forExterior = false) {
    const f = this.spaceFx;
    if (forExterior || deck === EXT_DECK) { f.position.copy(this.exterior.position); f.quaternion.identity(); return; }
    if (deck === RING_DECK) {
      f.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(XAX, -(S.ring ? S.ring.spin : 0))).multiply(this.qShipToRing);
      f.position.copy(RING_CENTER).sub(new THREE.Vector3(0, 0, SL.ringZ).applyQuaternion(f.quaternion));
      return;
    }
    f.quaternion.copy(this.qShipToDeck);
    f.position.set(0, deck * DECK_H, 0).sub(new THREE.Vector3(0, 0, World.DECK_Z[deck]).applyQuaternion(f.quaternion));
  }
  sprite(color, scale, life = 0.3) {
    let s = this.sprites.find((x) => !x.visible);
    if (!s) { s = new THREE.Sprite(this.flashMat.clone()); this.spaceFx.add(s); this.sprites.push(s); }
    s.material.color.setHex(color); s.material.opacity = 1; s.scale.setScalar(scale); s.visible = true; s.userData.t = 0; s.userData.life = life; s.userData.s0 = scale;
    return s;
  }
  // direction from an inertial bearing to the ship frame
  bodyDir(S, dir) { const b = qrot(qconj(S.att.q || [0, 0, 0, 1]), dir || [0, 0, -1]); return new THREE.Vector3(b[0], b[1], b[2]).normalize(); }
  // where an inbound threat is drawn: on its approach bearing, compressed so the last 60 km fit in ~750 m
  threatPos(S, t, out = new THREE.Vector3()) {
    const d = projBodyDir(S, t);
    const vd = 30 + Math.max(0, t.range) * 12;
    return out.set(d[0] * vd, d[1] * vd, d[2] * vd - 40);
  }
  explode(p, big = 1) {
    const s = this.sprite(0xffc070, 26 * big, 0.9); s.position.copy(p);
    const s2 = this.sprite(0xffffff, 10 * big, 0.25); s2.position.copy(p);
    for (let i = 0; i < 18; i++) { const d = new THREE.Vector3().randomDirection(); this.addTracer(p.clone(), d, 30 + Math.random() * 60, 4, 1.4, [1, 0.6 + Math.random() * 0.3, 0.25]); }
  }
  onFx(f) {
    if (!this._S) return;
    const S = this._S;
    if (f.type === 'srm') {
      const L = this.comps.launcher; if (!L) return;
      const tdir = this.bodyDir(S, f.dir);
      for (let i = 0; i < (f.n || 1); i++) {
        const lid = L.lids[(8 - (S.weap.cells + i + 1) + 64) % 8];
        lid.userData.open = 1.6 + i * 0.25;
        const p = new THREE.Vector3(); lid.getWorldPosition(p); this.exterior.worldToLocal(p);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(L.group.quaternion);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 10), mat(0xe8e6df));
        const pl = new THREE.Sprite(this.flashMat.clone()); pl.position.y = -1.3; pl.scale.setScalar(1.8); pl.material.color.setHex(0xffc070); m.add(pl);
        m.position.copy(p); this.spaceFx.add(m);
        this.missiles.push({ m, t: -i * 0.25, v: up.clone().multiplyScalar(12), up, tdir });
        m.visible = false;
      }
    } else if (f.type === 'pkill') { // a gatling stream caught a torpedo or drone
      const T = this.torps[f.id];
      if (T) { this.explode(T.m.position, 1.2); T.dead = true; }
    } else if (f.type === 'rail') {
      const mz = this.exterior.userData.railMuzzle; if (!mz) return;
      const s = this.sprite(0xbfe0ff, 9, 0.35); s.position.copy(mz.position);
      for (let i = 0; i < 6; i++) this.addTracer(mz.position.clone(), new THREE.Vector3(0, 0, -1), 4000, 30, 0.6, [0.7, 0.85, 1]);
    } else if (f.type === 'launch') {
      this.onFx({ type: 'srm', n: 1, dir: f.dir });
    } else if (f.type === 'hit' && this.lastThreatPos) {
      this.explode(this.lastThreatPos, 0.8); this.lastThreatPos = null;
    }
  }
  addTracer(p, dir, speed, len, life, col) {
    if (this.tracers.length >= this.trMax) this.tracers.shift();
    this.tracers.push({ p, d: dir, s: speed, len, life, t: 0, col });
  }
  updateThreats(S, dt, now) {
    const E = S.enc, seen = new Set();
    const list = [];
    if (E) {
      for (const pr of E.proj) if (pr.from === 'them' && pr.type === 'missile' && pr.range < 64) list.push(pr);
      for (const e of E.enemies) if (!e.dead && !e.gone && e.type === 'drone' && e.range < 64) list.push(e);
    }
    for (const t of list) {
      seen.add(t.id);
      let T = this.torps[t.id];
      if (!T) {
        const m = new THREE.Group();
        if (t.type === 'drone') { m.add(new THREE.Mesh(new THREE.BoxGeometry(3, 2, 5), mat(0x6a6f76))); }
        else {
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 5, 12), mat(0x3a3e44)); body.rotation.x = Math.PI / 2; m.add(body);
          const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.4, 12), mat(0xb8342a)); nose.rotation.x = -Math.PI / 2; nose.position.z = -3.2; m.add(nose);
        }
        const plume = new THREE.Sprite(this.flashMat.clone()); plume.material.color.setHex(0xff9a50); plume.position.z = 3.6; plume.scale.setScalar(9); m.add(plume);
        m.userData.plume = plume; this.spaceFx.add(m);
        T = this.torps[t.id] = { m };
      }
      this.threatPos(S, t, T.m.position);
      T.m.lookAt(this.spaceFx.localToWorld(new THREE.Vector3(0, 0, -40)));
      T.m.userData.plume.scale.setScalar(8 + Math.random() * 4);
      if (Math.random() < 0.7) this.addTracer(T.m.position.clone(), T.m.position.clone().sub(new THREE.Vector3(0, 0, -40)).normalize(), 3, 20, 2.0, [0.5, 0.45, 0.4]);
      if (t.range < 5) this.lastThreatPos = T.m.position.clone();
    }
    for (const id in this.torps) if (!seen.has(id)) { this.spaceFx.remove(this.torps[id].m); delete this.torps[id]; }
  }
  // the work pod, its cradle, drifting cargo and the ghosts' scout drones (all in the ship frame, outside)
  updateCraft(S, now) {
    const ex = this.exterior, P = podState(S), meId = this._meId;
    if (!this.cradle) { this.cradle = buildCradle(); this.cradle.position.set(POD_CRADLE.x, POD_CRADLE.y, POD_CRADLE.z); ex.add(this.cradle); this.podMesh = buildWorkPod(); ex.add(this.podMesh); this.cargoMeshes = {}; this.scouts = {}; }
    this.podMesh.visible = P.at !== 'lost' && !(P.pilot && P.pilot === meId);
    this.podMesh.position.set(P.x, P.y, P.z);
    const pilot = P.pilot && S.players[P.pilot];
    if (pilot) this.podMesh.rotation.set(0, (pilot.yaw || 0) + Math.PI, 0); else if (P.at === 'cradle') this.podMesh.rotation.set(0, Math.PI / 2, 0);
    this.podMesh.userData.lamp.visible = Math.sin(now * 4) > 0;
    const seen = new Set();
    for (const c of S.cargo || []) {
      seen.add(c.id);
      let m = this.cargoMeshes[c.id]; if (!m) { m = this.cargoMeshes[c.id] = buildContainer(c.kind); ex.add(m); }
      m.position.set(c.x, c.y, c.z); m.rotation.set(now * 0.05, now * 0.08 + c.id.length, 0);
      if (P.carry === c.id) m.rotation.set(0, this.podMesh.rotation.y, 0);
      m.userData.lamp.visible = Math.sin(now * 3 + c.x) > 0.3;
    }
    for (const id in this.cargoMeshes) if (!seen.has(id)) { ex.remove(this.cargoMeshes[id]); delete this.cargoMeshes[id]; }
    const sc = new Set();
    for (const p of Object.values(S.players)) {
      if (!p.connected || p.id === meId || p.ghost !== 'scout' || (p.state !== 'dead' && p.state !== 'spectator') || p.deck !== EXT_DECK) continue;
      sc.add(p.id);
      let m = this.scouts[p.id]; if (!m) { m = this.scouts[p.id] = buildScoutDrone(p.color); ex.add(m); }
      m.position.set(p.x, (p.y || 0) + EYE, p.z); m.rotation.y = (p.yaw || 0) + now * 0.2;
    }
    for (const id in this.scouts) if (!sc.has(id)) { ex.remove(this.scouts[id]); delete this.scouts[id]; }
  }
  updateExterior(S, now, dt) {
    this._S = S;
    const ex = this.exterior;
    if (ex.userData.ring) ex.userData.ring.rotation.z = S.ring ? S.ring.spin : 0;
    const hf = Math.min(1, S.heat.stored / 30000);
    for (const id of ['radA', 'radB']) {
      const w = this.comps[id] && this.comps[id].wing; if (!w) continue;
      const target = S.heat.radExt && S.comps[id].hp > 0 ? 1 : 0.12;
      w.scale.y += (target - w.scale.y) * Math.min(1, dt * 0.8);
      w.userData.mat.emissive.setRGB(0.35 * hf * hf, 0.1 * hf * hf, 0.02 * hf);
    }
    this.updateThreats(S, dt, now);
    this.updateCraft(S, now);
    // gatlings: each tracks its own target (a torpedo or drone it can see), spins up and fires tracer streams at it
    const W = S.weap || {}, fire = W.pdcFire || [0, 0, 0], tg = W.pdcTgt || [null, null, null];
    ['pdc1', 'pdc2', 'pdc3'].forEach((id, i) => {
      const v = this.comps[id]; if (!v || !v.gat) return;
      const G = v.gat, alive = S.comps[id].hp > 0;
      const mp = new THREE.Vector3(); G.flash.getWorldPosition(mp); ex.worldToLocal(mp);
      let aim = null;
      const T = tg[i] && this.torps[tg[i]];
      if (T) aim = T.m.position.clone().sub(mp).normalize();
      else if (S.enc) { const e = S.enc.enemies.find((x) => !x.dead && !x.gone); if (e) aim = this.bodyDir(S, e.dir); }
      if (alive) {
        let yawT, pitchT;
        if (aim) { const la = aim.clone().applyQuaternion(v.group.quaternion.clone().invert()); yawT = Math.atan2(-la.x, -la.z); pitchT = Math.max(-0.12, Math.atan2(la.y, Math.hypot(la.x, la.z))); }
        else { yawT = Math.sin(now * 0.15 + i * 2.1) * 1.4; pitchT = 0.35 + Math.sin(now * 0.11 + i) * 0.25; } // idle search sweep
        let dy = yawT - G.yaw.rotation.y; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        const k = Math.min(1, dt * (T ? 6 : 2));
        G.yaw.rotation.y += dy * k; G.pitch.rotation.x += (pitchT - G.pitch.rotation.x) * k;
      }
      const firing = alive && fire[i] > 0;
      G.spin = (G.spin || 0) + ((firing ? 55 : 0) - (G.spin || 0)) * Math.min(1, dt * (firing ? 5 : 1.2));
      G.barrels.rotation.z += G.spin * dt;
      G.flash.visible = firing && Math.random() < 0.75;
      if (G.flash.visible) G.flash.scale.setScalar(1.2 + Math.random() * 1.0);
      if (firing) {
        const bd = new THREE.Vector3(0, 0, -1).applyQuaternion(G.barrels.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(ex.quaternion.clone().invert());
        const n = Math.min(10, Math.max(1, Math.round(dt * 60)));
        for (let k2 = 0; k2 < n; k2++) { const d = bd.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.03)).normalize(); this.addTracer(mp.clone().addScaledVector(d, Math.random() * 3), d, 380 + Math.random() * 60, 24, 2.2, k2 % 4 === 0 ? [1, 0.35, 0.2] : [1, 0.85, 0.45]); }
      }
    });
    // launcher lids open briefly when a cell fires
    const L = this.comps.launcher;
    if (L && L.lids) for (const h of L.lids) { const o = h.userData.open || 0; h.userData.open = Math.max(0, o - dt); const tgt = o > 0 ? 1.9 : 0; h.rotation.z += (tgt * h.userData.side - h.rotation.z) * Math.min(1, dt * 8); }
    // missiles: boost up out of the cell, pitch over toward the target, then streak away
    for (const m of this.missiles) {
      m.t += dt;
      if (m.t < 0) continue;
      m.m.visible = true;
      if (m.t > 0.5) { const want = m.tdir.clone().multiplyScalar(200); m.v.lerp(want, Math.min(1, dt * (0.8 + m.t))); }
      m.m.position.addScaledVector(m.v, dt);
      m.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), m.v.clone().normalize());
      m.m.children[0].scale.setScalar(1.6 + Math.random() * 0.8);
      if (Math.random() < 0.6) this.addTracer(m.m.position.clone(), m.v.clone().normalize().negate(), 5, 3, 1.2, [0.9, 0.9, 0.95]);
    }
    this.missiles = this.missiles.filter((m) => { if (m.t > 5) { this.spaceFx.remove(m.m); m.m.geometry.dispose(); return false; } return true; });
    // tracer buffers
    const pos = this.tracerMesh.geometry.attributes.position.array, col = this.tracerMesh.geometry.attributes.color.array;
    const hpos = this.tracerHeads.geometry.attributes.position.array, hcol = this.tracerHeads.geometry.attributes.color.array;
    let n = 0;
    for (const t of this.tracers) {
      t.t += dt;
      if (t.t > t.life) continue;
      const head = t.p.clone().addScaledVector(t.d, t.s * t.t), tail = head.clone().addScaledVector(t.d, -Math.min(t.len, t.s * t.t));
      const a = 1 - t.t / t.life;
      pos.set([head.x, head.y, head.z, tail.x, tail.y, tail.z], n * 6);
      col.set([t.col[0] * a, t.col[1] * a, t.col[2] * a, t.col[0] * a * 0.2, t.col[1] * a * 0.2, t.col[2] * a * 0.2], n * 6);
      hpos.set([head.x, head.y, head.z], n * 3); hcol.set([t.col[0] * a, t.col[1] * a, t.col[2] * a], n * 3);
      n++;
    }
    this.tracers = this.tracers.filter((t) => t.t <= t.life);
    this.tracerMesh.geometry.setDrawRange(0, n * 2);
    this.tracerMesh.geometry.attributes.position.needsUpdate = true; this.tracerMesh.geometry.attributes.color.needsUpdate = true;
    this.tracerHeads.geometry.setDrawRange(0, n); this.tracerHeads.geometry.attributes.position.needsUpdate = true; this.tracerHeads.geometry.attributes.color.needsUpdate = true;
    for (const s of this.sprites) if (s.visible) { s.userData.t += dt; const k = s.userData.t / s.userData.life; s.material.opacity = Math.max(0, 1 - k); s.scale.setScalar(s.userData.s0 * (0.6 + k * 0.9)); if (k >= 1) s.visible = false; }
    // spinning kit, the plume, nav lights
    const combat = !!S.enc;
    if (this.comps.antenna && this.comps.antenna.spin) this.comps.antenna.spin.rotation.y = Math.sin(now * 0.05) * 0.4;
    if (this.comps.sensorArray && this.comps.sensorArray.spin && S.comps.sensorArray.hp > 0) this.comps.sensorArray.spin.rotation.y += dt * (S.sensors.pingT > 0 ? 8 : combat ? 3 : 1.2);
    if (this.comps.railgun && this.comps.railgun.glow) { const ch = S.weap.rail; this.comps.railgun.glow.material.color.setRGB(0.1 + 0.4 * ch, 0.2 + 0.6 * ch, 0.4 + 0.6 * ch); }
    const mz = ex.userData.railMuzzle; if (mz) { const ch = S.weap.rail; mz.material.color.setRGB(0.1 + 0.5 * ch, 0.2 + 0.7 * ch, 0.5 + 0.5 * ch); }
    const pl = ex.userData.plume;
    pl.visible = S.drive.ignited && S.drive.throttle > 0.01; pl.userData.core.visible = pl.visible;
    if (pl.visible) { pl.scale.set(0.6 + S.drive.throttle, 0.4 + S.drive.throttle * 1.2, 0.6 + S.drive.throttle); pl.material.opacity = 0.35 + 0.15 * Math.sin(now * 30); pl.userData.core.material.opacity = 0.5 + 0.2 * Math.sin(now * 47); }
    const ch = ex.userData.chamber; if (ch) { const k = S.drive.ignited ? 1.2 + S.drive.throttle : 0.25; ch.material.color.setRGB(0.6 * k, 0.48 * k, 1 * k); }
    for (const l of ex.userData.navs || []) if (l.userData.blink) l.visible = (now % 1.6) < 0.12;
    if (ex.userData.ring) ex.userData.ring.traverse((o) => { if (o.userData.blink) o.visible = (now % 2.0) < 0.15; });
  }

  // ---------------- external cameras: rendered into a console canvas with the main renderer ----------------
  renderExtCam(S, idx, canvas, now) {
    const C = EXT_CAMS[((idx % EXT_CAMS.length) + EXT_CAMS.length) % EXT_CAMS.length];
    if (!this.extCam) this.extCam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 9000);
    const cam = this.extCam, ex = this.exterior;
    const w = canvas.width, h = canvas.height;
    cam.fov = C.fov; cam.aspect = w / h; cam.updateProjectionMatrix();
    cam.position.set(...C.pos).add(ex.position);
    cam.lookAt(new THREE.Vector3(...C.look).add(ex.position));
    // swap in exterior lighting and visibility, render a small viewport, copy it out, restore
    const vis = this.decks.map((g) => g.visible); this.decks.forEach((g) => (g.visible = g === ex));
    const L = [this.point.intensity, this.point2.intensity, this.key.intensity, this.hemi.intensity, this.scene.environmentIntensity, this.sunlight.intensity];
    this.point.intensity = 0; this.point2.intensity = 0; this.key.intensity = 0; this.hemi.intensity = 0.22; this.scene.environmentIntensity = 0.35; this.sunlight.intensity = 3.4;
    const sp = this.sunlight.position.clone(), st = this.sunlight.target.position.clone();
    this.sunlight.position.set(ex.position.x - 70, ex.position.y + 80, ex.position.z + 45 - 30); this.sunlight.target.position.set(ex.position.x, ex.position.y, ex.position.z - 30);
    const tv = this.tether.visible; this.tether.visible = false;
    const hv = this.hand.visible; this.hand.visible = false;
    const fp = this.spaceFx.position.clone(), fq = this.spaceFx.quaternion.clone();
    this.placeSpaceFx(EXT_DECK, S, true);
    this.placeSky(cam.position, now);
    const r = this.renderer, size = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio();
    const vw = Math.min(size.x, w / pr), vh = Math.min(size.y, h / pr);
    r.setScissorTest(true); r.setViewport(0, size.y - vh, vw, vh); r.setScissor(0, size.y - vh, vw, vh);
    r.render(this.scene, cam);
    const g2 = canvas.getContext('2d');
    g2.drawImage(r.domElement, 0, 0, vw * pr, vh * pr, 0, 0, w, h);
    r.setScissorTest(false); r.setViewport(0, 0, size.x, size.y);
    this.decks.forEach((g, i) => (g.visible = vis[i]));
    [this.point.intensity, this.point2.intensity, this.key.intensity, this.hemi.intensity, this.scene.environmentIntensity, this.sunlight.intensity] = L;
    this.sunlight.position.copy(sp); this.sunlight.target.position.copy(st);
    this.tether.visible = tv; this.hand.visible = hv;
    this.spaceFx.position.copy(fp); this.spaceFx.quaternion.copy(fq);
    this.placeSky(this.camera.position, now, this.camDeck === RING_DECK && S.ring ? S.ring.spin : null);
    return C;
  }

  updateBreaches(S, deck, now) {
    const seen = new Set();
    for (const b of S.breaches) {
      seen.add(b.id);
      let m = this.breachMeshes[b.id];
      if (!m) {
        m = new THREE.Group();
        m.add(new THREE.Mesh(new THREE.CircleGeometry(0.25 + b.size * 0.3, 7), new THREE.MeshBasicMaterial({ color: 0x000000 })));
        m.add(new THREE.Mesh(new THREE.RingGeometry(0.25 + b.size * 0.3, 0.4 + b.size * 0.35, 7), mat(0x8a5030)));
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
      this.spacePos(it.deck, it.x, (it.y || 0) + 0.15, it.z, m.position);
      this.spaceQuat(it.deck, it.z, m.quaternion);
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
        a.label.position.y = 2.25; a.group.add(a.label);
        a.x = p.x; a.y = p.y || 0; a.z = p.z; a.yaw = p.yaw; a.phase = 0; a.deck = p.deck;
        this.scene.add(a.group);
        this.avatars[p.id] = a;
      }
      if (a.deck !== p.deck) { a.x = p.x; a.y = p.y || 0; a.z = p.z; a.deck = p.deck; }
      const k = Math.min(1, dt * 12);
      const ox = a.x, oz = a.z, oy = a.y;
      a.x += (p.x - a.x) * k; a.y += ((p.y || 0) - a.y) * k; a.z += (p.z - a.z) * k;
      const speed = dt > 0 ? Math.hypot(a.x - ox, a.z - oz, a.y - oy) / dt : 0;
      const floating = !!p.fl || p.deck === EXT_DECK;
      a.phase += dt * (floating ? 1.2 : 4 + speed * 2);
      a.animate(a.phase, floating ? 0.25 : Math.min(1, speed / 2.5));
      let dy = p.yaw - a.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      a.yaw += dy * k;
      this.spacePos(p.deck, a.x, a.y, a.z, a.group.position);
      this.spaceQuat(p.deck, a.z, a.group.quaternion);
      // floating crew lean into their direction of travel and drift slowly; walkers stand upright
      const lean = floating ? Math.min(1.1, 0.25 + speed * 0.35) : 0;
      const tq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-lean * Math.cos(a.phase * 0.2) * 0.4 - lean * 0.6, a.yaw + Math.PI, floating ? Math.sin(a.phase * 0.7) * 0.15 : 0, 'YXZ'));
      a.group.quaternion.multiply(tq);
      if (floating) a.group.position.y += Math.sin(now * 1.3 + p.id.length) * 0.03;
      a.group.visible = (p.deck === deck || (p.deck <= 4 && deck <= 4)) && p.state !== 'dead' && p.state !== 'spectator' && !p.pod;
      a.setSuit(p.suit);
      a.item.visible = !!p.item; if (p.item) a.item.material.color.setHex(ITEMS[p.item.type].color);
      if (p.sleep && p.state === 'alive') { a.group.rotateX(-Math.PI / 2); a.group.position.y += 0.5; }
      if (p.state === 'downed') { a.group.rotateX(-Math.PI / 2); a.label.material.color.setHex(Math.sin(now * 6) > 0 ? 0xff4040 : 0xffffff); }
      else a.label.material.color.setHex(0xffffff);
    }
    for (const id in this.avatars) if (!seen.has(id)) { this.scene.remove(this.avatars[id].group); delete this.avatars[id]; }
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
