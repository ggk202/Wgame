// WOLFRAM model viewer: browse the ship's 3D models (uses the game's own builders).
import * as THREE from 'three';
import { COMPS, COMP_IDS, DECKS, ROOM_H } from './config.js';
import { World, buildComp, buildFire, buildAvatar, buildExterior, textSprite } from './world.js';
import { buildShip, buildStation } from './npc.js';
import { buildPlanet } from './planet.js';
let tickFn = null;

const $ = (s) => document.querySelector(s);
const canvas = $('#vc');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b10);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
scene.add(new THREE.HemisphereLight(0xeef2ff, 0x3a3a34, 0.9));
const sun = new THREE.DirectionalLight(0xfff6e8, 2.2); sun.position.set(5, 8, 6); scene.add(sun);
const grid = new THREE.GridHelper(40, 40, 0x2a4058, 0x16222e); scene.add(grid);

// ---------- catalogue ----------
const CATS = [];
const accentOf = (id) => (COMPS[id].ext ? 0xd0a040 : DECKS[COMPS[id].deck].color);
CATS.push({ title: 'Ship systems', items: COMP_IDS.filter((id) => !COMPS[id].ext).map((id) => ({ id, name: COMPS[id].name, sub: `Deck ${COMPS[id].deck} · ${DECKS[COMPS[id].deck].name}`, kind: 'comp' })) });
CATS.push({ title: 'Exterior hardware (EVA)', items: COMP_IDS.filter((id) => COMPS[id].ext).map((id) => ({ id, name: COMPS[id].name, sub: 'Dorsal equipment spine', kind: 'comp' })) });
CATS.push({ title: 'Crew & fixtures', items: [
  { id: 'crew', name: 'Crew member', sub: 'Shipboard clothes', kind: 'avatar' },
  { id: 'crew-suit', name: 'Crew member (vacuum suit)', sub: 'Helmet + life-support pack', kind: 'avatar', suit: true },
  { id: 'fire', name: 'Fire effect', sub: 'Shown on burning components', kind: 'fire' },
] });
CATS.push({ title: 'Other ships', items: [
  { id: 'corvette', name: 'Pirate corvette', sub: '58 m · railgun + missiles', kind: 'npc' },
  { id: 'gunship', name: 'Gunship', sub: '80 m · twin railguns', kind: 'npc' },
  { id: 'frigate', name: 'Blockade frigate', sub: '110 m · heavy missiles', kind: 'npc' },
  { id: 'drone', name: 'Hijacked mining drone', sub: '30 m · kamikaze', kind: 'npc' },
] });
CATS.push({ title: 'Stations & worlds', items: [
  { id: 'luna', name: 'Shackleton Yard', sub: 'Luna orbit · shipyard', kind: 'station' },
  { id: 'phobos', name: 'Phobos Station', sub: 'Mars', kind: 'station' },
  { id: 'ceres', name: 'Ceres Ring', sub: 'Belt · spin ring', kind: 'station' },
  { id: 'ganymede', name: 'Ganymede High', sub: 'Jupiter · twin rings', kind: 'station' },
  { id: 'earth', name: 'Earth', sub: 'Rayleigh + Mie scattering, clouds', kind: 'planet' },
  { id: 'phobos', name: 'Mars', sub: 'Thin dusty CO₂ atmosphere', kind: 'planet' },
  { id: 'ganymede', name: 'Jupiter', sub: 'Banded clouds', kind: 'planet' },
] });
CATS.push({ title: 'Whole decks', items: [{ id: 'exterior', name: 'EXTERIOR', sub: 'Hull, spine & drive (EVA area)', kind: 'exterior' }, ...DECKS.slice().reverse().map((d) => ({ id: 'deck' + d.id, name: d.full.split('— ')[1], sub: `Deck ${d.id}`, kind: 'deck', deck: d.id }))] });

const list = $('#list');
for (const c of CATS) {
  const h = document.createElement('h3'); h.textContent = c.title; list.appendChild(h);
  for (const it of c.items) {
    const b = document.createElement('button'); b.className = 'item'; b.dataset.id = it.id;
    b.innerHTML = `<b>${it.name}</b><span>${it.sub}</span>`;
    b.onclick = () => show(it);
    list.appendChild(b);
    it.btn = b;
  }
}

// ---------- state ----------
let current = null, root = null, built = null, fireFx = null;
const opt = { cond: 'ok', fire: false, ceiling: false, wire: false, spin: true };
const orbit = { yaw: 0.7, pitch: 0.45, dist: 6, target: new THREE.Vector3(0, 1, 0) };

