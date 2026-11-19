// Console panel definitions. Each: { title, build(B, ctx, compId) }
import { COMPS, COMP_IDS, DECKS, WAYPOINTS, SHIP, G0, RECIPES, STATION_PRICES, ITEMS, AU, EXT, RING, RING_DECK, deckName } from './config.js';
import { fmtDist, fmtTime, fmtGameTime, clamp, pct } from './util.js';
import { eff, maxG, deltaV, heatFrac, demandOf, PDCS, ringRpm } from './sim.js';
import { qrot, qconj, nose, angDeg, sasModes, rollErr } from './attitude.js';
import { PARTS, PART_IDS, repairNeeds, missingParts, moduleOf } from './repair.js';
import { RAIL_CONE } from './combat.js';
import { ENEMY_TYPES } from './combat.js';
import { EVENTS } from './events.js';
import { CAP, ORBIT, RV, rvSafe, capEff, strainLimits, safeG, sunBody, radiatorSunFactor, stormShield, streamExposure } from './flight.js';
import { EXPERIMENTS, SCI_COST, sciConditions, UPG_TEXT, fmtLag, podState, POD_CRADLE } from './crew.js';
import { pdcCanSee } from './hull.js';
import { ROUTE_TYPES, routeOptions, routeCurve } from './routes.js';
import { stationNpcs, questOffers } from './stationdata.js';
import { projBodyDir } from './combat.js';
import { bar, btn, cls, esc } from './ui.js';
import { drawOrbitMap } from './orbitmap.js';
import { OB, DSkm } from './orbit.js';

const kmps = (v) => (v / 1000).toFixed(1) + ' km/s';
const stateName = { depart: 'DEPARTURE (ESCAPE BURN)', transit: 'IN TRANSIT', capture: 'CAPTURE (HYPERBOLIC)', orbit: 'PARKING ORBIT', rendezvous: 'RENDEZVOUS', approach: 'DOCKING APPROACH', docking: 'LATCHING', docked: 'DOCKED' };
const destName = (S) => WAYPOINTS[Math.min(S.nav.leg + 1, WAYPOINTS.length - 1)].name;

function flightBlock(B) {
  B.kv('Status', (S) => `${stateName[S.nav.state]}${S.nav.state === 'docked' ? ' — ' + WAYPOINTS[S.nav.leg].name : ' → ' + destName(S)}`);
  B.kv('Range to target', (S) => (S.nav.state === 'transit' ? fmtDist(S.nav.L - S.nav.x) : '—'));
  B.kv('Velocity (toward target)', (S) => kmps(S.nav.v));
  B.kv('Drive', (S) => {
    const D = S.drive;
    const ori = D.orient > 0 ? 'PROGRADE' : D.orient < 0 ? 'RETROGRADE' : `OFF-AXIS (${Math.round((Math.acos(Math.max(-1, Math.min(1, Math.abs(D.along || 1)))) * 180) / Math.PI)}°)`;
    if (D.flip > 0) return { text: `SLEWING · ${Math.round(D.flip)}° to go`, cls: 'warn' };
    if (!D.ignited) return { text: `COLD · ${ori}`, cls: D.orient ? '' : 'warn' };
    return { text: `${ori} · ${(D.acc / G0).toFixed(2)} g · throttle ${pct(D.throttle)}${D.locked > 0 ? ' · VALVE STUCK' : ''}`, cls: D.locked > 0 || !D.orient ? 'bad' : 'good' };
  });
  B.kv('Reaction mass / Δv left', (S) => ({ text: `${S.mass.rmass.toFixed(0)} t · ${(deltaV(S) / 1000).toFixed(0)} km/s`, cls: cls(S.mass.rmass, 500, 200) }));
}
function stopInfo(S) {
  const N = S.nav, rem = N.L - N.x;
  const a = Math.max(0.05, N.plan.g) * G0;
  const stop = (N.v * N.v) / (2 * a);
  const toward = N.v * Math.sign(rem || 1);
  const slack = Math.abs(rem) - stop;
  return { rem, stop, toward, slack, a };
}

function drawRouteMap(g, S, w, h) {
  const N = S.nav, leg = N.leg, a = WAYPOINTS[leg].pos, b = WAYPOINTS[leg + 1].pos;
  const opts = routeOptions(S, leg), curves = opts.map((id) => routeCurve(S, id, leg));
  const xs = [0, ...curves.flat().map((p) => p[0])], ys = [0, ...curves.flat().map((p) => p[1])];
  const minX = Math.min(...xs) - 0.3, maxX = Math.max(...xs) + 0.3, minY = Math.min(...ys) - 0.3, maxY = Math.max(...ys) + 0.3;
  const sc = Math.min(w / (maxX - minX), h / (maxY - minY));
  const P = (p) => [(p[0] - minX) * sc + (w - (maxX - minX) * sc) / 2, h - ((p[1] - minY) * sc + (h - (maxY - minY) * sc) / 2)];
  g.fillStyle = '#0b0500'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2a1404'; for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo((i * w) / 12, 0); g.lineTo((i * w) / 12, h); g.stroke(); }
  const sun = P([0, 0]); if (sun[0] > -20 && sun[0] < w + 20) { g.fillStyle = '#ffe070'; g.beginPath(); g.arc(sun[0], sun[1], 7, 0, 7); g.fill(); }
  // the asteroid belt band (2.2–3.2 AU) as dots
  g.fillStyle = '#5a4630'; for (let i = 0; i < 260; i++) { const r = 2.2 + ((i * 37) % 100) / 100, t = i * 2.399; const q = P([Math.cos(t) * r, Math.sin(t) * r]); if (q[0] > 0 && q[0] < w && q[1] > 0 && q[1] < h) g.fillRect(q[0], q[1], 1.5, 1.5); }
  opts.forEach((id, i) => {
    const R = ROUTE_TYPES[id], [p0, pm, p1] = curves[i], sel = (N.route || 'direct') === id;
    const A = P(p0), M = P(pm), B = P(p1), C = [2 * M[0] - (A[0] + B[0]) / 2, 2 * M[1] - (A[1] + B[1]) / 2];
    g.strokeStyle = R.color; g.lineWidth = sel ? 3.5 : 1.5; g.setLineDash(sel ? [] : [6, 5]);
    g.beginPath(); g.moveTo(A[0], A[1]); g.quadraticCurveTo(C[0], C[1], B[0], B[1]); g.stroke(); g.setLineDash([]);
    // danger pips along the route
    for (let k = 0; k < R.danger; k++) { const t = 0.3 + k * 0.13, x = (1 - t) * (1 - t) * A[0] + 2 * (1 - t) * t * C[0] + t * t * B[0], y = (1 - t) * (1 - t) * A[1] + 2 * (1 - t) * t * C[1] + t * t * B[1]; g.fillStyle = R.danger >= 3 ? '#ff5a3a' : '#ffd23f'; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 4, y + 3); g.lineTo(x - 4, y + 3); g.fill(); }
    g.fillStyle = R.color; g.font = (sel ? 'bold ' : '') + '11px monospace'; g.fillText(R.short, M[0] + 6, M[1] - 6);
  });
  for (const [p, nm] of [[a, WAYPOINTS[leg].name.split(',')[0]], [b, WAYPOINTS[leg + 1].name.split(',')[0]]]) { const q = P(p); g.fillStyle = '#ffc27a'; g.beginPath(); g.arc(q[0], q[1], 5, 0, 7); g.fill(); g.font = '12px monospace'; g.fillText(nm.toUpperCase(), q[0] + 8, q[1] + 4); }
}

// What the pilot needs right now: capture countdown, orbit trim, rendezvous profile, rocks, structure, burn advice
// the 3D orbit map plus its controls (time compression, targets)
function orbitBlock(B, h) {
  B.canvas(560, h, (g, S, w, hh) => drawOrbitMap(g, S, w, hh, (a, args) => B.ctx.act(a, args)));
  B.seg('Time', [{ v: 1, l: '×1' }, { v: 2, l: '×2' }, { v: 5, l: '×5' }, { v: 10, l: '×10' }], (S) => (S.orb ? S.orb.warp || 1 : 1), 'nav.owarp', (v) => ({ w: v }), (S) => !!S.orb && ['capture', 'orbit', 'depart'].includes(S.nav.state) && !S.drive.ignited && !S.enc);
  B.html((S) => {
    if (!S.orb || S.nav.state !== 'orbit') return '';
    const O = S.orb, km = DSkm(WAYPOINTS[O.leg].id);
    return `<div class="kv"><label>Target</label><span>${O.objs.map((o) => `<button class="btn ${O.tgt === o.id ? 'sel' : ''}" data-act="nav.target" data-args='{"id":"${o.id}"}'>${esc(o.name)}${o.dock ? ' ⚓' : ''}</button>`).join(' ')}</span></div>
      <div class="note">Intercept the port (⚓): park in a circular orbit, burn at the <b>transfer window</b> (the blue mark), trim with a <b>correction burn</b> (SAS Maneuver), then brake (SAS Target-retro) into the control zone — under ${Math.round(OB.handD * km)} km and ${OB.handV} m/s. Traffic control flies you the last 10 km to the docking hold.</div>`;
  });
  B.note((S) => (S.nav.state === 'depart' ? 'Departure: burn prograde at the <b>ejection mark</b> so the escape hyperbola leaves toward the next port (the dashed line). A late or early burn means a longer trip.' : S.nav.state === 'capture' ? 'Arrival: the yellow line is our hyperbola. Fix a low periapsis with a radial-out burn early, then burn retrograde centred on periapsis until the orbit closes.' : ''));
}
function directorHTML(S) {
  const N = S.nav, D = S.drive, out = [];
  const row = (k, v, c = '') => `<div class="kv"><label>${k}</label><b class="${c}">${v}</b></div>`;
  if (S.orb && ['capture', 'orbit', 'depart'].includes(N.state)) {
    const P = S.orb.plan;
    out.push(`<h4 class="dir">${N.state === 'capture' ? 'CAPTURE' : N.state === 'depart' ? 'ESCAPE' : 'ORBIT'} — FLIGHT COMPUTER</h4>`);
    if (P && P.text) out.push(`<div class="note ${P.burn ? 'good' : ''}"><b>${esc(P.text)}</b></div>`);
    if (N.state === 'capture' && N.cap) { const C = N.cap, k = C.dvEff / C.dvNeed; out.push(`<div class="kv"><label>Capture</label>${bar(Math.min(1, k), k >= 1 ? 'good' : k > 0.55 ? 'warn' : 'bad', `${Math.round(C.dvEff)} / ${C.dvNeed} m/s`)}</div>`); }
    out.push(`<div class="note">Open the <b>Navigation → Orbit map</b> (or Helm → Orbit) to see the trajectory, apoapsis, periapsis, the port and the closest approach. SAS modes Radial, Target-retro, Station and Maneuver point for you.</div>`);
    if (N.holdT > 0) out.push(row('Traffic hold', `${Math.ceil(N.holdT)} s`, 'warn'));
  }
  if (N.state === 'rendezvous' && N.rv) {
    const R = N.rv, safe = rvSafe(R.d);
    out.push(`<h4 class="dir">RENDEZVOUS</h4>`);
    out.push(row('Station', `${(R.d / 1000).toFixed(2)} km ahead · closing ${R.vc.toFixed(1)} m/s`, R.vc > safe ? 'bad' : R.vc < 0 ? 'warn' : 'good'));
    out.push(row('Safe closing speed', `${safe.toFixed(1)} m/s${R.vc > safe ? ' — <b>BRAKE (retro burn)</b>' : R.vc < 1 && R.d > RV.handoff + 200 ? ' — burn prograde to close' : ''}`));
    out.push(row('Hold point', `${RV.handoff} m, arrive below ${RV.maxHandoffV} m/s · time compression ×${S.warp}`));
  }
  if (N.slotT > 0) out.push(row('Approach slot', `${Math.floor(N.slotT / 60)}:${String(Math.floor(N.slotT % 60)).padStart(2, '0')} left`, N.slotT < 60 ? 'bad' : N.slotT < 150 ? 'warn' : ''));
  if (S.effects.chunk) { const C = S.effects.chunk; out.push(`<div class="kv"><label class="bad">ROCK INBOUND</label>${bar(Math.min(1, C.got / C.need), C.got >= C.need ? 'good' : 'bad', `${C.got.toFixed(2)} / ${C.need} m/s sideways · impact ${Math.ceil(C.t)} s`)}</div><div class="note">Translate with the RCS pad below (or <b>J/L/U/O</b>), or burn with the nose off-axis.</div>`); }
  // structural load
  const lims = strainLimits(S);
  if ((S.strain && S.strain.v > 0.02) || (D.ignited && lims.length)) {
    const sv = S.strain ? S.strain.v : 0;
    out.push(`<div class="kv"><label>Structure</label>${bar(Math.min(1, sv), sv > 0.8 ? 'bad' : sv > 0.4 ? 'warn' : 'good', `${pct(sv)} · safe ≤ ${safeG(S).toFixed(2)} g (${lims.map((l) => l.text).join(', ') || 'clean'})`)}</div>`);
  }
  if (N.advice) {
    const A = N.advice;
    out.push(`<div class="kv"><label>Burn advice</label><b class="${A.ok ? 'good' : 'warn'}">${A.burn ? `${A.mode === 'pro' ? 'PROGRADE' : 'RETROGRADE'} at ${A.g.toFixed(2)} g · ${(A.dv / 1000).toFixed(0)} km/s to go` : 'COAST — drive off'}${A.ok ? ' ✓' : ''}</b></div>`);
  }
  return out.join('');
}
// Threat cone: the whole sky around the ship seen from the bow (centre = nose, rim = stern). Shaded: what each gatling
// can cover from its mount. Red: torpedoes and drones inbound. Rolling and pitching moves the coverage onto them.
let _cov = null;
function coverageGrid() {
  if (_cov) return _cov;
  const n = 48, g = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const u = (i + 0.5) / n * 2 - 1, v = (j + 0.5) / n * 2 - 1, r = Math.hypot(u, v);
    if (r > 1) { g.push(-1); continue; }
    const ang = r * Math.PI, phi = Math.atan2(-v, u);
    const d = [Math.sin(ang) * Math.cos(phi), Math.sin(ang) * Math.sin(phi), -Math.cos(ang)];
    g.push(PDCS.reduce((s, id) => s + (pdcCanSee(id, d) ? 1 : 0), 0));
  }
  return (_cov = { n, g });
}
function drawThreatCone(g, S, w, h) {
  const R = Math.min(h / 2 - 10, 110), cx = R + 14, cy = h / 2;
  g.fillStyle = '#0b0500'; g.fillRect(0, 0, w, h);
  const C = coverageGrid(), cell = (2 * R) / C.n;
  for (let i = 0; i < C.n; i++) for (let j = 0; j < C.n; j++) {
    const k = C.g[i * C.n + j]; if (k < 0) continue;
    g.fillStyle = k === 0 ? '#2a0a04' : k === 1 ? '#3d2a08' : k === 2 ? '#55450c' : '#6d6012';
    g.fillRect(cx - R + i * cell, cy - R + j * cell, cell + 0.5, cell + 0.5);
  }
  g.strokeStyle = '#3a1a04'; for (const r of [0.25, 0.5, 0.75, 1]) { g.beginPath(); g.arc(cx, cy, r * R, 0, 7); g.stroke(); }
  g.fillStyle = '#a8581a'; g.font = '10px monospace'; g.fillText('NOSE', cx - 12, cy + 3); g.fillText('BROADSIDE', cx - 26, cy - R / 2 - 3); g.fillText('STERN (rim)', cx - 30, cy + R + 9);
  g.fillText('DORSAL ▲', cx - 24, cy - R + 10); g.fillText('STBD ▶', cx + R - 40, cy + 12);
  const P = (d) => { const ang = Math.acos(Math.max(-1, Math.min(1, -d[2]))), phi = Math.atan2(d[1], d[0]), r = (ang / Math.PI) * R; return [cx + Math.cos(phi) * r, cy - Math.sin(phi) * r]; };
  const qi = qconj(S.att.q);
  let nThreat = 0, nCovered = 0;
  if (S.enc) {
    for (const e of S.enc.enemies) { if (e.dead || e.gone) continue; const [x, y] = P(qrot(qi, e.dir)); g.strokeStyle = '#ffd23f'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.stroke(); }
    const th = [...S.enc.proj.filter((p) => p.from === 'them' && p.type === 'missile' && !p.done), ...S.enc.enemies.filter((e) => !e.dead && !e.gone && ENEMY_TYPES[e.type].kamikaze)];
    for (const t of th) {
      const d = projBodyDir(S, t), cov = PDCS.some((id) => pdcCanSee(id, d) && eff(S, id) > 0);
      nThreat++; if (cov) nCovered++;
      const [x, y] = P(d); g.fillStyle = cov ? '#ff8a1e' : '#ff2a1a'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
      if (!cov) { g.strokeStyle = '#ff2a1a'; g.beginPath(); g.arc(x, y, 8, 0, 7); g.stroke(); }
    }
  }
  const tx = cx + R + 22; g.font = '12px monospace';
  g.fillStyle = '#ffc27a'; g.fillText('POINT-DEFENCE COVERAGE', tx, 22);
  g.fillStyle = '#a8581a'; g.font = '11px monospace';
  ['Bright: 2–3 gatlings bear', 'Dim: 1 gatling', 'Dark red: blind spot'].forEach((t, i) => g.fillText(t, tx, 42 + i * 16));
  g.fillStyle = nThreat && nCovered < nThreat ? '#ff3b2f' : '#9dff7a'; g.font = '12px monospace';
  g.fillText(nThreat ? `${nCovered} of ${nThreat} inbound covered` : 'No inbound threats', tx, 104);
  if (nThreat && nCovered < nThreat) { g.fillStyle = '#ff8a1e'; g.font = '11px monospace'; g.fillText('Roll/pitch to bring the', tx, 122); g.fillText('ringed threats into the light', tx, 136); }
  const lock = S.enc && S.enc.enemies.find((e) => e.id === S.sensors.lock && !e.dead && !e.gone);
  if (lock) { const a = angDeg(nose(S.att.q), lock.dir), asp = Math.abs(Math.sin((a * Math.PI) / 180)); g.fillStyle = '#a8581a'; g.fillText(`Aspect to target: ${a.toFixed(0)}°`, tx, 162); g.fillText(`Cross-section: ${pct(0.55 + 0.45 * asp)} (nose-on is smallest)`, tx, 178); g.fillText(a <= RAIL_CONE ? 'Railgun can bear' : 'Railgun needs nose-on', tx, 194); }
}

