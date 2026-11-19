// The Navigation orbit map: a low-res phosphor wireframe of the planet we're at (same look as the maintenance tablet),
// with our trajectory, apoapsis and periapsis, the stations and traffic on their orbits, the closest approach to the
// target, and the flight computer's next burn. Drag to turn, wheel or pinch to zoom, tap a contact to target it.
// One shared WebGL renderer draws into any number of panel canvases.
import * as THREE from 'three';
import { WAYPOINTS } from './config.js';
import { OB, bodyOf, DSkm, bodyObjects, elements, objState, objElements, pathPts, posAt, tToPe, tToAp, targetInfo, fromLocal, destAngle } from './orbit.js';

const MW = 400, MH = 250, U = 0.01; // render resolution; map units per orbit-frame metre
const PHC = { bg: 0x020803, line: 0x2fbf4a, dim: 0x123f22, ok: 0x39ff6a, warn: 0xffc030, bad: 0xff3a24, tgt: 0xffb040, ship: 0xe8ffe8, burn: 0x40c8ff, xfer: 0x40c8ff };
const css = (c) => '#' + c.toString(16).padStart(6, '0');
const P3 = (p, y = 0) => new THREE.Vector3(p[0] * U, y, -p[1] * U);
let M = null;
const views = new WeakMap();

function lineObj(n, color, dashed) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 6, gapSize: 5 }) : new THREE.LineBasicMaterial({ color });
  const l = new THREE.Line(g, m); l.frustumCulled = false; l.userData.n = n; return l;
}
function setLine(l, pts, y = 0) {
  const a = l.geometry.attributes.position, n = Math.min(pts.length, l.userData.n);
  for (let i = 0; i < n; i++) a.setXYZ(i, pts[i][0] * U, y, -pts[i][1] * U);
  a.needsUpdate = true; l.geometry.setDrawRange(0, n); l.visible = n > 1;
  if (l.material.isLineDashedMaterial) l.computeLineDistances();
}
function circlePts(r, n = 96) { const o = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; o.push([r * Math.cos(a), r * Math.sin(a)]); } return o; }
function init() {
  const r = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(MW, MH, false);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(PHC.bg);
  const cam = new THREE.PerspectiveCamera(36, MW / MH, 1, 40000);
  const R = OB.R * U;
  // the planet: a dark occluder and a latitude/longitude cage
  const planet = new THREE.Group(); sc.add(planet);
  planet.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.992, 28, 14), new THREE.MeshBasicMaterial({ color: 0x041a0b })));
  const ll = [];
  for (let la = -60; la <= 60; la += 30) { const y = R * Math.sin((la * Math.PI) / 180), rr = R * Math.cos((la * Math.PI) / 180); for (let i = 0; i < 36; i++) { const a0 = (i / 36) * Math.PI * 2, a1 = ((i + 1) / 36) * Math.PI * 2; ll.push(rr * Math.cos(a0), y, rr * Math.sin(a0), rr * Math.cos(a1), y, rr * Math.sin(a1)); } }
  for (let lo = 0; lo < 180; lo += 30) for (let i = 0; i < 36; i++) { const b0 = (i / 36) * Math.PI * 2, b1 = ((i + 1) / 36) * Math.PI * 2, c = Math.cos((lo * Math.PI) / 180), s = Math.sin((lo * Math.PI) / 180); ll.push(R * Math.sin(b0) * c, R * Math.cos(b0), R * Math.sin(b0) * s, R * Math.sin(b1) * c, R * Math.cos(b1), R * Math.sin(b1) * s); }
  const llg = new THREE.BufferGeometry(); llg.setAttribute('position', new THREE.Float32BufferAttribute(ll, 3));
  const cage = new THREE.LineSegments(llg, new THREE.LineBasicMaterial({ color: PHC.line })); planet.add(cage);
  const atm = lineObj(98, 0x1f7a5a); sc.add(atm);
  // range rings in the orbit plane, and the sphere of influence
  const rings = []; for (let k = 2; k <= 7; k++) { const l = lineObj(98, PHC.dim); setLine(l, circlePts(OB.R * k)); sc.add(l); rings.push(l); }
  const soi = lineObj(130, 0x1c6030, true); setLine(soi, circlePts(OB.soi, 128)); sc.add(soi);
  const ship = lineObj(200, PHC.ok); sc.add(ship);
  const xfer = lineObj(100, PHC.xfer, true); sc.add(xfer);
  const objs = []; for (let i = 0; i < 8; i++) { const l = lineObj(130, PHC.dim); sc.add(l); objs.push(l); }
  const ca = lineObj(2, PHC.warn); sc.add(ca);
  const dest = lineObj(2, 0x7a6020, true); sc.add(dest);
  const ptsG = new THREE.BufferGeometry(); ptsG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3)); ptsG.setAttribute('color', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
  const pts = new THREE.Points(ptsG, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true })); pts.frustumCulled = false; sc.add(pts);
  return { r, sc, cam, planet, cage, atm, rings, soi, ship, xfer, objs, ca, dest, pts };
}