function disposeRoot() {
  if (!root) return;
  scene.remove(root);
  root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  root = null; built = null; fireFx = null;
}
function show(it) {
  disposeRoot();
  current = it;
  for (const c of CATS) for (const x of c.items) x.btn.classList.toggle('sel', x === it);
  root = new THREE.Group();
  let info = '';
  tickFn = null;
  if (it.kind === 'comp') {
    built = buildComp(COMPS[it.id].mesh, accentOf(it.id));
    root.add(built.group);
    if (!COMPS[it.id].ext) { fireFx = buildFire(); fireFx.position.z = COMPS[it.id].fp * 0.25; root.add(fireFx); }
    const c = COMPS[it.id];
    info = `<h2>${c.name}</h2><dl><dt>Location</dt><dd>${it.sub}</dd><dt>Console</dt><dd>${c.panel || (c.ext ? 'none: inspect on EVA, repair by hand or drone' : '—')}</dd><dt>Base power</dt><dd>${c.power} MW · priority ${c.prio}</dd><dt>Wear</dt><dd>${c.wear} %/min</dd><dt>Footprint</dt><dd>${(c.fp * 2).toFixed(1)} m</dd>${c.computer ? '<dt>Type</dt><dd>Computer: can suffer software faults</dd>' : ''}</dl>`;
  } else if (it.kind === 'avatar') {
    const a = buildAvatar('#ff8c42');
    a.setSuit(!!it.suit); a.item.visible = false;
    root.add(a.group);
    info = `<h2>${it.name}</h2><p>Players are seen like this by crewmates. Colour comes from the lobby choice. Downed crew lie on the floor with a flashing name tag.</p>`;
  } else if (it.kind === 'fire') {
    fireFx = buildFire(); fireFx.visible = true; root.add(fireFx);
    info = `<h2>Fire</h2><p>Grows with oxygen, spreads to nearby systems above 50% intensity, and is put out with an extinguisher, suppressant, or by venting the deck.</p>`;
  } else if (it.kind === 'npc') {
    const m = buildShip(it.id); root.add(m);
    for (const p of m.userData.plumes) p.visible = true;
    tickFn = (now) => { for (const p of m.userData.plumes) p.scale.setScalar(0.9 + 0.2 * Math.sin(now * 40 + p.id)); m.traverse((o) => { if (o.userData.blink) o.visible = Math.sin(now * 3 + o.id) > 0; }); };
    info = `<h2>${it.name}</h2><p>${it.sub}. Seen in combat through the optical telescope on the Fire Control and Sensor consoles: watch its attitude thrusters, drive plume and muzzle flashes. Its weapons bear along its nose, like ours.</p>`;
  } else if (it.kind === 'station') {
    const st = buildStation(it.id); root.add(st);
    tickFn = (now) => st.userData.tick(now);
    info = `<h2>${it.name}</h2><p>${it.sub}. Docking is flown by hand: bring the bow port onto the docking target (white disc with a black standoff cross) inside the capture window.</p>`;
  } else if (it.kind === 'planet') {
    const p = buildPlanet(it.id); p.scale.setScalar(6); root.add(p);
    const sun = new THREE.Vector3();
    tickFn = (now) => { sun.copy(camera.position).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.9).normalize(); p.userData.setSun(sun); p.userData.tick(now); };
    info = `<h2>${it.name}</h2><p>${it.sub}. No atmosphere mesh: each pixel ray-marches Rayleigh and Mie scattering through the air, so the glowing limb, haze, reddened terminator and the planet's shadow fall out of the physics. Sunlight on the ground is filtered by air mass, and the cloud deck drifts inside the atmosphere.</p>`;
  } else if (it.kind === 'exterior') {
    const comps = {};
    root.add(buildExterior(comps));
    root.children[0].userData.plume.visible = true;
    built = { comps, exterior: true };
    for (const id of ['radA', 'radB']) comps[id].wing.scale.x = 1;
    info = `<h2>Exterior</h2><p>The pressure hull with the dorsal equipment spine on top. Crew reach it through the Cargo-deck airlock in a vacuum suit. Radiator wings, three PDC turrets, the spinal railgun, the antenna and the sensor array are all repairable by hand.</p><p class="dim">The drive plume is shown lit here.</p>`;
  } else if (it.kind === 'deck') {
    const fake = { scene: root, decks: [], comps: {} };
    World.prototype.buildDeck.call(fake, DECKS[it.deck]);
    const g = fake.decks[0]; g.position.y = 0;
    built = { deck: g, comps: fake.comps };
    g.children[1].visible = opt.ceiling; // ceiling
    info = `<h2>${DECKS[it.deck].full}</h2><p>${Object.keys(fake.comps).map((id) => COMPS[id].name).join(' · ')}</p><p class="dim">Lift in the centre, emergency locker on the wall. Toggle the ceiling to look inside.</p>`;
  }
  scene.add(root);
  // frame the model
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  orbit.target.copy(ctr);
  if (it.kind === 'exterior') { orbit.target.set(0, -8, -8); orbit.dist = 175; orbit.pitch = 0.45; }
  else { orbit.dist = Math.max(2.2, Math.max(size.x, size.y, size.z) * (it.kind === 'deck' ? 1.25 : 1.9)); orbit.pitch = it.kind === 'deck' ? 0.85 : 0.35; }
  grid.visible = it.kind !== 'deck' && it.kind !== 'exterior' && it.kind !== 'planet' && it.kind !== 'station';
  $('#info').innerHTML = info;
  $('#ctl-cond').style.display = it.kind === 'comp' || it.kind === 'deck' || it.kind === 'exterior' ? '' : 'none';
  $('#t-fire').style.display = it.kind === 'comp' && !COMPS[it.id].ext ? '' : 'none';
  $('#t-ceil').style.display = it.kind === 'deck' ? '' : 'none';
  applyOpts();
}

