// Combat simulator: the ship's real combat model (sensors, railgun, torpedoes, Kestrel missiles, point defence,
// evasive jinking, damage) run on a private copy of the ship, with a holographic tactical view and the helm/weapons
// console beside it. Opened from the main menu (training) or from the sim pod on the centrifuge ring, where it runs
// on the player's own machine while the real ship carries on.
import * as THREE from 'three';
import { createState, newPlayer } from './state.js';
import { step } from './sim.js';
import { applyAction } from './actions.js';
import { startEncounter, projBodyDir } from './combat.js';
import { PanelView } from './ui.js';
import { PANELS } from './panels.js';
import { buildShipExterior } from './ship.js';
import { buildShip } from './npc.js';
import { qrot, nose, angDeg } from './attitude.js';
import { COMP_IDS } from './config.js';

export const SIM_SCEN = [
  { id: 'drill', name: 'Target practice', desc: 'An unarmed hulk 300 km out. Lock it, point the nose, fire the railgun.', waves: [['drill', 40]] },
  { id: 'drones', name: 'Drone swarm', desc: 'Kamikaze mining drones from all sides. Point defence, manual PDC targeting, missiles.', waves: [['drones', 150]] },
  { id: 'corvette', name: 'Pirate corvette', desc: 'One armed corvette: torpedo salvos and a railgun. The classic duel.', waves: [['pirate', 100]] },
  { id: 'pack', name: 'Pirate pack', desc: 'Two corvettes on different bearings. Split your attention.', waves: [['pirate', 160]] },
  { id: 'gunship', name: 'Separatist gunship', desc: 'Fast railgun fire at long range. Keep jinking and close the distance.', waves: [['gunship', 150]] },
  { id: 'blockade', name: 'Blockade', desc: 'Frigate, corvette and gunship together. Hard.', waves: [['blockade', 260]] },
  { id: 'gauntlet', name: 'The gauntlet', desc: 'Four waves back to back, no repairs between them. How far can you get?', waves: [['drones', 120], ['pirate', 110], ['pirate', 170], ['blockade', 240]] },
];
const DIFFS = [{ id: 'recruit', name: 'Recruit', k: 0.8 }, { id: 'spacer', name: 'Spacer', k: 1 }, { id: 'veteran', name: 'Veteran', k: 1.25 }];
const SEAT = (a) => (a.startsWith('tac.') ? 'tactical' : a.startsWith('sensors.') ? 'sensors' : 'helm');
const BEST_KEY = 'wolfram-simbest';
const loadBest = () => { try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch (e) { return {}; } };
const scaleDist = (km) => 70 + 150 * Math.log10(1 + Math.max(0, km) / 40); // tactical view: log range