// per-canvas view: drag to orbit the camera, wheel / pinch to zoom, tap a contact to target it
function viewFor(canvas, act) {
  let v = views.get(canvas); if (v) return v;
  v = { yaw: 0.5, pitch: 0.95, dist: 0, hits: [], act };
  views.set(canvas, v);
  const pts = new Map(); let moved = 0, pinch0 = 0;
  canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } e.stopPropagation(); });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p[0], dy = e.clientY - p[1]; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) v.dist = Math.max(60, Math.min(1400, v.dist * (pinch0 / d))); pinch0 = d; moved = 99; return; }
    moved += Math.abs(dx) + Math.abs(dy);
    v.yaw -= dx * 0.008; v.pitch = Math.max(0.05, Math.min(1.5, v.pitch + dy * 0.008));
  });
  const up = (e) => {
    if (pts.size === 1 && moved < 6) {
      const rc = canvas.getBoundingClientRect(), x = ((e.clientX - rc.left) / rc.width) * v.w, y = ((e.clientY - rc.top) / rc.height) * v.h;
      let best = null, bd = 16; for (const h of v.hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } }
      if (best && v.act) v.act('nav.target', { id: best.id });
    }
    pts.delete(e.pointerId); pinch0 = 0;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); v.dist = Math.max(60, Math.min(1400, v.dist * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); }, { passive: false });
  return v;
}

const fmtT = (t) => { if (!isFinite(t)) return '—'; t = Math.max(0, Math.round(t)); return t >= 60 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : `${t} s`; };