export const PANELS = {
  helm: {
    title: 'HELM',
    build(B) {
      B.view('dock', (S) => S.nav.state === 'approach' || S.nav.state === 'docking');
      B.pad('Translate (RCS)', [['FWD ⇡ I', 't', 2, 1], ['BACK ⇣ K', 't', 2, -1], ['◀ LEFT J', 't', 0, -1], ['RIGHT L ▶', 't', 0, 1], ['UP U', 't', 1, 1], ['DOWN O', 't', 1, -1]], (S) => S.nav.state === 'approach' || !!S.effects.chunk);
      B.buttons([
        { label: 'Request approach', act: 'helm.dock', show: (S) => S.nav.state === 'orbit', enabled: (S) => S.nav.state === 'orbit' },
        { label: 'Undock & depart', act: 'helm.depart', cls: 'green', show: (S) => S.nav.state === 'docked', enabled: (S) => S.nav.state === 'docked' && S.nav.leg < WAYPOINTS.length - 1 },
        { label: 'Back off & re-approach', act: 'helm.reapproach', show: (S) => S.nav.state === 'approach' },
      ]);
      B.html(directorHTML);
      B.section('Attitude');
      B.canvas(560, 230, drawAttitude);
      B.seg('SAS', [{ v: 'off', l: 'Off' }, { v: 'hold', l: 'Hold' }, { v: 'pro', l: 'Prograde' }, { v: 'retro', l: 'Retro' }, { v: 'target', l: 'Target' }, { v: 'shield', l: 'Stern to Sun' }, { v: 'sun', l: 'Nose to Sun' }, { v: 'dock', l: 'Dock align' }, { v: 'radout', l: 'Radial out' }, { v: 'radin', l: 'Radial in' }, { v: 'tret', l: 'Target-retro' }, { v: 'tlos', l: 'Station' }, { v: 'node', l: 'Maneuver' }], (S) => S.att.mode, 'att.mode', (v) => ({ m: v }), (S, v) => sasModes(S).includes(v));
      B.pad('Rotate (RCS)', [['▲ NOSE UP S', 'r', 0, 1], ['▼ NOSE DN W', 'r', 0, -1], ['◀ YAW A', 'r', 1, 1], ['YAW D ▶', 'r', 1, -1], ['⟲ ROLL Q', 'r', 2, 1], ['ROLL E ⟳', 'r', 2, -1]]);
      B.note((S) => `Keys while seated: <b>W/S</b> pitch · <b>A/D</b> yaw · <b>Q/E</b> roll · <b>X</b> kill rotation${S.nav.state === 'approach' ? ' · <b>I/K</b> forward/back · <b>J/L</b> left/right · <b>U/O</b> up/down' : ''}. ${S.settings.sas === 'none' ? 'No SAS on this difficulty: every rotation you start, you must stop yourself.' : S.settings.sas === 'hold' ? 'SAS can only damp rotation (Hold). Pointing is up to you.' : ''}`);
      B.section('Orbit');
      orbitBlock(B, 300);
      B.section('Flight');
      flightBlock(B);
      B.buttons([
        { label: 'Ignite drive', act: 'helm.ignite', enabled: (S) => !S.drive.ignited && ['transit', 'capture', 'orbit', 'rendezvous', 'depart'].includes(S.nav.state) },
        { label: 'Cut drive', act: 'helm.cutoff', cls: 'red', enabled: (S) => S.drive.ignited },
        { label: 'Flip 180° (SAS)', act: 'helm.flip', enabled: (S) => S.drive.flip <= 0 && S.nav.state === 'transit' && sasModes(S).includes('pro') },
      ]);
      B.slider('Thrust (g)', { min: 0, max: 2, step: 0.01, maxFn: (S) => maxG(S).toFixed(2), get: (S) => S.drive.cmdG, fmt: (v) => v.toFixed(2) + ' g', act: 'helm.g', args: (v) => ({ g: v }) });
      B.buttons([
        { label: 'Autopilot', labelFn: (S) => (S.settings.autopilot ? `Autopilot: ${S.nav.autopilot ? 'ENGAGED' : 'OFF'}` : 'Autopilot: N/A at this difficulty'), act: 'helm.autopilot', args: () => ({ on: !B.ctx.S().nav.autopilot }), enabled: (S) => S.settings.autopilot },
        { label: 'Manual burns', labelFn: (S) => `Manual burns (computer advises): ${S.nav.manual ? 'ON' : 'OFF'}`, act: 'helm.manual', args: () => ({ on: !B.ctx.S().nav.manual }) },
      ]);
      B.kv('Structure', (S) => { const l = strainLimits(S); return { text: `safe thrust ≤ ${safeG(S).toFixed(2)} g${l.length ? ' — ' + l.map((x) => x.text).join(', ') : ' (ring stopped, radiators stowed, nobody outside)'}${S.drive.capped ? ' · flight computer limiting thrust' : ''}`, cls: S.drive.ignited && S.drive.g > safeG(S) ? 'bad' : '' }; });
      B.kv('Sun', (S) => { const s = sunBody(S), rf = radiatorSunFactor(S); return { text: `${(s.au).toFixed(2)} AU · radiators ${pct(rf)} efficient${rf < 0.8 ? ' (sunlight on the panels — turn them edge-on)' : ''}${S.effects.stormT > 0 || S.effects.stormWarn > 0 ? ` · storm shielding ${pct(0.85 * stormShield(S))}` : ''}`, cls: rf < 0.7 ? 'warn' : '' }; });
      B.note((S) => {
        if (S.nav.state !== 'transit') return '';
        const i = stopInfo(S);
        if (i.toward <= 0) return `<span class="warn">Moving away from (or not toward) the target. Point prograde and burn.</span>`;
        const real = i.slack / Math.max(1, Math.abs(S.nav.v)) / S.warp;
        if (i.slack < 0) return `<span class="bad">OVERSHOOTING — stopping distance ${fmtDist(i.stop)} exceeds range. Flip and decelerate hard!</span>`;
        return `Stopping distance at ${S.nav.plan.g.toFixed(2)} g: ${fmtDist(i.stop)}. ${S.drive.orient < 0 ? 'Decelerating.' : `Flip and start the decel burn in about <b>${fmtTime(real)}</b> (real time).`}`;
      });
      B.section('Combat');
      B.canvas(560, 240, drawThreatCone);
      B.toggle('Evasive jinking', (S) => S.drive.evasive, 'helm.evasive', (v) => ({ on: v }));
      B.seg('Range', [{ v: 'hold', l: 'Hold' }, { v: 'open', l: 'Open range' }, { v: 'close', l: 'Close' }], (S) => S.drive.maneuver, 'helm.maneuver', (v) => ({ m: v }));
      B.note((S) => { const t = S.enc && S.enc.enemies.find((e) => e.id === S.sensors.lock && !e.dead && !e.gone); const aim = t ? angDeg(nose(S.att.q), t.dir) : null; return (t ? `<b>${aim <= RAIL_CONE ? 'RAIL SOLUTION' : 'Target ' + aim.toFixed(1) + '° off the nose'}</b> · ` : '') + 'The spinal railgun only fires along the nose: point the ship at the target (SAS Target, or by hand). Nose-on you also present a much smaller silhouette. Rotating or jinking spoils enemy railgun solutions; jinking adds 1.2 g.'; });
      B.section('Port');
      B.buttons([
        { label: 'Request approach', act: 'helm.dock', enabled: (S) => S.nav.state === 'orbit' },
        { label: 'Undock & depart', act: 'helm.depart', cls: 'green', enabled: (S) => S.nav.state === 'docked' && S.nav.leg < WAYPOINTS.length - 1 },
      ]);
      B.note('Arrival: a capture burn at periapsis, then circularise if needed. Request an approach slot: rendezvous from ~10 km to the 200 m hold point within the slot time, then fly the docking.');
      B.note('Docking is flown by hand: the approach starts about 200 m out. Null your sideways drift, line the cross up inside the target circle, match roll, and touch the port slower than 0.25 m/s.');
      camBlock(B);
    },
  },

  nav: {
    title: 'NAVIGATION',
    build(B) {
      B.kv('Status', (S) => `${stateName[S.nav.state]}${S.nav.state === 'docked' ? ' — ' + WAYPOINTS[S.nav.leg].name : ' → ' + destName(S)}`);
      B.section('Orbit map');
      orbitBlock(B, 340);
      B.section('Route & system');
      // route choice for the next leg, FTL-style: shown while docked, and as a reminder of the chosen route in flight
      B.canvas(560, 250, drawRouteMap, (S) => S.nav.state === 'docked' && S.nav.leg < WAYPOINTS.length - 1);
      B.html((S) => {
        const N = S.nav;
        if (N.state !== 'docked' || N.leg >= WAYPOINTS.length - 1) { const R = ROUTE_TYPES[N.route] || ROUTE_TYPES.direct; return N.state === 'transit' ? `<div class="kv"><label>Route</label><b style="color:${R.color}">${R.name}</b> · danger ${'▲'.repeat(R.danger)}${'△'.repeat(4 - R.danger)}</div>` : ''; }
        const opts = routeOptions(S, N.leg), dest = WAYPOINTS[N.leg + 1].name.split(',')[0];
        return `<h4>Routes to ${dest}</h4>` + opts.map((id) => {
          const R = ROUTE_TYPES[id], sel = (N.route || 'direct') === id;
          return `<div class="route ${sel ? 'sel' : ''}" style="border-color:${R.color}"><div><b style="color:${R.color}">${R.name}</b> <i>· ${Math.round(R.len * 100)}% distance · danger ${'▲'.repeat(R.danger)}${'△'.repeat(4 - R.danger)}</i></div><div class="note">${esc(R.text)}</div>${sel ? '<b class="good">SELECTED</b>' : `<button class="btn" data-act="nav.route" data-args='{"id":"${id}"}'>Plot this route</button>`}</div>`;
        }).join('');
      });
      B.canvas(400, 230, (g, S, w, h) => {
        const pts = WAYPOINTS.map((p) => p.pos);
        const xs = [...pts.map((p) => p[0]), 0], ys = [...pts.map((p) => p[1]), 0];
        const minX = Math.min(...xs) - 0.5, maxX = Math.max(...xs) + 0.5, minY = Math.min(...ys) - 0.4, maxY = Math.max(...ys) + 0.4;
        const sc = Math.min(w / (maxX - minX), h / (maxY - minY));
        const P = (p) => [(p[0] - minX) * sc + (w - (maxX - minX) * sc) / 2, h - ((p[1] - minY) * sc + (h - (maxY - minY) * sc) / 2)];
        g.fillStyle = '#0b0500'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#3a1a04'; for (const r of [1, 1.5, 2.7, 5.2]) { const c = P([0, 0]); g.beginPath(); g.arc(c[0], c[1], r * sc, 0, 7); g.stroke(); }
        const sun = P([0, 0]); g.fillStyle = '#ffd860'; g.beginPath(); g.arc(sun[0], sun[1], 5, 0, 7); g.fill();
        g.setLineDash([4, 4]); g.strokeStyle = '#8a4410'; g.beginPath(); pts.forEach((p, i) => { const q = P(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke(); g.setLineDash([]);
        WAYPOINTS.forEach((wp, i) => { const q = P(wp.pos); g.fillStyle = wp.color; g.beginPath(); g.arc(q[0], q[1], 4, 0, 7); g.fill(); g.fillStyle = i <= S.nav.leg ? '#7a4a20' : '#ffb060'; g.font = '10px system-ui'; g.fillText(wp.name.split(',')[0], q[0] + 6, q[1] - 5); });
        const a = WAYPOINTS[S.nav.leg].pos, b = WAYPOINTS[Math.min(S.nav.leg + 1, WAYPOINTS.length - 1)].pos;
        const f = S.nav.state === 'transit' ? S.nav.x / S.nav.L : S.nav.state === 'docked' ? 0 : 1;
        const sp = P([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
        g.fillStyle = '#ffd8a0'; g.beginPath(); g.moveTo(sp[0], sp[1] - 6); g.lineTo(sp[0] + 5, sp[1] + 5); g.lineTo(sp[0] - 5, sp[1] + 5); g.fill();
        g.fillStyle = '#ffd8a0'; g.font = 'bold 10px monospace'; g.fillText('WOLFRAM', sp[0] + 7, sp[1] + 12);
      });
      B.kv('Leg', (S) => `${S.nav.leg + 1} of ${WAYPOINTS.length - 1}: ${WAYPOINTS[S.nav.leg].name.split(',')[0]} → ${destName(S).split(',')[0]}`);
      B.kv('Progress', (S) => (S.nav.state === 'transit' ? pct(clamp(S.nav.x / S.nav.L, 0, 9)) : stateName[S.nav.state]));
      B.kv('Range / velocity', (S) => `${fmtDist(S.nav.L - S.nav.x)} · ${kmps(S.nav.v)}`);
      B.kv('ETA at current speed', (S) => { const r = S.nav.L - S.nav.x; if (S.nav.state !== 'transit' || S.nav.v * r <= 0) return '—'; const t = r / S.nav.v; return `${fmtGameTime(t)} ship time (~${fmtTime(t / S.settings.warpBase)} real)`; });
      B.kv('Time compression', (S) => (S.warp > 1 ? `×${S.warp}` : 'REAL TIME (combat or docking)'));
      B.html(directorHTML);
      B.section('Burn plan (used by autopilot)');
      B.slider('Cruise speed', { min: 50, max: 1500, step: 10, get: (S) => S.nav.plan.cruise, fmt: (v) => v + ' km/s', act: 'nav.plan', args: (v) => ({ cruise: v }) });
      B.slider('Burn acceleration', { min: 0.05, max: 1.2, step: 0.01, get: (S) => S.nav.plan.g, fmt: (v) => v.toFixed(2) + ' g', act: 'nav.plan', args: (v) => ({ g: v }) });
      B.kv('Plan Δv required (this leg)', (S) => {
        const L = S.nav.L, a = S.nav.plan.g * G0, vb = Math.sqrt(a * L);
        const vc = Math.min(S.nav.plan.cruise * 1000, vb);
        const dv = 2 * vc, have = deltaV(S);
        return { text: `${(dv / 1000).toFixed(0)} km/s (have ${(have / 1000).toFixed(0)})`, cls: dv > have ? 'bad' : dv > have * 0.85 ? 'warn' : 'good' };
      });
      B.kv('Plan trip time', (S) => {
        const L = S.nav.L, a = S.nav.plan.g * G0, vb = Math.sqrt(a * L);
        const vc = Math.min(S.nav.plan.cruise * 1000, vb);
        const t = (2 * vc) / a + (L - (vc * vc) / a) / vc;
        return `${fmtGameTime(t)} ship time (~${fmtTime(t / S.settings.warpBase)} real)`;
      });
      B.note('Hard sci-fi travel: burn toward the target, coast, flip 180°, then burn to slow down. Higher cruise speed arrives sooner but costs reaction mass. Stations refuel you when you dock.');
    },
  },

  sensors: {
    title: 'SENSORS',
    build(B) {
      telescopeBlock(B);
      B.canvas(400, 200, drawRadar);
      B.kv('Sensor suite / array', (S) => `${pct(eff(S, 'sensors'))} / ${pct(eff(S, 'sensorArray'))}${S.effects.stormT > 0 ? ' · STORM INTERFERENCE' : ''}`);
      B.bar('Target lock', (S) => ({ v: S.sensors.q, text: S.sensors.lock ? pct(S.sensors.q) : 'none', cls: S.sensors.q > 0.4 ? 'good' : 'warn' }));
      B.buttons([{ label: 'Active ping', labelFn: (S) => (S.sensors.pingCd > 0 ? `Active ping (${Math.ceil(S.sensors.pingCd)} s)` : 'Active ping (+35% lock)'), act: 'sensors.ping', enabled: (S) => S.sensors.pingCd <= 0 && !!S.enc }]);
      B.html((S) => contactList(S));
      B.note('Drive plumes are visible across the solar system, so there is no stealth in space. Lock quality improves faster at short range. The active ping also tells the enemy exactly where you are.');
    },
  },

  tactical: {
    title: 'FIRE CONTROL',
    build(B) {
      telescopeBlock(B);
      B.kv('Target', (S) => { const e = S.enc && S.enc.enemies.find((x) => x.id === S.sensors.lock); return e ? { text: `${e.name} · ${e.range.toFixed(0)} km · lock ${pct(S.sensors.q)}`, cls: S.sensors.q > 0.4 ? 'good' : 'warn' } : { text: 'NO LOCK — select a contact below', cls: 'warn' }; });
      B.html((S) => contactList(S));
      weaponSections(B);
      camBlock(B);
    },
  },

  // the combat simulator (sim pod / main-menu training): helm, weapons and sensors on one console, no cameras
  simconsole: {
    title: 'COMBAT SIMULATOR',
    build(B) {
      B.kv('Target', (S) => { const e = S.enc && S.enc.enemies.find((x) => x.id === S.sensors.lock); return e ? { text: `${e.name} · ${e.range.toFixed(0)} km · lock ${pct(S.sensors.q)}`, cls: S.sensors.q > 0.4 ? 'good' : 'warn' } : { text: S.enc ? 'NO LOCK — select a contact below' : 'No contacts', cls: 'warn' }; });
      B.html((S) => contactList(S));
      B.section('Helm');
      B.canvas(560, 230, drawAttitude);
      B.seg('SAS', [{ v: 'off', l: 'Off' }, { v: 'hold', l: 'Hold' }, { v: 'pro', l: 'Prograde' }, { v: 'retro', l: 'Retro' }, { v: 'target', l: 'Target' }], (S) => S.att.mode, 'att.mode', (v) => ({ m: v }), (S, v) => sasModes(S).includes(v));
      B.pad('Rotate (RCS)', [['▲ NOSE UP S', 'r', 0, 1], ['▼ NOSE DN W', 'r', 0, -1], ['◀ YAW A', 'r', 1, 1], ['YAW D ▶', 'r', 1, -1], ['⟲ ROLL Q', 'r', 2, 1], ['ROLL E ⟳', 'r', 2, -1]]);
      B.canvas(560, 240, drawThreatCone);
      B.toggle('Evasive jinking', (S) => S.drive.evasive, 'helm.evasive', (v) => ({ on: v }));
      B.seg('Range', [{ v: 'hold', l: 'Hold' }, { v: 'open', l: 'Open range' }, { v: 'close', l: 'Close' }], (S) => S.drive.maneuver, 'helm.maneuver', (v) => ({ m: v }));
      B.buttons([{ label: 'Ignite drive', act: 'helm.ignite', enabled: (S) => !S.drive.ignited }, { label: 'Cut drive', act: 'helm.cutoff', cls: 'red', enabled: (S) => S.drive.ignited }]);
      B.note((S) => { const t = S.enc && S.enc.enemies.find((e) => e.id === S.sensors.lock && !e.dead && !e.gone); const aim = t ? angDeg(nose(S.att.q), t.dir) : null; return (t ? `<b>${aim <= RAIL_CONE ? 'RAIL SOLUTION' : 'Target ' + aim.toFixed(1) + '° off the nose'}</b> · ` : '') + 'Keys: <b>W/S</b> pitch · <b>A/D</b> yaw · <b>Q/E</b> roll · <b>X</b> kill rotation. Point the nose at the target for the railgun (SAS Target). Evasive jinking spoils enemy rail solutions; range control needs the drive lit.'; });
      weaponSections(B);
      B.section('Sensors');
      B.canvas(400, 200, drawRadar);
      B.bar('Target lock', (S) => ({ v: S.sensors.q, text: S.sensors.lock ? pct(S.sensors.q) : 'none', cls: S.sensors.q > 0.4 ? 'good' : 'warn' }));
      B.buttons([{ label: 'Active ping', labelFn: (S) => (S.sensors.pingCd > 0 ? `Active ping (${Math.ceil(S.sensors.pingCd)} s)` : 'Active ping (+35% lock)'), act: 'sensors.ping', enabled: (S) => S.sensors.pingCd <= 0 && !!S.enc }]);
    },
  },

  comms: {
    title: 'COMMUNICATIONS',
    build(B) {
      B.buttons([{ label: 'Hail contacts', act: 'comms.hail', enabled: (S) => !!S.enc && !S.enc.hailed }]);
      B.html((S) => {
        if (S.nav.state !== 'docked') return '';
        return `<h4>Station services — ${WAYPOINTS[S.nav.leg].name}</h4><div class="kv"><label>Credits</label><b class="good">${S.credits}</b></div>` +
          '<div class="grid2">' + Object.entries(STATION_PRICES).map(([k, v]) => `<button class="btn" data-act="station.buy" data-args='{"item":"${k}"}' ${S.credits < v.cost ? 'disabled' : ''}>${v.name} <i>${v.cost}cr</i></button>`).join('') + '</div>';
      });
      B.buttons([
        { label: 'Request approach', act: 'helm.dock', enabled: (S) => S.nav.state === 'orbit', show: (S) => S.nav.state === 'orbit' },
        { label: 'Undock & depart', act: 'helm.depart', cls: 'green', enabled: (S) => S.nav.state === 'docked' && S.nav.leg < WAYPOINTS.length - 1, show: (S) => S.nav.state === 'docked' },
      ]);
      B.section('Hails');
      B.html((S) => {
        const hs = ((S.comms && S.comms.hails) || []).filter((h) => S.gameTime >= h.arrive).slice().reverse();
        if (!hs.length) return '<div class="note">No hails awaiting a reply. Messages from far away arrive late, and so do your answers.</div>';
        return hs.map((h) => {
          const left = h.deadline - S.gameTime - h.lag; // reply must leave before this to arrive in time
          const st = h.done ? (h.expired ? '<b class="bad">no reply sent in time</b>' : `<b class="good">reply delivered</b>`) : h.reply ? `<b class="warn">reply in flight — arrives in ${fmtLag(Math.max(0, h.replyArrive - S.gameTime))}</b>` : left > 0 ? `<b class="${left < 600 ? 'bad' : 'warn'}">reply within ${fmtGameTime(left)} ship time for it to arrive on time</b>` : '<b class="bad">too late</b>';
          const opts = !h.done && !h.reply && left > 0 ? h.opts.map((o) => `<button class="btn" data-act="comms.reply" data-args='${JSON.stringify({ id: h.id, opt: o.id })}'>${esc(o.label)}</button>`).join(' ') : '';
          return `<div class="msg"><b>${esc(h.from)}</b> <i>(light-lag ${fmtLag(h.lag)} each way)</i><p>${esc(h.text)}</p><div>${st}</div><div class="grid2">${opts}</div></div>`;
        }).join('');
      });
      B.section('Message log');
      B.html((S) => S.msgs.slice().reverse().map((m) => `<div class="msg"><b>${esc(m.from)}</b>${m.lag > 60 ? ` <i>(sent ${Math.round(m.lag / 60)} min ago)</i>` : ''}<p>${esc(m.text)}</p></div>`).join('') || '<div class="note">No messages.</div>');
    },
  },

  status: {
    title: 'SHIP STATUS',
    build(B) { statusBlock(B); },
  },

  life: {
    title: 'ATMOSPHERE CONTROL',
    build(B) {
      B.kv('Reserves', (S) => ({ text: `O₂ ${Math.round(S.life.o2)} kg · N₂ ${Math.round(S.life.n2)} kg · water ${Math.round(S.life.water)} L · food ${Math.round(S.life.food)} kg`, cls: S.life.o2 < 200 || S.life.n2 < 400 ? 'warn' : '' }));
      B.toggle('Electrolysis (water → O₂)', (S) => S.life.electrolysis, 'life.electrolysis', (v) => ({ on: v }));
      B.kv('Suppressant charges', (S) => S.life.suppressant);
      B.html((S) => '<table class="tbl"><tr><th>Deck</th><th>kPa</th><th>O₂</th><th>CO₂</th><th>°C</th><th>Status</th><th></th></tr>' + S.decks.filter((d) => !d.ext).reverse().map((d) => {
        const P = d.o2 + d.n2 + d.co2, br = S.breaches.filter((b) => b.deck === d.id).length;
        const fires = COMP_IDS.filter((id) => !COMPS[id].ext && COMPS[id].deck === d.id && S.comps[id].fire > 0).length;
        const st = [d.vent ? '<b class="bad">VENTING</b>' : '', br ? `<b class="bad">${br} breach</b>` : '', fires ? `<b class="bad">${fires} fire</b>` : '', d.force ? 'forced' : ''].filter(Boolean).join(' ');
        return `<tr><td>${DECKS[d.id].name}</td><td class="${P < 60 ? 'bad' : P < 90 ? 'warn' : ''}">${P.toFixed(0)}</td><td class="${d.o2 < 16 ? 'bad' : ''}">${d.o2.toFixed(1)}</td><td class="${d.co2 > 1.2 ? 'bad' : d.co2 > 0.6 ? 'warn' : ''}">${d.co2.toFixed(2)}</td><td>${d.temp.toFixed(0)}</td><td>${st || 'ok'}</td><td>${d.vent ? btn('Seal', 'life.seal', { deck: d.id }) : btn('Vent', 'life.vent', { deck: d.id }, 'red')} ${br ? btn(d.force ? 'Unforce' : 'Force fill', 'life.force', { deck: d.id, on: !d.force }) : ''} ${fires ? btn('Suppress', 'life.suppress', { deck: d.id }) : ''}</td></tr>`;
      }).join('') + '</table>');
      B.note('Venting a deck to space starves any fire on it, and costs a lot of gas to refill. Life support isolates breached decks automatically; "Force fill" pours reserves into them anyway (into space, while the hole is open). Partial pressures in kPa; O₂ below 13 causes hypoxia, CO₂ above 2 is toxic.');
    },
  },

  scrubbers: {
    title: 'CO₂ SCRUBBERS',
    build(B) {
      B.bar('Cartridge saturation', (S) => ({ v: S.life.sat, text: pct(S.life.sat), cls: cls(S.life.sat, 0.6, 0.85, true) }));
      B.kv('Scrubbing efficiency', (S) => ({ text: pct(S.scrubE || 0), cls: cls(S.scrubE || 0, 0.5, 0.2) }));
      B.kv('CO₂ by deck (kPa)', (S) => S.decks.filter((d) => !d.ext).map((d) => `${DECKS[d.id].name[0]}:${d.co2.toFixed(2)}`).join('  '));
      B.buttons([{ label: 'Thermal bake-out', labelFn: (S) => (S.life.regen > 0 ? `Baking out… ${Math.ceil(S.life.regen)} s` : 'Thermal bake-out (60 s, offline)'), act: 'scrub.regen', enabled: (S) => S.life.regen <= 0 }]);
      B.note('Fastest fix: bring a Scrubber Cartridge from Stores (Cargo deck) and press F here. A bake-out regenerates cartridges to about 20%, but scrubbing stops while it runs and it wears the unit.');
    },
  },
  recycler: {
    title: 'WATER RECYCLER',
    build(B) {
      B.kv('Water reserve', (S) => `${Math.round(S.life.water)} L`);
      B.kv('Recovery efficiency', (S) => pct(0.9 * eff(S, 'recycler') + 0.1 * (eff(S, 'recycler') > 0 ? 1 : 0)));
      B.note('Water is used for drinking, for electrolysis to make oxygen, and as shielding. A broken recycler loses about ten times as much water to waste.');
    },
  },
  hydro: {
    title: 'HYDROPONICS',
    build(B) {
      B.kv('Food stores', (S) => `${Math.round(S.life.food)} kg`);
      B.kv('Production', (S) => `${(2.5 * eff(S, 'hydro')).toFixed(1)} kg/day`);
      B.kv('Crew consumption', (S) => `${(1.8 * Math.max(1, Object.values(S.players).filter((p) => p.state === 'alive' && p.connected).length)).toFixed(1)} kg/day`);
      B.note('Hydroponics is lowest power priority, so it is the first system shed in a power crunch.');
    },
  },
  med: {
    title: 'MEDBAY',
    build(B, ctx) {
      B.kv('Your health', (S) => { const p = ctx.me(); return { text: `${Math.round(p.hp)} / ${Math.round(p.maxHp || 100)}`, cls: cls(p.hp, 50, 25) }; });
      B.kv('Your radiation dose', (S) => { const p = ctx.me(); return { text: `${p.dose.toFixed(2)} Sv${p.dose > 1 ? ' — radiation sickness, max health reduced' : ''}`, cls: cls(p.dose, 1, 3, true) }; });
      B.note((S) => (eff(S, 'medbay') > 0 ? 'Stay here (panel open) to be treated: about +6 health per second.' : '<span class="bad">Medbay offline: no treatment possible.</span>'));
      B.buttons([{ label: 'Radiation countermeasures (−1.2 Sv, uses 1 medkit)', act: 'med.rad' }]);
      B.html((S) => '<table class="tbl"><tr><th>Crew</th><th>Health</th><th>Dose</th><th>Deck</th></tr>' + Object.values(S.players).filter((p) => p.connected).map((p) => `<tr><td>${esc(p.name)}</td><td class="${cls(p.hp, 50, 25)}">${p.state === 'alive' ? Math.round(p.hp) : p.state.toUpperCase()}</td><td>${p.dose.toFixed(2)} Sv</td><td>${deckName(p.deck)}</td></tr>`).join('') + '</table>');
    },
  },
  cryo: {
    title: 'CRYO BAY',
    build(B) {
      B.kv('Backup crew in cryo', (S) => ({ text: `${S.pods}`, cls: S.pods > 1 ? 'good' : S.pods === 1 ? 'warn' : 'bad' }));
      B.kv('Pod power', (S) => (eff(S, 'cryo') > 0 ? { text: 'NOMINAL', cls: 'good' } : { text: `UNPOWERED — pod loss in ${Math.max(0, Math.ceil(90 - (S.cryoOffT || 0)))} s`, cls: 'bad' }));
      B.note('When a crew member dies, a backup crew member is thawed and takes over. Keep this bay powered: an unpowered pod loses its occupant every 90 seconds.');
    },
  },

  reactor: {
    title: 'FUSION REACTOR (D–³He)',
    build(B, ctx) {
      B.kv('State', (S) => { const R = S.reactor; const m = { running: ['RUNNING', 'good'], scram: ['SCRAM — SHUT DOWN', 'bad'], preheat: [`PRE-HEAT ${pct(R.preheat / 20)}`, 'warn'], ready: ['READY TO IGNITE', 'warn'] }[R.state]; return { text: m[0], cls: m[1] }; });
      B.bar('Output', (S) => ({ v: S.reactor.actual, text: `${pct(S.reactor.actual)} → target ${pct(S.reactor.target)} · ${S.power.gen.toFixed(1)} MWe`, cls: 'good' }));
      B.slider('Target output', { min: 0, max: 1, step: 0.01, get: (S) => S.reactor.target, fmt: (v) => pct(v), act: 'reactor.target', args: (v) => ({ v }), enabled: (S) => !S.settings.autoPower });
      B.note((S) => (S.settings.autoPower ? 'Automatic load following is active (difficulty setting).' : 'Manual load control: match output to demand (see Power Distribution). Spare output becomes waste heat.'));
      B.section('Magnetic confinement');
      B.bar('Plasma stability', (S) => ({ v: S.reactor.stab, text: pct(S.reactor.stab) + (S.reactor.lowStabT > 0 ? ` · AUTO-SCRAM IN ${Math.max(0, Math.ceil(4 - S.reactor.lowStabT))} s` : ''), cls: cls(S.reactor.stab, 0.5, 0.25) }));
      B.html((S) => {
        const R = S.reactor;
        if (R.state !== 'running') return '';
        const n = Math.sin(S.t * 3.1) * 0.03 + Math.sin(S.t * 7.3) * 0.02;
        const asym = R.field - R.drift + n;
        const pos = clamp(50 + asym * 50, 0, 100);
        return `<div class="kv"><label>Flux asymmetry</label><div class="gauge"><i style="left:${pos}%"></i><u></u></div></div><div class="note ${Math.abs(asym) > 0.15 ? 'warn' : ''}">${Math.abs(asym) < 0.06 ? 'Field balanced.' : asym > 0 ? '◀ Field too strong: lower the confinement field' : 'Field too weak: raise the confinement field ▶'}</div>`;
      });
      B.slider('Confinement field', { min: -1, max: 1, step: 0.01, get: (S) => S.reactor.field, fmt: (v) => (v >= 0 ? '+' : '') + v.toFixed(2), act: 'reactor.field', args: (v) => ({ v }) });
      B.note((S) => ({ full: 'Field auto-tuning: FULL (difficulty).', assist: 'Field auto-tuning: ASSIST. Corrects slowly, so big disturbances still need you.' }[S.settings.autoReactor] || 'Field auto-tuning: NONE. Keep the asymmetry needle centred.'));
      B.section('Startup / shutdown');
      B.buttons([
        { label: 'SCRAM', cls: 'red', act: 'reactor.scram', enabled: (S) => S.reactor.state === 'running' },
        { label: 'Pre-heat magnets', act: 'reactor.preheat', enabled: (S) => S.reactor.state === 'scram' },
        { label: 'IGNITE', cls: 'green', act: 'reactor.ignite', enabled: (S) => S.reactor.state === 'ready' },
      ]);
      B.kv('Fuel pellets (D–³He)', (S) => ({ text: `${S.mass.pellets.toFixed(0)} kg`, cls: cls(S.mass.pellets, 100, 30) }));
      B.note('Restart: Pre-heat (20 s on battery power, 6 MW) → Ignite. If the battery is flat, the emergency fuel cell recharges it at 2 MW. Shed loads to speed that up.');
    },
  },

  power: {
    title: 'POWER DISTRIBUTION',
    build(B) {
      B.kv('Generation / demand', (S) => ({ text: `${S.power.gen.toFixed(1)} MW / ${S.power.demand.toFixed(1)} MW`, cls: S.power.deficit > 0.5 ? 'bad' : 'good' }));
      B.bar('Battery', (S) => { const c = S.power.cap || SHIP.batteryMWh; return { v: S.battery.charge / c, text: `${S.battery.charge.toFixed(2)} / ${c.toFixed(1)} MWh · ${S.power.batt >= 0 ? '+' : ''}${S.power.batt.toFixed(1)} MW`, cls: cls(S.battery.charge / c, 0.3, 0.1) }; });
      B.kv('Shed (unpowered) load', (S) => ({ text: `${S.power.deficit.toFixed(1)} MW`, cls: S.power.deficit > 0.5 ? 'bad' : 'good' }));
      B.html((S) => '<table class="tbl"><tr><th>System</th><th>MW</th><th>Priority</th><th>Breaker</th></tr>' + COMP_IDS.map((id) => {
        const c = S.comps[id], d = demandOf(S, id);
        const st = c.hp <= 0 ? '<b class="bad">dead</b>' : !c.on ? '<b class="warn">off</b>' : c.pw <= 0 ? '<b class="bad">shed</b>' : '<b class="good">on</b>';
        return `<tr><td>${COMPS[id].name}</td><td>${d.toFixed(1)}</td><td>${[1, 2, 3].map((p) => `<button class="btn mini ${c.prio === p ? 'sel' : ''}" data-act="power.prio" data-args='{"id":"${id}","p":${p}}'>${p}</button>`).join('')}</td><td>${st} ${btn(c.on ? 'Off' : 'On', 'power.breaker', { id, on: !c.on }, 'mini')}</td></tr>`;
      }).join('') + '</table>');
      B.note('When demand exceeds supply, priority 3 systems are shed first, then priority 2. The hotel load (lights, fans) always takes 3 MW. The battery covers short peaks such as railgun charging.');
    },
  },

  thermal: {
    title: 'THERMAL CONTROL',
    build(B) {
      B.bar('Heat sink', (S) => { const f = heatFrac(S); return { v: f, text: `${pct(f)} · ${(S.heat.stored / 1000).toFixed(1)} / ${SHIP.heatCap / 1000} GJ`, cls: cls(f, 0.7, 0.9, true) }; });
      B.kv('Heat in / radiated', (S) => ({ text: `${S.heat.inMW.toFixed(0)} MW / ${S.heat.outMW.toFixed(0)} MW`, cls: S.heat.inMW > S.heat.outMW ? 'warn' : 'good' }));
      B.kv('Radiators', (S) => `${S.heat.radExt ? 'EXTENDED' : 'RETRACTED'} · A ${Math.round(S.comps.radA.hp)}% · B ${Math.round(S.comps.radB.hp)}%`);
      B.kv('Coolant pumps', (S) => ({ text: pct(eff(S, 'coolpump')), cls: cls(eff(S, 'coolpump'), 0.5, 0.2) }));
      B.buttons([
        { label: 'Extend radiators', act: 'thermal.radiators', args: { ext: true }, enabled: (S) => !S.heat.radExt && !S.settings.autoRadiators },
        { label: 'Retract radiators', act: 'thermal.radiators', args: { ext: false }, enabled: (S) => S.heat.radExt && !S.settings.autoRadiators },
      ]);
      B.note((S) => (S.settings.autoRadiators ? 'Radiators are automated: retracted in combat while there is heat-sink headroom.' : '') + ' In space, heat can only leave by radiation. Extended radiators shed 6× more heat but are big, fragile targets in combat. At 90% heat, components start cooking. At 100%, the reactor SCRAMs and the drive shuts down. Railgun shots dump 450 MJ each.');
    },
  },

  fab: {
    title: 'FABRICATOR',
    build(B) {
      B.kv('Feedstock', (S) => ({ text: `${Math.round(S.stores.feedstock)} kg`, cls: cls(S.stores.feedstock, 60, 20) }));
      B.html((S) => (S.fab.queue.length ? '<table class="tbl"><tr><th>Queue</th><th>Progress</th><th></th></tr>' + S.fab.queue.map((j, i) => `<tr><td>${j.name}</td><td>${bar(j.p, '', pct(j.p))}</td><td>${btn('✕', 'fab.cancel', { i }, 'mini')}</td></tr>`).join('') + '</table>' : '<div class="note">Queue empty.</div>'));
      B.html((S) => '<div class="grid2">' + Object.entries(RECIPES).map(([k, r]) => `<button class="btn" data-act="fab.queue" data-args='{"item":"${k}"}' ${S.stores.feedstock < r.kg ? 'disabled' : ''}>${r.name}<i> ${r.kg} kg · ${r.t} s</i></button>`).join('') + '</div>');
      B.note('Fabricated items go to Stores. Fabrication draws 5 MW and is power priority 3.');
    },
  },
  stores: {
    title: 'STORES',
    build(B) {
      B.html((S) => '<table class="tbl"><tr><th>Spare parts</th><th>In stock</th><th>Needed now</th></tr>' + PART_IDS.map((k) => { const need = COMP_IDS.reduce((n, id) => { const r = repairNeeds(S, id); return n + (r ? r.parts[k] || 0 : 0); }, 0); return `<tr><td>${PARTS[k].name}</td><td class="${S.stores[k] ? (S.stores[k] < need ? 'warn' : '') : 'bad'}">${S.stores[k]}</td><td>${need || '—'}</td></tr>`; }).join('') + '</table>');
      B.note('Parts are drawn from these stocks automatically when a repair procedure is finished at the faulty module. Make more at the Fabricator, buy them in port, or trade for them.');
      B.html((S) => `<div class="grid2">${['patch', 'medkit', 'cartridge'].map((t) => `<button class="btn" data-act="stores.take" data-args='{"type":"${t}"}' ${S.stores[t] > 0 ? '' : 'disabled'}>Take ${ITEMS[t].name} <i>(${S.stores[t]})</i></button>`).join('')}</div>`);
      B.buttons([{ label: 'Return held item', act: 'stores.return', enabled: () => !!B.ctx.me().item }]);
      B.kv('Munitions', (S) => `${S.stores.missiles} torpedoes · ${S.stores.slugs} slugs · ${S.stores.pdcAmmo} PDC rds · ${S.stores.chaff} chaff`);
      B.kv('Feedstock / credits', (S) => `${Math.round(S.stores.feedstock)} kg · ${S.credits} cr`);
      B.note('Carry these by hand: Hull Patches seal breaches, Medkits revive downed crew, Cartridges regenerate the CO₂ scrubbers.');
    },
  },
  drones: {
    title: 'REPAIR DRONE BAY',
    build(B) {
      B.kv('Drones available', (S) => `${S.drones.total - S.drones.jobs.length} / ${S.drones.total}`);
      B.html((S) => '<table class="tbl"><tr><th>External system</th><th>Integrity</th><th></th></tr>' + COMP_IDS.filter((id) => COMPS[id].ext).map((id) => {
        const job = S.drones.jobs.find((j) => j.target === id);
        return `<tr><td>${COMPS[id].name}</td><td>${bar(S.comps[id].hp / 100, cls(S.comps[id].hp, 60, 25), Math.round(S.comps[id].hp) + '%')}</td><td>${job ? `working ${Math.ceil(job.t)} s` : (() => { const n = repairNeeds(S, id); return n ? btn(`Dispatch (${Object.entries(n.parts).map(([k, c]) => c + '× ' + PARTS[k].short).join(' ')})`, 'drones.send', { target: id }, 'mini') : S.comps[id].hp < 100 ? '<i class="dim">light wear only</i>' : '—'; })()}</td></tr>`;
      }).join('') + `<tr><td>Hull plating</td><td>${bar(S.hull / 100, cls(S.hull, 50, 25), Math.round(S.hull) + '%')}</td><td>${S.drones.jobs.find((j) => j.target === 'hull') ? 'working' : btn('Dispatch (1 hull patch)', 'drones.send', { target: 'hull' }, 'mini')}</td></tr></table>`);
      B.note('Drones fix external faults remotely in about 35 s, using the same spare parts as a hand repair. Crew can also repair them on an EVA: suit up, cycle out through the airlock on this deck and keep the drive off. A Hull Patch can be welded onto the hull plating directly.');
    },
  },
  magazine: {
    title: 'MUNITIONS MAGAZINE',
    build(B) {
      B.kv('Torpedoes in stock', (S) => S.stores.missiles);
      B.html((S) => S.weap.tubes.map((t, i) => `<div class="kv"><label>Tube ${i + 1}</label><b>${t.loaded ? '<span class="good">LOADED</span>' : t.load > 0 ? bar(t.load, '', 'loading ' + pct(t.load)) : btn('Load torpedo', 'mag.load', { i })}</b></div>`).join(''));
      B.kv('Railgun slugs / PDC ammo / chaff', (S) => `${S.stores.slugs} / ${S.stores.pdcAmmo} / ${S.stores.chaff}`);
      B.note('Loading takes about 8 seconds per tube. Fire torpedoes from Fire Control on the bridge.');
    },
  },
  drive: {
    title: 'FUSION TORCH DRIVE',
    build(B) {
      flightBlock(B);
      B.kv('Nozzle power', (S) => ({ text: pct(Math.min(1, S.comps.drivecore.pw)), cls: S.comps.drivecore.pw < 1 ? 'warn' : 'good' }));
      B.kv('Exhaust velocity', (S) => `${(SHIP.ve * (1 - 0.3 * S.mass.contam) / 1000).toFixed(0)} km/s`);
      B.kv('Pellet injector', (S) => ({ text: pct(eff(S, 'injector')), cls: cls(eff(S, 'injector'), 0.5, 0.2) }));
      B.buttons([
        { label: 'Ignite', act: 'helm.ignite', enabled: (S) => !S.drive.ignited && S.nav.state === 'transit' },
        { label: 'Cut drive', cls: 'red', act: 'helm.cutoff', enabled: (S) => S.drive.ignited },
        { label: 'Manual valve override', cls: 'red', act: 'drive.override', enabled: (S) => S.drive.locked > 0 },
      ]);
      B.slider('Thrust (local)', { min: 0, max: 2, step: 0.01, maxFn: (S) => maxG(S).toFixed(2), get: (S) => S.drive.cmdG, fmt: (v) => v.toFixed(2) + ' g', act: 'helm.g', args: (v) => ({ g: v }) });
      B.note('Local drive control works even when the bridge is out. Flips can only be commanded from the helm or here.');
      B.buttons([{ label: 'Flip 180°', act: 'helm.flip', enabled: (S) => S.drive.flip <= 0 && S.nav.state === 'transit' }]);
    },
  },
  tanks: {
    title: 'REACTION MASS & FUEL',
    build(B) {
      B.bar('Reaction mass', (S) => ({ v: S.mass.rmass / SHIP.rmassMax, text: `${S.mass.rmass.toFixed(0)} / ${SHIP.rmassMax} t`, cls: cls(S.mass.rmass, 500, 200) }));
      B.kv('Δv remaining', (S) => `${(deltaV(S) / 1000).toFixed(0)} km/s`);
      B.bar('Contamination', (S) => ({ v: S.mass.contam, text: pct(S.mass.contam), cls: cls(S.mass.contam, 0.15, 0.4, true) }));
      B.buttons([{ label: 'Purge contaminated mass (−88 t)', cls: 'red', act: 'tanks.purge', enabled: (S) => S.mass.contam > 0.01 }]);
      B.kv('D–³He pellets', (S) => `${S.mass.pellets.toFixed(0)} kg`);
      B.note('Reaction mass also shields the Drive deck from radiation, so the fuller the tanks, the safer.');
    },
  },

  // non-component panels
  locker: {
    title: 'EMERGENCY LOCKER',
    build(B, ctx) {
      B.buttons([
        { label: 'Suit', labelFn: () => (ctx.me().suit ? 'Take off vacuum suit' : 'Put on vacuum suit'), act: 'locker.suit' },
        { label: 'Refill suit O₂ & extinguisher', act: 'locker.refill' },
      ]);
      B.html((S) => `<div class="grid2">${btn('Take extinguisher', 'locker.take', { type: 'ext' })}${btn(`Take hull patch (${S.stores.patch})`, 'locker.take', { type: 'patch' })}${btn(`Take medkit (${S.stores.medkit})`, 'locker.take', { type: 'medkit' })}${btn('Take maintenance tablet', 'locker.take', { type: 'tablet' })}${btn('Return held item', 'stores.return')}</div>`);
      B.note('Suits give 5 minutes of oxygen and protect against vacuum, smoke and heat, but slow you down. Patches and medkits come from the ship-wide stores through the pneumatic tube network.');
    },
  },
  extcomp: {
    title: 'EXTERNAL SYSTEM',
    build(B, ctx, id) {
      const info = { radA: 'Radiator wing: dumps waste heat to space (50 MW extended, 8 MW retracted).', radB: 'Radiator wing: dumps waste heat to space (50 MW extended, 8 MW retracted).', railgun: 'Spinal railgun capacitor bank and breech. The rails run under the modules to a muzzle beside the bow port. Fired from Fire Control.', launcher: 'Kestrel 8-cell missile launcher. Reloads itself from the missile stock.', pdc1: 'Gatling PDC: six 30 mm barrels, about 4,000 rounds a minute.', pdc2: 'Gatling PDC: six 30 mm barrels, about 4,000 rounds a minute.', pdc3: 'Gatling PDC: six 30 mm barrels, about 4,000 rounds a minute.', antenna: 'High-gain antenna for long-range comms and hailing.', sensorArray: 'Radar, lidar and IR array. Feeds target lock quality.' }[id] || 'Point-defence cannon: shreds incoming torpedoes and drones.';
      B.note(`<b>${COMPS[id].name}</b>: ${info}`);
      B.bar('Integrity', (S) => ({ v: S.comps[id].hp / 100, text: Math.round(S.comps[id].hp) + '%', cls: cls(S.comps[id].hp, 60, 25) }));
      B.kv('Drone job', (S) => (S.drones.jobs.some((j) => j.target === id) ? 'a drone is working on it' : '—'));
      B.note((S) => { const n = repairNeeds(S, id); return n ? `Fault: <b>${n.issues.map((i) => i.label).join(' + ')}</b>. Press R next to it for the repair procedure (uses ${Object.entries(n.parts).map(([k, c]) => c + '× ' + PARTS[k].name).join(', ')}), or send a drone from the Drone Bay.` : 'No fault. Hold R next to it to tend light wear.'; });
    },
  },
  airlock: {
    title: 'AIRLOCK',
    build(B, ctx) {
      B.kv('Your suit', () => { const p = ctx.me(); return p.suit ? { text: `ON · ${Math.ceil(p.suitO2)} s O₂`, cls: p.suitO2 > 120 ? 'good' : 'warn' } : { text: 'NOT WORN', cls: 'bad' }; });
      B.kv('Drive thrust', (S) => ({ text: `${S.drive.g.toFixed(2)} g`, cls: S.drive.g > EXT.maxG ? 'bad' : 'good' }));
      B.buttons([
        { label: 'Refill suit O₂', act: 'locker.refill' },
        { label: 'Cycle out to EVA', cls: 'green', onClick: () => ctx.local('local.eva', { out: true }), enabled: () => ctx.me().suit },
      ]);
      B.note(`Outside is hard vacuum. You fly a SAFER-style jet pack (WASD, Space/C up/down, Shift for more push) clipped to a ${EXT.tether} m safety tether. With nothing pressed near the hull you hold on to the handrails. Radiators, gatling PDCs, the missile launcher, the railgun, antenna and sensor array can all be repaired by hand: hold R (spare kit needed if destroyed). Hold F with a Hull Patch to weld hull plating. Any thrust above ${EXT.maxG} g sweeps you off the hull and the tether reels you in, and it hurts. No radiation shielding out there. Vacuum suits are in the emergency lockers.`);
    },
  },
  hatch: {
    title: 'AIRLOCK HATCH',
    build(B, ctx) {
      B.kv('Suit oxygen', () => { const p = ctx.me(); return { text: `${Math.ceil(p.suitO2)} s`, cls: p.suitO2 > 90 ? 'good' : 'bad' }; });
      B.buttons([
        { label: 'Refill suit O₂ (umbilical)', act: 'locker.refill' },
        { label: 'Cycle in to Cargo deck', cls: 'green', onClick: () => ctx.local('local.eva', { out: false }) },
      ]);
    },
  },
  centrifuge: {
    title: 'CENTRIFUGE',
    build(B) {
      B.canvas(560, 170, drawRing);
      B.kv('Spin gravity', (S) => ({ text: `${S.ring.g.toFixed(3)} g at the floor · ${ringRpm(S.ring.g).toFixed(2)} rpm${Math.abs(S.ring.target - S.ring.g) > 0.002 && !S.ring.brake ? (S.ring.target > S.ring.g ? ' · SPINNING UP' : ' · SPINNING DOWN') : ''}${S.ring.brake ? ' · BRAKING' : ''}`, cls: S.ring.g > 0.05 ? 'good' : '' }));
      B.slider('Target spin', { min: 0, max: RING.maxG, step: 0.01, get: (S) => S.ring.target, fmt: (v) => `${v.toFixed(2)} g (${ringRpm(v).toFixed(1)} rpm)`, act: 'ring.target', args: (v) => ({ g: v }) });
      B.buttons([
        { label: 'Lunar (0.17 g)', act: 'ring.target', args: () => ({ g: 0.17 }) },
        { label: 'Mars (0.38 g)', act: 'ring.target', args: () => ({ g: 0.38 }) },
        { label: 'Max (0.5 g)', act: 'ring.target', args: () => ({ g: 0.5 }) },
        { label: 'Emergency brake', cls: 'red', act: 'ring.brake', args: () => ({ on: true }) },
      ]);
      B.bar('Bearing wear', (S) => ({ v: S.ring.wear, text: pct(S.ring.wear), cls: S.ring.wear > 0.8 ? 'bad' : S.ring.wear > 0.5 ? 'warn' : 'good' }));
      B.kv('Motor draw', (S) => `${demandOf(S, 'centrifuge').toFixed(1)} MW`);
      B.note((S) => `Spinning the ring up or down pushes the opposite twist into the hull: SAS soaks it up with RCS. Under thrust the ring floor feels tilted toward the drive (now ${(Math.atan2(S.drive.g, Math.max(0.001, S.ring.g)) * 57.3).toFixed(0)}°). Experiments run in the twelve science bays along the ring: walk up to a rack and press E.`);
    },
  },
  npc: {
    title: 'STATION',
    build(B, ctx, id) {
      B.html((S) => {
        const wid = WAYPOINTS[S.nav.leg].id, n = stationNpcs(wid).find((x) => x.id === id);
        if (!n) return '';
        let h = `<h4>${esc(n.name)} — ${esc(n.title)}</h4><div class="note">“${esc(n.line)}”</div><div class="kv"><label>Credits</label><b>${S.credits}</b></div>`;
        if (n.shop) h += '<div class="grid2">' + n.shop.map((k) => { const v = STATION_PRICES[k]; return `<button class="btn" data-act="station.buy" data-args='{"item":"${k}"}' ${S.credits < v.cost ? 'disabled' : ''}>${v.name} <i>${v.cost}cr</i></button>`; }).join('') + '</div>';
        if (n.role === 'quest') {
          const offers = questOffers(S), act = (S.quests && S.quests.active) || [];
          h += '<h4>Contracts for the next leg</h4>' + (offers.length ? offers.map((q) => { const taken = act.some((a) => a.id === q.id); return `<div class="route ${taken ? 'sel' : ''}"><b>${esc(q.title)}</b> <i>· ${q.reward} credits on arrival</i><div class="note">${esc(q.text)}</div>${taken ? '<b class="good">ACCEPTED</b>' : `<button class="btn" data-act="quest.accept" data-args='{"id":"${q.id}"}'>Take the job</button>`}</div>`; }).join('') : '<div class="note">Nothing more on the board. This is the end of the line.</div>');
          if (act.length) h += `<div class="note">Active: ${act.map((q) => esc(q.title)).join(' · ')}</div>`;
        }
        if (n.role === 'ambient') h += '<div class="note">They nod and get on with their day.</div>';
        return h;
      });
    },
  },
  science: {
    title: 'SCIENCE BAY',
    build(B, ctx, bay) {
      B.html((S) => {
        const run = S.sci && S.sci.bays[bay];
        const n = +String(bay).replace('bay', '') + 1;
        let h = `<h4>Science bay ${n}</h4>`;
        if (run) {
          const ex = EXPERIMENTS[run.ex], c = sciConditions(S, ex);
          h += `<div class="kv"><label>${esc(ex.name)}</label>${bar(run.p, c.ok ? 'good' : 'warn', pct(run.p))}</div><div class="kv"><label>Conditions</label><b class="${c.ok ? 'good' : 'bad'}">${c.ok ? 'MET' : 'NOT MET — paused'} · ${esc(c.why)}</b></div>`;
          h += `<button class="btn red" data-act="sci.stop" data-args='{"bay":"${bay}"}'>Abort experiment</button>`;
          return h;
        }
        h += `<div class="note">Each payload uses ${SCI_COST.feedstock} kg of fabricator feedstock. Conditions must hold while it runs; it pauses when they don't. The first run of each pays in full (and some unlock upgrades), repeats pay half.</div><table class="tbl"><tr><th>Experiment</th><th>Needs</th><th>Time</th><th>Pays</th><th></th></tr>`;
        const busy = new Set(Object.values((S.sci && S.sci.bays) || {}).filter(Boolean).map((r) => r.ex));
        for (const [k, ex] of Object.entries(EXPERIMENTS)) {
          const c = sciConditions(S, ex), done = S.sci && S.sci.done[k];
          h += `<tr><td>${esc(ex.name)}<br><i class="note">${esc(ex.text)}</i></td><td class="${c.ok ? 'good' : ''}">${esc(c.why)}</td><td>${Math.round(ex.dur / 60)} min</td><td>${done ? Math.round(ex.credits / 2) : ex.credits} cr${ex.upg && !done ? '<br><b>+ ' + esc(UPG_TEXT[ex.upg]) + '</b>' : ''}</td><td>${busy.has(k) ? 'running' : `<button class="btn mini" data-act="sci.start" data-args='${JSON.stringify({ bay, ex: k })}' ${S.stores.feedstock < SCI_COST.feedstock ? 'disabled' : ''}>Install</button>`}</td></tr>`;
        }
        return h + '</table>';
      });
      B.html((S) => { const ups = Object.keys(S.upg || {}); return ups.length ? `<div class="note">Upgrades earned: ${ups.map((u) => UPG_TEXT[u]).join(' · ')}</div>` : ''; });
    },
  },
  lift: {
    title: 'LIFT',
    build(B, ctx) {
      B.html((S) => (S.nav.state === 'docked' ? `<button class="btn wide green" data-act="local.lift" data-args='{"deck":7}'>STATION — ${esc(WAYPOINTS[S.nav.leg].name)} · up the docking tunnel</button>` : '') + DECKS.slice().reverse().map((d) => `<button class="btn wide ${ctx.me().deck === d.id ? 'sel' : ''}" data-act="local.lift" data-args='{"deck":${d.id}}'>${d.full}${S.breaches.some((b) => b.deck === d.id) ? ' <i class="bad">BREACH</i>' : ''}${COMP_IDS.some((id) => !COMPS[id].ext && COMPS[id].deck === d.id && S.comps[id].fire > 0) ? ' <i class="bad">FIRE</i>' : ''}</button>` + (d.id === 3 ? `<button class="btn wide" data-act="local.lift" data-args='{"deck":${RING_DECK}}'>CENTRIFUGE RING — via the hub and a spoke ladder · ${S.ring.g.toFixed(2)} g</button>` : '')).join(''));
      B.note((S) => (S.drive.g < 0.04 ? 'Zero-g: you can also float straight up or down the open trunk (Space / C, or the ▲ ▼ buttons).' : `Under ${S.drive.g.toFixed(2)} g the trunk is a ${(7 * 4).toFixed(0)} m drop. Ride the platform, or use the ladder.`));
    },
  },
  debug: {
    title: 'DEBUG (solo)',
    build(B) {
      B.html(() => '<div class="grid3">' + Object.keys(EVENTS).filter((k) => EVENTS[k].fire).map((k) => btn(k, 'debug.event', { id: k }, 'mini')).join('') + '</div>');
      B.html(() => '<div class="grid3">' + [['Heal all', 'debug.heal'], ['Repair all', 'debug.repair'], ['Max resources', 'debug.resources'], ['Skip to 90%', 'debug.skip'], ['Arrive now', 'debug.arrive'], ['God mode', 'debug.god'], ['Hit ship', 'debug.hit'], ['Breach here', 'debug.breach'], ['Fire: reactor', 'debug.fire'], ['Next story event', 'debug.storyNext'], ['Kill enemies', 'debug.endEnc'], ['Warp ×5000', 'debug.warp', { w: 5000 }], ['Warp normal', 'debug.warp', { w: 420 }]].map(([l, a, x]) => btn(l, a, x || {}, 'mini')).join('') + '</div>');
      B.html((S) => `<div class="note">t=${S.t.toFixed(0)}s · tension ${S.story.tension.toFixed(2)} · next event in ${Math.max(0, S.story.nextAt - S.t).toFixed(0)} s · threat pts ${Math.round((60 + (S.t / 60) * 3 + S.nav.leg * 35) * S.settings.threat)}<br>history: ${S.story.history.slice(-8).map((h) => h.id).join(', ')}</div>`);
    },
  },
};

// spinning ring diagram: rpm, the floor's "down", spokes turning
function drawRing(g, S, w, h) {
  g.fillStyle = '#0b0500'; g.fillRect(0, 0, w, h);
  const cx = 95, cy = h / 2, R = 70, a0 = S.ring.spin;
  g.strokeStyle = '#ff8a1e'; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
  g.lineWidth = 3; g.strokeStyle = '#a8581a';
  for (const d of RING.spokes) { const a = a0 + (d * Math.PI) / 180; g.beginPath(); g.moveTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14); g.lineTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6)); g.stroke(); }
  g.fillStyle = '#ffc27a'; g.beginPath(); g.arc(cx, cy, 13, 0, 7); g.fill();
  for (let i = 0; i < 6; i++) { const a = a0 + (i / 6) * Math.PI * 2; g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * (R + 8), cy + Math.sin(a) * (R + 8)); g.lineTo(cx + Math.cos(a) * (R + 8 + S.ring.g * 40), cy + Math.sin(a) * (R + 8 + S.ring.g * 40)); g.stroke(); }
  g.font = '14px monospace'; g.fillStyle = '#ffc27a';
  g.fillText(`RING  R ${RING.R} m · W ${RING.W} m`, 200, 30);
  g.fillText(`SPIN  ${S.ring.g.toFixed(3)} g   ${ringRpm(S.ring.g).toFixed(2)} rpm`, 200, 54);
  g.fillText(`TARGET ${S.ring.target.toFixed(2)} g`, 200, 78);
  g.fillText(`THRUST ${S.drive.g.toFixed(2)} g → floor tilt ${(Math.atan2(S.drive.g, Math.max(0.001, S.ring.g)) * 57.3).toFixed(0)}°`, 200, 102);
  const crew = Object.values(S.players).filter((p) => p.deck === RING_DECK && p.connected).length;
  g.fillText(`CREW IN RING ${crew}`, 200, 126);
  g.fillStyle = '#a8581a'; g.fillText('yellow: "down" is outward', 200, 150);
}
// external camera feeds: rendered by the main renderer into the console
function camBlock(B) {
  B.section('Cameras');
  B.view('cams');
  B.buttons([
    { label: '◀ Prev camera', onClick: () => B.ctx.cams && (B.ctx.cams.cam -= 1) },
    { label: 'Next camera ▶', onClick: () => B.ctx.cams && (B.ctx.cams.cam += 1) },
  ]);
}
function telescopeBlock(B) {
  B.view('telescope');
  B.buttons([
    { label: 'Zoom ×1', onClick: () => B.ctx.ext && (B.ctx.ext.zoom = 1) },
    { label: 'Zoom ×4', onClick: () => B.ctx.ext && (B.ctx.ext.zoom = 4) },
    { label: 'Wide ×0.2', onClick: () => B.ctx.ext && (B.ctx.ext.zoom = 0.2) },
    { label: 'Next target', onClick: () => { const S = B.ctx.S(); if (!S.enc) return; const live = S.enc.enemies.filter((e) => !e.dead && !e.gone); if (!live.length) return; const i = live.findIndex((e) => e.id === S.sensors.lock); B.ctx.act('sensors.lock', { id: live[(i + 1) % live.length].id }); } },
  ]);
}
// Attitude indicator: everything as seen from the nose (centre = where the nose points; edge = directly behind)
function drawAttitude(g, S, w, h) {
  const A = S.att, R = 100, cx = 120, cy = h / 2;
  g.fillStyle = '#0b0500'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#3a1a04'; g.lineWidth = 1;
  for (const r of [30, 60, 90, 180]) { g.beginPath(); g.arc(cx, cy, (r / 180) * R, 0, 7); g.stroke(); }
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  const qi = qconj(A.q);
  const proj = (d) => { const b = qrot(qi, d); const ang = Math.acos(Math.max(-1, Math.min(1, -b[2]))); const phi = Math.atan2(b[1], b[0]); const r = (ang / Math.PI) * R; return [cx + Math.cos(phi) * r, cy - Math.sin(phi) * r, ang]; };
  const mark = (d, col, shape, label) => {
    const [x, y] = proj(d); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2; g.beginPath();
    if (shape === 'pro') { g.arc(x, y, 7, 0, 7); g.moveTo(x, y - 7); g.lineTo(x, y - 12); g.moveTo(x - 7, y); g.lineTo(x - 12, y); g.moveTo(x + 7, y); g.lineTo(x + 12, y); }
    else if (shape === 'retro') { g.arc(x, y, 7, 0, 7); g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5); g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); }
    else if (shape === 'tgt') { g.moveTo(x, y - 8); g.lineTo(x + 8, y); g.lineTo(x, y + 8); g.lineTo(x - 8, y); g.closePath(); }
    else { g.rect(x - 6, y - 6, 12, 12); }
    g.stroke(); g.font = '10px monospace'; g.fillText(label, x + 10, y - 8);
  };
  mark([0, 0, -1], S.nav.state === 'approach' ? '#9dff7a' : '#ffc27a', S.nav.state === 'approach' ? 'port' : 'pro', S.nav.state === 'approach' ? 'PORT' : 'PRO');
  // orbit: target markers and the flight computer's next burn
  const L = S.orb && S.orb.loc, P = S.orb && S.orb.plan;
  if (L && L.tret) { mark(L.tret, '#40c8ff', 'retro', 'TGT−'); mark([-L.tret[0], -L.tret[1], -L.tret[2]], '#2a7a9a', 'pro', 'TGT+'); }
  if (L && L.tlos) mark(L.tlos, '#ffb040', 'tgt', 'STN');
  if (L && L.node) mark(L.node, '#40c8ff', 'tgt', 'NODE');
  const pdir = P && P.mode && ({ pro: [0, 0, -1], retro: [0, 0, 1], radout: [0, 1, 0], radin: [0, -1, 0] }[P.mode] || (L && L[P.mode]));
  if (pdir && P.tBurn < 90) {
    const [x, y] = proj(pdir), now = P.burn;
    g.strokeStyle = now ? '#9dff7a' : '#ffd23f'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 13 + (now ? Math.sin(Date.now() / 120) * 2 : 0), 0, 7); g.stroke();
    g.fillStyle = now ? '#9dff7a' : '#ffd23f'; g.font = 'bold 11px monospace'; g.fillText(now ? `BURN ${P.dv.toFixed(0)} m/s` : `BURN T−${Math.ceil(P.tBurn)}s`, x + 15, y + 14);
  }
  if (!pdir || pdir[2] !== 1) mark([0, 0, 1], '#a8581a', 'retro', 'RETRO');
  if (S.att.sunDir) { const [x, y, ang] = proj(S.att.sunDir); if (ang < Math.PI * 0.98) { g.fillStyle = '#ffe070'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.strokeStyle = '#ffe070'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.stroke(); g.font = '10px monospace'; g.fillText('SUN', x + 11, y + 4); } }
  if (S.enc) for (const e of S.enc.enemies) if (!e.dead && !e.gone) mark(e.dir, e.id === S.sensors.lock ? '#ff3b2f' : '#ffd23f', 'tgt', e.id === S.sensors.lock ? 'TGT' : '');
  const up = proj([0, 1, 0]); g.fillStyle = '#7a4a20'; g.font = '10px monospace'; g.fillText('UP', up[0] - 6, up[1] + 3);
  // nose crosshair + railgun cone
  g.strokeStyle = '#ff8a1e'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 16, cy); g.lineTo(cx - 5, cy); g.moveTo(cx + 5, cy); g.lineTo(cx + 16, cy); g.moveTo(cx, cy - 16); g.lineTo(cx, cy - 5); g.moveTo(cx, cy + 5); g.lineTo(cx, cy + 16); g.stroke();
  g.beginPath(); g.arc(cx, cy, Math.max(2, (RAIL_CONE / 180) * R * 4), 0, 7); g.stroke();
  // rates and status
  const deg = (x) => (x * 180) / Math.PI;
  const bars = [['PITCH', A.w[0]], ['YAW', A.w[1]], ['ROLL', A.w[2]]];
  g.font = '12px monospace';
  bars.forEach(([n, v], i) => {
    const y = 28 + i * 34, x0 = 250, bw = 280;
    g.fillStyle = '#a8581a'; g.fillText(`${n} ${deg(v) >= 0 ? '+' : ''}${deg(v).toFixed(2)}°/s`, x0, y);
    g.fillStyle = '#2a1204'; g.fillRect(x0, y + 5, bw, 8);
    g.fillStyle = Math.abs(v) < 0.002 ? '#9dff7a' : '#ff8a1e'; const k = Math.max(-1, Math.min(1, v / 0.16)); g.fillRect(x0 + bw / 2 + Math.min(0, k * bw / 2), y + 5, Math.abs(k * bw / 2), 8);
    g.fillStyle = '#ffc27a'; g.fillRect(x0 + bw / 2 - 1, y + 3, 2, 12);
  });
  g.fillStyle = '#ffc27a';
  const n = nose(A.q);
  g.fillText(`SAS ${A.mode.toUpperCase()}${A.err > 0.5 ? `  ERR ${A.err.toFixed(1)}°` : ''}${A.rcs ? '  · RCS FIRING' : ''}`, 250, 136);
  g.fillText(`NOSE vs PROGRADE ${angDeg(n, [0, 0, -1]).toFixed(1)}°   ROLL ${rollErr(A.q).toFixed(1)}°`, 250, 156);
  const t = S.enc && S.enc.enemies.find((e) => e.id === S.sensors.lock && !e.dead && !e.gone);
  if (t) { const a = angDeg(n, t.dir); g.fillStyle = a <= RAIL_CONE ? '#ffd23f' : '#ff3b2f'; g.fillText(a <= RAIL_CONE ? `RAIL SOLUTION ON ${t.name.split(' “')[0].toUpperCase()}` : `TARGET ${a.toFixed(1)}° OFF NOSE`, 250, 176); }
  if (S.nav.state === 'approach' && S.prox) { g.fillStyle = '#9dff7a'; g.fillText(`PORT ${Math.max(0, S.prox.p[2]).toFixed(1)} m · ${(-S.prox.v[2]).toFixed(2)} m/s`, 250, 196); }
  drawRadAlign(g, S, 518, 190);
}
// Radiator alignment: an end-on view looking forward along the spine. The wings lie in the ship's Y–Z plane, so they
// show as a vertical bar; the Sun dot should sit on that bar (edge-on), never off to the side (face-on).
function drawRadAlign(g, S, cx, cy) {
  if (!S.att.sunDir) return;
  const sd = sunBody(S).dir, face = (Math.asin(Math.min(1, Math.abs(sd[0]))) * 180) / Math.PI;
  const loss = Math.round((1 - radiatorSunFactor(S)) * 100), ext = S.heat.radExt;
  const col = !ext ? '#7a4a20' : face < 10 ? '#9dff7a' : face < 35 ? '#ffd23f' : '#ff3b2f', r = 24;
  g.strokeStyle = '#3a1a04'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
  g.fillStyle = 'rgba(157,255,122,0.10)'; g.beginPath(); // the edge-on band: ±10° either side of the wing plane
  for (const s0 of [-1, 1]) { g.moveTo(cx, cy); g.arc(cx, cy, r, -Math.PI / 2 * s0 - 0.1745, -Math.PI / 2 * s0 + 0.1745); g.lineTo(cx, cy); }
  g.fill();
  g.strokeStyle = ext ? '#ffc27a' : '#7a4a20'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy - (ext ? r - 4 : 8)); g.lineTo(cx, cy + (ext ? r - 4 : 8)); g.stroke();
  g.fillStyle = '#a8581a'; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();
  const pl = Math.hypot(sd[0], sd[1]);
  if (pl > 0.05) { const x = cx + (sd[0] / pl) * r, y = cy - (sd[1] / pl) * r; g.fillStyle = '#ffe070'; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); g.strokeStyle = '#ffe070'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(cx + (x - cx) * 0.55, cy + (y - cy) * 0.55); g.stroke(); }
  g.font = '9px monospace'; g.textAlign = 'center'; g.fillStyle = '#a8581a'; g.fillText('RADIATORS', cx, cy - r - 4);
  g.fillStyle = col; g.fillText(!ext ? 'STOWED' : face < 10 ? 'EDGE-ON' : `${face.toFixed(0)}° −${loss}%`, cx, cy + r + 10);
  g.textAlign = 'left';
}
function drawRadar(g, S, w, h) {
        g.fillStyle = '#0b0500'; g.fillRect(0, 0, w, h);
        const cx = w / 2, cy = h - 10, maxR = 4500, sc = (h - 20) / maxR;
        g.strokeStyle = '#4a2208'; g.fillStyle = '#a0581a'; g.font = '9px monospace';
        for (const r of [1000, 2000, 3000, 4000]) { g.beginPath(); g.arc(cx, cy, r * sc, Math.PI, 0); g.stroke(); g.fillText(r + ' km', cx + r * sc - 30, cy - 2); }
        const E = S.enc;
        if (!E) { g.fillStyle = '#ff8a1e'; g.fillText('No contacts. Passive IR watch.', 10, 16); return; }
        const ang = (id) => { let h2 = 0; for (const ch of id) h2 = (h2 * 31 + ch.charCodeAt(0)) % 1000; return Math.PI * (0.15 + 0.7 * (h2 / 1000)); };
        for (const e of E.enemies) {
          if (e.dead || e.gone) continue;
          const a = ang(e.id), r = Math.min(maxR, e.range) * sc;
          const x = cx - Math.cos(a) * r, y = cy - Math.sin(a) * r;
          g.fillStyle = S.sensors.lock === e.id ? '#ff3b2f' : '#ffb040';
          g.beginPath(); g.arc(x, y, e.type === 'drone' ? 3 : 5, 0, 7); g.fill();
          g.fillText(e.name.slice(0, 22), x + 7, y + 3);
          for (const p of E.proj) if (p.src === e.id && p.from === 'them') { const rr = Math.min(maxR, p.range) * sc; g.fillStyle = p.type === 'missile' ? '#ff4040' : '#ffffff'; g.fillRect(cx - Math.cos(a) * rr - 1.5, cy - Math.sin(a) * rr - 1.5, 3, 3); }
        }
        g.fillStyle = '#ffd8a0'; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();
      }
