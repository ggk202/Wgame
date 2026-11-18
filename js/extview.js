// External optical views shown on console screens: the combat telescope and the docking camera.
// A separate small renderer, so it can live inside a console panel.
import * as THREE from 'three';
import { WAYPOINTS } from './config.js';
import { buildShip, buildStation } from './npc.js';
import { buildPlanet } from './planet.js';
import { qrot, nose, angDeg, dot, cross, vnorm, rollErr, PORT_TOL } from './attitude.js';
import { RAIL_CONE } from './combat.js';

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function glowTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.3, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class ExtView {
  constructor() {
    this.wrap = document.createElement('div'); this.wrap.className = 'extview';
    this.canvas = document.createElement('canvas'); this.overlay = document.createElement('canvas');
    this.wrap.append(this.canvas, this.overlay);
    this.renderer = null; this.mode = null; this.zoom = 1; this.fx = []; this.ships = {}; this.sprites = [];
  }
  init() {
    if (this.renderer) return;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, logarithmicDepthBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.25;
    // telescope scene (units: km)
    const T = (this.tScene = new THREE.Scene());
    T.background = new THREE.Color(0x000000);
    T.add(this.makeStars(40000));
    this.tSun = new THREE.DirectionalLight(0xfff4e0, 5.5); T.add(this.tSun); T.add(new THREE.HemisphereLight(0x8090a8, 0x201810, 1.1));
    this.tCam = new THREE.PerspectiveCamera(1, 1.6, 0.01, 60000);
    this.texDot = glowTex('#ffffff', 'rgba(255,190,120,0.6)'); this.texBlue = glowTex('#ffffff', 'rgba(140,190,255,0.7)'); this.texBoom = glowTex('#fff8e0', 'rgba(255,140,40,0.7)');
    // docking scene (units: m)
    const D = (this.dScene = new THREE.Scene());
    D.background = new THREE.Color(0x000000);
    D.add(this.makeStars(30000));
    this.dSun = new THREE.DirectionalLight(0xfff4e0, 3.0); this.dSun.position.set(-60, 40, 50); D.add(this.dSun); D.add(new THREE.AmbientLight(0x50586a, 0.6));
    this.dFill = new THREE.PointLight(0xfff0d0, 60, 60, 1.5); D.add(this.dFill); // our own port floodlights
    this.dCam = new THREE.PerspectiveCamera(42, 1.6, 0.05, 40000);
    this.dPlanet = null; this.dStation = null; this.dWid = null;
  }
  makeStars(R) {
    const n = 2000, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(R); pos.set([v.x, v.y, v.z], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false }));
  }
  attach(host, mode) {
    this.init();
    this.mode = mode;
    host.appendChild(this.wrap);
    this.host = host;
  }
  onFx(f) { if (['efire', 'ehit', 'edead', 'pdc', 'rail', 'launch'].includes(f.type)) this.fx.push({ ...f, t: 0 }); }
  size() {
    const w = Math.max(200, this.wrap.clientWidth), h = Math.round(w * 0.56);
    if (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.lastH !== h) {
      this.renderer.setSize(w, h, false); this.canvas.style.width = '100%'; this.canvas.style.height = h + 'px';
      this.overlay.width = w * 2; this.overlay.height = h * 2; this.overlay.style.height = h + 'px'; this.lastH = h;
    }
    return [w, h];
  }
  render(S, dt, now) {
    if (!this.renderer || !this.host || !this.wrap.isConnected) return;
    const [w, h] = this.size();
    if (this.mode === 'dock') this.renderDock(S, now, w, h); else this.renderTelescope(S, dt, now, w, h);
  }

  // ---------------- combat telescope ----------------
  shipFor(e) {
    let m = this.ships[e.id];
    if (!m) { m = buildShip(e.type); m.scale.setScalar(0.001); this.tScene.add(m); this.ships[e.id] = m; }
    return m;
  }
  sprite(tex, color = 0xffffff) {
    let s = this.sprites.find((x) => !x.visible);
    if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: false })); this.tScene.add(s); this.sprites.push(s); }
    s.material.map = tex; s.material.color.setHex(color); s.material.opacity = 1; s.visible = true;
    return s;
  }
  renderTelescope(S, dt, now, w, h) {
    const E = S.enc, cam = this.tCam;
    for (const s of this.sprites) s.visible = false;
    const live = E ? E.enemies.filter((e) => !e.dead && !e.gone) : [];
    for (const id in this.ships) if (!live.find((e) => e.id === id)) { this.tScene.remove(this.ships[id]); delete this.ships[id]; }
    const tgt = live.find((e) => e.id === S.sensors.lock) || live[0];
    const myNose = nose(S.att.q);
    const look = tgt ? tgt.dir : myNose;
    const sun = new THREE.Vector3(-0.6, 0.35, 0.72).normalize();
    this.tSun.position.copy(sun).multiplyScalar(1000);
    // field of view: auto-frame the target, user zoom on top
    const L = tgt ? (tgt.type === 'frigate' ? 0.11 : tgt.type === 'gunship' ? 0.08 : tgt.type === 'drone' ? 0.03 : 0.058) : 0;
    const fov = tgt ? Math.min(25, Math.max(0.002, (2 * Math.atan((L * 0.9) / tgt.range) * 180) / Math.PI)) / this.zoom : 20 / this.zoom;
    cam.fov = fov; cam.aspect = w / h; cam.updateProjectionMatrix();
    cam.position.set(0, 0, 0);
    const up = Math.abs(look[1]) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    cam.up.copy(up); cam.lookAt(V3(look));
    for (const e of live) {
      const m = this.shipFor(e);
      m.position.copy(V3(e.dir).multiplyScalar(e.range));
      m.quaternion.set(e.q[0], e.q[1], e.q[2], e.q[3]);
      for (const p of m.userData.plumes) { p.visible = !!e.thr; p.scale.setScalar(0.9 + 0.2 * Math.sin(now * 40 + p.id)); }
      m.traverse((o) => { if (o.userData.blink) o.visible = Math.sin(now * 3 + o.id) > 0; });
      if (e.rcs && Math.random() < 0.5) { // attitude thruster puffs
        const s = this.sprite(this.texDot, 0xe8f0ff); const off = new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.08).applyQuaternion(m.quaternion);
        s.position.copy(m.position).add(off); s.scale.setScalar(0.012); s.material.opacity = 0.7;
      }
      if (e.thr) { const s = this.sprite(this.texDot, 0xffb070); s.position.copy(m.position).add(new THREE.Vector3(0, 0, 0.08).applyQuaternion(m.quaternion)); s.scale.setScalar(0.03); }
    }
    // projectiles
    const perp = (d) => { const a = vnorm(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])); return [a, vnorm(cross(d, a))]; };
    if (E) for (const pr of E.proj) {
      const src = E.enemies.find((x) => x.id === (pr.from === 'them' ? pr.src : pr.target));
      if (!src) continue;
      const d = src.dir, [a, b] = perp(d), off = pr.off || [0, 0];
      const dist = pr.from === 'them' ? pr.range : Math.max(0, src.range - pr.range);
      const frac = pr.from === 'them' ? pr.range / Math.max(1, src.range) : pr.range / Math.max(1, src.range);
      const lat = Math.sin(Math.PI * Math.min(1, frac)) * src.range * 0.012; // missiles arc, slugs fly nearly straight
      const k = pr.type === 'missile' ? lat : lat * 0.15;
      const pos = new THREE.Vector3(d[0] * dist + (a[0] * off[0] + b[0] * off[1]) * k, d[1] * dist + (a[1] * off[0] + b[1] * off[1]) * k, d[2] * dist + (a[2] * off[0] + b[2] * off[1]) * k);
      const s = this.sprite(pr.type === 'missile' ? this.texDot : this.texBlue, pr.type === 'missile' ? (pr.from === 'them' ? 0xff8040 : 0xffd080) : 0xbfe0ff);
      s.position.copy(pos); s.scale.setScalar(pr.type === 'missile' ? 0.022 : 0.016);
      if (pr.type === 'missile') { const t = this.sprite(this.texDot, 0xff6020); t.position.copy(pos).addScaledVector(V3(d), pr.from === 'them' ? 3 : -3); t.scale.setScalar(0.012); t.material.opacity = 0.5; }
    }
    // transient effects
    for (const f of this.fx) {
      f.t += dt;
      const e = E && E.enemies.find((x) => x.id === f.id);
      if (f.type === 'efire' && e) { // muzzle flash or launch bloom at the enemy
        const m = this.ships[e.id]; if (!m) continue;
        const s = this.sprite(f.w === 'rail' ? this.texBlue : this.texBoom, f.w === 'rail' ? 0xd8ecff : 0xffa060);
        s.position.copy(m.userData.muzzle.getWorldPosition(new THREE.Vector3())); s.scale.setScalar((f.w === 'rail' ? 0.09 : 0.05) * (1 - f.t / 0.5)); s.material.opacity = Math.max(0, 1 - f.t / 0.5);
      } else if ((f.type === 'ehit' || f.type === 'edead') && (e || f.pos)) {
        if (!f.pos && e) f.pos = V3(e.dir).multiplyScalar(e.range);
        const big = f.type === 'edead', life = big ? 2.2 : 0.9;
        const s = this.sprite(this.texBoom, 0xffc080); s.position.copy(f.pos); s.scale.setScalar((big ? 0.25 : 0.08) * Math.min(1, f.t * 6) * (1.2 - f.t / life)); s.material.opacity = Math.max(0, 1 - f.t / life);
        if (big) for (let i = 0; i < 6; i++) { const d = this.sprite(this.texDot, 0xffe0b0); const ang = i * 1.05 + f.t; d.position.copy(f.pos).add(new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0).applyQuaternion(cam.quaternion).multiplyScalar(f.t * f.pos.length() * 0.0012)); d.scale.setScalar(0.01); d.material.opacity = Math.max(0, 1 - f.t / life); }
        f.dead = f.t > life;
        continue;
      } else if (f.type === 'pdc') { // our point-defence tracer fans reaching out along the line of sight
        for (let i = 0; i < 10; i++) { const s = this.sprite(this.texDot, 0xffe28a); const r = 6 + Math.random() * 40; const dir = V3(look).add(new THREE.Vector3((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02, 0).applyQuaternion(cam.quaternion)).normalize(); s.position.copy(dir.multiplyScalar(r)); s.scale.setScalar(0.006); s.material.opacity = Math.max(0, 1 - f.t / 0.6); }
      } else if (f.type === 'rail' && tgt) { // our own slug's departure flash, seen at the edge of the view
        const s = this.sprite(this.texBlue, 0xbfe0ff); s.position.copy(V3(myNose).multiplyScalar(30)); s.scale.setScalar(0.1 * Math.max(0, 1 - f.t / 0.4));
      }
      f.dead = f.dead || f.t > 0.8;
    }
    this.fx = this.fx.filter((f) => !f.dead);
    // non-attenuated sprites still scale with the projection: express their sizes as a fraction of the view height
    const sk = Math.tan((fov * Math.PI) / 360) * 2;
    for (const s of this.sprites) if (s.visible) s.scale.multiplyScalar(sk);
    this.renderer.render(this.tScene, cam);
    this.drawTelescopeOverlay(S, tgt, myNose, fov, w, h, live.length);
  }
  drawTelescopeOverlay(S, tgt, myNose, fov, w, h, n) {
    const g = this.overlay.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, w, h);
    const O = '#ff8a1e', B = '#ffc27a', R = '#ff3b2f', Y = '#ffd23f';
    g.font = '12px "Share Tech Mono", ui-monospace, monospace'; g.lineWidth = 1.5;
    g.strokeStyle = O; g.fillStyle = O; g.shadowColor = O; g.shadowBlur = 4;
    // reticle
    const cx = w / 2, cy = h / 2;
    g.beginPath(); for (const [x1, y1, x2, y2] of [[cx - 40, cy, cx - 10, cy], [cx + 10, cy, cx + 40, cy], [cx, cy - 40, cx, cy - 10], [cx, cy + 10, cx, cy + 40]]) { g.moveTo(x1, y1); g.lineTo(x2, y2); } g.stroke();
    const br = 54; g.beginPath(); for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.moveTo(cx + sx * br, cy + sy * (br - 14)); g.lineTo(cx + sx * br, cy + sy * br); g.lineTo(cx + sx * (br - 14), cy + sy * br); } g.stroke();
    g.fillText(`OPTICAL TELESCOPE  FOV ${fov < 0.1 ? fov.toFixed(3) : fov.toFixed(2)}°  ×${this.zoom}`, 10, 18);
    if (!tgt) { g.fillStyle = B; g.fillText(n ? 'NO LOCK: TRACKING NEAREST' : 'NO CONTACTS: VIEW ALONG NOSE', 10, 34); return; }
    g.fillStyle = B;
    g.fillText(`TGT  ${tgt.name.toUpperCase().slice(0, 30)}`, 10, 34);
    g.fillText(`RNG  ${tgt.range.toFixed(0)} km   CLOSING ${(-tgt.vr).toFixed(1)} km/s`, 10, 50);
    const aspect = angDeg(nose(tgt.q), [-tgt.dir[0], -tgt.dir[1], -tgt.dir[2]]);
    g.fillText(`ASPECT ${aspect < 35 ? 'NOSE-ON (WEAPONS BEARING)' : aspect > 145 ? 'TAIL-ON (DRIVE PLUME)' : 'BROADSIDE'}`, 10, 66);
    g.fillText(`LOCK ${Math.round(S.sensors.q * 100)}%   HULL ${S.sensors.q > 0.5 ? Math.round((tgt.hp / tgt.maxHp) * 100) + '%' : '??'}`, 10, 82);
    // our railgun boresight (where the spinal gun points) relative to the target
    const aim = angDeg(myNose, tgt.dir);
    const ok = aim <= RAIL_CONE;
    const v = new THREE.Vector3(...myNose).project(this.tCam);
    g.fillStyle = ok ? Y : R; g.strokeStyle = ok ? Y : R;
    g.fillText(ok ? `RAIL SOLUTION  ${aim.toFixed(2)}°  FIRE WHEN READY` : `RAIL OFF-AXIS ${aim.toFixed(1)}°  HELM: POINT THE NOSE AT TARGET`, 10, h - 12);
    if (v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2) { const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h; g.beginPath(); g.arc(x, y, 9, 0, 7); g.moveTo(x - 14, y); g.lineTo(x - 5, y); g.moveTo(x + 5, y); g.lineTo(x + 14, y); g.stroke(); g.fillText('BORESIGHT', x + 12, y - 10); }
    else { // arrow toward the boresight
      const tb = qrot([-S.att.q[0], -S.att.q[1], -S.att.q[2], S.att.q[3]], tgt.dir);
      const ang = Math.atan2(-tb[1], -tb[0]);
      g.save(); g.translate(cx, cy); g.rotate(ang); g.beginPath(); g.moveTo(70, 0); g.lineTo(58, -7); g.lineTo(58, 7); g.closePath(); g.fill(); g.restore();
    }
  }

  // ---------------- docking camera ----------------
  renderDock(S, now, w, h) {
    const N = S.nav;
    const wid = N.state === 'docked' ? WAYPOINTS[N.leg].id : WAYPOINTS[Math.min(N.leg + 1, WAYPOINTS.length - 1)].id;
    if (wid !== this.dWid) {
      if (this.dStation) this.dScene.remove(this.dStation);
      if (this.dPlanet) this.dScene.remove(this.dPlanet);
      this.dStation = buildStation(wid); this.dScene.add(this.dStation);
      this.dPlanet = buildPlanet(wid); this.dPlanet.scale.setScalar(9000); this.dPlanet.position.set(4000, -9000, -16000); this.dScene.add(this.dPlanet);
      this.dWid = wid;
    }
    this.dStation.userData.tick(now); this.dPlanet.userData.tick(now); this.dPlanet.userData.setSun(this.dSun.position.clone().normalize());
    const q = S.att.q, P = S.prox;
    const port = P ? P.p : N.state === 'docked' || N.state === 'docking' ? [0, 0, 0] : [0, 0, 600];
    const camOff = qrot(q, [0, 1.5, 0]);
    const cam = this.dCam;
    { const back = qrot(q, [0, 0, 1.5]); cam.position.set(port[0] + camOff[0] + back[0], port[1] + camOff[1] + back[1], port[2] + camOff[2] + back[2]); }
    cam.quaternion.set(q[0], q[1], q[2], q[3]);
    cam.aspect = w / h; cam.fov = 42; cam.updateProjectionMatrix();
    this.dFill.position.copy(cam.position);
    this.renderer.render(this.dScene, cam);
    this.drawDockOverlay(S, w, h);
  }
  drawDockOverlay(S, w, h) {
    const g = this.overlay.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, w, h);
    const O = '#ff8a1e', B = '#ffc27a', R = '#ff3b2f', Y = '#ffd23f', G = '#9dff7a';
    g.font = '12px "Share Tech Mono", ui-monospace, monospace'; g.lineWidth = 1.5; g.shadowColor = O; g.shadowBlur = 4;
    const cx = w / 2, cy = h / 2;
    g.strokeStyle = O; g.beginPath(); g.moveTo(cx - 60, cy); g.lineTo(cx - 12, cy); g.moveTo(cx + 12, cy); g.lineTo(cx + 60, cy); g.moveTo(cx, cy - 60); g.lineTo(cx, cy - 12); g.moveTo(cx, cy + 12); g.lineTo(cx, cy + 60); g.stroke();
    g.beginPath(); g.arc(cx, cy, 30, 0, 7); g.stroke();
    const P = S.prox, diff = S.settings.difficulty;
    g.fillStyle = B; g.fillText('DOCKING CAMERA  · CENTRELINE', 10, 18);
    if (!P) { g.fillText(S.nav.state === 'docked' ? 'HARD DOCKED' : S.nav.state === 'docking' ? 'LATCHING…' : 'STANDBY', 10, 34); return; }
    const A = S.att, range = Math.max(0, P.p[2]), closing = -P.v[2], lat = Math.hypot(P.p[0], P.p[1]);
    const ang = angDeg(nose(A.q), [0, 0, -1]), roll = rollErr(A.q);
    const col = (v, tol) => (v <= tol ? G : v <= tol * 2.5 ? Y : R);
    let y = 34;
    const line = (t, c = B) => { g.fillStyle = c; g.fillText(t, 10, y); y += 16; };
    line(`RANGE   ${range.toFixed(1)} m`);
    const rec = Math.min(2.0, 0.08 + range * 0.012);
    line(`CLOSING ${closing.toFixed(2)} m/s${diff !== 'newtonian' && diff !== 'veteran' ? `  (rec ${rec.toFixed(2)})` : ''}`, range < 8 ? col(closing, PORT_TOL.speed) : closing > rec * 1.6 ? R : B);
    if (diff !== 'newtonian') {
      // lateral offsets in the camera frame (what the pilot must null with J/L/U/O)
      const qi = [-A.q[0], -A.q[1], -A.q[2], A.q[3]], rb = qrot(qi, [-P.p[0], -P.p[1], -P.p[2]]);
      line(`LATERAL X ${(-rb[0]).toFixed(2)}  Y ${(-rb[1]).toFixed(2)} m`, col(lat, PORT_TOL.lateral));
      line(`ATTITUDE ${ang.toFixed(1)}°  ROLL ${roll.toFixed(1)}°`, col(Math.max(ang / PORT_TOL.angle, roll / PORT_TOL.roll), 1));
    }
    g.fillStyle = B;
    g.fillText(`CAPTURE WINDOW: <${PORT_TOL.lateral} m · <${PORT_TOL.speed} m/s · <${PORT_TOL.angle}° · roll <${PORT_TOL.roll}°`, 10, h - 12);
    if (diff === 'recruit' || diff === 'spacer') { // predicted contact point marker
      const tc = closing > 0.01 ? range / closing : 1e9;
      if (tc < 600) {
        const hit = [P.p[0] + P.v[0] * tc, P.p[1] + P.v[1] * tc, 0];
        const qi = [-A.q[0], -A.q[1], -A.q[2], A.q[3]], rb = qrot(qi, [-hit[0], -hit[1], -Math.max(0.5, range)]);
        const v = new THREE.Vector3(rb[0], rb[1] - 1.5, rb[2]).applyQuaternion(this.dCam.quaternion).add(this.dCam.position).project(this.dCam);
        if (v.z < 1) { const x = (v.x * 0.5 + 0.5) * w, yy = (-v.y * 0.5 + 0.5) * h; g.strokeStyle = Math.hypot(hit[0], hit[1]) < PORT_TOL.lateral ? G : Y; g.beginPath(); g.rect(x - 6, yy - 6, 12, 12); g.stroke(); g.fillStyle = g.strokeStyle; g.fillText('PREDICTED', x + 9, yy + 4); }
      }
    }
  }
}