export function drawOrbitMap(g, S, w, h, act) {
  if (!M) { try { M = init(); } catch (e) { g.fillStyle = '#020803'; g.fillRect(0, 0, w, h); g.fillStyle = '#39ff6a'; g.font = '12px monospace'; g.fillText('MAP OFFLINE (no WebGL)', 20, 30); return; } }
  const v = viewFor(g.canvas, act); v.w = w; v.h = h;
  const RH = Math.round((MW * h) / w); if (M.rh !== RH) { M.rh = RH; M.r.setSize(MW, RH, false); M.cam.aspect = MW / RH; M.cam.updateProjectionMatrix(); }
  const N = S.nav, O = S.orb;
  // which body, and what's around it
  const leg = O ? O.leg : N.state === 'docked' ? N.leg : Math.min(N.leg + 1, WAYPOINTS.length - 1);
  const wid = WAYPOINTS[leg].id, B = bodyOf(wid), km = DSkm(wid), R = OB.R;
  const t = O ? O.t : S.gameTime || 0;
  let objs = O ? O.objs : (v.cacheLeg === leg ? v.cacheObjs : (v.cacheObjs = bodyObjects(S, leg)));
  v.cacheLeg = leg;
  const el = O ? elements(O.r, O.v) : null;
  const P = O && O.plan;
  // camera: fit the interesting orbit the first time
  if (!v.dist) { const dk = objs.find((o) => o.dock); v.dist = Math.max(220, Math.min(1400, (dk ? dk.a : OB.R * 2) * U * 4.4)); }
  const cam = M.cam; cam.position.set(Math.sin(v.yaw) * Math.cos(v.pitch), Math.sin(v.pitch), Math.cos(v.yaw) * Math.cos(v.pitch)).multiplyScalar(v.dist); cam.lookAt(0, 0, 0);
  M.planet.rotation.y = t * 0.002;
  if (B.atm) { setLine(M.atm, circlePts(R * (1 + B.atm))); } else M.atm.visible = false;
  // trajectories
  if (el) { setLine(M.ship, pathPts(el, 199)); M.ship.material.color.setHex(el.e >= 1 ? PHC.warn : PHC.ok); } else M.ship.visible = false;
  if (P && P.xfer) { const xp = P.xfer, half = []; for (let i = 0; i <= 98; i++) { const nu = (i / 98) * Math.PI; const r = xp.p / (1 + xp.e * Math.cos(nu)), th = xp.w + nu; half.push([r * Math.cos(th), r * Math.sin(th)]); } setLine(M.xfer, half); } else M.xfer.visible = false;
  const tgtId = O ? O.tgt : 'dock';
  objs.forEach((o, i) => { if (i >= M.objs.length) return; const l = M.objs[i]; setLine(l, pathPts(objElements(o), 128)); l.material.color.setHex(o.id === tgtId ? 0x8a5a10 : o.dock ? 0x5a4010 : PHC.dim); });
  for (let i = objs.length; i < M.objs.length; i++) M.objs[i].visible = false;
  // markers
  const pa = M.pts.geometry.attributes.position, ca = M.pts.geometry.attributes.color; let np = 0;
  const labels = [], hits = [];
  const mark = (p, col, label, id, y = 0) => { if (np >= 64) return; const q = P3(p, y); pa.setXYZ(np, q.x, q.y, q.z); const c = new THREE.Color(col); ca.setXYZ(np, c.r, c.g, c.b); np++; if (label) labels.push({ q, col, label, id }); };
  const states = objs.map((o) => objState(o, t));
  objs.forEach((o, i) => mark(states[i].r, o.id === tgtId ? PHC.tgt : o.dock ? 0xb08030 : PHC.line, o.name, o.id));
  let I = null;
  if (O) {
    mark(O.r, PHC.ship, 'WOLFRAM', null, 0);
    if (el.e < 1) { mark(posAt(el, tToAp(el)), PHC.ok, `AP ${((el.ra - R) * km).toFixed(0)}`); }
    if (el.rp > 0) mark(posAt(el, el.e < 1 ? tToPe(el) : Math.max(0, tToPe(el))), el.rp < R * (1.06 + B.atm) ? PHC.bad : PHC.ok, `PE ${((el.rp - R) * km).toFixed(0)}`);
    if (P && P.at && P.tBurn < 1e6) mark(P.at, PHC.burn, P.burn ? 'BURN' : `BURN ${fmtT(P.tBurn)}`);
    if (O.tgt) I = P && P.ca && O.tgt === 'dock' ? { ...targetInfo(O, el, O.tgt, 1, true), ca: P.ca } : targetInfo(O, el, O.tgt);
    if (I && I.ca && I.ca.t > 1) { mark(I.ca.ship, PHC.warn, null); mark(I.ca.tgt, PHC.warn, `CA ${(I.ca.d * km).toFixed(0)} km`); setLine(M.ca, [I.ca.ship, I.ca.tgt]); } else M.ca.visible = false;
    if (S.enc) for (const e of S.enc.enemies) { if (e.dead || e.gone) continue; const d2 = fromLocal(O, e.dir), m = Math.hypot(d2[0], d2[1]) || 1, rr = Math.min(OB.soi, (e.range || 1000) / km); mark([O.r[0] + (d2[0] / m) * rr, O.r[1] + (d2[1] / m) * rr], PHC.bad, e.name.split(' “')[0]); }
  } else M.ca.visible = false;
  // where the next port lies (departure) — and the line we'll leave along
  if (N.state === 'depart' || N.state === 'docked') { const a = destAngle(leg); setLine(M.dest, [[0, 0], [OB.soi * 1.05 * Math.cos(a), OB.soi * 1.05 * Math.sin(a)]]); labels.push({ q: P3([OB.soi * 1.08 * Math.cos(a), OB.soi * 1.08 * Math.sin(a)]), col: 0xb08030, label: `→ ${WAYPOINTS[Math.min(leg + 1, WAYPOINTS.length - 1)].name.split(',')[0].toUpperCase()}` }); } else M.dest.visible = false;
  pa.needsUpdate = true; ca.needsUpdate = true; M.pts.geometry.setDrawRange(0, np);
  M.r.render(M.sc, cam);
  // blit, hard pixels
  g.imageSmoothingEnabled = false; g.drawImage(M.r.domElement, 0, 0, w, h); g.imageSmoothingEnabled = true;
  // labels
  g.font = '10px monospace'; g.textBaseline = 'middle';
  const used = [[0, 0, 190, 90], [w - 250, 0, w, 76], [0, h - 44, w, h]];
  for (const L of labels) {
    const s = L.q.clone().project(cam); if (s.z > 1) continue;
    const x = ((s.x + 1) / 2) * w, y = ((1 - s.y) / 2) * h, tw = g.measureText(L.label).width;
    // keep labels from piling on top of each other: try a few slots around the marker
    let ly = null, lx = x + 6;
    for (const [ox, oy] of [[6, -7], [6, 7], [-tw - 6, -7], [-tw - 6, 7], [6, -19], [6, 19]]) { const bx = x + ox, by = y + oy; if (!used.some((u) => bx < u[2] && bx + tw > u[0] && by - 5 < u[3] && by + 5 > u[1])) { lx = bx; ly = by; break; } }
    if (L.id) hits.push({ id: L.id, x, y });
    if (ly === null) continue;
    used.push([lx, ly - 5, lx + tw, ly + 5]);
    g.fillStyle = css(L.col); g.fillText(L.label, lx, ly);
    if (L.id) { if (L.id === tgtId) { g.strokeStyle = css(PHC.tgt); g.lineWidth = 1; g.strokeRect(x - 6, y - 6, 12, 12); } }
  }
  v.hits = hits;
  // readouts
  const line = (txt, x, y, col = PHC.ok, align = 'left') => { g.textAlign = align; g.fillStyle = css(col); g.fillText(txt, x, y); g.textAlign = 'left'; };
  g.font = '11px monospace';
  const stName = { capture: 'HYPERBOLIC APPROACH', orbit: 'ORBIT', depart: 'DEPARTURE', rendezvous: 'FINAL APPROACH', approach: 'DOCKING', docking: 'LATCHING', docked: 'DOCKED', transit: 'IN TRANSIT' }[N.state] || N.state;
  line(`${B.name.toUpperCase()} · ${stName}`, 8, 12, PHC.ok);
  if (el) {
    const alt = (Math.hypot(O.r[0], O.r[1]) - R) * km;
    line(`ALT ${alt.toFixed(0)} km  e ${el.e.toFixed(3)}`, 8, 26, PHC.line);
    line(el.e < 1 ? `AP ${((el.ra - R) * km).toFixed(0)} km  ${fmtT(tToAp(el))}` : 'AP  — escape', 8, 40, PHC.line);
    line(`PE ${((el.rp - R) * km).toFixed(0)} km  ${el.e < 1 || tToPe(el) > 0 ? fmtT(tToPe(el)) : 'passed'}`, 8, 54, el.rp < R * (1.06 + B.atm) ? PHC.bad : PHC.line);
    if (el.e < 1) line(`PERIOD ${fmtT(el.period)}`, 8, 68, 0x2a8a40);
    if (O.aero) line('AEROBRAKING', 8, 82, PHC.warn);
  } else if (N.state === 'transit') line(`ARRIVAL: ${((N.L - N.x) / 1.496e11).toFixed(2)} AU to go`, 8, 26, PHC.line);
  if (I) {
    line(`TGT ${I.o.name.toUpperCase()}`, w - 8, 12, PHC.tgt, 'right');
    line(`RNG ${(I.d * km).toFixed(0)} km  REL ${I.rel.toFixed(1)} m/s`, w - 8, 26, PHC.tgt, 'right');
    if (I.ca) line(I.ca.t < 1 ? `CLOSEST NOW — range opening` : `CLOSEST ${(I.ca.d * km).toFixed(0)} km in ${fmtT(I.ca.t)}`, w - 8, 40, I.ca.d < OB.handD ? PHC.ok : PHC.warn, 'right');
    line(`ZONE < ${(OB.handD * km).toFixed(0)} km & < ${OB.handV} m/s`, w - 8, 54, 0x2a8a40, 'right');
  }
  if (O && O.warp > 1 && !S.drive.ignited) line(`TIME ×${O.warp}`, w - 8, 70, PHC.warn, 'right');
  if (P && P.text) {
    const blink = P.burn && Math.sin(Date.now() / 140) > 0;
    g.fillStyle = 'rgba(2,8,3,0.78)'; g.fillRect(0, h - 30, w, 30);
    g.font = '10px monospace'; const words = P.text.split(' '), lim = w - 16; let l1 = '', l2 = '';
    for (const wd of words) { if (!l2 && g.measureText(l1 + ' ' + wd).width <= lim) l1 += (l1 ? ' ' : '') + wd; else l2 += (l2 ? ' ' : '') + wd; }
    while (l2 && g.measureText(l2).width > lim) l2 = l2.slice(0, -2) + '…';
    line(l1, 8, h - 21, blink ? PHC.ship : P.burn ? PHC.burn : PHC.ok); line(l2, 8, h - 9, blink ? PHC.ship : P.burn ? PHC.burn : PHC.ok);
  } else if (!O) { g.fillStyle = 'rgba(2,8,3,0.78)'; g.fillRect(0, h - 18, w, 18); g.font = '10px monospace'; line(N.state === 'transit' ? `Stations shown at ${B.name}. On arrival: capture burn at periapsis.` : 'Orbit data resumes when we fly.', 8, h - 9, PHC.line); }
  g.font = '9px monospace'; line('drag ⟲ · wheel/pinch zoom · tap a contact to target', 8, h - (P && P.text ? 38 : 26), 0x1f6a34);
  // phosphor scanlines
  g.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1);
  g.textBaseline = 'alphabetic';
}