function weaponSections(B) {
      B.section('Railgun');
      B.bar('Capacitor', (S) => ({ v: S.weap.rail, text: S.weap.rail >= 1 ? 'CHARGED' : pct(S.weap.rail) + (S.weap.charging ? ' charging (20 MW)' : ''), cls: S.weap.rail >= 1 ? 'good' : 'warn' }));
      B.buttons([
        { label: 'Charge', labelFn: (S) => (S.weap.charging ? 'Stop charging' : 'Charge capacitor'), act: 'tac.charge', args: () => ({ on: !B.ctx.S().weap.charging }) },
        { label: 'FIRE RAILGUN', cls: 'red', act: 'tac.rail', labelFn: (S) => `FIRE RAILGUN (${S.stores.slugs} slugs)`, enabled: (S) => S.weap.rail >= 1 && !!S.enc },
      ]);
      B.section('Torpedoes');
      B.kv('Tubes', (S) => S.weap.tubes.map((t, i) => `T${i + 1}: ${t.loaded ? 'LOADED' : t.load > 0 ? 'loading ' + pct(t.load) : 'empty'}`).join(' · '));
      B.buttons([
        { label: 'LAUNCH TORPEDO', cls: 'red', act: 'tac.torp', enabled: (S) => S.weap.tubes.some((t) => t.loaded) && !!S.enc },
        { label: 'Deploy chaff', act: 'tac.chaff', labelFn: (S) => `Deploy chaff (${S.stores.chaff})`, enabled: (S) => !!S.enc && S.stores.chaff > 0 },
      ]);
      B.section('Missiles');
      B.kv('Cells', (S) => ({ text: `${'▮'.repeat(S.weap.cells)}${'▯'.repeat(8 - S.weap.cells)}  ${S.weap.cells}/8 ready · ${S.stores.srm} in stock${S.weap.cells < 8 && S.stores.srm > 0 ? ` · reloading ${pct(S.weap.cellT / 18)}` : ''}`, cls: S.weap.cells ? 'good' : 'warn' }));
      B.buttons([1, 2, 4].map((n) => ({ label: `SALVO ×${n}`, cls: 'red', act: 'tac.srm', args: () => ({ n }), enabled: (S) => !!S.enc && S.weap.cells >= n && eff(S, 'launcher') > 0 })));
      B.note('Kestrels are small, fast and cheap: each hits for less than a torpedo, but salvoes swamp enemy point defence. The launcher reloads one cell every 18 s from stock (fabricate more at Cargo).');
      B.section('Point defence');
      B.seg('Mode', [{ v: 'auto', l: 'Auto' }, { v: 'manual', l: 'Manual' }, { v: 'off', l: 'Off' }], (S) => S.weap.pdcMode, 'tac.pdc', (v) => ({ mode: v }), (S, v) => v !== 'auto' || S.settings.autoPDC);
      B.kv('Turrets / ammo', (S) => `${PDCS.map((id) => pct(eff(S, id))).join(' · ')} · ${S.stores.pdcAmmo} rds`);
      B.html((S) => {
        const E = S.enc;
        if (!E) return '';
        const inc = E.proj.filter((p) => p.from === 'them');
        if (!inc.length) return '<div class="note">No incoming fire.</div>';
        return '<table class="tbl"><tr><th>Incoming</th><th>Range</th><th>ETA</th><th></th></tr>' + inc.map((p) => `<tr><td class="${p.type === 'missile' ? 'bad' : 'warn'}">${p.type === 'missile' ? 'TORPEDO' + (p.chaffed ? ' (spoofed)' : '') : 'RAIL SLUG'}</td><td>${p.range.toFixed(0)} km</td><td>${Math.ceil(p.range / Math.max(1, p.speed))} s</td><td>${p.type === 'missile' && S.weap.pdcMode === 'manual' ? (S.weap.focus.includes(p.id) ? '<b class="good">ENGAGING</b>' : btn('ENGAGE', 'tac.focus', { id: p.id }, 'red')) : ''}</td></tr>`).join('') + '</table>';
      });
      B.note('Three 6-barrel gatlings: each burst is a wall of tracers. PDCs cannot stop railgun slugs, only torpedoes and drones. Slugs are dodged by evasive jinking at the helm. In manual mode, ENGAGE each torpedo for a much better kill chance.');
}
function contactList(S) {
  const E = S.enc;
  if (!E) return '<div class="note">No contacts.</div>';
  return '<table class="tbl"><tr><th>Contact</th><th>Range</th><th>Closing</th><th>Integrity</th><th></th></tr>' + E.enemies.filter((e) => !e.dead && !e.gone).map((e) => {
    const known = S.sensors.lock === e.id && S.sensors.q > 0.5;
    return `<tr class="${S.sensors.lock === e.id ? 'sel' : ''}"><td>${esc(e.name)}${e.fleeing ? ' <i>(fleeing)</i>' : ''}</td><td>${e.range.toFixed(0)} km</td><td>${(-e.vr).toFixed(1)} km/s</td><td>${known ? pct(e.hp / e.maxHp) : '?'}</td><td>${S.sensors.lock === e.id ? '<b class="good">LOCKED</b>' : btn('LOCK', 'sensors.lock', { id: e.id }, 'mini')}</td></tr>`;
  }).join('') + '</table>';
}

