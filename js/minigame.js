// Hands-on repair procedures: a 3D workbench in a window, with real tools on real fasteners.
// Each module type has its own faults (repair.js); each fault builds one of six procedures here:
// circuit cards & wiring, seals & flanges, bearings & actuators, high-voltage fuses & cells, crack welding, optics.
// Difficulty changes the fasteners: one bit fits all on Recruit; on Newtonian every screw and bolt can be a
// different size and drive, unmarked, and the wrong bit strips the head.
import * as THREE from 'three';
import { COMPS } from './config.js';
import { PARTS, PROCS, repairNeeds, moduleOf, missingParts } from './repair.js';

const TOOLS = [
  { id: 'hand', name: 'Hands', key: '1' },
  { id: 'driver', name: 'Screwdriver', key: '2' },
  { id: 'wrench', name: 'Ratchet wrench', key: '3' },
  { id: 'tweezers', name: 'Tweezers', key: '4' },
  { id: 'cutters', name: 'Wire cutters', key: '5' },
  { id: 'tape', name: 'Insulating tape', key: '6' },
  { id: 'welder', name: 'Compact welder', key: '7' },
  { id: 'probe', name: 'Probe / multimeter', key: '8' },
];
const BITS = ['PH1', 'PH2', 'HEX3', 'HEX4', 'T20'];
const SOCKETS = ['10', '13', '17'];
const mgRnd = (a, b) => a + Math.random() * (b - a);
const mgPick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------- textures ----------------
const MGTX = {};
function mgTex(key, w, h, draw) {
  if (MGTX[key]) return MGTX[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return (MGTX[key] = t);
}
const mgPcb = (burnt) => mgTex('pcb' + burnt, 256, 192, (g, w, h) => {
  g.fillStyle = '#1f5a2c'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#4fae5e'; g.lineWidth = 2;
  for (let i = 0; i < 40; i++) { g.beginPath(); let x = mgRnd(0, w), y = mgRnd(0, h); g.moveTo(x, y); for (let k = 0; k < 3; k++) { if (k % 2) x += mgRnd(-60, 60); else y += mgRnd(-40, 40); g.lineTo(x, y); } g.stroke(); }
  for (let i = 0; i < 9; i++) { const x = mgRnd(10, w - 60), y = mgRnd(10, h - 50); g.fillStyle = '#16181b'; g.fillRect(x, y, mgRnd(26, 50), mgRnd(18, 36)); g.fillStyle = '#c9cdd2'; g.font = '9px monospace'; g.fillText('W' + Math.floor(mgRnd(100, 999)), x + 3, y + 12); }
  g.fillStyle = '#d4a93c'; for (let x = 6; x < w - 6; x += 8) g.fillRect(x, h - 14, 5, 14); // edge fingers
  if (burnt) { const gr = g.createRadialGradient(w * 0.55, h * 0.45, 4, w * 0.55, h * 0.45, 80); gr.addColorStop(0, 'rgba(8,6,4,0.97)'); gr.addColorStop(0.5, 'rgba(40,24,10,0.8)'); gr.addColorStop(1, 'rgba(40,24,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
});
const mgBrushed = (tint = '#9aa2aa') => mgTex('brush' + tint, 256, 256, (g, w, h) => {
  g.fillStyle = tint; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${mgRnd(0.02, 0.07)})`; g.fillRect(0, mgRnd(0, h), w, 1); }
});
const mgLabel = (text, fg = '#111', bg = '#e8d44a') => mgTex('lbl' + text + bg, 256, 48, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; let fs = 26; g.font = `bold ${fs}px Helvetica, Arial, sans-serif`; while (g.measureText(text).width > w - 16 && fs > 10) { fs--; g.font = `bold ${fs}px Helvetica, Arial, sans-serif`; } g.textBaseline = 'middle'; g.fillText(text, 8, h / 2 + 1); });

const MGM = {};
function mgMats() {
  if (MGM.ok) return MGM;
  Object.assign(MGM, {
    ok: true,
    housing: new THREE.MeshStandardMaterial({ map: mgBrushed('#7e868e'), roughness: 0.5, metalness: 0.65 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.6, metalness: 0.4 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb9c0c7, roughness: 0.28, metalness: 0.95 }),
    zinc: new THREE.MeshStandardMaterial({ color: 0xc9c2a8, roughness: 0.35, metalness: 0.85 }),
    blackOx: new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.4, metalness: 0.8 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.3, metalness: 0.9 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xc87a40, roughness: 0.3, metalness: 0.95 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc23a2a, roughness: 0.45 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xe0b92a, roughness: 0.5 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x2e5b96, roughness: 0.5 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xe07a2a, roughness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    tape: new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.55 }),
    pcb: new THREE.MeshStandardMaterial({ map: mgPcb(false), roughness: 0.6 }),
    pcbBurnt: new THREE.MeshStandardMaterial({ map: mgPcb(true), roughness: 0.8 }),
    wireR: new THREE.MeshStandardMaterial({ color: 0xb02a22, roughness: 0.6 }), wireB: new THREE.MeshStandardMaterial({ color: 0x1d4f9a, roughness: 0.6 }),
    wireW: new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.6 }), wireBurnt: new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.95 }),
    gasket: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.85 }), gasketOld: new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.95 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x88aacc, roughness: 0.05, metalness: 0, transmission: 0.6, transparent: true, opacity: 0.6 }),
    bead: new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.5, metalness: 0.8, emissive: 0xff5a10, emissiveIntensity: 1 }),
    glowHint: 0x2a8cff,
  });
  return MGM;
}
// removed parts leave a faint ghost in place, so the empty slot can still be clicked to fit a spare
function ghost(obj, on) {
  obj.visible = true;
  obj.traverse((o) => {
    if (o.isSprite) { o.visible = !on && o.userData.wasVis !== false; return; }
    if (!o.isMesh) return;
    if (on) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.14; o.material.depthWrite = false; o.userData.ghost = true; }
    else if (o.userData.ghost) { o.material.transparent = false; o.material.opacity = 1; o.material.depthWrite = true; o.userData.ghost = false; }
  });
}
const mgBox = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const mgCyl = (r1, r2, h, m, s = 20) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, s), m);

// ---------------- 3D tools ----------------
function buildTools() {
  const m = mgMats(), T = {};
  { // screwdriver: two-tone grip, steel shaft, swappable bit; tip at local origin, pointing -z
    const g = new THREE.Group();
    const grip = mgCyl(0.016, 0.019, 0.11, m.orange, 16); grip.rotation.x = Math.PI / 2; grip.position.z = 0.19; g.add(grip);
    const grip2 = mgCyl(0.0175, 0.0175, 0.035, m.rubber, 16); grip2.rotation.x = Math.PI / 2; grip2.position.z = 0.12; g.add(grip2);
    for (let i = 0; i < 6; i++) { const r = mgBox(0.004, 0.03, 0.09, m.rubber); const a = (i / 6) * Math.PI * 2; r.position.set(Math.cos(a) * 0.017, Math.sin(a) * 0.017, 0.19); r.rotation.z = a; g.add(r); }
    const shaft = mgCyl(0.0035, 0.0035, 0.1, m.steel, 10); shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.055; g.add(shaft);
    const bit = new THREE.Group(); g.add(bit); g.userData.bit = bit;
    g.userData.setBit = (b) => { bit.clear(); const tip = b.startsWith('PH') ? mgCyl(0.0035, 0.0008, 0.012, m.blackOx, 4) : b.startsWith('HEX') ? mgCyl(b === 'HEX3' ? 0.0026 : 0.0034, b === 'HEX3' ? 0.0026 : 0.0034, 0.012, m.blackOx, 6) : mgCyl(0.0032, 0.0032, 0.012, m.blackOx, 6); tip.rotation.x = Math.PI / 2; tip.position.z = 0.006; bit.add(tip); };
    g.userData.spin = g; T.driver = g;
  }
  { // ratchet wrench with a socket
    const g = new THREE.Group();
    const handle = mgBox(0.018, 0.012, 0.16, m.steel); handle.position.set(0, 0.0, 0.12); handle.rotation.x = -0.25; g.add(handle);
    const grip = mgBox(0.022, 0.016, 0.07, m.red); grip.position.set(0, 0.02, 0.17); grip.rotation.x = -0.25; g.add(grip);
    const head = mgCyl(0.016, 0.016, 0.014, m.steel, 18); head.position.set(0, 0, 0.035); g.add(head);
    const socket = mgCyl(0.011, 0.011, 0.03, m.steel, 6); socket.rotation.x = Math.PI / 2; socket.position.z = 0.015; g.add(socket);
    g.userData.socket = socket; T.wrench = g;
  }
  { // tweezers: two arms that pinch
    const g = new THREE.Group(); const arms = [];
    for (const s of [-1, 1]) { const a = new THREE.Group(); const b = mgBox(0.004, 0.0015, 0.12, m.steel); b.position.z = 0.06; a.add(b); a.position.x = s * 0.006; a.rotation.y = s * 0.06; g.add(a); arms.push(a); }
    const top = mgBox(0.016, 0.004, 0.02, m.steel); top.position.z = 0.125; g.add(top);
    g.userData.pinch = (k) => arms.forEach((a, i) => { a.rotation.y = (i ? 1 : -1) * 0.06 * (1 - k); }); T.tweezers = g;
  }
  { // wire cutters: insulated handles, jaws that close
    const g = new THREE.Group(); const jaws = [];
    for (const s of [-1, 1]) { const j = new THREE.Group(); const blade = mgBox(0.006, 0.004, 0.03, m.blackOx); blade.position.z = 0.012; j.add(blade); const h = mgBox(0.01, 0.008, 0.11, m.red); h.position.set(s * 0.01, 0, 0.08); h.rotation.y = s * 0.12; j.add(h); j.rotation.y = s * 0.25; g.add(j); jaws.push(j); }
    const pivot = mgCyl(0.006, 0.006, 0.012, m.steel, 12); pivot.position.z = 0.03; g.add(pivot);
    g.userData.close = (k) => jaws.forEach((j, i) => { j.rotation.y = (i ? 1 : -1) * 0.25 * (1 - k); }); T.cutters = g;
  }
  { // insulating tape roll
    const g = new THREE.Group(); const roll = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.009, 10, 24), m.tape); roll.position.z = 0.03; g.add(roll);
    const core = mgCyl(0.014, 0.014, 0.018, m.yellow, 18); core.rotation.x = Math.PI / 2; core.position.z = 0.03; g.add(core);
    const strip = mgBox(0.018, 0.0008, 0.03, m.tape); strip.position.set(0, -0.02, 0.012); g.add(strip);
    g.userData.roll = roll; T.tape = g;
  }
  { // compact MIG-style welder torch with a cable, glowing tip and sparks
    const g = new THREE.Group();
    const nozzle = mgCyl(0.007, 0.01, 0.03, m.copper, 14); nozzle.rotation.x = Math.PI / 2; nozzle.position.z = 0.016; g.add(nozzle);
    const body = mgCyl(0.013, 0.013, 0.08, m.dark, 14); body.rotation.x = Math.PI / 2 - 0.4; body.position.set(0, 0.012, 0.07); g.add(body);
    const trig = mgBox(0.008, 0.02, 0.012, m.red); trig.position.set(0, -0.006, 0.075); g.add(trig);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.03, 0.11), new THREE.Vector3(0, 0.07, 0.2), new THREE.Vector3(0.05, 0.02, 0.35)]), 16, 0.006, 8), m.rubber); g.add(cable);
    const arc = new THREE.Sprite(new THREE.SpriteMaterial({ map: mgGlow(), color: 0xbfe0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); arc.scale.setScalar(0.06); arc.visible = false; g.add(arc);
    g.userData.arc = arc; T.welder = g;
  }
  { // probe: red/black test leads and a little multimeter
    const g = new THREE.Group();
    const tip = mgCyl(0.0012, 0.0035, 0.03, m.steel, 8); tip.rotation.x = Math.PI / 2; tip.position.z = 0.015; g.add(tip);
    const body = mgCyl(0.006, 0.006, 0.08, m.red, 12); body.rotation.x = Math.PI / 2; body.position.z = 0.07; g.add(body);
    const meter = mgBox(0.05, 0.08, 0.018, m.yellow); meter.position.set(0.06, 0.05, 0.16); g.add(meter);
    const scr = mgBox(0.038, 0.022, 0.002, m.dark); scr.position.set(0.06, 0.07, 0.17); g.add(scr);
    T.probe = g;
  }
  { // hands: a gloved hand (simple: palm + fingers)
    const g = new THREE.Group(); const glove = new THREE.MeshStandardMaterial({ color: 0xe8e3d6, roughness: 0.8 });
    const palm = mgBox(0.05, 0.016, 0.06, glove); palm.position.z = 0.06; g.add(palm);
    for (let i = 0; i < 4; i++) { const f = mgCyl(0.006, 0.006, 0.045, glove, 8); f.rotation.x = Math.PI / 2 - 0.3; f.position.set(-0.018 + i * 0.012, -0.006, 0.018); g.add(f); }
    const th = mgCyl(0.007, 0.007, 0.035, glove, 8); th.rotation.set(Math.PI / 2, 0, 0.9); th.position.set(0.03, 0, 0.05); g.add(th);
    T.hand = g;
  }
  return T;
}
let _glow = null;
function mgGlow() { if (_glow) return _glow; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 1, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, 'rgba(180,220,255,0.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (_glow = new THREE.CanvasTexture(c)); }

// ---------------- fasteners ----------------
function screwMesh(size) {
  const m = mgMats(), g = new THREE.Group();
  const r = { PH1: 0.0055, PH2: 0.007, HEX3: 0.0065, HEX4: 0.0082, T20: 0.007 }[size];
  const head = mgCyl(r, r * 0.92, 0.004, size.startsWith('HEX') ? m.blackOx : m.zinc, 18); head.rotation.x = Math.PI / 2; head.position.z = 0.002; g.add(head);
  const dz = 0.0043;
  if (size.startsWith('PH')) for (const rz of [0, Math.PI / 2]) { const s = mgBox(r * 1.3, r * 0.22, 0.002, m.dark); s.position.z = dz; s.rotation.z = rz; g.add(s); }
  else if (size.startsWith('HEX')) { const s = mgCyl(r * 0.45, r * 0.45, 0.002, m.dark, 6); s.rotation.x = Math.PI / 2; s.position.z = dz; g.add(s); }
  else for (let i = 0; i < 3; i++) { const s = mgBox(r * 1.1, r * 0.2, 0.002, m.dark); s.position.z = dz; s.rotation.z = (i * Math.PI) / 3; g.add(s); }
  const thread = mgCyl(r * 0.45, r * 0.45, 0.02, m.steel, 8); thread.rotation.x = Math.PI / 2; thread.position.z = -0.01; g.add(thread);
  g.scale.setScalar(2.8); return g;
}
function boltMesh(size) {
  const m = mgMats(), g = new THREE.Group();
  const r = { 10: 0.0085, 13: 0.011, 17: 0.0145 }[size];
  const head = mgCyl(r, r, 0.009, m.steel, 6); head.rotation.x = Math.PI / 2; head.position.z = 0.0045; g.add(head);
  const washer = mgCyl(r * 1.35, r * 1.35, 0.002, m.zinc, 18); washer.rotation.x = Math.PI / 2; g.add(washer);
  const thread = mgCyl(r * 0.55, r * 0.55, 0.04, m.steel, 10); thread.rotation.x = Math.PI / 2; thread.position.z = -0.02; g.add(thread);
  g.scale.setScalar(1.5); return g;
}

// =====================================================================================
export class RepairGame {
  constructor(host) {
    this.host = host; // { S(), act(a, args), sfx, me(), onClose() }
    this.open = false;
    const el = (this.el = document.createElement('div'));
    el.id = 'repair';
    el.innerHTML = `<div class="rg-win"><div class="rg-head"><b class="rg-title"></b><span class="rg-sub"></span><span class="rg-time"></span><button class="rg-x" title="Abandon (Esc)">✕ ABANDON</button></div>
      <div class="rg-main"><div class="rg-view"><canvas></canvas><div class="rg-cam"><button data-c="l" title="Turn left (←)">⟲</button><button data-c="u" title="Tilt up (↑)">▲</button><button data-c="d" title="Tilt down (↓)">▼</button><button data-c="r" title="Turn right (→)">⟳</button><button data-c="i" title="Zoom in (+)">＋</button><button data-c="o" title="Zoom out (−)">－</button><button data-c="0" title="Reset view (0)">⌂</button></div><div class="rg-camhint">Right-drag or two fingers: turn the view · wheel: zoom</div><div class="rg-msg"></div><div class="rg-prog"><i></i></div></div>
      <div class="rg-side"><div class="rg-h">TOOLS</div><div class="rg-tools"></div><div class="rg-sizes"></div><div class="rg-h">PARTS FROM STORES</div><div class="rg-parts"></div><div class="rg-h">PROCEDURE</div><ol class="rg-steps"></ol></div></div></div>`;
    document.body.appendChild(el);
    this.canvas = el.querySelector('canvas');
    this.msgEl = el.querySelector('.rg-msg'); this.progEl = el.querySelector('.rg-prog i');
    el.querySelector('.rg-x').onclick = () => this.close(true);
    const tb = el.querySelector('.rg-tools');
    this.toolBtns = TOOLS.map((t) => { const b = document.createElement('button'); b.className = 'rg-tool'; b.innerHTML = `<kbd>${t.key}</kbd> ${t.name}`; b.onclick = () => this.selectTool(t.id); tb.appendChild(b); return b; });
    this.sizesEl = el.querySelector('.rg-sizes'); this.partsEl = el.querySelector('.rg-parts'); this.stepsEl = el.querySelector('.rg-steps');
    // view: right-drag (or Alt/two-finger drag) turns the camera round the bench, the wheel or a pinch zooms
    this.view = { yaw: 0, pitch: 0.03, dist: 1.28 };
    const touches = new Map(); let orbit = null, pinch = 0;
    this.canvas.addEventListener('pointermove', (e) => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 2) { const [a, b] = [...touches.values()], c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (orbit) this.turnView((c[0] - orbit[0]) * 0.006, (c[1] - orbit[1]) * 0.006); if (pinch) this.zoomView(pinch / d); orbit = c; pinch = d; return; }
      if (orbit && touches.size < 2) { this.turnView((e.clientX - orbit[0]) * 0.006, (e.clientY - orbit[1]) * 0.006); orbit = [e.clientX, e.clientY]; return; }
      this.onMove(e);
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') { touches.set(e.pointerId, [e.clientX, e.clientY]); if (touches.size === 2) { this.action = null; orbit = null; pinch = 0; return; } }
      if (e.button === 2 || e.button === 1 || e.altKey) { orbit = [e.clientX, e.clientY]; this.canvas.setPointerCapture(e.pointerId); return; }
      this.onDown(e);
    });
    window.addEventListener('pointerup', (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; if (orbit && touches.size === 0) { orbit = null; return; } this.onUp(); });
    this.canvas.addEventListener('wheel', (e) => { if (!this.open) return; e.preventDefault(); this.zoomView(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });
    el.querySelectorAll('.rg-cam button').forEach((b) => (b.onclick = () => this.camKey(b.dataset.c)));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  init() {
    if (this.renderer) return;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.9;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const sc = (this.scene = new THREE.Scene()); sc.background = new THREE.Color(0x101318);
    { // a simple studio for metal reflections
      const env = new THREE.Scene(); env.add(new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: 0x40454d, side: THREE.BackSide })));
      const p = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), new THREE.MeshBasicMaterial({ color: 0xffffff })); p.position.set(0, 2.9, 0); p.rotation.x = Math.PI / 2; env.add(p);
      const p2 = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), new THREE.MeshBasicMaterial({ color: 0xfff0dd })); p2.position.set(-4.9, 0.5, 0); p2.rotation.y = Math.PI / 2; env.add(p2);
      const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(env, 0.03).texture; pm.dispose();
    }
    const key = new THREE.SpotLight(0xfff4e6, 6, 6, 0.7, 0.5, 1.2); key.position.set(-0.8, 1.1, 1.4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; sc.add(key); sc.add(key.target);
    sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2420, 0.6));
    this.lamp = new THREE.PointLight(0xffffff, 0.9, 3); this.lamp.position.set(0.4, 0.3, 0.9); sc.add(this.lamp);
    this.cam = new THREE.PerspectiveCamera(42, 1.5, 0.01, 20); this.cam.position.set(0, 0.04, 1.28); this.cam.lookAt(0, 0, 0);
    this.ray = new THREE.Raycaster();
    this.tools = buildTools();
    this.toolRoot = new THREE.Group(); sc.add(this.toolRoot);
    this.toolScale = 1.7;
    for (const t of Object.values(this.tools)) { t.scale.setScalar(this.toolScale); t.visible = false; t.traverse((o) => { if (o.isMesh) o.castShadow = true; }); this.toolRoot.add(t); }
    this.sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(120 * 3), 3)), new THREE.PointsMaterial({ color: 0xffd28a, size: 0.006, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sparkV = Array.from({ length: 120 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9 }));
    this.sparks.frustumCulled = false; sc.add(this.sparks);
  }

  // ---------------- opening a job ----------------
  start(id) {
    const S = this.host.S(), need = repairNeeds(S, id);
    if (!need) return false;
    this.init();
    this.id = id; this.need = need; this.jobKey = need.issues.map((i) => i.label).join('|');
    this.diff = S.settings.style || S.settings.difficulty;
    this.speed = { recruit: 0.6, spacer: 0.8, veteran: 1, newtonian: 1.25 }[this.diff] || 1;
    this.hints = this.diff === 'recruit' || this.diff === 'spacer';
    this.used = {}; this.stage = 0; this.errors = 0; this.elapsed = 0; this.view = { yaw: 0, pitch: 0.03, dist: 1.28 }; this.action = null; this.tool = 'hand'; this.part = null; this.bit = 'PH2'; this.socket = '13';
    this.el.querySelector('.rg-title').textContent = `${COMPS[id].name.toUpperCase()} — ${need.issues.map((i) => i.label.toUpperCase()).join(' + ')}`;
    this.buildStage();
    this.el.style.display = 'flex'; this.open = true;
    this.resize();
    this.selectTool('hand');
    this.say(this.hints ? 'Follow the procedure on the right. Pick a tool (1–8), then hold the mouse on the part to work it.' : 'Pick the right tool and size for each fastener. Hold the mouse to work.');
    return true;
  }
  close(abandon) {
    if (!this.open) return;
    this.open = false; this.el.style.display = 'none'; this.action = null;
    if (this.bench) { this.scene.remove(this.bench); this.bench = null; }
    if (abandon) this.host.toast && this.host.toast('Repair abandoned — the module is still broken', 'warn');
    this.host.onClose && this.host.onClose();
  }
  resize() {
    const v = this.el.querySelector('.rg-view'), w = v.clientWidth, h = v.clientHeight;
    this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }
  say(t, bad) { if (bad) this.errors = (this.errors || 0) + 1; this.msgEl.textContent = t; this.msgEl.className = 'rg-msg' + (bad ? ' bad' : ''); this.msgT = 5; if (bad && this.host.sfx) this.host.sfx.play('warn'); }
  size(kind) { // fastener sizes by difficulty
    if (kind === 'screw') return this.diff === 'recruit' ? 'PH2' : this.diff === 'spacer' ? mgPick(['PH1', 'PH2']) : this.diff === 'veteran' ? mgPick(['PH2', 'HEX4']) : mgPick(BITS);
    return this.diff === 'recruit' || this.diff === 'spacer' ? '13' : this.diff === 'veteran' ? mgPick(['13', '17']) : mgPick(SOCKETS);
  }
  sizesKnown() { return this.diff !== 'newtonian'; }

  // ---------------- stage building ----------------
  buildStage() {
    if (this.bench) this.scene.remove(this.bench);
    const issue = this.need.issues[this.stage];
    this.issue = issue;
    this.el.querySelector('.rg-sub').textContent = `${PROCS[issue.proc].name}${this.need.issues.length > 1 ? ` · stage ${this.stage + 1} of ${this.need.issues.length}` : ''}`;
    this.bench = new THREE.Group(); this.scene.add(this.bench);
    this.targets = []; this.steps = []; this.st = {};
    const m = mgMats();
    const back = mgBox(1.7, 1.1, 0.04, m.dark); back.position.z = -0.32; back.receiveShadow = true; this.bench.add(back);
    ({ circuit: () => this.buildCircuit(issue.f), coolant: () => this.buildCoolant(issue.f), bearing: () => this.buildBearing(issue.f), hv: () => this.buildHV(issue.f), weld: () => this.buildWeld(issue.f), optics: () => this.buildOptics(issue.f) })[issue.proc]();
    this.bench.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.renderParts();
  }
  // a target is anything you can work on: obj is raycast; tool/size gate it; ok() says if it is its turn
  T(o) { const t = { dur: 1, size: null, hint: true, ...o }; t.obj.traverse((x) => { x.userData.t = t; }); this.targets.push(t); return t; }
  step(text, done) { this.steps.push({ text, done }); }

  // housing with an access panel held by screws; returns { panel, screwsOut(), panelOff(), closed() }
  housing(w, h, nScrews, depth = 0.3) {
    const m = mgMats(), st = this.st;
    const shell = new THREE.Group(); this.bench.add(shell);
    const sides = [[w + 0.04, 0.02, 0, (h + 0.02) / 2], [w + 0.04, 0.02, 0, -(h + 0.02) / 2], [0.02, h + 0.04, (w + 0.02) / 2, 0], [0.02, h + 0.04, -(w + 0.02) / 2, 0]];
    for (const [sw, sh, x, y] of sides) { const b = mgBox(sw, sh, depth, m.housing); b.position.set(x, y, -depth / 2); shell.add(b); }
    const inner = mgBox(w, h, 0.01, m.dark); inner.position.z = -depth; shell.add(inner);
    const panel = new THREE.Group(); panel.position.z = 0.006; this.bench.add(panel);
    const plate = mgBox(w + 0.02, h + 0.02, 0.008, m.housing); panel.add(plate);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.04), new THREE.MeshBasicMaterial({ map: mgLabel('⚠ ' + moduleOf(this.id).name.toUpperCase()) })); lab.position.set(-w / 2 + 0.17, h / 2 - 0.085, 0.0045); panel.add(lab);
    for (let i = 0; i < 6; i++) { const v = mgBox(0.08, 0.004, 0.002, m.dark); v.position.set(w / 2 - 0.08, -h / 2 + 0.06 + i * 0.012, 0.0045); panel.add(v); }
    st.screws = []; st.panelOff = false; st.panelBack = false;
    const pos = [];
    const per = Math.max(2, Math.ceil(nScrews / 2));
    for (let i = 0; i < per; i++) { const x = -w / 2 + 0.035 + ((w - 0.07) * i) / (per - 1); pos.push([x, h / 2 - 0.03], [x, -h / 2 + 0.03]); }
    pos.length = nScrews;
    for (const [x, y] of pos) {
      const size = this.size('screw');
      const sm = screwMesh(size); sm.position.set(x, y, 0.01); this.bench.add(sm);
      const sc = { obj: sm, x, y, size, in: true, stripped: false };
      st.screws.push(sc);
      this.T({ obj: sm, kind: 'screw', tool: 'driver', size, dur: 0.9, sc,
        label: () => `Screw ${this.sizesKnown() ? size : ''}`,
        ok: () => (sc.in ? !st.panelOff : st.panelBack && st.closeReady()),
        why: () => (sc.in ? 'Panel is already off' : !st.closeReady() ? 'Finish the repair inside first' : 'Put the panel back on first'),
        anim: (k) => { sm.position.z = 0.01 + (sc.in ? k : 1 - k) * 0.03; sm.rotation.z = (sc.in ? -k : k) * 18; },
        done: () => { sc.in = !sc.in; sm.position.z = sc.in ? 0.01 : 0.04; sm.visible = sc.in || !st.panelOff; if (!sc.in && !st.panelOff) sm.position.z = 0.04; this.host.sfx && this.host.sfx.click(0.25, 0, 3200); },
      });
    }
    this.T({ obj: panel, kind: 'panel', tool: 'hand', dur: 0.6,
      ok: () => (!st.panelOff ? st.screws.every((s) => !s.in) : !st.panelBack && st.closeReady()),
      why: () => (!st.panelOff ? 'Take out all the screws first' : 'Finish the repair inside first'),
      anim: (k) => { if (!st.panelOff) { panel.position.set(k * (w * 0.9), -k * 0.05, 0.006 + k * 0.12); panel.rotation.y = -k * 0.5; } else { panel.position.set((1 - k) * (w * 0.9), -(1 - k) * 0.05, 0.006 + (1 - k) * 0.12); panel.rotation.y = -(1 - k) * 0.5; } },
      done: () => {
        if (!st.panelOff) { st.panelOff = true; panel.position.set(w * 0.95, -0.05, 0.13); panel.rotation.y = -0.5; for (const s of st.screws) s.obj.visible = false; }
        else { st.panelBack = true; panel.position.set(0, 0, 0.006); panel.rotation.y = 0; for (const s of st.screws) { s.obj.visible = true; s.obj.position.z = 0.04; } }
        this.host.sfx && this.host.sfx.noise(0.12, 0.15, 1800);
      },
    });
    st.closeReady = () => true;
    this.step(`Unscrew the access panel (${nScrews} screws${this.sizesKnown() ? '' : ', mixed sizes'})`, () => st.panelOff);
    this.step('Lift the panel off', () => st.panelOff);
    return { w, h };
  }
  closeSteps() {
    const st = this.st;
    this.step('Put the panel back on', () => st.panelBack);
    this.step('Screw it shut', () => st.panelBack && st.screws.every((s) => s.in));
  }
  testPort(x, y, z = 0.01, label = 'TEST') {
    const m = mgMats(), st = this.st, g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(2.2); this.bench.add(g);
    const plate = mgBox(0.07, 0.05, 0.006, m.dark); g.add(plate);
    const bezel = mgBox(0.078, 0.058, 0.004, m.yellow); bezel.position.z = -0.004; g.add(bezel);
    for (const [dx, mm] of [[-0.015, m.red], [0.015, m.blackOx]]) { const j = mgCyl(0.006, 0.006, 0.01, mm, 12); j.rotation.x = Math.PI / 2; j.position.set(dx, -0.004, 0.006); g.add(j); }
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), new THREE.MeshBasicMaterial({ color: 0x401010 })); led.position.set(0, 0.016, 0.005); g.add(led);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.012), new THREE.MeshBasicMaterial({ map: mgLabel(label, '#fff', '#2b2f35') })); lab.position.set(0, 0.033, 0.004); g.add(lab);
    st.tested = false;
    this.T({ obj: g, kind: 'test', tool: 'probe', dur: 1.2, ok: () => st.testReady(), why: () => 'Not ready to test yet', done: () => { st.tested = true; led.material.color.setHex(0x30ff60); this.host.sfx && this.host.sfx.chirp(1760, 0.08, 0.05); } });
    st.testReady = () => true;
    return g;
  }

  // ---------------- circuit: cards + wiring ----------------
  buildCircuit(f) {
    const m = mgMats(), st = this.st;
    const { w, h } = this.housing(0.9, 0.56, f.s);
    // card cage with n cards, some scorched
    const cards = [], n = f.cards, bad = new Set();
    while (bad.size < f.bad) bad.add(Math.floor(Math.random() * n));
    const rail = mgBox(0.5, 0.012, 0.2, m.steel); rail.position.set(-0.13, 0.17, -0.15); this.bench.add(rail);
    const rail2 = rail.clone(); rail2.position.y = -0.09; this.bench.add(rail2);
    for (let i = 0; i < n; i++) {
      const x = -0.36 + i * (0.46 / Math.max(1, n - 1));
      const card = new THREE.Group(); card.position.set(x, 0.04, -0.14); this.bench.add(card);
      const pcb = mgBox(0.004, 0.25, 0.17, bad.has(i) ? m.pcbBurnt : m.pcb); card.add(pcb);
      const pull = mgBox(0.012, 0.03, 0.012, m.red); pull.position.set(0, 0.11, 0.09); card.add(pull);
      const c = { card, i, bad: bad.has(i), state: bad.has(i) ? 'bad' : 'ok' };
      if (c.bad) { const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: mgGlow(), color: 0x302820, transparent: true, opacity: 0.5, depthWrite: false })); smoke.position.set(0, 0.05, 0.05); smoke.scale.setScalar(0.12); card.add(smoke); c.smoke = smoke; }
      cards.push(c);
      if (!c.bad) continue;
      this.T({ obj: card, kind: 'card', tool: 'tweezers', dur: 1.1, c,
        ok: () => st.panelOff && !st.panelBack && c.state !== 'ok', why: () => 'The access panel is in the way',
        label: () => (c.state === 'bad' ? 'Scorched card: pull it' : 'Empty slot: fit a spare card'),
        part: () => (c.state === 'empty' ? 'board' : null),
        anim: (k) => { if (c.state === 'bad') card.position.z = -0.14 + k * 0.2; else card.position.z = 0.06 - k * 0.2; },
        done: () => {
          if (c.state === 'bad') { c.state = 'empty'; if (c.smoke) c.smoke.userData.wasVis = false; ghost(card, true); card.position.z = 0.06; this.host.sfx && this.host.sfx.noise(0.15, 0.1, 2400); }
          else { c.state = 'ok'; ghost(card, false); card.position.z = -0.14; pcb.material = m.pcb; if (c.smoke) c.smoke.visible = false; this.use('board'); this.host.sfx && this.host.sfx.click(0.3, 0, 2600); }
        },
        toolFor: () => (c.state === 'empty' ? 'part' : 'tweezers'),
      });
    }
    // wiring harness: a few cables across the bottom; some segments burnt (cut out, then splice and tape)
    const wires = [];
    const cut = new Set(); while (cut.size < f.cut) cut.add(Math.floor(Math.random() * f.wires));
    for (let i = 0; i < f.wires; i++) {
      const y = -0.17 - i * 0.03, mat = [m.wireR, m.wireB, m.wireW][i % 3];
      const pts = [new THREE.Vector3(-0.42, y, -0.05), new THREE.Vector3(-0.15, y + 0.01, -0.03), new THREE.Vector3(0.15, y - 0.01, -0.03), new THREE.Vector3(0.42, y, -0.05)];
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.006, 8), mat); this.bench.add(tube);
      if (!cut.has(i)) continue;
      const sx = mgRnd(-0.2, 0.2);
      const seg = new THREE.Group(); seg.position.set(sx, y, -0.03); this.bench.add(seg);
      const burnt = mgCyl(0.0075, 0.0075, 0.05, m.wireBurnt, 10); burnt.rotation.z = Math.PI / 2; seg.add(burnt);
      const cu = mgCyl(0.003, 0.003, 0.02, m.copper, 8); cu.rotation.z = Math.PI / 2; seg.add(cu);
      const tape = mgCyl(0.0095, 0.0095, 0.07, m.tape, 12); tape.rotation.z = Math.PI / 2; tape.visible = false; seg.add(tape);
      const wv = { seg, state: 'burnt', burnt, cu, tape }; wires.push(wv);
      this.T({ obj: seg, kind: 'wire', dur: 0.8, wv,
        toolFor: () => (wv.state === 'burnt' ? 'cutters' : 'tape'),
        ok: () => st.panelOff && !st.panelBack && wv.state !== 'taped', why: () => 'The access panel is in the way',
        label: () => (wv.state === 'burnt' ? 'Burnt section: cut it out' : 'Splice and tape the joint'),
        need: () => (wv.state === 'cut' ? 'wire' : null),
        anim: (k) => { if (wv.state === 'cut') tape.scale.set(1, k, 1); },
        done: () => {
          if (wv.state === 'burnt') { wv.state = 'cut'; burnt.visible = false; cu.scale.set(1, 0.4, 1); this.host.sfx && this.host.sfx.click(0.5, 0, 6000); }
          else { wv.state = 'taped'; tape.visible = true; tape.scale.set(1, 1, 1); cu.visible = false; this.use('wire'); this.host.sfx && this.host.sfx.noise(0.35, 0.12, 5000); }
        },
        durFor: () => (wv.state === 'cut' ? 1.8 : 0.8),
      });
    }
    this.testPort(0.3, -0.41, 0.02);
    st.closeReady = () => cards.every((c) => c.state === 'ok') && wires.every((w2) => w2.state === 'taped');
    st.testReady = () => st.panelBack && st.screws.every((s) => s.in);
    if (f.bad) { this.step(`Pull the scorched card${f.bad > 1 ? 's' : ''} (tweezers)`, () => cards.every((c) => !c.bad || c.state !== 'bad')); this.step(`Fit ${f.bad} spare card${f.bad > 1 ? 's' : ''} from stores`, () => cards.every((c) => c.state === 'ok')); }
    if (f.cut) { this.step(`Cut out the burnt wiring (cutters)`, () => wires.every((x) => x.state !== 'burnt')); this.step('Splice and tape each joint', () => wires.every((x) => x.state === 'taped')); }
    this.closeSteps();
    this.step('Probe the test port', () => st.tested);
    st.complete = () => st.tested;
  }

  // ---------------- coolant: valve, flange, gasket, star-pattern bolts ----------------
  buildCoolant(f) {
    const m = mgMats(), st = this.st;
    // a pipe run with an isolation valve (handwheel) and a bolted flange joint, angled so the flange face shows
    const bench0 = this.bench; const asm = new THREE.Group(); asm.rotation.y = -0.55; asm.position.set(0.02, 0, 0.12); bench0.add(asm); this.bench = asm;
    const pipe = mgCyl(0.045, 0.045, 1.15, m.steel, 24); pipe.rotation.z = Math.PI / 2; pipe.position.set(0, -0.02, -0.12); this.bench.add(pipe);
    for (const x of [-0.52, 0.52]) { const cl = mgBox(0.04, 0.2, 0.1, m.dark); cl.position.set(x, -0.08, -0.16); this.bench.add(cl); }
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.035), new THREE.MeshBasicMaterial({ map: mgLabel('COOLANT · 6 bar', '#111', '#4ad0e6') })); tag.position.set(-0.3, 0.27, -0.12); this.bench.add(tag);
    // valve
    const vbody = mgBox(0.09, 0.1, 0.1, m.blue); vbody.position.set(-0.3, -0.02, -0.12); this.bench.add(vbody);
    const stem = mgCyl(0.008, 0.008, 0.12, m.steel, 10); stem.position.set(-0.3, 0.07, -0.12); this.bench.add(stem);
    const wheel = new THREE.Group(); wheel.position.set(-0.3, 0.13, -0.12); this.bench.add(wheel);
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 10, 28), m.red).rotateX(Math.PI / 2));
    for (let i = 0; i < 4; i++) { const sp = mgBox(0.12, 0.006, 0.006, m.red); sp.rotation.y = (i * Math.PI) / 4; wheel.add(sp); }
    st.valve = 'open';
    this.T({ obj: wheel, kind: 'valve', tool: 'hand', dur: 1.8,
      ok: () => (st.valve === 'open' ? !st.reassembling : st.valve === 'closed' && st.boltsDone()), why: () => (st.valve === 'reopened' ? 'Already open' : 'Bolt the flange back up first'),
      label: () => (st.valve === 'open' ? 'Close the isolation valve' : 'Reopen the valve'),
      anim: (k) => { wheel.rotation.y = (st.valve === 'open' ? k : 1 - k) * Math.PI * 4; },
      done: () => { st.valve = st.valve === 'open' ? 'closed' : 'reopened'; this.host.sfx && this.host.sfx.noise(0.6, 0.1, 900); },
    });
    // flange: two discs with a ring of bolts; the front half comes off to reach the gasket
    const fx = 0.18;
    const flA = mgCyl(0.11, 0.11, 0.025, m.steel, 32); flA.rotation.z = Math.PI / 2; flA.position.set(fx - 0.014, -0.02, -0.12); this.bench.add(flA);
    const flB = new THREE.Group(); flB.position.set(fx + 0.014, -0.02, -0.12); this.bench.add(flB);
    const flBm = mgCyl(0.11, 0.11, 0.025, m.steel, 32); flBm.rotation.z = Math.PI / 2; flB.add(flBm);
    const gasket = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.008, 8, 32), m.gasketOld); gasket.rotation.y = Math.PI / 2; gasket.position.set(fx, -0.02, -0.12); this.bench.add(gasket);
    const crack = mgBox(0.004, 0.03, 0.01, m.dark); crack.position.set(fx, 0.05, -0.12); this.bench.add(crack);
    // the bolt ring faces the camera: we look at the flange from the front by rotating the joint toward us
    const ring = new THREE.Group(); ring.position.set(fx + 0.03, -0.02, -0.12); this.bench.add(ring);
    const nb = f.b, bolts = [];
    const star = starOrder(nb);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2, size = this.size('bolt');
      const bm = boltMesh(size); bm.rotation.y = Math.PI / 2; bm.position.set(0.0, Math.sin(a) * 0.09, Math.cos(a) * 0.09); ring.add(bm);
      const b = { bm, i, size, state: 'tight' };
      bolts.push(b);
      const num = new THREE.Sprite(new THREE.SpriteMaterial({ map: numTex(star.indexOf(i) + 1), depthTest: false, transparent: true })); num.scale.setScalar(0.022); num.position.set(0.02, 0, 0); num.visible = false; bm.add(num); b.num = num;
      this.T({ obj: bm, kind: 'bolt', tool: 'wrench', size, dur: 1.1, b,
        label: () => `Bolt${this.sizesKnown() ? ' ' + size + ' mm' : ''}`,
        ok: () => (b.state === 'tight' ? st.valve === 'closed' && !st.reassembling : st.reassembling && st.sealIn && !st.flangeOpen),
        why: () => (b.state === 'tight' && st.valve === 'open' ? 'The line is under pressure — close the isolation valve first!' : b.state === 'tight' ? 'Already tightened' : !st.sealIn ? 'Fit the new gasket first' : 'Close the flange first'),
        anim: (k) => { bm.position.x = (b.state === 'tight' ? k : 1 - k) * 0.03; bm.rotation.x = (b.state === 'tight' ? -k : k) * 12; },
        done: () => {
          if (b.state === 'tight') { b.state = 'out'; bm.position.x = 0.03; }
          else {
            const nextIdx = star[st.torqued.length];
            if (b.i !== nextIdx && this.diff !== 'recruit') { // out of sequence: the gasket pinches
              st.torqued = []; for (const bb of bolts) { bb.state = 'out'; bb.bm.position.x = 0.03; }
              this.say(`Out of sequence: torque the bolts in a star pattern${this.hints ? ' (follow the numbers)' : ''}. Gasket pinched — all bolts backed off, start again.`, true);
              return;
            }
            b.state = 'tight'; bm.position.x = 0; st.torqued.push(b.i);
          }
          this.host.sfx && this.host.sfx.relay(0.4);
        },
        blockIf: () => (b.state === 'out' && st.reassembling && this.diff === 'recruit' && b.i !== star[st.torqued.length] ? `Next in the star pattern is bolt ${st.torqued.length + 1}` : null),
      });
    }
    this.bench = bench0;
    st.torqued = []; st.flangeOpen = false; st.reassembling = false; st.sealIn = false;
    st.boltsDone = () => bolts.every((b) => b.state === 'tight') && st.reassembling;
    this.T({ obj: flB, kind: 'flange', tool: 'hand', dur: 0.7,
      ok: () => (!st.flangeOpen ? bolts.every((b) => b.state === 'out') && !st.reassembling : st.sealIn), why: () => (!st.flangeOpen ? 'Undo every bolt first' : 'Fit the new gasket first'),
      label: () => (!st.flangeOpen ? 'Separate the flange' : 'Close the flange'),
      anim: (k) => { const o = st.flangeOpen ? 1 - k : k; flB.position.x = fx + 0.014 + o * 0.12; ring.position.x = fx + 0.03 + o * 0.12; },
      done: () => { st.flangeOpen = !st.flangeOpen; if (!st.flangeOpen) { st.reassembling = true; for (const b of bolts) b.num.visible = this.hints; } this.host.sfx && this.host.sfx.noise(0.2, 0.1, 1200); },
    });
    this.T({ obj: gasket, kind: 'gasket', dur: 1.0,
      toolFor: () => (st.gasket === 'new' ? 'part' : 'tweezers'), part: () => (st.gasket === 'gone' ? 'seal' : null),
      ok: () => st.flangeOpen && !st.sealIn, why: () => 'Separate the flange to reach the gasket',
      label: () => (st.gasket === 'gone' ? 'Fit the new gasket' : 'Pick out the perished gasket'),
      done: () => { if (st.gasket !== 'gone') { st.gasket = 'gone'; ghost(gasket, true); crack.visible = false; } else { st.sealIn = true; ghost(gasket, false); gasket.material = m.gasket; this.use('seal'); } this.host.sfx && this.host.sfx.click(0.3); },
    });
    st.gasket = 'old';
    this.testPort(0.58, 0.3, 0.06, 'P-TEST');
    st.testReady = () => st.valve === 'reopened';
    this.step('Close the isolation valve', () => st.valve !== 'open');
    this.step(`Undo the ${nb} flange bolts${this.sizesKnown() ? '' : ' (check the socket size)'}`, () => bolts.every((b) => b.state === 'out') || st.reassembling);
    this.step('Separate the flange', () => st.flangeOpen || st.reassembling);
    this.step('Pick out the perished gasket', () => st.gasket !== 'old');
    this.step('Fit a new gasket from stores', () => st.sealIn);
    this.step('Close the flange', () => st.reassembling);
    this.step(`Torque the bolts in a star pattern${this.hints ? ' (numbered)' : ''}`, () => st.boltsDone());
    this.step('Reopen the valve', () => st.valve === 'reopened');
    this.step('Pressure-test (probe the P-TEST port)', () => st.tested);
    st.complete = () => st.tested;
  }

  // ---------------- bearing / actuator ----------------
  buildBearing(f) {
    const m = mgMats(), st = this.st;
    this.housing(0.7, 0.5, f.s);
    // motor with a shaft; the bearing sits on the shaft behind a retaining plate held by bolts
    const motor = mgCyl(0.12, 0.12, 0.18, m.blue, 28); motor.rotation.x = Math.PI / 2; motor.position.set(-0.05, 0, -0.2); this.bench.add(motor);
    for (let i = 0; i < 10; i++) { const fin = mgBox(0.25, 0.006, 0.17, m.blue); fin.position.set(-0.05, -0.12 + i * 0.026, -0.2); fin.scale.x = Math.sqrt(Math.max(0.05, 1 - Math.pow((-0.12 + i * 0.026) / 0.13, 2))); this.bench.add(fin); }
    const shaft = mgCyl(0.014, 0.014, 0.2, m.steel, 14); shaft.rotation.x = Math.PI / 2; shaft.position.set(-0.05, 0, -0.03); this.bench.add(shaft);
    const bearing = new THREE.Group(); bearing.position.set(-0.05, 0, -0.06); this.bench.add(bearing);
    const outer = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 12, 32), m.steel); bearing.add(outer);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const ball = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), m.dark); ball.position.set(Math.cos(a) * 0.033, Math.sin(a) * 0.033, 0); bearing.add(ball); }
    const rust = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.0125, 8, 32), new THREE.MeshStandardMaterial({ color: 0x6a3a1c, roughness: 1, transparent: true, opacity: 0.7 })); bearing.add(rust);
    const plate = new THREE.Group(); plate.position.set(-0.05, 0, -0.02); this.bench.add(plate);
    const pl = mgCyl(0.075, 0.075, 0.008, m.steel, 28); pl.rotation.x = Math.PI / 2; plate.add(pl);
    const bolts = [];
    for (let i = 0; i < f.b; i++) {
      const a = (i / f.b) * Math.PI * 2 + 0.3, size = this.size('bolt');
      const bm = boltMesh(size); bm.position.set(-0.05 + Math.cos(a) * 0.058, Math.sin(a) * 0.058, -0.012); this.bench.add(bm);
      const b = { bm, size, state: 'tight' }; bolts.push(b);
      this.T({ obj: bm, kind: 'bolt', tool: 'wrench', size, dur: 1.0, b, label: () => `Retaining bolt${this.sizesKnown() ? ' ' + size + ' mm' : ''}`,
        ok: () => st.panelOff && !st.panelBack && (b.state === 'tight' ? st.br === 'old' : st.br === 'new' && st.plateOn), why: () => (!st.panelOff ? 'The cover is in the way' : b.state === 'tight' ? 'Already tight' : 'Fit the new bearing and the retaining plate first'),
        anim: (k) => { bm.position.z = -0.012 + (b.state === 'tight' ? k : 1 - k) * 0.03; bm.rotation.z = (b.state === 'tight' ? -k : k) * 14; },
        done: () => { b.state = b.state === 'tight' ? 'out' : 'tight'; bm.position.z = b.state === 'tight' ? -0.012 : 0.018; this.host.sfx && this.host.sfx.relay(0.4); } });
    }
    st.br = 'old'; st.plateOn = true;
    this.T({ obj: plate, kind: 'plate', tool: 'hand', dur: 0.6, ok: () => st.panelOff && (st.plateOn ? bolts.every((b) => b.state === 'out') : st.br === 'new'), why: () => (st.plateOn ? 'Undo the retaining bolts first' : 'Fit the new bearing first'),
      label: () => (st.plateOn ? 'Lift off the retaining plate' : 'Refit the retaining plate'),
      anim: (k) => { plate.position.z = -0.02 + (st.plateOn ? k : 1 - k) * 0.1; },
      done: () => { st.plateOn = !st.plateOn; plate.position.z = st.plateOn ? -0.02 : 0.08; for (const b of bolts) b.bm.visible = st.plateOn || b.state === 'tight'; } });
    this.T({ obj: bearing, kind: 'bearing', dur: 1.6, toolFor: () => (st.br === 'gone' ? 'part' : 'hand'), part: () => (st.br === 'gone' ? 'bearing' : null),
      ok: () => !st.plateOn && st.br !== 'new', why: () => 'Lift the retaining plate off first',
      label: () => (st.br === 'old' ? 'Draw off the seized bearing' : 'Press on a new bearing'),
      anim: (k) => { bearing.position.z = st.br === 'old' ? -0.06 + k * 0.12 : 0.06 - k * 0.12; bearing.rotation.z += 0.05; },
      done: () => { if (st.br === 'old') { st.br = 'gone'; ghost(bearing, true); } else { st.br = 'new'; ghost(bearing, false); rust.visible = false; bearing.position.z = -0.06; rust.visible = false; this.use('bearing'); } this.host.sfx && this.host.sfx.noise(0.3, 0.15, 1400); } });
    const tp = this.testPort(0.25, -0.37, 0.02, 'RUN');
    st.closeReady = () => st.br === 'new' && st.plateOn && bolts.every((b) => b.state === 'tight');
    st.testReady = () => st.panelBack && st.screws.every((s) => s.in);
    this.step(`Undo the retaining bolts${this.sizesKnown() ? '' : ' (check the socket)'}`, () => bolts.every((b) => b.state === 'out') || st.br !== 'old');
    this.step('Lift off the retaining plate', () => !st.plateOn || st.br === 'new');
    this.step('Draw off the seized bearing', () => st.br !== 'old');
    this.step('Press on a new bearing from stores', () => st.br === 'new');
    this.step('Refit the plate and torque the bolts', () => st.closeReady());
    this.closeSteps();
    this.step('Test-run the motor (probe RUN)', () => st.tested);
    st.complete = () => st.tested;
    this.st.spin = () => { if (st.tested) shaft.rotation.y += 0.4; };
    void tp;
  }

  // ---------------- high voltage: lockout, discharge, fuses/cells ----------------
  buildHV(f) {
    const m = mgMats(), st = this.st;
    // breaker beside the housing, with a lockout hasp
    const br = new THREE.Group(); br.position.set(0.56, 0.12, 0.02); this.bench.add(br);
    br.add(mgBox(0.1, 0.16, 0.04, m.dark));
    const lever = new THREE.Group(); br.add(lever); const lv = mgBox(0.02, 0.07, 0.02, m.red); lv.position.y = 0.03; lever.add(lv); lever.position.z = 0.03;
    const lock = mgBox(0.03, 0.04, 0.012, m.yellow); lock.position.set(0, -0.06, 0.03); lock.visible = false; br.add(lock);
    const hvl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.02), new THREE.MeshBasicMaterial({ map: mgLabel('⚡ 4 kV', '#111', '#e8d44a') })); hvl.position.set(0, 0.095, 0.021); br.add(hvl);
    st.breaker = 'on';
    this.T({ obj: br, kind: 'breaker', tool: 'hand', dur: 0.7, ok: () => (st.breaker === 'on' ? true : st.breaker === 'locked' && st.closedAll()), why: () => (st.breaker === 'on' ? 'Already on' : 'Close everything up first'),
      label: () => (st.breaker === 'on' ? 'Open the breaker and lock it out' : 'Remove the lock and restore power'),
      anim: (k) => { lever.rotation.x = (st.breaker === 'on' ? k : 1 - k) * 2.2; },
      done: () => { st.breaker = st.breaker === 'on' ? 'locked' : 'restored'; lock.visible = st.breaker === 'locked'; this.host.sfx && this.host.sfx.relay(0.9); } });
    this.housing(0.9, 0.56, f.s);
    // capacitor bank: two terminals to short with the grounding probe
    const caps = [];
    for (let i = 0; i < 3; i++) { const c = mgCyl(0.04, 0.04, 0.16, m.blue, 20); c.position.set(-0.32 + i * 0.09, 0.12, -0.16); this.bench.add(c); caps.push(c); }
    const terms = [];
    for (let i = 0; i < 2; i++) {
      const t = new THREE.Group(); t.position.set(-0.32 + i * 0.18, 0.21, -0.16); this.bench.add(t);
      const post = mgCyl(0.008, 0.008, 0.03, m.brass, 10); t.add(post);
      const term = { t, done: false }; terms.push(term);
      this.T({ obj: t, kind: 'term', tool: 'probe', dur: 0.9, label: () => 'Capacitor terminal: discharge it',
        ok: () => st.panelOff && st.breaker === 'locked' && !term.done, why: () => (st.breaker !== 'locked' ? 'LOCK OUT THE BREAKER FIRST' : 'The panel is in the way'),
        done: () => { term.done = true; this.burst(t.position.clone().add(new THREE.Vector3(0, 0.02, 0)), 30); this.host.sfx && this.host.sfx.noise(0.25, 0.4, 7000); } });
    }
    // fuse / cell holders
    const cells = [], bad = new Set(); while (bad.size < f.bad) bad.add(Math.floor(Math.random() * f.cells));
    for (let i = 0; i < f.cells; i++) {
      const g = new THREE.Group(); g.position.set(-0.36 + (i % 4) * 0.12 + (i >= 4 ? 0.06 : 0), -0.06 - Math.floor(i / 4) * 0.13, -0.12); this.bench.add(g);
      const holder = mgBox(0.07, 0.1, 0.03, m.dark); holder.position.z = -0.03; g.add(holder);
      const fuse = new THREE.Group(); g.add(fuse);
      const body = mgCyl(0.016, 0.016, 0.08, bad.has(i) ? new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.9 }) : m.glass, 14); fuse.add(body);
      for (const y of [-0.045, 0.045]) { const cap = mgCyl(0.018, 0.018, 0.012, m.brass, 14); cap.position.y = y; fuse.add(cap); }
      const c = { g, fuse, body, bad: bad.has(i), state: bad.has(i) ? 'blown' : 'ok' }; cells.push(c);
      if (!c.bad) continue;
      this.T({ obj: g, kind: 'cell', dur: 1.0, toolFor: () => (c.state === 'gone' ? 'part' : 'tweezers'), part: () => (c.state === 'gone' ? 'cell' : null),
        label: () => (c.state === 'blown' ? 'Blown fuse: pull it' : 'Fit a new HV fuse'),
        ok: () => st.panelOff && !st.panelBack && c.state !== 'ok' && terms.every((t) => t.done),
        why: () => (st.breaker !== 'locked' ? 'LETHAL: lock out the breaker first' : !terms.every((t) => t.done) ? 'LETHAL: discharge the capacitor bank with the probe first' : 'The panel is in the way'),
        shock: () => st.panelOff && (st.breaker !== 'locked' || !terms.every((t) => t.done)),
        anim: (k) => { fuse.position.z = c.state === 'blown' ? k * 0.08 : 0.08 - k * 0.08; },
        done: () => { if (c.state === 'blown') { c.state = 'gone'; ghost(fuse, true); } else { c.state = 'ok'; ghost(fuse, false); fuse.position.z = 0; body.material = m.glass; this.use('cell'); } this.host.sfx && this.host.sfx.click(0.35, 0, 2000); } });
    }
    this.testPort(0.3, -0.41, 0.03, 'HV TEST');
    st.closeReady = () => cells.every((c) => c.state === 'ok');
    st.closedAll = () => st.panelBack && st.screws.every((s) => s.in);
    st.testReady = () => st.breaker === 'restored';
    this.steps.unshift({ text: 'Open the breaker and lock it out', done: () => st.breaker !== 'on' });
    this.step('Discharge both capacitor terminals (probe)', () => terms.every((t) => t.done));
    this.step(`Pull the blown fuse${f.bad > 1 ? 's' : ''}`, () => cells.every((c) => c.state !== 'blown'));
    this.step(`Fit ${f.bad} new fuse${f.bad > 1 ? 's' : ''} from stores`, () => cells.every((c) => c.state === 'ok'));
    this.closeSteps();
    this.step('Restore power at the breaker', () => st.breaker === 'restored');
    this.step('Probe HV TEST', () => st.tested);
    st.complete = () => st.tested;
  }

  // ---------------- weld: lay a bead along the whole crack ----------------
  buildWeld(f) {
    const m = mgMats(), st = this.st;
    const plate = mgBox(1.0, 0.6, 0.03, new THREE.MeshStandardMaterial({ map: mgBrushed('#7f878f'), roughness: 0.5, metalness: 0.8 })); plate.position.z = -0.03; this.bench.add(plate);
    for (const [x, y] of [[-0.45, 0.25], [0.45, 0.25], [-0.45, -0.25], [0.45, -0.25]]) { const r = boltMesh('17'); r.position.set(x, y, -0.015); this.bench.add(r); }
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.045), new THREE.MeshBasicMaterial({ map: mgLabel('STRUCTURAL · NO GRINDING') })); lab.position.set(-0.3, 0.24, 0.001); this.bench.add(lab);
    // crack: a jagged polyline; weld points along it must be laid in order with the welder held down
    const n = 6 + f.len * 4, pts = [];
    let x = -0.38, y = mgRnd(-0.12, 0.12);
    for (let i = 0; i < n; i++) { pts.push(new THREE.Vector3(x, y, 0.0)); x += 0.76 / (n - 1); y = Math.max(-0.2, Math.min(0.2, y + mgRnd(-0.05, 0.05))); }
    const crackGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 6, 0.0035, 6);
    this.bench.add(new THREE.Mesh(crackGeo, new THREE.MeshBasicMaterial({ color: 0x050505 })));
    st.wpts = pts; st.wi = 0; st.beads = []; st.inspected = false;
    const hit = mgBox(0.85, 0.5, 0.02, new THREE.MeshBasicMaterial({ visible: false })); hit.position.z = 0.005; this.bench.add(hit);
    this.T({ obj: hit, kind: 'weld', tool: 'welder', dur: 99, continuous: true, label: () => 'Weld along the crack (hold and trace it)',
      ok: () => st.wi < pts.length, why: () => 'The crack is closed',
      drag: (p) => { // called while holding: advance when the torch is near the next point
        const next = pts[st.wi];
        if (next && p.distanceTo(next) < 0.03) {
          if (st.wi > 0) { const a = pts[st.wi - 1], b = next; const len = a.distanceTo(b); const bead = mgCyl(0.007, 0.007, len, m.bead, 8); bead.position.copy(a).add(b).multiplyScalar(0.5); bead.position.z = 0.004; bead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); bead.material = m.bead.clone(); this.bench.add(bead); st.beads.push({ bead, t: 0 }); }
          st.wi++;
          if (st.wi >= pts.length) { this.use('filler', this.issue.parts.filler || 1); this.say('Crack closed. Let it cool, then inspect the bead with the probe.'); }
        }
        return next ? 1 - p.distanceTo(next) * 10 : 1;
      } });
    // inspection: probe the bead once cool
    const ins = new THREE.Group(); ins.position.set(0.0, 0.0, 0.01); this.bench.add(ins);
    this.T({ obj: hit, kind: 'inspect', tool: 'probe', dur: 1.4, label: () => 'Inspect the bead', ok: () => st.wi >= pts.length && st.beads.every((b) => b.t > 2.5), why: () => (st.wi < pts.length ? 'Finish the weld first' : 'Wait for the bead to cool'), done: () => { st.inspected = true; this.host.sfx && this.host.sfx.chirp(1567, 0.08, 0.05); } });
    this.step(`Trace the welder along the whole crack (${n} points)`, () => st.wi >= pts.length);
    this.step('Let the bead cool, then inspect it (probe)', () => st.inspected);
    st.complete = () => st.inspected;
    st.cool = (dt) => { for (const b of st.beads) { b.t += dt; b.bead.material.emissiveIntensity = Math.max(0, 1.2 - b.t * 0.5); } };
    this.weldHint = (p) => { const nx = pts[st.wi]; return nx; };
  }

  // ---------------- optics: unbolt, swap the head, peak the alignment ----------------
  buildOptics(f) {
    const m = mgMats(), st = this.st;
    const mount = mgBox(0.5, 0.4, 0.04, m.housing); mount.position.z = -0.08; this.bench.add(mount);
    const head = new THREE.Group(); head.position.set(-0.05, 0, -0.02); this.bench.add(head);
    const body = mgCyl(0.11, 0.11, 0.12, m.dark, 28); body.rotation.x = Math.PI / 2; head.add(body);
    const lens = mgCyl(0.085, 0.085, 0.01, new THREE.MeshPhysicalMaterial({ color: 0x223040, roughness: 0.02, metalness: 0.5, clearcoat: 1 }), 28); lens.rotation.x = Math.PI / 2; lens.position.z = 0.065; head.add(lens);
    const crackL = mgBox(0.12, 0.003, 0.002, new THREE.MeshBasicMaterial({ color: 0xdfe8f0 })); crackL.position.set(0, 0, 0.071); crackL.rotation.z = 0.6; head.add(crackL);
    const bolts = [];
    for (let i = 0; i < f.b; i++) {
      const a = (i / f.b) * Math.PI * 2 + Math.PI / 4, size = this.size('bolt');
      const bm = boltMesh(size); bm.position.set(-0.05 + Math.cos(a) * 0.15, Math.sin(a) * 0.15, -0.055); this.bench.add(bm);
      const b = { bm, size, state: 'tight' }; bolts.push(b);
      this.T({ obj: bm, kind: 'bolt', tool: 'wrench', size, dur: 1.0, b, label: () => `Mount bolt${this.sizesKnown() ? ' ' + size + ' mm' : ''}`,
        ok: () => (b.state === 'tight' ? st.head === 'old' : st.head === 'new'), why: () => (b.state === 'tight' ? 'Already tight' : 'Fit the new sensor head first'),
        anim: (k) => { bm.position.z = -0.055 + (b.state === 'tight' ? k : 1 - k) * 0.03; bm.rotation.z = (b.state === 'tight' ? -k : k) * 12; },
        done: () => { b.state = b.state === 'tight' ? 'out' : 'tight'; bm.position.z = b.state === 'tight' ? -0.055 : -0.025; this.host.sfx && this.host.sfx.relay(0.4); } });
    }
    st.head = 'old';
    this.T({ obj: head, kind: 'head', dur: 1.2, toolFor: () => (st.head === 'gone' ? 'part' : 'hand'), part: () => (st.head === 'gone' ? 'optic' : null),
      ok: () => (st.head === 'old' ? bolts.every((b) => b.state === 'out') : st.head === 'gone'), why: () => (st.head === 'old' ? 'Undo the mount bolts first' : 'Already fitted'),
      label: () => (st.head === 'old' ? 'Lift out the damaged head' : 'Seat a new sensor head'),
      anim: (k) => { head.position.z = st.head === 'old' ? -0.02 + k * 0.2 : 0.18 - k * 0.2; },
      done: () => { if (st.head === 'old') { st.head = 'gone'; ghost(head, true); } else { st.head = 'new'; ghost(head, false); head.position.z = -0.02; crackL.visible = false; this.use('optic'); } this.host.sfx && this.host.sfx.noise(0.2, 0.1, 1600); } });
    // alignment: a knob you turn by holding the hand on it (left/right half); a meter shows signal strength
    const knob = new THREE.Group(); knob.position.set(0.3, -0.1, -0.03); this.bench.add(knob);
    const kb = mgCyl(0.04, 0.04, 0.03, m.dark, 24); kb.rotation.x = Math.PI / 2; knob.add(kb);
    const mark = mgBox(0.006, 0.03, 0.004, m.yellow); mark.position.set(0, 0.022, 0.017); knob.add(mark);
    const meter = mgBox(0.16, 0.06, 0.01, m.dark); meter.position.set(0.3, 0.1, -0.03); this.bench.add(meter);
    const bar = mgBox(0.14, 0.02, 0.002, new THREE.MeshBasicMaterial({ color: 0x30ff60 })); bar.position.set(0.3, 0.1, -0.022); this.bench.add(bar);
    st.ang = mgRnd(-2, 2); st.goal = mgRnd(-2.2, 2.2); st.lockT = 0; st.aligned = false;
    this.T({ obj: knob, kind: 'knob', tool: 'hand', dur: 99, continuous: true, label: () => 'Peak the signal: hold on the left or right of the knob',
      ok: () => st.head === 'new' && bolts.every((b) => b.state === 'tight') && !st.aligned, why: () => (st.aligned ? 'Aligned' : 'Bolt the new head down first'),
      drag: (p, dt) => { st.ang += (p.x < 0.3 ? -1 : 1) * dt * 0.8; knob.rotation.z = -st.ang; const sig = Math.max(0, 1 - Math.abs(st.ang - st.goal) / 1.2); return sig; } });
    st.signal = () => Math.max(0, 1 - Math.abs(st.ang - st.goal) / 1.2);
    st.tick = (dt) => { const s = st.signal(); bar.scale.x = Math.max(0.02, s); bar.position.x = 0.3 - 0.07 * (1 - s); bar.material.color.setHex(s > 0.94 ? 0x30ff60 : s > 0.6 ? 0xffd23f : 0xff5a2a); if (st.head === 'new' && s > 0.94 && !st.aligned) { st.lockT += dt; if (st.lockT > 1.2) { st.aligned = true; this.say('Signal peaked and locked.'); this.host.sfx && this.host.sfx.chirp(2093, 0.1, 0.05); } } else if (!st.aligned) st.lockT = 0; };
    this.step(`Undo the ${f.b} mount bolts`, () => bolts.every((b) => b.state === 'out') || st.head !== 'old');
    this.step('Lift out the damaged head', () => st.head !== 'old');
    this.step('Seat a new sensor head from stores', () => st.head === 'new');
    this.step('Bolt it down', () => st.head === 'new' && bolts.every((b) => b.state === 'tight'));
    this.step('Turn the knob until the signal peaks (hold it there)', () => st.aligned);
    st.complete = () => st.aligned;
  }

  // ---------------- parts and tools ----------------
  use(k, n = 1) { this.used[k] = (this.used[k] || 0) + n; this.renderParts(); }
  have(k) { const S = this.host.S(); return (S.stores[k] || 0) - (this.used[k] || 0); }
  renderParts() {
    const parts = this.need.parts;
    this.partsEl.innerHTML = Object.keys(parts).map((k) => `<button class="rg-part ${this.part === k ? 'sel' : ''}" data-k="${k}"><b>${PARTS[k].name}</b><i>${this.have(k)} in stores · job needs ${parts[k]}</i></button>`).join('');
    for (const b of this.partsEl.querySelectorAll('.rg-part')) b.onclick = () => this.selectPart(b.dataset.k);
  }
  selectPart(k) { this.part = k; this.tool = 'part'; this.toolBtns.forEach((b) => b.classList.remove('sel')); this.renderParts(); this.say(`${PARTS[k].name}: click where it goes.`); for (const t of Object.values(this.tools)) t.visible = false; this.tools.hand.visible = true; this.curTool = this.tools.hand; this.sizesEl.innerHTML = ''; }
  selectTool(id) {
    this.tool = id; this.part = null; this.renderParts();
    TOOLS.forEach((t, i) => this.toolBtns[i].classList.toggle('sel', t.id === id));
    for (const [k, t] of Object.entries(this.tools)) t.visible = k === id;
    this.curTool = this.tools[id];
    // bit / socket pickers (sizes are only marked on easier difficulties)
    if (id === 'driver' || id === 'wrench') {
      const list = id === 'driver' ? BITS : SOCKETS, cur = id === 'driver' ? this.bit : this.socket;
      this.sizesEl.innerHTML = `<div class="rg-h">${id === 'driver' ? 'BIT' : 'SOCKET'}</div>` + list.map((s) => `<button class="rg-size ${s === cur ? 'sel' : ''}" data-s="${s}">${id === 'wrench' ? s + ' mm' : s}</button>`).join('');
      for (const b of this.sizesEl.querySelectorAll('.rg-size')) b.onclick = () => { if (id === 'driver') { this.bit = b.dataset.s; this.tools.driver.userData.setBit(this.bit); } else this.socket = b.dataset.s; this.selectTool(id); };
      if (id === 'driver') this.tools.driver.userData.setBit(this.bit);
    } else this.sizesEl.innerHTML = '';
  }
  turnView(dx, dy) { const v = this.view; v.yaw = Math.max(-1.25, Math.min(1.25, v.yaw - dx)); v.pitch = Math.max(-0.9, Math.min(0.95, v.pitch + dy)); }
  zoomView(k) { this.view.dist = Math.max(0.55, Math.min(2.0, this.view.dist * k)); }
  camKey(c) { if (c === 'l') this.turnView(-0.25, 0); else if (c === 'r') this.turnView(0.25, 0); else if (c === 'u') this.turnView(0, -0.2); else if (c === 'd') this.turnView(0, 0.2); else if (c === 'i') this.zoomView(0.85); else if (c === 'o') this.zoomView(1.18); else if (c === '0') Object.assign(this.view, { yaw: 0, pitch: 0.03, dist: 1.28 }); }
  placeCam() {
    const v = this.view, t = new THREE.Vector3(0, 0, -0.06);
    this.cam.position.set(Math.sin(v.yaw) * Math.cos(v.pitch) * v.dist, Math.sin(v.pitch) * v.dist, Math.cos(v.yaw) * Math.cos(v.pitch) * v.dist).add(t);
    this.cam.lookAt(t);
  }
  key(k) {
    if (!this.open) return false;
    const ck = { arrowleft: 'l', arrowright: 'r', arrowup: 'u', arrowdown: 'd', '+': 'i', '=': 'i', '-': 'o', '0': '0' }[k];
    if (ck) { this.camKey(ck); return true; }
    if (k === 'escape') { this.close(true); return true; }
    const t = TOOLS.find((x) => x.key === k);
    if (t) { this.selectTool(t.id); return true; }
    if (k === 'b' && (this.tool === 'driver' || this.tool === 'wrench')) { // cycle bit/socket size
      if (this.tool === 'driver') { this.bit = BITS[(BITS.indexOf(this.bit) + 1) % BITS.length]; this.tools.driver.userData.setBit(this.bit); } else this.socket = SOCKETS[(SOCKETS.indexOf(this.socket) + 1) % SOCKETS.length];
      this.selectTool(this.tool); return true;
    }
    return true; // swallow everything else while working
  }

  // ---------------- input ----------------
  pickAt(e) {
    const r = this.canvas.getBoundingClientRect();
    const nd = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(nd, this.cam);
    const objs = this.targets.map((t) => t.obj).filter((o) => o.visible !== false);
    const hits = this.ray.intersectObjects(objs, true).filter((h) => h.object.userData.t);
    // prefer small targets (screws, bolts) over the big ones behind them
    hits.sort((a, b) => a.distance - b.distance);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.02), p = new THREE.Vector3();
    this.ray.ray.intersectPlane(plane, p);
    return { t: hits[0] ? hits[0].object.userData.t : null, p: hits[0] ? hits[0].point : p, planeP: p };
  }
  onMove(e) { if (!this.open) return; const h = this.pickAt(e); this.hover = h; }
  toolOf(t) { return t.toolFor ? t.toolFor() : t.tool; }
  onDown(e) {
    if (!this.open || e.button !== 0) return;
    const h = this.pickAt(e); this.hover = h;
    const t = h.t;
    if (!t) return;
    // pick the matching target under the cursor (weld and inspect share the plate)
    let tt = t;
    if (t.kind === 'weld' || t.kind === 'inspect') tt = this.targets.find((x) => x.obj === t.obj && this.toolOf(x) === (this.tool === 'part' ? 'part' : this.tool)) || t;
    const need = this.toolOf(tt);
    if (need === 'part') {
      const pk = tt.part && tt.part();
      if (this.tool !== 'part' || this.part !== pk) return this.say(`Select ${PARTS[pk].name} in the parts list, then click here.`, true);
      if (this.have(pk) < 1) return this.say(`No ${PARTS[pk].name} left in stores! Fabricate or buy more.`, true);
    } else if (need !== this.tool) return this.say(`${tt.label ? tt.label() + ': ' : ''}use the ${TOOLS.find((x) => x.id === need).name.toLowerCase()}.`, true);
    if (tt.shock && tt.shock()) { // touching live HV parts
      this.burst(h.p, 60); this.host.sfx && this.host.sfx.play('hit');
      if (this.diff === 'veteran' || this.diff === 'newtonian') { this.host.act('impact', { v: 9 }); return this.say('ZAP! You touched a live circuit. ' + tt.why(), true); }
      return this.say(tt.why(), true);
    }
    if (!tt.ok()) return this.say(tt.why(), true);
    const blk = tt.blockIf && tt.blockIf(); if (blk) return this.say(blk, true);
    if (tt.need) { const k = tt.need(); if (k && this.have(k) < 1) return this.say(`No ${PARTS[k].name} left in stores!`, true); }
    // fastener size
    if (tt.size && (tt.kind === 'screw' || tt.kind === 'bolt')) {
      const sel = tt.kind === 'screw' ? this.bit : this.socket;
      if (this.diff === 'recruit') { /* any bit/socket: the kit is magnetic and forgiving */ }
      else if (sel !== tt.size) {
        if (this.diff === 'newtonian' && tt.kind === 'screw' && !(tt.sc && tt.sc.stripped)) { tt.sc.stripped = true; this.burst(h.p, 8); return this.say(`The ${sel} bit cams out and chews the head. That screw will take longer now. (It needs a different bit.)`, true); }
        return this.say(`${sel}${tt.kind === 'bolt' ? ' mm' : ''} doesn't fit${this.sizesKnown() ? ` — this one is ${tt.size}${tt.kind === 'bolt' ? ' mm' : ''}` : ''}. Press B or pick another ${tt.kind === 'screw' ? 'bit' : 'socket'}.`, true);
      }
    }
    const dur = (tt.durFor ? tt.durFor() : tt.dur) * this.speed * (tt.sc && tt.sc.stripped ? 3 : 1);
    this.action = { t: tt, k: 0, dur, p: h.p.clone() };
  }
  onUp() { if (this.action && !this.action.t.continuous && this.action.k < 1) { if (this.action.k > 0.05) this.say('Let go too early. Hold until it is done.'); this.action.t.anim && this.action.t.anim(0); } this.action = null; }

  burst(p, n) { let k = 0; for (const s of this.sparkV) { if (s.t < 0.6) continue; s.p.copy(p); s.v.set(mgRnd(-1, 1), mgRnd(0, 1.5), mgRnd(0, 1)).multiplyScalar(0.6); s.t = 0; if (++k >= n) break; } }

  // ---------------- per frame ----------------
  tick(dt, now) {
    if (!this.open) return;
    const st = this.st;
    // check the module is still broken the same way (someone else may have fixed it)
    const S = this.host.S(), need = repairNeeds(S, this.id);
    if (!need || need.issues.map((i) => i.label).join('|') !== this.jobKey) { this.close(false); this.host.toast && this.host.toast('That module was repaired by someone else', 'good'); return; }
    this.elapsed += dt;
    const tm = this.el.querySelector('.rg-time'); tm.textContent = this.practice ? fmtClock(this.elapsed) : '';
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.msgEl.textContent = ''; }
    // tool follows the cursor; during an action it moves onto the target and animates
    const tool = this.curTool, a = this.action;
    if (tool) {
      let target = (this.hover && this.hover.p) || new THREE.Vector3(0.2, -0.1, 0.05);
      if (a && !a.t.continuous) { const wp = new THREE.Vector3(); a.t.obj.getWorldPosition(wp); target = wp; }
      const want = target.clone().add(new THREE.Vector3(0, 0, 0.012));
      tool.position.lerp(want, Math.min(1, dt * 18));
      tool.rotation.set(-0.35, 0.25, 0);
      if (this.tool === 'driver' && a) tool.rotation.z += a.k * 30;
      if (this.tool === 'wrench' && a) tool.rotation.z = Math.sin(a.k * 20) * 0.5;
      if (this.tool === 'tweezers' && tool.userData.pinch) tool.userData.pinch(a ? Math.min(1, a.k * 3) : 0);
      if (this.tool === 'cutters' && tool.userData.close) tool.userData.close(a ? Math.min(1, a.k * 2) : 0);
      if (this.tool === 'tape' && a) tool.userData.roll.rotation.z += dt * 20;
      if (this.tools.welder.userData.arc) this.tools.welder.userData.arc.visible = this.tool === 'welder' && !!a;
    }
    if (a) {
      if (a.t.continuous) {
        const signal = a.t.drag(this.hover ? this.hover.p : a.p, dt);
        this.progEl.style.width = Math.max(0, Math.min(1, signal)) * 100 + '%';
        if (this.tool === 'welder') { this.burst(tool.position.clone().add(new THREE.Vector3(0, -0.012, 0)), 3); if (Math.random() < dt * 14) this.host.sfx && this.host.sfx.noise(0.06, 0.08, 4500); }
      } else {
        a.k = Math.min(1, a.k + dt / a.dur);
        a.t.anim && a.t.anim(a.k);
        this.progEl.style.width = a.k * 100 + '%';
        if (Math.random() < dt * 8) this.host.sfx && this.host.sfx.click(0.08, 0, 3000 + Math.random() * 2000);
        if (a.k >= 1) { a.t.done && a.t.done(); this.action = null; this.progEl.style.width = '0%'; }
      }
    } else this.progEl.style.width = '0%';
    if (st.cool) st.cool(dt);
    if (st.tick) st.tick(dt);
    if (st.spin) st.spin();
    // sparks
    const pos = this.sparks.geometry.attributes.position.array;
    this.sparkV.forEach((s, i) => { if (s.t < 0.6) { s.t += dt; s.v.y -= dt * 2; s.p.addScaledVector(s.v, dt); pos.set([s.p.x, s.p.y, s.p.z], i * 3); } else pos.set([0, 0, -9], i * 3); });
    this.sparks.geometry.attributes.position.needsUpdate = true;
    // hints: pulse what can be worked on next (easier difficulties)
    const pulse = 0.5 + 0.5 * Math.sin(now * 6);
    for (const t of this.targets) {
      const avail = this.hints && t.kind !== 'weld' && t.kind !== 'inspect' && t.ok() && (!t.blockIf || !t.blockIf());
      t.obj.traverse((o) => { if (o.isMesh && o.material && o.material.emissive && !o.userData.hintMat) { o.material = o.material.clone(); o.userData.hintMat = true; } if (o.isMesh && o.material && o.material.emissive && o.material !== mgMats().bead) o.material.emissive.setHex(avail ? 0x1a5aaa : 0x000000), (o.material.emissiveIntensity = avail ? 0.25 + pulse * 0.6 : 1); });
    }
    if (this.hints && st.wpts && st.wi < st.wpts.length && this.tool === 'welder') { const nx = st.wpts[st.wi]; if (!this.weldDot) { this.weldDot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), new THREE.MeshBasicMaterial({ color: 0x40a0ff })); this.scene.add(this.weldDot); } this.weldDot.visible = true; this.weldDot.position.copy(nx); } else if (this.weldDot) this.weldDot.visible = false;
    // checklist
    const html = this.steps.map((s) => { const d = s.done(); return `<li class="${d ? 'done' : ''}">${s.text}</li>`; });
    const first = this.steps.findIndex((s) => !s.done());
    const out = html.map((h, i) => (i === first ? h.replace('<li class="', '<li class="cur ') : h)).join('');
    if (out !== this.lastSteps) { this.stepsEl.innerHTML = out; this.lastSteps = out; }
    // hover label
    if (this.hover && this.hover.t && !a) { const t = this.hover.t; this.canvas.title = t.label ? t.label() : ''; }
    // stage complete?
    if (st.complete && st.complete()) {
      if (this.stage < this.need.issues.length - 1) { this.stage++; this.say('Stage done. Next fault…'); this.buildStage(); }
      else { this.host.act('repair.complete', { id: this.id, key: this.jobKey }); this.host.sfx && this.host.sfx.play('chime'); this.close(false); }
      return;
    }
    this.placeCam();
    this.renderer.render(this.scene, this.cam);
  }
}

export const fmtClock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
// star tightening order for n bolts on a circle (e.g. 8: 0,4,2,6,1,5,3,7)
function starOrder(n) {
  if (n === 4) return [0, 2, 1, 3];
  if (n === 6) return [0, 3, 1, 4, 2, 5];
  if (n === 8) return [0, 4, 2, 6, 1, 5, 3, 7];
  const o = []; for (let i = 0; i < n; i += 2) o.push(i); for (let i = 1; i < n; i += 2) o.push(i); return o;
}
const NT = {};
function numTex(n) { if (NT[n]) return NT[n]; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#2a8cff'; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 36px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 34); return (NT[n] = new THREE.CanvasTexture(c)); }