const COND = { ok: [0x40ff80, 0xffffff], damaged: [0xffb020, 0xffffff], critical: [0xff3030, 0xff7a70], fault: [0xff40ff, 0xff60ff], dead: [0x111111, 0x050608] };
function applyOpts() {
  if (!root) return;
  const comps = built && built.comps ? Object.values(built.comps) : built && built.light ? [built] : [];
  for (const b of comps) { const [l, s] = COND[opt.cond]; b.light.material.color.setHex(l); if (b.screen) b.screen.material.color.setHex(s); }
  if (fireFx && current.kind === 'comp') fireFx.visible = opt.fire;
  if (built && built.deck) built.deck.children[1].visible = opt.ceiling;
  root.traverse((o) => { if (o.isMesh && o.material && 'wireframe' in o.material) o.material.wireframe = opt.wire; });
}
for (const b of document.querySelectorAll('[data-cond]')) b.onclick = () => { opt.cond = b.dataset.cond; document.querySelectorAll('[data-cond]').forEach((x) => x.classList.toggle('sel', x === b)); applyOpts(); };
const tog = (id, key) => { const b = $(id); b.onclick = () => { opt[key] = !opt[key]; b.classList.toggle('sel', opt[key]); applyOpts(); }; b.classList.toggle('sel', opt[key]); };
tog('#t-fire', 'fire'); tog('#t-ceil', 'ceiling'); tog('#t-wire', 'wire'); tog('#t-spin', 'spin');

// ---------- orbit controls (mouse + touch) ----------
const pointers = new Map();
let pinch0 = 0, dist0 = 0;
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = orbit.dist; } });
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId); if (!p) return;
  if (pointers.size === 1) { orbit.yaw -= (e.clientX - p.x) * 0.008; orbit.pitch = Math.max(-0.2, Math.min(1.5, orbit.pitch + (e.clientY - p.y) * 0.006)); opt.spin = false; $('#t-spin').classList.remove('sel'); }
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) orbit.dist = Math.max(1, Math.min(600, (dist0 * pinch0) / d)); }
});
const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); orbit.dist = Math.max(1, Math.min(600, orbit.dist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: false });

function resize() {
  const r = canvas.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
let last = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const now = t / 1000, dt = Math.min(0.05, now - last); last = now;
  if (opt.spin) orbit.yaw += dt * 0.35;
  if (tickFn) tickFn(now);
  const cp = Math.cos(orbit.pitch);
  camera.position.set(orbit.target.x + Math.sin(orbit.yaw) * cp * orbit.dist, orbit.target.y + Math.sin(orbit.pitch) * orbit.dist, orbit.target.z + Math.cos(orbit.yaw) * cp * orbit.dist);
  camera.lookAt(orbit.target);
  if (fireFx && fireFx.visible) fireFx.children.forEach((ch) => { if (ch.userData.flame) ch.scale.y = 0.7 + 0.5 * Math.abs(Math.sin(now * 8 + ch.userData.ph)); });
  if (built && built.glow) built.glow.scale.setScalar(0.92 + 0.08 * Math.sin(now * 3));
  renderer.render(scene, camera);
}
resize();
show(CATS[0].items.find((x) => x.id === 'reactor'));
requestAnimationFrame(frame);