export function statusBlock(B) {
  B.html((S) => (S.cascade && S.cascade.length ? `<div class="kv"><label class="bad">CASCADING FAULTS</label><b class="warn">${S.cascade.slice(0, 5).map(esc).join('<br>')}</b></div>` : ''));
  B.kv('Hull integrity', (S) => ({ text: `${Math.round(S.hull)}% · ${S.breaches.length} breach(es)`, cls: cls(S.hull, 50, 25) }));
  B.kv('Backup crew / credits', (S) => `${S.pods} pods · ${S.credits} cr`);
  B.kv('Spare parts', (S) => PART_IDS.map((k) => `${PARTS[k].short} ${S.stores[k]}`).join(' · '));
  B.kv('Stores', (S) => `${S.stores.patch} patches · ${S.stores.medkit} medkits · ${S.stores.cartridge} cartridges · ${Math.round(S.stores.feedstock)} kg feedstock`);
  B.html((S) => {
    let h = '<table class="tbl status"><tr><th>System</th><th>Integrity</th><th>State</th></tr>';
    for (const d of [4, 3, 2, 1, 0, -1]) {
      h += `<tr class="grp"><td colspan="3">${d >= 0 ? DECKS[d].full : 'EXTERIOR (EVA or drones)'}</td></tr>`;
      for (const id of COMP_IDS) {
        const c = COMPS[id];
        if ((d === -1 && !c.ext) || (d >= 0 && (c.ext || c.deck !== d))) continue;
        const s = S.comps[id];
        const st = [s.fire > 0 ? '<b class="bad">FIRE</b>' : '', s.fault ? '<b class="bad">FAULT</b>' : '', !s.on ? '<b class="warn">OFF</b>' : s.pw <= 0 && s.hp > 0 ? '<b class="warn">NO PWR</b>' : '', s.hp <= 0 ? '<b class="bad">DEAD</b>' : ''].filter(Boolean).join(' ') || '<span class="good">ok</span>';
        h += `<tr><td>${c.name}</td><td>${bar(s.hp / 100, cls(s.hp, 60, 25), Math.round(s.hp) + '%')}</td><td>${st}</td></tr>`;
      }
    }
    return h + '</table>';
  });
}