export class CombatSim {
  constructor(deps) {
    this.d = deps; this.open = false; this.run = null; this.keys = {}; this.pt = { r: [0, 0, 0], t: [0, 0, 0] };
    this.sel = { scen: 'corvette', diff: 'spacer' };
    try { Object.assign(this.sel, JSON.parse(localStorage.getItem('wolfram-simsel') || '{}')); } catch (e) { /* defaults */ }
    const el = (this.el = document.createElement('div')); el.id = 'csim'; el.style.display = 'none';
    el.innerHTML = `
      <div class="cs-menu"><div class="cs-card">
        <h2>COMBAT SIMULATOR</h2><div class="cs-sub"></div>
        <div class="cs-scen"></div>
        <div class="cs-row"><label>Difficulty</label><span class="cs-diff"></span></div>
        <div class="cs-row cs-btns"><button class="btn big green cs-start">Start simulation</button><button class="btn big cs-close">Leave</button></div>
        <div class="cs-note">Same weapons, sensors and damage model as the real ship. Mouse-drag the hologram to look around, scroll to zoom, C toggles chase view. Keys W/S/A/D/Q/E steer, X holds attitude, Esc pauses.</div>
      </div></div>
      <div class="cs-run">
        <div class="cs-left"><canvas class="cs-view"></canvas><canvas class="cs-ovl"></canvas>
          <div class="cs-top"><span class="cs-title"></span><span class="cs-stat"></span></div>
          <div class="cs-ctl"><button class="btn cs-cam">Chase view</button><button class="btn cs-pause">Pause</button><button class="btn red cs-abort">End sim</button></div>
          <div class="cs-banner"></div></div>
        <div class="cs-right"><div class="cs-panel"></div></div>
      </div>
      <div class="cs-result"><div class="cs-card"><h2 class="cs-rtitle"></h2><div class="cs-rbody"></div>
        <div class="cs-row cs-btns"><button class="btn big green cs-retry">Run it again</button><button class="btn big cs-back">Scenarios</button><button class="btn big cs-close2">Leave</button></div></div></div>`;
    document.body.appendChild(el);
    const $ = (s) => el.querySelector(s); this.$ = $;
    $('.cs-close').onclick = () => this.close(); $('.cs-close2').onclick = () => this.close();
    $('.cs-start').onclick = () => this.start();
    $('.cs-retry').onclick = () => this.start();
    $('.cs-back').onclick = () => this.showMenu();
    $('.cs-abort').onclick = () => this.finish(false, 'Simulation ended by the trainee.');
    $('.cs-pause').onclick = () => this.pause();
    $('.cs-cam').onclick = () => { this.chase = !this.chase; $('.cs-cam').textContent = this.chase ? 'Orbit view' : 'Chase view'; };
    this.chase = true; $('.cs-cam').textContent = 'Orbit view';
    // the console: the game's own panel renderer, pointed at the private ship
    this.panel = new PanelView($('.cs-panel'), {
      S: () => this.run && this.run.S, me: () => null, act: (a, args) => this.act(a, args), click: () => deps.sfx && deps.sfx.play('click'),
      get touch() { return !!deps.touch && deps.touch(); }, local: () => {}, sfx: deps.sfx, attachView: () => {},
      pilotPress: (g, i, v) => { this.pt[g][i] = v; }, closePanel: () => this.finish(false, 'Simulation ended by the trainee.'),
    });
    if (this.panel.exit) this.panel.exit.remove();
    // keys go to the simulator, not the avatar, while it is open
    const kd = (e, down) => {
      if (!this.open) return;
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const k = (e.key || '').toLowerCase();
      if (down && (k === 'escape' || k === '`')) { if (this.run && !this.run.over) this.pause(); else this.close(); e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (down && k === 'c' && this.run) { this.$('.cs-cam').click(); }
      if (down && k === 'x' && this.run) this.act('att.mode', { m: 'hold' });
      if ('wasdqe'.includes(k) && k.length === 1) this.keys[k] = down;
      e.stopImmediatePropagation(); if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    };
    addEventListener('keydown', (e) => kd(e, true), true); addEventListener('keyup', (e) => kd(e, false), true);
    // camera drag/zoom on the hologram
    this.cam = { yaw: 0.6, pitch: 0.35, dist: 260 };
    const cv = $('.cs-ovl'); let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (!drag) return; this.cam.yaw -= (e.clientX - drag[0]) * 0.006; this.cam.pitch = Math.max(-1.4, Math.min(1.4, this.cam.pitch + (e.clientY - drag[1]) * 0.006)); drag = [e.clientX, e.clientY]; if (this.chase) { this.chase = false; $('.cs-cam').textContent = 'Chase view'; } });
    cv.addEventListener('pointerup', () => { drag = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.dist = Math.max(90, Math.min(900, this.cam.dist * (e.deltaY > 0 ? 1.1 : 1 / 1.1))); }, { passive: false });
    this.loop = this.loop.bind(this);
  }
  // ---------------- menu ----------------
  show(opts = {}) {
    this.pod = !!opts.pod; this.open = true; this.el.style.display = 'flex'; this.keys = {};
    this.$('.cs-sub').textContent = this.pod ? 'SIM POD · CENTRIFUGE RING — the real ship carries on around you' : 'TRAINING · no ship at stake';
    this.showMenu();
  }
  showMenu() {
    this.stopRun(); this.mode('menu');
    const best = loadBest();
    this.$('.cs-scen').innerHTML = SIM_SCEN.map((s) => `<button class="cs-sc ${s.id === this.sel.scen ? 'sel' : ''}" data-id="${s.id}"><b>${s.name}</b><span>${s.desc}</span><i>${DIFFS.map((d) => best[s.id + '/' + d.id] ? `${d.name[0]} ${best[s.id + '/' + d.id]}` : '').filter(Boolean).join(' · ') || 'no score yet'}</i></button>`).join('');
    this.$('.cs-scen').querySelectorAll('.cs-sc').forEach((b) => { b.onclick = () => { this.sel.scen = b.dataset.id; this.showMenu(); }; });
    this.$('.cs-diff').innerHTML = DIFFS.map((d) => `<button class="btn ${d.id === this.sel.diff ? 'sel' : ''}" data-id="${d.id}">${d.name}</button>`).join(' ');
    this.$('.cs-diff').querySelectorAll('button').forEach((b) => { b.onclick = () => { this.sel.diff = b.dataset.id; this.showMenu(); }; });
  }
  mode(m) { this.el.className = 'cs-' + m; }
  close() { this.stopRun(); this.open = false; this.el.style.display = 'none'; this.keys = {}; if (this.d.onClose) this.d.onClose(); }
  // ---------------- a run ----------------
  start() {
    try { localStorage.setItem('wolfram-simsel', JSON.stringify(this.sel)); } catch (e) { /* private mode */ }
    const scen = SIM_SCEN.find((s) => s.id === this.sel.scen) || SIM_SCEN[2], diff = DIFFS.find((d) => d.id === this.sel.diff) || DIFFS[1];
    const S = createState({ difficulty: diff.id, storyteller: 'halley', length: 'short' });
    S.tutorial = true; S.sim = true; S.settings.warpBase = 1;
    Object.assign(S.nav, { state: 'transit', x: 0, v: 0, L: 1e15, autopilot: false });
    const p = Object.assign(newPlayer('sim', 'Trainee', '#7cf'), { deck: 4, x: 0, z: -2, seat: 'tactical' });
    S.players = { sim: p };
    this.run = { S, scen, diff, wave: -1, next: 4, t: 0, kills: 0, killHp: 0, hull0: S.hull, over: false, paused: false, dead: new Set(), last: performance.now(), panelT: 0, flash: 0, railFx: 0, booms: [] };
    this.mode('run');
    this.$('.cs-title').textContent = `${scen.name.toUpperCase()} · ${diff.name.toUpperCase()}`;
    this.panel.show(PANELS.simconsole, null, 'overlay');
    this.initView(); this.buildScene();
    this.banner(scen.waves.length > 1 ? `WAVE 1 OF ${scen.waves.length} IN 4` : 'CONTACT IN 4', 3.5);
    requestAnimationFrame(this.loop);
  }
  stopRun() { if (this.run) this.run.over = true; this.run = null; if (this.panel.open) this.panel.hide(); }
  pause() { const R = this.run; if (!R || R.over) return; R.paused = !R.paused; this.$('.cs-pause').textContent = R.paused ? 'Resume' : 'Pause'; this.banner(R.paused ? 'PAUSED' : '', R.paused ? 1e9 : 0); }
  banner(t, dur) { const b = this.$('.cs-banner'); b.textContent = t; b.style.display = t ? 'block' : 'none'; this.bannerT = dur; }
  act(a, args = {}) {
    const R = this.run; if (!R || R.over) return;
    const p = R.S.players.sim; p.seat = SEAT(a);
    applyAction(R.S, 'sim', a, args);
    this.panel.update(R.S);
  }
  loop(now) {
    const R = this.run; if (!R || R.over || !this.open) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - R.last) / 1000); R.last = now;
    const S = R.S;
    if (this.bannerT !== undefined && this.bannerT < 1e8) { this.bannerT -= dt; if (this.bannerT <= 0) this.banner('', 0); }
    if (!R.paused) {
      // hand controller: keys + the console's RCS pad
      const k = this.keys, P = this.pt, b = (x) => (k[x] ? 1 : 0), c = (x) => Math.max(-1, Math.min(1, x));
      const r = [c(b('s') - b('w') + P.r[0]), c(b('a') - b('d') + P.r[1]), c(b('q') - b('e') + P.r[2])], sig = r.join();
      if (sig !== R.rsig) { R.rsig = sig; S.players.sim.seat = 'helm'; applyAction(S, 'sim', 'att.cmd', { r, t: [0, 0, 0] }); }
      const E0 = S.enc; step(S, dt); R.t += dt;
      const p = S.players.sim; p.hp = 100; p.state = 'alive'; p.o2 = 100;
      this.onFx(S.fx); S.fx.length = 0;
      // kills
      if (E0) for (const e of E0.enemies) if (e.dead && !R.dead.has(e.id)) { R.dead.add(e.id); R.kills++; R.killHp += e.maxHp; this.boomAt(e); }
      // waves
      if (R.wave < 0 || R.gap || (!S.enc && R.waveOn)) {
        if (R.waveOn) { R.waveOn = false; R.gap = true; R.next = 5; if (R.wave + 1 >= R.scen.waves.length) { this.finish(true); return; } this.banner(`WAVE ${R.wave + 2} OF ${R.scen.waves.length} IN 5`, 4.5); }
        R.next -= dt;
        if (R.next <= 0) { R.gap = false; R.wave++; const [kind, pts] = R.scen.waves[R.wave]; startEncounter(S, kind, pts * R.diff.k); R.waveOn = true; this.onFx(S.fx); S.fx.length = 0; this.buildScene(); }
      }
      if (S.hull <= 0 || S.phase !== 'play') { this.finish(false, 'The Wolfram was destroyed.'); return; }
    }
    R.panelT -= dt; if (R.panelT <= 0) { R.panelT = 0.12; this.panel.update(S); this.hud(); }
    this.render(dt, now);
  }
  hud() {
    const R = this.run, S = R.S, left = S.enc ? S.enc.enemies.filter((e) => !e.dead && !e.gone).length : 0;
    const dmg = COMP_IDS.reduce((a, id) => a + (100 - S.comps[id].hp), 0);
    this.$('.cs-stat').innerHTML = `${R.scen.waves.length > 1 ? `WAVE ${Math.max(1, R.wave + 1)}/${R.scen.waves.length} · ` : ''}T+${Math.floor(R.t / 60)}:${String(Math.floor(R.t % 60)).padStart(2, '0')} · HULL <b class="${S.hull < 40 ? 'bad' : S.hull < 75 ? 'warn' : 'good'}">${Math.round(S.hull)}%</b> · SYSTEMS ${Math.max(0, Math.round(100 - dmg / COMP_IDS.length))}% · KILLS ${R.kills} · HOSTILES ${left}`;
  }
  score(win) {
    const R = this.run, S = R.S, dmg = COMP_IDS.reduce((a, id) => a + (100 - S.comps[id].hp), 0) / COMP_IDS.length;
    const base = Math.round(R.killHp * 6 + (R.wave + (win ? 1 : 0)) * 300 - (R.hull0 - S.hull) * 9 - dmg * 12 + (win ? Math.max(0, 420 - R.t) * 2 : 0));
    return Math.max(0, Math.round(base * R.diff.k));
  }
  finish(win, why) {
    const R = this.run; if (!R || R.over) return;
    R.over = true;
    const sc = this.score(win), key = R.scen.id + '/' + R.diff.id, best = loadBest(), rec = sc > (best[key] || 0);
    if (rec && (win || R.wave > 0 || R.kills)) { best[key] = sc; try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) { /* private mode */ } }
    const S = R.S, dmg = COMP_IDS.reduce((a, id) => a + (100 - S.comps[id].hp), 0) / COMP_IDS.length;
    this.$('.cs-rtitle').textContent = win ? 'SIMULATION COMPLETE' : 'SIMULATION FAILED';
    this.$('.cs-rbody').innerHTML = `<div class="cs-big ${win ? 'good' : 'bad'}">${sc}${rec && sc ? ' <small>NEW BEST</small>' : ''}</div>
      <div>${why || (win ? 'All hostiles destroyed or driven off.' : '')}</div>
      <table class="tbl"><tr><td>Scenario</td><td>${R.scen.name} · ${R.diff.name}</td></tr><tr><td>Time</td><td>${Math.floor(R.t / 60)}:${String(Math.floor(R.t % 60)).padStart(2, '0')}</td></tr>
      <tr><td>Kills</td><td>${R.kills}</td></tr><tr><td>Waves cleared</td><td>${R.wave + (win ? 1 : 0)} / ${R.scen.waves.length}</td></tr>
      <tr><td>Hull</td><td>${Math.round(S.hull)}%</td></tr><tr><td>System damage</td><td>${Math.round(dmg)}% average</td></tr>
      <tr><td>Hits taken</td><td>${S.stats.hits}</td></tr><tr><td>Slugs / torpedoes / missiles left</td><td>${S.stores.slugs} / ${S.stores.missiles} / ${S.stores.srm}</td></tr></table>
      ${this.pod ? '<div class="cs-note">Logged in the pilot\'s training record: a recent sim session (48 h) speeds up your target locks at Sensors or Fire Control by 20%.</div>' : ''}`;
    if (this.panel.open) this.panel.hide();
    this.mode('result');
    if (this.d.onFinish) this.d.onFinish({ scen: R.scen.id, name: R.scen.name, diff: R.diff.id, win, score: sc });
  }
  // ---------------- holographic tactical view ----------------
  initView() {
    if (this.V) return;
    const cv = this.$('.cs-view');
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x01060a);
    const cam = new THREE.PerspectiveCamera(50, 1, 1, 20000);
    // stars
    const sp = []; for (let i = 0; i < 1500; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(6000); sp.push(v.x, v.y, v.z); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sc.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x5a7a8a, size: 1.5, sizeAttenuation: false })));
    // range rings (log scale) in the ship's inertial "ecliptic"
    const rings = new THREE.Group(); sc.add(rings);
    for (const km of [100, 500, 1000, 2000, 4000]) { const R2 = scaleDist(km), pts = []; for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * R2, 0, Math.sin(a) * R2)); } rings.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x0d3a46, transparent: true, opacity: 0.8 }))); }
    this.V = { r, sc, cam, ships: new Map(), proj: new Map(), ringKm: [100, 500, 1000, 2000, 4000] };
    // projectiles and tracers
    const mk = (n, col, size) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); const p = new THREE.Points(g, new THREE.PointsMaterial({ color: col, size, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); p.frustumCulled = false; sc.add(p); return p; };
    this.V.pIn = mk(64, 0xff4a30, 6); this.V.pOut = mk(64, 0x5ad0ff, 5); this.V.pSlug = mk(32, 0xffffff, 4);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3));
    this.V.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); this.V.tracers.frustumCulled = false; sc.add(this.V.tracers);
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.V.noseLine = new THREE.Line(ng, new THREE.LineDashedMaterial({ color: 0x3affb0, dashSize: 8, gapSize: 6, transparent: true, opacity: 0.6 })); this.V.noseLine.frustumCulled = false; sc.add(this.V.noseLine);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.V.railLine = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: 0xc8f8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })); this.V.railLine.frustumCulled = false; sc.add(this.V.railLine);
  }
  holo(obj, color, scale) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { col: { value: new THREE.Color(color) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 col; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(col * (0.12 + 1.1 * f), 0.15 + 0.7 * f); }',
    });
    obj.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = o.receiveShadow = false; } else if (o.isSprite || o.isPoints || o.isLine) o.visible = false; });
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const k = scale / Math.max(size.x, size.y, size.z, 0.01);
    const inner = new THREE.Group(); obj.position.sub(c); inner.add(obj); inner.scale.setScalar(k);
    return inner;
  }
  buildScene() {
    const V = this.V, R = this.run; if (!V || !R) return;
    if (!V.ship) {
      const m = buildShipExterior({}); const h = this.holo(m, 0x3affb0, 60);
      h.rotation.x = -Math.PI / 2; // model nose is +Y; the body frame's nose is -Z
      V.ship = new THREE.Group(); V.ship.add(h); V.sc.add(V.ship);
    }
    for (const [id, g] of V.ships) { V.sc.remove(g); V.ships.delete(id); }
    const E = R.S.enc; if (!E) return;
    for (const e of E.enemies) {
      const t = e.type === 'drone' ? 'drone' : e.type === 'gunship' ? 'gunship' : e.type === 'frigate' ? 'frigate' : 'corvette';
      let m; try { m = buildShip(t); } catch (err) { m = new THREE.Mesh(new THREE.ConeGeometry(1, 3, 6), new THREE.MeshBasicMaterial()); }
      const g = new THREE.Group(); g.add(this.holo(m, e.training ? 0xffd060 : 0xff5a3a, e.type === 'drone' ? 16 : 44)); V.sc.add(g); V.ships.set(e.id, g);
    }
  }
  boomAt(e) { if (!this.V) return; this.run.booms.push({ dir: e.dir.slice(), range: e.range, t: 0 }); }
  onFx(list) {
    const sfx = this.d.sfx; if (!list || !list.length) return;
    for (const f of list) {
      if (!sfx) continue;
      if (f.type === 'rail') { sfx.play('rail'); this.run.railFx = 0.35; }
      else if (f.type === 'launch') sfx.play('launch');
      else if (f.type === 'srm') sfx.play('srm');
      else if (f.type === 'pdc') sfx.gatling && sfx.gatling(1.1, f.n || 1);
      else if (f.type === 'hit') { sfx.play('hit'); this.run.flash = 0.5; }
      else if (f.type === 'boom') sfx.play('boom');
      else if (f.type === 'alarm') sfx.play('alarm');
    }
  }
  render(dt, now) {
    const V = this.V, R = this.run, S = R.S; if (!V) return;
    const cv = this.$('.cs-view'), ov = this.$('.cs-ovl'), w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    if (V.w !== w || V.h !== h) { V.w = w; V.h = h; V.r.setSize(w, h, false); V.cam.aspect = w / h; V.cam.updateProjectionMatrix(); ov.width = w * 2; ov.height = h * 2; }
    const q = S.att.q, Q = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
    V.ship.quaternion.copy(Q);
    const nz = nose(q), N = new THREE.Vector3(nz[0], nz[1], nz[2]);
    // camera
    if (this.chase) { const off = new THREE.Vector3(0, 38, 150).applyQuaternion(Q); V.cam.position.copy(off); V.cam.up.set(0, 1, 0).applyQuaternion(Q); V.cam.lookAt(N.clone().multiplyScalar(220)); }
    else { const c = this.cam; V.cam.up.set(0, 1, 0); V.cam.position.set(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)).multiplyScalar(c.dist); V.cam.lookAt(0, 0, 0); }
    const pa = V.noseLine.geometry.attributes.position; pa.setXYZ(0, N.x * 35, N.y * 35, N.z * 35); pa.setXYZ(1, N.x * 900, N.y * 900, N.z * 900); pa.needsUpdate = true; V.noseLine.computeLineDistances();
    R.railFx = Math.max(0, R.railFx - dt); V.railLine.material.opacity = R.railFx * 2.5; const rl = V.railLine.geometry.attributes.position; rl.setXYZ(0, N.x * 30, N.y * 30, N.z * 30); rl.setXYZ(1, N.x * 1500, N.y * 1500, N.z * 1500); rl.needsUpdate = true;
    // contacts
    const E = S.enc, pos = new Map();
    if (E) for (const e of E.enemies) {
      const g = V.ships.get(e.id); if (!g) continue;
      g.visible = !e.dead && !e.gone;
      const d = scaleDist(e.range); g.position.set(e.dir[0] * d, e.dir[1] * d, e.dir[2] * d); pos.set(e.id, g.position.clone());
      g.quaternion.set(e.q[0], e.q[1], e.q[2], e.q[3]);
    }
    // projectiles
    const put = (pts, list) => { const a = pts.geometry.attributes.position; let n = 0; for (const v of list) { if (n >= a.count) break; a.setXYZ(n++, v.x, v.y, v.z); } a.needsUpdate = true; pts.geometry.setDrawRange(0, n); };
    const pin = [], pout = [], pslug = [], threats = [];
    if (E) for (const p of E.proj) {
      if (p.done) continue;
      let v;
      if (p.from === 'them') { const b = projBodyDir(S, p), iw = qrot(q, b), d = scaleDist(p.range); v = new THREE.Vector3(iw[0] * d, iw[1] * d, iw[2] * d); if (p.type === 'missile') threats.push(v); }
      else { const e = E.enemies.find((x) => x.id === p.target); if (!e) continue; const d = scaleDist(Math.max(0, e.range - p.range)); v = new THREE.Vector3(e.dir[0] * d, e.dir[1] * d, e.dir[2] * d); }
      (p.type === 'slug' ? pslug : p.from === 'them' ? pin : pout).push(v);
    }
    if (E) for (const e of E.enemies) if (!e.dead && !e.gone && e.type === 'drone') { const g = pos.get(e.id); if (g) threats.push(g); }
    put(V.pIn, pin); put(V.pOut, pout); put(V.pSlug, pslug);
    // PDC tracers: each firing turret sprays toward the nearest threat
    const ta = V.tracers.geometry.attributes.position; let tn = 0;
    const fire = (S.weap.pdcFire || []).some((x) => x > 0);
    if (fire && threats.length) { threats.sort((a, b) => a.length() - b.length()); for (let i = 0; i < 12 && tn < 63; i++) { const t = threats[i % threats.length], j = new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), s0 = t.clone().normalize().multiplyScalar(22 + Math.random() * 10), s1 = s0.clone().lerp(t.clone().add(j), 0.3 + Math.random() * 0.6); ta.setXYZ(tn * 2, s0.x, s0.y, s0.z); ta.setXYZ(tn * 2 + 1, s1.x, s1.y, s1.z); tn++; } }
    ta.needsUpdate = true; V.tracers.geometry.setDrawRange(0, tn * 2);
    V.r.render(V.sc, V.cam);
    // overlay: labels, lock bracket, rail solution, explosions, hit flash
    const g = ov.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, w, h);
    const proj = (v) => { const s = v.clone().project(V.cam); return s.z > 1 ? null : [((s.x + 1) / 2) * w, ((1 - s.y) / 2) * h]; };
    g.font = '11px monospace'; g.textBaseline = 'middle';
    if (E) for (const e of E.enemies) {
      if (e.dead || e.gone) continue; const p = pos.get(e.id); if (!p) continue; const s = proj(p); if (!s) continue;
      const lock = S.sensors.lock === e.id;
      g.strokeStyle = lock ? '#ff4a30' : 'rgba(255,140,90,0.7)'; g.lineWidth = lock ? 2 : 1; const z = lock ? 16 : 11;
      g.beginPath(); for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.moveTo(s[0] + sx * z, s[1] + sy * z * 0.4); g.lineTo(s[0] + sx * z, s[1] + sy * z); g.lineTo(s[0] + sx * z * 0.4, s[1] + sy * z); } g.stroke();
      g.fillStyle = lock ? '#ffb0a0' : '#ffa080'; g.fillText(`${e.name.split(' “')[0]}  ${e.range.toFixed(0)} km  ${Math.round((e.hp / e.maxHp) * 100)}%${e.fleeing ? ' FLEEING' : ''}`, s[0] + z + 4, s[1] - z + 4);
      if (lock) { const aim = angDeg(nz, e.dir); g.fillStyle = aim <= 1.5 ? '#7dffb0' : '#ffd060'; g.fillText(aim <= 1.5 ? 'RAIL SOLUTION' : `${aim.toFixed(1)}° OFF NOSE · lock ${Math.round(S.sensors.q * 100)}%`, s[0] + z + 4, s[1] + z + 2); }
    }
    for (const km of V.ringKm) { const s = proj(new THREE.Vector3(scaleDist(km), 0, 0)); if (s) { g.fillStyle = 'rgba(60,150,170,0.6)'; g.fillText(`${km} km`, s[0] + 3, s[1]); } }
    R.booms = R.booms.filter((b) => (b.t += dt) < 1.2);
    for (const b of R.booms) { const d = scaleDist(b.range), s = proj(new THREE.Vector3(b.dir[0] * d, b.dir[1] * d, b.dir[2] * d)); if (!s) continue; g.strokeStyle = `rgba(255,${180 - b.t * 100},80,${1 - b.t / 1.2})`; g.lineWidth = 3; g.beginPath(); g.arc(s[0], s[1], 8 + b.t * 60, 0, 7); g.stroke(); }
    if (pin.length) { g.fillStyle = Math.sin(now / 120) > 0 ? '#ff5a3a' : '#ffb0a0'; g.font = 'bold 13px monospace'; g.fillText(`⚠ ${pin.length} TORPEDO${pin.length > 1 ? 'ES' : ''} INBOUND`, 14, h - 60); }
    R.flash = Math.max(0, R.flash - dt); if (R.flash > 0) { g.fillStyle = `rgba(255,40,20,${R.flash * 0.45})`; g.fillRect(0, 0, w, h); }
    g.textBaseline = 'alphabetic';
  }
}
