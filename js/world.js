// Three.js scene: five stacked decks of the CSV Wolfram, the hull exterior, crew and effects.
// Models and textures live in models.js (ISS-era, NASA-style look).
import * as THREE from 'three';
import { DECKS, COMPS, COMP_IDS, LOCKERS, LIFT_A, SHELTER, DECK_H, ROOM_R, ROOM_H, SHAFT_R, EYE, ITEMS, WAYPOINTS, EXT, EXT_DECK, AIRLOCK } from './config.js';
import { polar, compDeck } from './util.js';
import { PAL, mat, emis, texMat, mliTex, rackTex, floorTex, textSprite, planeLabel, buildComp, buildFire, buildAvatar, buildExterior, buildPlanet } from './models.js';

export { textSprite, buildComp, buildFire, buildAvatar, buildExterior };

const SEG = 16;
const SCREEN_OK = 0xffffff;

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000002);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 7000);
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0xf2f4ff, 0x4a4a44, 1.0);
    this.scene.add(this.hemi);
    this.point = new THREE.PointLight(0xffffff, 40, 30, 1.6);
    this.scene.add(this.point);
    this.point2 = new THREE.PointLight(0xffffff, 15, 18, 1.6);
    this.scene.add(this.point2);
    this.sunlight = new THREE.DirectionalLight(0xfff6e8, 0);
    this.sunlight.position.set(-60, 40, 30);
    this.scene.add(this.sunlight);
    this.decks = [];
    this.comps = {};
    this.avatars = {};
    this.itemMeshes = {};
    this.breachMeshes = {};
    this.shake = 0;
    this.flash = 0;
    this.planetKind = null; this.planet = null;
    this.buildStars();
    for (const d of DECKS) this.buildDeck(d);
    this.exterior = buildExterior(this.comps);
    this.exterior.position.y = EXT_DECK * DECK_H;
    this.scene.add(this.exterior);
    this.decks.push(this.exterior);
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
    const n = 3000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(5000);
      pos.set([v.x, v.y, v.z], i * 3);
      const t = Math.random(), b = 0.55 + Math.random() * 0.45;
      col.set((t < 0.1 ? [1, 0.8, 0.6] : t < 0.2 ? [0.7, 0.8, 1] : [1, 1, 1]).map((c) => c * b), i * 3);
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
    this.sun.scale.set(500, 500, 1);
    this.scene.add(this.sun);
    this.dest = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#ffe0c0', 'rgba(200,140,90,0.35)'), blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.dest);
    this.battleFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#ffffff', 'rgba(255,200,120,0.6)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.battleFlash.scale.set(400, 400, 1);
    this.scene.add(this.battleFlash);
  }

  // ---------- ISS-style interior deck ----------
  buildDeck(d) {
    const g = new THREE.Group();
    g.position.y = d.id * DECK_H;
    const accent = d.color, accHex = '#' + accent.toString(16).padStart(6, '0');
    const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
    add(new THREE.CircleGeometry(ROOM_R + 0.3, SEG * 2), texMat(floorTex([7, 7])), 0, 0, 0, -Math.PI / 2);
    add(new THREE.CircleGeometry(ROOM_R + 0.3, SEG * 2), mat(0xd6d2c6, { side: THREE.DoubleSide }), 0, ROOM_H, 0, Math.PI / 2);
    add(new THREE.RingGeometry(ROOM_R - 1.42, ROOM_R - 1.3, 64), emis(accent, 0.55), 0, 0.01, 0, -Math.PI / 2);
    // cable trays and ducting around the ceiling edge
    add(new THREE.TorusGeometry(ROOM_R - 0.45, 0.07, 6, 64), mat(PAL.dark), 0, ROOM_H - 0.2, 0, Math.PI / 2);
    add(new THREE.TorusGeometry(ROOM_R - 0.62, 0.05, 6, 64), mat(PAL.blue), 0, ROOM_H - 0.18, 0, Math.PI / 2);
    add(new THREE.TorusGeometry(ROOM_R - 0.8, 0.14, 8, 64), mat(0xbfbab0), 0, ROOM_H - 0.32, 0, Math.PI / 2);

    const segW = 2 * ROOM_R * Math.sin(Math.PI / SEG) + 0.05;
    const apo = ROOM_R * Math.cos(Math.PI / SEG);
    const wallMat = texMat(rackTex([1, 1])), frameMat = mat(PAL.off), railMat = mat(PAL.rail);
    const glass = new THREE.MeshLambertMaterial({ color: 0x9fbbd8, transparent: true, opacity: 0.12, depthWrite: false });
    const bagMat = texMat(mliTex([1, 1], '#d8cdb2')), strap = mat(PAL.blue);
    const busy = [...COMP_IDS.filter((id) => !COMPS[id].ext && COMPS[id].deck === d.id).map((id) => COMPS[id].a), ...LOCKERS.filter((l) => l.deck === d.id).map((l) => l.a), ...(d.id === AIRLOCK.deck ? [AIRLOCK.a] : []), ...(d.id === SHELTER.deck ? [SHELTER.a] : [])];
    const near = (a) => busy.some((b) => Math.abs(((a - b + 540) % 360) - 180) < 26);
    for (let i = 0; i < SEG; i++) {
      const aDeg = (i + 0.5) * (360 / SEG);
      const p = polar(aDeg, apo);
      const isWindow = d.id === 4 && (aDeg < 70 || aDeg > 290);
      const isPort = d.id === 3 && (aDeg > 100 && aDeg < 125);
      const w = new THREE.Group();
      w.position.set(p.x, 0, p.z); w.rotation.y = -(aDeg * Math.PI) / 180;
      if (isWindow || isPort) {
        const bot = new THREE.Mesh(new THREE.BoxGeometry(segW, 1.0, 0.25), frameMat); bot.position.y = 0.5; w.add(bot);
        const top = new THREE.Mesh(new THREE.BoxGeometry(segW, 0.7, 0.25), frameMat); top.position.y = ROOM_H - 0.35; w.add(top);
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(segW, ROOM_H - 1.7), glass); gl.position.set(0, 1.0 + (ROOM_H - 1.7) / 2, 0); w.add(gl);
        const mull = new THREE.Mesh(new THREE.BoxGeometry(0.12, ROOM_H - 1.7, 0.2), frameMat); mull.position.y = 1.0 + (ROOM_H - 1.7) / 2; w.add(mull);
      } else {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(segW, ROOM_H, 0.25), wallMat); wall.position.y = ROOM_H / 2; w.add(wall);
        if (!near(aDeg) && (i + d.id) % 3 !== 1) { // stowage bags strapped to the racks
          for (let k = 0; k < 2 + (i % 2); k++) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.45), bagMat); b.position.set(-1.1 + k * 0.85, 0.27 + (k === 2 ? 0.5 : 0), 0.36); b.rotation.y = (k - 1) * 0.06; w.add(b);
            const s = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.05, 0.03), strap); s.position.set(b.position.x, b.position.y + 0.08, 0.6); w.add(s);
          }
        }
      }
      // handrail (ISS yellow-gold) along each wall segment
      const hr = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, segW * 0.8, 6), railMat); hr.rotation.z = Math.PI / 2; hr.position.set(0, 1.15, 0.24); w.add(hr);
      for (const x of [-segW * 0.38, segW * 0.38]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.12), railMat); st.position.set(x, 1.15, 0.18); w.add(st); }
      // rack-edge ribs
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.2, ROOM_H, 0.35), mat(0xb9b5aa));
      const rp = polar(i * (360 / SEG), ROOM_R - 0.12); rib.position.set(rp.x, ROOM_H / 2, rp.z); rib.rotation.y = -(i * 2 * Math.PI) / SEG;
      g.add(rib);
      g.add(w);
      // ceiling light units
      const lp = polar(aDeg, ROOM_R - 3.5);
      const housing = add(new THREE.BoxGeometry(1.3, 0.08, 0.5), mat(PAL.grey), lp.x, ROOM_H - 0.04, lp.z, 0, -(aDeg * Math.PI) / 180);
      const lamp = add(new THREE.PlaneGeometry(1.15, 0.36), emis(0xf4f2ea, 0.95), lp.x, ROOM_H - 0.09, lp.z, Math.PI / 2, 0, (aDeg * Math.PI) / 180);
      lamp.userData.lamp = true;
    }
    // lift shaft
    add(new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, ROOM_H, 24), texMat(mliTex([3, 1], '#e4e1d8')), 0, ROOM_H / 2, 0);
    for (const y of [0.05, ROOM_H - 0.05]) add(new THREE.TorusGeometry(SHAFT_R + 0.02, 0.06, 6, 24), mat(PAL.grey), 0, y, 0, Math.PI / 2);
    const lp = polar(LIFT_A, SHAFT_R + 0.02), lr = -(LIFT_A * Math.PI) / 180;
    add(new THREE.BoxGeometry(1.25, 2.3, 0.1), mat(PAL.grey), lp.x, 1.15, lp.z, 0, lr);
    add(new THREE.BoxGeometry(0.04, 2.2, 0.12), mat(PAL.dark), lp.x, 1.15, lp.z, 0, lr);
    add(new THREE.BoxGeometry(1.45, 0.1, 0.14), emis(accent, 1), lp.x, 2.36, lp.z, 0, lr);
    const sign = planeLabel(d.full, 2.9, 0.42, { size: 54, accent: accHex });
    const sp = polar(LIFT_A, SHAFT_R + 0.06);
    sign.position.set(sp.x, 2.85, sp.z); sign.rotation.y = Math.PI - (LIFT_A * Math.PI) / 180; g.add(sign);
    const sign2 = sign.clone(); const sp2 = polar(LIFT_A + 180, SHAFT_R + 0.06);
    sign2.position.set(sp2.x, 2.85, sp2.z); sign2.rotation.y = Math.PI - ((LIFT_A + 180) * Math.PI) / 180; g.add(sign2);
    const liftLabel = textSprite('LIFT', { width: 0.6, size: 30 }); liftLabel.position.set(polar(LIFT_A, SHAFT_R + 0.5).x, 2.6, polar(LIFT_A, SHAFT_R + 0.5).z); g.add(liftLabel);

    // emergency locker: red ISS-style emergency stowage with PFE extinguishers and a portable breathing apparatus
    const lk = LOCKERS.find((l) => l.deck === d.id);
    const lkp = polar(lk.a, lk.r);
    const locker = new THREE.Group();
    const lb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.6), mat(0xc0392b)); lb.position.y = 1.1; locker.add(lb);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff })); panel.position.set(0, 1.7, 0.31); locker.add(panel);
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), emis(0xc0392b)); cross.position.set(0, 1.7, 0.315); locker.add(cross);
    const cross2 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.3), emis(0xc0392b)); cross2.position.set(0, 1.7, 0.315); locker.add(cross2);
    for (let i = 0; i < 2; i++) { const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 10), mat(0xd8d8d0)); ex.position.set(-0.3 + i * 0.6, 0.6, 0.4); locker.add(ex); const n = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 6), mat(PAL.black)); n.position.set(-0.3 + i * 0.6, 0.97, 0.4); locker.add(n); }
    const suitHang = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.15), mat(0xf2f1ec)); suitHang.position.set(0, 1.1, 0.38); locker.add(suitHang);
    locker.position.set(lkp.x, 0, lkp.z); locker.rotation.y = -(lk.a * Math.PI) / 180;
    g.add(locker);
    const ll = textSprite('EMERGENCY LOCKER', { width: 1.5, size: 26, color: '#ffd0d0' }); ll.position.set(lkp.x * 0.97, 2.55, lkp.z * 0.97); g.add(ll);

    // storm shelter: crew quarters walled with water bags
    if (d.id === SHELTER.deck) {
      const c = polar(SHELTER.a, SHELTER.r);
      add(new THREE.CylinderGeometry(SHELTER.rad, SHELTER.rad, ROOM_H, 16, 1, true), new THREE.MeshLambertMaterial({ color: 0x4a7ab8, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }), c.x, ROOM_H / 2, c.z);
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; if (Math.abs(a - Math.PI * 0.75) < 0.6) continue; add(new THREE.BoxGeometry(0.9, 1.2, 0.35), texMat(mliTex([1, 1], '#b9cde0')), c.x + Math.cos(a) * SHELTER.rad, 0.6, c.z + Math.sin(a) * SHELTER.rad, 0, -a + Math.PI / 2); }
      add(new THREE.CircleGeometry(SHELTER.rad, 20), emis(0x2050a0, 0.5), c.x, 0.02, c.z, -Math.PI / 2);
      const sl = textSprite('STORM SHELTER (water-walled)', { width: 2.2, size: 26, color: '#bcd8ff' }); sl.position.set(c.x, 2.9, c.z); g.add(sl);
    }
    // cargo deck: CTB bag stacks and the inner airlock hatch
    if (d.id === AIRLOCK.deck) {
      for (let i = 0; i < 6; i++) { const cp = polar(150 + i * 9, 9.6 - (i % 2) * 0.9); add(new THREE.BoxGeometry(0.9, 0.7, 0.7), bagMat, cp.x, 0.35 + (i > 3 ? 0.7 : 0), cp.z, 0, i); }
      const ap = polar(AIRLOCK.a, ROOM_R - 0.3), ar = -(AIRLOCK.a * Math.PI) / 180;
      add(new THREE.BoxGeometry(2.2, 2.7, 0.3), mat(PAL.off), ap.x, 1.35, ap.z, 0, ar);
      add(new THREE.BoxGeometry(1.4, 1.9, 0.12), mat(0xe8e6df), ap.x * 0.985, 1.25, ap.z * 0.985, 0, ar);
      add(new THREE.CircleGeometry(0.22, 16), emis(0x80a0c0, 0.5), ap.x * 0.975, 1.65, ap.z * 0.975, 0, Math.PI + ar);
      add(new THREE.BoxGeometry(1.6, 0.08, 0.16), mat(PAL.rail), ap.x * 0.98, 2.25, ap.z * 0.98, 0, ar);
      const at = textSprite('AIRLOCK → EVA', { width: 1.2, size: 28 }); at.position.set(ap.x * 0.95, 2.9, ap.z * 0.95); g.add(at);
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
    this.hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.hand.position.set(0.24, -0.22, -0.6);
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
    this.point.position.set(0, baseY + ROOM_H - 0.4, 0);
    this.point2.position.set(-Math.sin(me.yaw) * 4, baseY + ROOM_H - 0.5, -Math.cos(me.yaw) * 4);
    const red = S.alert === 'red', yel = S.alert === 'yellow';
    const pulse = 0.5 + 0.5 * Math.sin(now * 4);
    const powerDim = S.power && S.power.gen <= 0 && S.battery.charge <= 0.01 ? 0.35 : 1;
    const lc = red ? new THREE.Color(1, 0.35 + 0.3 * (1 - pulse), 0.3 + 0.3 * (1 - pulse)) : yel ? new THREE.Color(1, 0.93, 0.78) : new THREE.Color(1, 0.99, 0.96);
    const eva = deck === EXT_DECK;
    this.point.color.copy(lc); this.point.intensity = eva ? 0 : 42 * powerDim;
    this.point2.color.copy(lc); this.point2.intensity = eva ? 0 : 16 * powerDim;
    this.hemi.intensity = eva ? 0.35 : 1.0 * powerDim;
    this.sunlight.intensity = eva ? 2.6 : 0;
    if (eva) this.updateExterior(S, now, dt);
    this.decks[deck].traverse((o) => { if (o.userData.lamp) o.material.color.setRGB(lc.r * 0.95 * powerDim, lc.g * 0.95 * powerDim, lc.b * 0.95 * powerDim); });

    // sky: stars, sun, destination, nearby planet or moon
    this.stars.position.set(me.x, baseY, me.z);
    const N = S.nav;
    const leg = Math.min(N.leg + (N.state === 'docked' ? 0 : 1), WAYPOINTS.length - 1);
    const f = N.state === 'transit' ? Math.min(1, N.x / N.L) : 1;
    const distAU = Math.max(0.01, Math.hypot(WAYPOINTS[leg].pos[0] - WAYPOINTS[N.leg].pos[0], WAYPOINTS[leg].pos[1] - WAYPOINTS[N.leg].pos[1]) * (1 - f));
    this.dest.position.set(me.x, baseY + 300, me.z - 3000);
    const ds = Math.min(700, 40 / distAU);
    this.dest.scale.set(ds, ds, 1);
    this.sun.position.set(me.x - 2600, baseY + 900, me.z + 1500);
    let pk = null;
    if (N.state === 'docked') pk = WAYPOINTS[N.leg].id;
    else if (N.state !== 'transit') pk = WAYPOINTS[Math.min(N.leg + 1, WAYPOINTS.length - 1)].id;
    else if (f < 0.03) pk = WAYPOINTS[N.leg].id;
    else if (f > 0.97) pk = WAYPOINTS[Math.min(N.leg + 1, WAYPOINTS.length - 1)].id;
    if (pk !== this.planetKind) {
      if (this.planet) { this.scene.remove(this.planet); this.planet = null; }
      this.planetKind = pk;
      if (pk) { this.planet = buildPlanet(pk); this.planet.scale.setScalar(pk === 'ganymede' ? 2600 : 1500); this.scene.add(this.planet); }
    }
    if (this.planet) { this.planet.position.set(me.x - 2600, baseY - 900, me.z - 2200); this.planet.rotation.y = now * 0.004; }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.5);
    this.battleFlash.material.opacity = this.flash;
    this.battleFlash.position.set(me.x + Math.sin(now) * 1200, baseY + 200, me.z - 2500);

    // components
    for (const id in this.comps) {
      const v = this.comps[id], c = S.comps[id];
      if (!c || compDeck(id) !== deck) continue;
      const lp = v.label.position;
      v.label.visible = Math.hypot(lp.x - me.x, lp.z - me.z) > 3.2;
      const hp = c.hp;
      const col = hp <= 0 ? 0x111111 : c.fire > 0 ? (Math.sin(now * 12) > 0 ? 0xff3010 : 0x401000) : c.fault ? 0xff40ff : hp < 25 ? 0xff3030 : hp < 60 ? 0xffb020 : 0x40ff80;
      v.light.material.color.setHex(col);
      if (v.screen) {
        const off = hp <= 0 || c.pw <= 0 || !c.on;
        v.screen.material.color.setHex(off ? 0x050608 : c.fault ? (Math.sin(now * 6) > 0 ? 0xff60ff : 0x401040) : hp < 25 ? 0xff7a70 : SCREEN_OK);
      }
      if (!v.fire) continue;
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
    if (this.comps.drivecore && deck === 0) {
      const g = this.comps.drivecore.glow, t = S.drive.ignited ? 0.3 + S.drive.throttle : 0.05;
      g.material.color.setRGB(t, t * 0.6, t * 0.3);
    }
    if (this.comps.fabricator && deck === 1) { const g = this.comps.fabricator.glow; g.visible = S.fab.queue.length > 0; g.rotation.y += dt * 3; }
    if (this.comps.cryo && deck === 3) this.comps.cryo.group.children.forEach((ch) => { if (ch.userData.pod !== undefined) ch.material.color.setHex(ch.userData.pod < S.pods ? 0x4aa0d8 : 0x101418); });
    if (this.comps.dronebay && deck === 1) { const busy = S.drones.jobs.length; this.comps.dronebay.group.children.forEach((ch) => { if (ch.userData.drone !== undefined) { ch.visible = ch.userData.drone >= busy; ch.position.y = 0.4 + 0.05 * Math.sin(now * 2 + ch.userData.drone); } }); }

    this.updateBreaches(S, deck, now);
    this.updateItems(S, deck);
    this.updateAvatars(S, me, deck, dt, now);
    if (me.item) { this.hand.visible = true; this.hand.material.color.setHex(ITEMS[me.item.type].color); }
    else this.hand.visible = false;
  }
  updateExterior(S, now, dt) {
    const hf = Math.min(1, S.heat.stored / 30000);
    for (const id of ['radA', 'radB']) {
      const w = this.comps[id].wing;
      const target = S.heat.radExt && S.comps[id].hp > 0 ? 1 : 0.1;
      w.scale.x += (target - w.scale.x) * Math.min(1, dt * 0.8);
      w.userData.mat.emissive.setRGB(0.35 * hf * hf, 0.1 * hf * hf, 0.02 * hf);
    }
    const combat = !!S.enc;
    for (const id of ['pdc1', 'pdc2', 'pdc3']) { const s = this.comps[id].spin; if (s && S.comps[id].hp > 0) s.rotation.y = combat ? Math.sin(now * 1.7 + id.length) * 1.4 : s.rotation.y * 0.98; }
    if (this.comps.antenna.spin) this.comps.antenna.spin.rotation.y = Math.sin(now * 0.05) * 0.4;
    if (this.comps.sensorArray.spin && S.comps.sensorArray.hp > 0) this.comps.sensorArray.spin.rotation.y += dt * (S.sensors.pingT > 0 ? 8 : 1.2);
    const rg = this.comps.railgun.glow; const ch = S.weap.rail;
    rg.material.color.setRGB(0.1 + 0.4 * ch, 0.2 + 0.6 * ch, 0.4 + 0.6 * ch);
    const pl = this.exterior.userData.plume;
    pl.visible = S.drive.ignited && S.drive.throttle > 0.01;
    if (pl.visible) { pl.scale.set(0.6 + S.drive.throttle, 0.4 + S.drive.throttle * 1.2, 0.6 + S.drive.throttle); pl.material.opacity = 0.35 + 0.15 * Math.sin(now * 30); }
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
        a.label.position.y = 2.25; a.group.add(a.label);
        a.x = p.x; a.z = p.z; a.yaw = p.yaw; a.phase = 0;
        this.scene.add(a.group);
        this.avatars[p.id] = a;
      }
      const k = Math.min(1, dt * 12);
      const ox = a.x, oz = a.z;
      a.x += (p.x - a.x) * k; a.z += (p.z - a.z) * k;
      const speed = dt > 0 ? Math.hypot(a.x - ox, a.z - oz) / dt : 0;
      a.phase += dt * (4 + speed * 2);
      a.animate(a.phase, Math.min(1, speed / 2.5));
      let dy = p.yaw - a.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      a.yaw += dy * k;
      a.group.position.set(a.x, p.deck * DECK_H, a.z);
      a.group.rotation.set(0, a.yaw + Math.PI, 0);
      a.group.visible = p.deck === deck && p.state !== 'dead' && p.state !== 'spectator';
      a.setSuit(p.suit);
      a.item.visible = !!p.item; if (p.item) a.item.material.color.setHex(ITEMS[p.item.type].color);
      if (p.state === 'downed') { a.group.rotation.x = -Math.PI / 2; a.group.position.y += 0.3; a.label.material.color.setHex(Math.sin(now * 6) > 0 ? 0xff4040 : 0xffffff); }
      else { a.group.rotation.x = 0; a.label.material.color.setHex(0xffffff); }
    }
    for (const id in this.avatars) if (!seen.has(id)) { this.scene.remove(this.avatars[id].group); delete this.avatars[id]; }
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