// ---------- compact live readouts drawn on the in-world screens ----------
const pc = (v) => Math.round(v * 100) + '%';
const C = (v, w, b, hi) => cls(v, w, b, hi);
export function screenInfo(S, id) {
  if (id === 'centrifuge') return { title: 'CENTRIFUGE', lines: [['SPIN', S.ring.g.toFixed(2) + ' g'], ['RPM', ringRpm(S.ring.g).toFixed(2)], ['TARGET', S.ring.target.toFixed(2) + ' g'], ['BEARINGS', Math.round((1 - S.ring.wear) * 100) + '%', S.ring.wear > 0.7 ? 'warn' : '']] };
  if (id === 'launcher') return { title: 'KESTREL VLS', lines: [['CELLS', S.weap.cells + '/8'], ['STOCK', String(S.stores.srm)]], bars: [['INTEGRITY', S.comps.launcher.hp / 100, '']] };
  if (id === 'helm#0') { const A = S.att, d = (x) => ((x * 180) / Math.PI).toFixed(2); return { title: 'ATTITUDE', lines: [['SAS', A.mode.toUpperCase()], ['NOSE/PRO', angDeg(nose(A.q), [0, 0, -1]).toFixed(1) + '°'], ['P/Y/R °/s', `${d(A.w[0])} ${d(A.w[1])} ${d(A.w[2])}`], ['RCS', A.rcs ? 'FIRING' : 'IDLE', A.rcs ? 'warn' : '']] }; }
  if (id === 'helm#1') {
    if (S.nav.state === 'approach' && S.prox) { const P = S.prox; return { title: 'DOCKING', lines: [['RANGE', Math.max(0, P.p[2]).toFixed(1) + ' m'], ['CLOSING', (-P.v[2]).toFixed(2) + ' m/s', -P.v[2] > 0.25 && P.p[2] < 10 ? 'bad' : ''], ['OFF-AXIS', Math.hypot(P.p[0], P.p[1]).toFixed(2) + ' m'], ['ROLL', rollErr(S.att.q).toFixed(1) + '°']] }; }
    const t = S.enc && S.enc.enemies.find((e) => e.id === S.sensors.lock && !e.dead && !e.gone);
    if (t) { const a = angDeg(nose(S.att.q), t.dir); return { title: 'TARGETING', lines: [['TARGET', t.name.split(' “')[0].toUpperCase().slice(0, 16)], ['RANGE', t.range.toFixed(0) + ' km'], ['OFF NOSE', a.toFixed(1) + '°', a <= RAIL_CONE ? '' : 'warn'], ['RAIL', a <= RAIL_CONE ? 'SOLUTION' : 'NO SOLUTION', a <= RAIL_CONE ? '' : 'bad']] }; }
    return { title: 'NAV', lines: [['STATE', stateName[S.nav.state]], ['VELOCITY', kmps(S.nav.v)], ['THRUST', `${S.drive.g.toFixed(2)} g`]] };
  }
  const c = S.comps[id], N = S.nav, R = S.reactor, D = S.drive;
  const name = COMPS[id].name.toUpperCase();
  const integ = ['INTEGRITY', c.hp / 100, C(c.hp, 60, 25)];
  const rem = N.L - N.x;
  switch (id) {
    case 'helm': return { title: 'HELM', lines: [['STATUS', stateName[N.state]], ['RANGE', N.state === 'transit' ? fmtDist(rem) : '—'], ['VELOCITY', kmps(N.v)], ['DRIVE', D.flip > 0 ? 'FLIP' : D.ignited ? `${D.g.toFixed(2)} g ${D.orient > 0 ? 'PRO' : 'RETRO'}` : 'COLD', D.locked > 0 ? 'bad' : ''], ['AUTOPILOT', S.settings.autopilot ? (N.autopilot ? 'ENGAGED' : 'OFF') : 'N/A']], bars: [['REACTION MASS', S.mass.rmass / SHIP.rmassMax, C(S.mass.rmass, 500, 200)]] };
    case 'navcomp': return { title: 'NAVIGATION', lines: [['LEG', `${N.leg + 1}/${WAYPOINTS.length - 1}`], ['TARGET', destName(S).split(',')[0].toUpperCase()], ['RANGE', N.state === 'transit' ? fmtDist(rem) : '—'], ['PLAN', `${N.plan.cruise} km/s @ ${N.plan.g.toFixed(2)} g`]], bars: [['PROGRESS', N.state === 'transit' ? clamp(N.x / N.L, 0, 1) : 1, 'good']] };
    case 'tactical': { const t = S.enc && S.enc.enemies.find((e) => e.id === S.sensors.lock); const inc = S.enc ? S.enc.proj.filter((p) => p.from === 'them').length : 0; return { title: 'FIRE CONTROL', lines: [['TARGET', t ? t.name.split(' “')[0].toUpperCase() : 'NONE', t ? '' : 'warn'], ['TUBES', S.weap.tubes.map((x) => (x.loaded ? 'RDY' : '---')).join(' ')], ['PDC', `${S.weap.pdcMode.toUpperCase()} · ${S.stores.pdcAmmo}`], ['INCOMING', String(inc), inc ? 'bad' : '']], bars: [['RAIL CAP', S.weap.rail, S.weap.rail >= 1 ? 'good' : 'warn']] }; }
    case 'sensors': { const live = S.enc ? S.enc.enemies.filter((e) => !e.dead && !e.gone) : []; const near = live.length ? Math.min(...live.map((e) => e.range)) : 0; return { title: 'SENSORS', lines: [['CONTACTS', String(live.length), live.length ? 'bad' : ''], ['NEAREST', live.length ? near.toFixed(0) + ' km' : '—'], ['ARRAY', pc(eff(S, 'sensorArray'))], ['PING', S.sensors.pingCd > 0 ? Math.ceil(S.sensors.pingCd) + ' s' : 'READY']], bars: [['LOCK', S.sensors.q, S.sensors.q > 0.4 ? 'good' : 'warn']], radar: live.map((e) => e.range) }; }
    case 'comms': { const m = S.msgs[S.msgs.length - 1]; return { title: 'COMMS', lines: [['FROM', m ? m.from.toUpperCase().slice(0, 22) : '—'], ['', m ? m.text.slice(0, 30) : 'NO TRAFFIC'], ['', m ? m.text.slice(30, 60) : ''], ['CREDITS', String(S.credits)], ['PORT', N.state === 'docked' ? 'DOCKED' : N.state === 'orbit' ? 'REQ DOCK' : '—']] }; }
    case 'status': { const fires = COMP_IDS.filter((x) => S.comps[x].fire > 0).length; const dead = COMP_IDS.filter((x) => S.comps[x].hp <= 0).length; return { title: 'SHIP STATUS', lines: [['ALERT', S.alert.toUpperCase(), S.alert === 'red' ? 'bad' : S.alert === 'yellow' ? 'warn' : ''], ['FIRES', String(fires), fires ? 'bad' : ''], ['BREACHES', String(S.breaches.length), S.breaches.length ? 'bad' : ''], ['SYSTEMS DOWN', String(dead), dead ? 'bad' : ''], ['BACKUP CREW', String(S.pods)]], bars: [['HULL', S.hull / 100, C(S.hull, 50, 25)], ['HEAT', heatFrac(S), C(heatFrac(S), 0.7, 0.9, true)]] }; }
    case 'lifesupport': return { title: 'ATMOSPHERE', lines: [['O2 RESERVE', Math.round(S.life.o2) + ' kg', C(S.life.o2, 300, 120)], ['N2 RESERVE', Math.round(S.life.n2) + ' kg', C(S.life.n2, 600, 200)], ['WATER', Math.round(S.life.water) + ' L'], ...S.decks.filter((d) => !d.ext).reverse().map((d) => { const P = d.o2 + d.n2 + d.co2; return [DECKS[d.id].name.toUpperCase(), `${P.toFixed(0)} kPa O2 ${d.o2.toFixed(0)}`, P < 60 ? 'bad' : d.o2 < 16 ? 'warn' : '']; })] };
    case 'scrubbers': return { title: 'CO2 SCRUBBERS', lines: [['EFFICIENCY', pc(S.scrubE || 0), C(S.scrubE || 0, 0.5, 0.2)], ['BAKE-OUT', S.life.regen > 0 ? Math.ceil(S.life.regen) + ' s' : 'IDLE'], ['MAX CO2', Math.max(...S.decks.filter((d) => !d.ext).map((d) => d.co2)).toFixed(2) + ' kPa']], bars: [['SATURATION', S.life.sat, C(S.life.sat, 0.6, 0.85, true)]] };
    case 'recycler': return { title: 'WATER RECYCLER', lines: [['RESERVE', Math.round(S.life.water) + ' L'], ['RECOVERY', pc(eff(S, 'recycler'))]], bars: [integ] };
    case 'hydro': return { title: 'HYDROPONICS', lines: [['FOOD', Math.round(S.life.food) + ' kg'], ['YIELD', (2.5 * eff(S, 'hydro')).toFixed(1) + ' kg/day']], bars: [integ] };
    case 'medbay': return { title: 'MEDBAY', lines: Object.values(S.players).filter((p) => p.connected).slice(0, 5).map((p) => [p.name.toUpperCase().slice(0, 12), p.state === 'alive' ? `${Math.round(p.hp)} HP ${p.dose.toFixed(1)} SV` : p.state.toUpperCase(), p.state !== 'alive' || p.hp < 40 ? 'bad' : '']) };
    case 'cryo': return { title: 'CRYO BAY', lines: [['PODS', String(S.pods), S.pods ? '' : 'bad'], ['POWER', eff(S, 'cryo') > 0 ? 'NOMINAL' : 'FAILING', eff(S, 'cryo') > 0 ? '' : 'bad']], bars: [integ] };
    case 'reactor': return { title: 'FUSION REACTOR', lines: [['STATE', R.state.toUpperCase(), R.state === 'running' ? '' : 'bad'], ['OUTPUT', S.power.gen.toFixed(1) + ' MWe'], ['FIELD ERR', R.state === 'running' ? (R.field - R.drift >= 0 ? '+' : '') + (R.field - R.drift).toFixed(2) : '—', Math.abs(R.field - R.drift) > 0.15 ? 'warn' : ''], ['PELLETS', S.mass.pellets.toFixed(0) + ' kg']], bars: [['OUTPUT', R.actual, 'good'], ['STABILITY', R.stab, C(R.stab, 0.5, 0.25)]] };
    case 'powerdist': case 'battery': { const cap = S.power.cap || SHIP.batteryMWh; return { title: 'POWER', lines: [['GENERATION', S.power.gen.toFixed(1) + ' MW'], ['DEMAND', S.power.demand.toFixed(1) + ' MW'], ['SHED', S.power.deficit.toFixed(1) + ' MW', S.power.deficit > 0.5 ? 'bad' : ''], ['BREAKERS OFF', String(COMP_IDS.filter((x) => !S.comps[x].on).length)]], bars: [['BATTERY', S.battery.charge / cap, C(S.battery.charge / cap, 0.3, 0.1)]] }; }
    case 'thermal': case 'coolpump': return { title: 'THERMAL', lines: [['HEAT IN', S.heat.inMW.toFixed(0) + ' MW'], ['RADIATED', S.heat.outMW.toFixed(0) + ' MW'], ['RADIATORS', S.heat.radExt ? 'EXTENDED' : 'RETRACTED'], ['PUMPS', pc(eff(S, 'coolpump'))]], bars: [['HEAT SINK', heatFrac(S), C(heatFrac(S), 0.7, 0.9, true)]] };
    case 'fabricator': { const j = S.fab.queue[0]; return { title: 'FABRICATOR', lines: [['FEEDSTOCK', Math.round(S.stores.feedstock) + ' kg'], ['QUEUE', String(S.fab.queue.length)], ['JOB', j ? j.name.toUpperCase().slice(0, 18) : 'IDLE']], bars: [['PROGRESS', j ? j.p : 0, 'good']] }; }
    case 'stores': return { title: 'STORES', lines: [...PART_IDS.slice(0, 4).map((k) => [PARTS[k].short, String(S.stores[k]), S.stores[k] ? '' : 'bad']), ['HULL PATCHES', String(S.stores.patch)], ['MEDKITS', String(S.stores.medkit)], ['CARTRIDGES', String(S.stores.cartridge)], ['FEEDSTOCK', Math.round(S.stores.feedstock) + ' kg']] };
    case 'magazine': return { title: 'MAGAZINE', lines: [['TORPEDOES', String(S.stores.missiles)], ...S.weap.tubes.map((t, i) => [`TUBE ${i + 1}`, t.loaded ? 'LOADED' : t.load > 0 ? 'LOADING ' + pc(t.load) : 'EMPTY', t.loaded ? '' : 'warn']), ['SLUGS', String(S.stores.slugs)]] };
    case 'dronebay': return { title: 'DRONE BAY', lines: [['AVAILABLE', `${S.drones.total - S.drones.jobs.length}/${S.drones.total}`], ...S.drones.jobs.slice(0, 3).map((j) => [j.target === 'hull' ? 'HULL' : COMPS[j.target].name.toUpperCase().slice(0, 16), Math.ceil(j.t) + ' s'])] };
    case 'drivecore': case 'drivectl': return { title: 'TORCH DRIVE', lines: [['STATE', D.ignited ? 'IGNITED' : 'COLD', D.ignited ? '' : 'warn'], ['THRUST', `${(D.acc / G0).toFixed(2)} g`], ['THROTTLE', pc(D.throttle)], ['VALVE', D.locked > 0 ? 'STUCK' : 'OK', D.locked > 0 ? 'bad' : '']], bars: [['NOZZLE PWR', Math.min(1, S.comps.drivecore.pw), 'good']] };
    case 'tanks': case 'injector': return { title: 'PROPELLANT', lines: [['REACTION MASS', S.mass.rmass.toFixed(0) + ' t'], ['DELTA-V', (deltaV(S) / 1000).toFixed(0) + ' km/s'], ['PELLETS', S.mass.pellets.toFixed(0) + ' kg']], bars: [['TANKS', S.mass.rmass / SHIP.rmassMax, C(S.mass.rmass, 500, 200)], ['CONTAMINATION', S.mass.contam, C(S.mass.contam, 0.15, 0.4, true)]] };
    default: return { title: name.slice(0, 22), lines: [['STATE', c.hp > 0 ? 'OPERATIONAL' : 'DESTROYED', c.hp > 0 ? '' : 'bad']], bars: [integ] };
  }
}
