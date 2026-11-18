// Console panel definitions. Each: { title, build(B, ctx, compId) }
import { COMPS, COMP_IDS, DECKS, WAYPOINTS, SHIP, G0, RECIPES, STATION_PRICES, ITEMS, AU, EXT, deckName } from './config.js';
import { fmtDist, fmtTime, fmtGameTime, clamp, pct } from './util.js';
import { eff, maxG, deltaV, heatFrac, demandOf, PDCS } from './sim.js';
import { ENEMY_TYPES } from './combat.js';
import { EVENTS } from './events.js';
import { bar, btn, cls, esc } from './ui.js';

const kmps = (v) => (v / 1000).toFixed(1) + ' km/s';
const stateName = { transit: 'IN TRANSIT', orbit: 'IN ORBIT', docking: 'DOCKING', docked: 'DOCKED' };
const destName = (S) => WAYPOINTS[Math.min(S.nav.leg + 1, WAYPOINTS.length - 1)].name;

function flightBlock(B) {
  B.kv('Status', (S) => `${stateName[S.nav.state]}${S.nav.state === 'docked' ? ' — ' + WAYPOINTS[S.nav.leg].name : ' → ' + destName(S)}`);
  B.kv('Range to target', (S) => (S.nav.state === 'transit' ? fmtDist(S.nav.L - S.nav.x) : '—'));
  B.kv('Velocity (toward target)', (S) => kmps(S.nav.v));
  B.kv('Drive', (S) => {
    const D = S.drive;
    if (D.flip > 0) return { text: `FLIPPING (${Math.ceil(D.flip)} s)`, cls: 'warn' };
    if (!D.ignited) return { text: `COLD · ${D.orient > 0 ? 'PROGRADE' : 'RETROGRADE'}`, cls: '' };
    return { text: `${D.orient > 0 ? 'PROGRADE' : 'RETROGRADE'} · ${(D.acc / G0).toFixed(2)} g · throttle ${pct(D.throttle)}${D.locked > 0 ? ' · VALVE STUCK' : ''}`, cls: D.locked > 0 ? 'bad' : 'good' };
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

export const PANELS = {
  helm: {
    title: 'HELM',
    build(B) {
      B.section('Flight');
      flightBlock(B);
      B.buttons([
        { label: 'Ignite drive', act: 'helm.ignite', enabled: (S) => !S.drive.ignited && S.nav.state === 'transit' },
        { label: 'Cut drive', act: 'helm.cutoff', cls: 'red', enabled: (S) => S.drive.ignited },
        { label: 'Flip 180°', act: 'helm.flip', enabled: (S) => S.drive.flip <= 0 && S.nav.state === 'transit' },
      ]);
      B.slider('Thrust (g)', { min: 0, max: 2, step: 0.01, maxFn: (S) => maxG(S).toFixed(2), get: (S) => S.drive.cmdG, fmt: (v) => v.toFixed(2) + ' g', act: 'helm.g', args: (v) => ({ g: v }) });
      B.buttons([{ label: 'Autopilot', labelFn: (S) => (S.settings.autopilot ? `Autopilot: ${S.nav.autopilot ? 'ENGAGED' : 'OFF'}` : 'Autopilot: N/A at this difficulty'), act: 'helm.autopilot', args: () => ({ on: !B.ctx.S().nav.autopilot }), enabled: (S) => S.settings.autopilot }]);
      B.note((S) => {
        if (S.nav.state !== 'transit') return '';
        const i = stopInfo(S);
        if (i.toward <= 0) return `<span class="warn">Moving away from (or not toward) the target. Point prograde and burn.</span>`;
        const real = i.slack / Math.max(1, Math.abs(S.nav.v)) / S.warp;
        if (i.slack < 0) return `<span class="bad">OVERSHOOTING — stopping distance ${fmtDist(i.stop)} exceeds range. Flip and decelerate hard!</span>`;
        return `Stopping distance at ${S.nav.plan.g.toFixed(2)} g: ${fmtDist(i.stop)}. ${S.drive.orient < 0 ? 'Decelerating.' : `Flip and start the decel burn in about <b>${fmtTime(real)}</b> (real time).`}`;
      });
      B.section('Combat maneuvering');
      B.toggle('Evasive jinking', (S) => S.drive.evasive, 'helm.evasive', (v) => ({ on: v }));
      B.seg('Range', [{ v: 'hold', l: 'Hold' }, { v: 'open', l: 'Open range' }, { v: 'close', l: 'Close' }], (S) => S.drive.maneuver, 'helm.maneuver', (v) => ({ m: v }));
      B.note('Jinking halves enemy railgun accuracy but costs reaction mass and adds 1.2 g. Crew away from a couch take injuries above 2.2 g.');
      B.section('Port');
      B.buttons([
        { label: 'Request docking', act: 'helm.dock', enabled: (S) => S.nav.state === 'orbit' },
        { label: 'Undock & depart', act: 'helm.depart', cls: 'green', enabled: (S) => S.nav.state === 'docked' && S.nav.leg < WAYPOINTS.length - 1 },
      ]);
    },
  },

  nav: {
    title: 'NAVIGATION',
    build(B) {
      B.canvas(400, 230, (g, S, w, h) => {
        const pts = WAYPOINTS.map((p) => p.pos);
        const xs = [...pts.map((p) => p[0]), 0], ys = [...pts.map((p) => p[1]), 0];
        const minX = Math.min(...xs) - 0.5, maxX = Math.max(...xs) + 0.5, minY = Math.min(...ys) - 0.4, maxY = Math.max(...ys) + 0.4;
        const sc = Math.min(w / (maxX - minX), h / (maxY - minY));
        const P = (p) => [(p[0] - minX) * sc + (w - (maxX - minX) * sc) / 2, h - ((p[1] - minY) * sc + (h - (maxY - minY) * sc) / 2)];
        g.fillStyle = '#05080c'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#1a2a3a'; for (const r of [1, 1.5, 2.7, 5.2]) { const c = P([0, 0]); g.beginPath(); g.arc(c[0], c[1], r * sc, 0, 7); g.stroke(); }
        const sun = P([0, 0]); g.fillStyle = '#ffd860'; g.beginPath(); g.arc(sun[0], sun[1], 5, 0, 7); g.fill();
        g.setLineDash([4, 4]); g.strokeStyle = '#3a5a7a'; g.beginPath(); pts.forEach((p, i) => { const q = P(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke(); g.setLineDash([]);
        WAYPOINTS.forEach((wp, i) => { const q = P(wp.pos); g.fillStyle = wp.color; g.beginPath(); g.arc(q[0], q[1], 4, 0, 7); g.fill(); g.fillStyle = i <= S.nav.leg ? '#7a8a9a' : '#cfe0f0'; g.font = '10px system-ui'; g.fillText(wp.name.split(',')[0], q[0] + 6, q[1] - 5); });
        const a = WAYPOINTS[S.nav.leg].pos, b = WAYPOINTS[Math.min(S.nav.leg + 1, WAYPOINTS.length - 1)].pos;
        const f = S.nav.state === 'transit' ? S.nav.x / S.nav.L : S.nav.state === 'docked' ? 0 : 1;
        const sp = P([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
        g.fillStyle = '#4ad0e6'; g.beginPath(); g.moveTo(sp[0], sp[1] - 6); g.lineTo(sp[0] + 5, sp[1] + 5); g.lineTo(sp[0] - 5, sp[1] + 5); g.fill();
        g.fillStyle = '#4ad0e6'; g.font = 'bold 10px system-ui'; g.fillText('WOLFRAM', sp[0] + 7, sp[1] + 12);
      });
      B.kv('Leg', (S) => `${S.nav.leg + 1} of ${WAYPOINTS.length - 1}: ${WAYPOINTS[S.nav.leg].name.split(',')[0]} → ${destName(S).split(',')[0]}`);
      B.kv('Progress', (S) => (S.nav.state === 'transit' ? pct(clamp(S.nav.x / S.nav.L, 0, 9)) : stateName[S.nav.state]));
      B.kv('Range / velocity', (S) => `${fmtDist(S.nav.L - S.nav.x)} · ${kmps(S.nav.v)}`);
      B.kv('ETA at current speed', (S) => { const r = S.nav.L - S.nav.x; if (S.nav.state !== 'transit' || S.nav.v * r <= 0) return '—'; const t = r / S.nav.v; return `${fmtGameTime(t)} ship time (~${fmtTime(t / S.settings.warpBase)} real)`; });
      B.kv('Time compression', (S) => (S.warp > 1 ? `×${S.warp}` : 'REAL TIME (combat or docking)'));
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
      B.canvas(400, 200, (g, S, w, h) => {
        g.fillStyle = '#03080a'; g.fillRect(0, 0, w, h);
        const cx = w / 2, cy = h - 10, maxR = 4500, sc = (h - 20) / maxR;
        g.strokeStyle = '#123a2a'; g.fillStyle = '#2a6a4a'; g.font = '9px system-ui';
        for (const r of [1000, 2000, 3000, 4000]) { g.beginPath(); g.arc(cx, cy, r * sc, Math.PI, 0); g.stroke(); g.fillText(r + ' km', cx + r * sc - 30, cy - 2); }
        const E = S.enc;
        if (!E) { g.fillStyle = '#3a8a6a'; g.fillText('No contacts. Passive IR watch.', 10, 16); return; }
        const ang = (id) => { let h2 = 0; for (const ch of id) h2 = (h2 * 31 + ch.charCodeAt(0)) % 1000; return Math.PI * (0.15 + 0.7 * (h2 / 1000)); };
        for (const e of E.enemies) {
          if (e.dead || e.gone) continue;
          const a = ang(e.id), r = Math.min(maxR, e.range) * sc;
          const x = cx - Math.cos(a) * r, y = cy - Math.sin(a) * r;
          g.fillStyle = S.sensors.lock === e.id ? '#ff6040' : '#ffb040';
          g.beginPath(); g.arc(x, y, e.type === 'drone' ? 3 : 5, 0, 7); g.fill();
          g.fillText(e.name.slice(0, 22), x + 7, y + 3);
          for (const p of E.proj) if (p.src === e.id && p.from === 'them') { const rr = Math.min(maxR, p.range) * sc; g.fillStyle = p.type === 'missile' ? '#ff4040' : '#ffffff'; g.fillRect(cx - Math.cos(a) * rr - 1.5, cy - Math.sin(a) * rr - 1.5, 3, 3); }
        }
        g.fillStyle = '#4ad0e6'; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();
      });
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
      B.kv('Target', (S) => { const e = S.enc && S.enc.enemies.find((x) => x.id === S.sensors.lock); return e ? { text: `${e.name} · ${e.range.toFixed(0)} km · lock ${pct(S.sensors.q)}`, cls: S.sensors.q > 0.4 ? 'good' : 'warn' } : { text: 'NO LOCK — select a contact below', cls: 'warn' }; });
      B.html((S) => contactList(S));
      B.section('Spinal railgun');
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
      B.section('Point defence (PDCs)');
      B.seg('Mode', [{ v: 'auto', l: 'Auto' }, { v: 'manual', l: 'Manual' }, { v: 'off', l: 'Off' }], (S) => S.weap.pdcMode, 'tac.pdc', (v) => ({ mode: v }), (S, v) => v !== 'auto' || S.settings.autoPDC);
      B.kv('Turrets / ammo', (S) => `${PDCS.map((id) => pct(eff(S, id))).join(' · ')} · ${S.stores.pdcAmmo} rds`);
      B.html((S) => {
        const E = S.enc;
        if (!E) return '';
        const inc = E.proj.filter((p) => p.from === 'them');
        if (!inc.length) return '<div class="note">No incoming fire.</div>';
        return '<table class="tbl"><tr><th>Incoming</th><th>Range</th><th>ETA</th><th></th></tr>' + inc.map((p) => `<tr><td class="${p.type === 'missile' ? 'bad' : 'warn'}">${p.type === 'missile' ? 'TORPEDO' + (p.chaffed ? ' (spoofed)' : '') : 'RAIL SLUG'}</td><td>${p.range.toFixed(0)} km</td><td>${Math.ceil(p.range / Math.max(1, p.speed))} s</td><td>${p.type === 'missile' && S.weap.pdcMode === 'manual' ? (S.weap.focus.includes(p.id) ? '<b class="good">ENGAGING</b>' : btn('ENGAGE', 'tac.focus', { id: p.id }, 'red')) : ''}</td></tr>`).join('') + '</table>';
      });
      B.note('PDCs cannot stop railgun slugs, only torpedoes and drones. Slugs are dodged by evasive jinking at the helm. In manual mode, ENGAGE each torpedo for a much better kill chance.');
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
        { label: 'Request docking', act: 'helm.dock', enabled: (S) => S.nav.state === 'orbit', show: (S) => S.nav.state === 'orbit' },
        { label: 'Undock & depart', act: 'helm.depart', cls: 'green', enabled: (S) => S.nav.state === 'docked' && S.nav.leg < WAYPOINTS.length - 1, show: (S) => S.nav.state === 'docked' },
      ]);
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
      B.html((S) => `<div class="grid2">${['spares', 'patch', 'medkit', 'cartridge'].map((t) => `<button class="btn" data-act="stores.take" data-args='{"type":"${t}"}' ${S.stores[t] > 0 ? '' : 'disabled'}>Take ${ITEMS[t].name} <i>(${S.stores[t]})</i></button>`).join('')}</div>`);
      B.buttons([{ label: 'Return held item', act: 'stores.return', enabled: () => !!B.ctx.me().item }]);
      B.kv('Munitions', (S) => `${S.stores.missiles} torpedoes · ${S.stores.slugs} slugs · ${S.stores.pdcAmmo} PDC rds · ${S.stores.chaff} chaff`);
      B.kv('Feedstock / credits', (S) => `${Math.round(S.stores.feedstock)} kg · ${S.credits} cr`);
      B.note('Carry items by hand. A Spare Parts Kit repairs about 60 points of damage and is needed for destroyed components. Hull Patches seal breaches. Medkits revive downed crew.');
    },
  },
  drones: {
    title: 'REPAIR DRONE BAY',
    build(B) {
      B.kv('Drones available', (S) => `${S.drones.total - S.drones.jobs.length} / ${S.drones.total}`);
      B.html((S) => '<table class="tbl"><tr><th>External system</th><th>Integrity</th><th></th></tr>' + COMP_IDS.filter((id) => COMPS[id].ext).map((id) => {
        const job = S.drones.jobs.find((j) => j.target === id);
        return `<tr><td>${COMPS[id].name}</td><td>${bar(S.comps[id].hp / 100, cls(S.comps[id].hp, 60, 25), Math.round(S.comps[id].hp) + '%')}</td><td>${job ? `working ${Math.ceil(job.t)} s` : btn('Dispatch (1 spare kit)', 'drones.send', { target: id }, 'mini')}</td></tr>`;
      }).join('') + `<tr><td>Hull plating</td><td>${bar(S.hull / 100, cls(S.hull, 50, 25), Math.round(S.hull) + '%')}</td><td>${S.drones.jobs.find((j) => j.target === 'hull') ? 'working' : btn('Dispatch (1 hull patch)', 'drones.send', { target: 'hull' }, 'mini')}</td></tr></table>`);
      B.note('Drones repair external systems remotely: about 35 s per job, using stock from Stores. Crew can also repair them by hand on an EVA. Suit up, cycle out through the airlock on this deck, and keep the drive below 0.6 g. Hand-repair is faster than drones, and a Hull Patch can be welded onto the hull plating directly.');
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
      B.html((S) => `<div class="grid2">${btn('Take extinguisher', 'locker.take', { type: 'ext' })}${btn(`Take hull patch (${S.stores.patch})`, 'locker.take', { type: 'patch' })}${btn(`Take medkit (${S.stores.medkit})`, 'locker.take', { type: 'medkit' })}${btn('Return held item', 'stores.return')}</div>`);
      B.note('Suits give 5 minutes of oxygen and protect against vacuum, smoke and heat, but slow you down. Patches and medkits come from the ship-wide stores through the pneumatic tube network.');
    },
  },
  extcomp: {
    title: 'EXTERNAL SYSTEM',
    build(B, ctx, id) {
      const info = { radA: 'Radiator wing: dumps waste heat to space (50 MW extended, 8 MW retracted).', radB: 'Radiator wing: dumps waste heat to space (50 MW extended, 8 MW retracted).', railgun: 'Spinal railgun barrel and capacitor housing. Fired from Fire Control.', antenna: 'High-gain antenna for long-range comms and hailing.', sensorArray: 'Radar, lidar and IR array. Feeds target lock quality.' }[id] || 'Point-defence cannon: shreds incoming torpedoes and drones.';
      B.note(`<b>${COMPS[id].name}</b>: ${info}`);
      B.bar('Integrity', (S) => ({ v: S.comps[id].hp / 100, text: Math.round(S.comps[id].hp) + '%', cls: cls(S.comps[id].hp, 60, 25) }));
      B.kv('Drone job', (S) => (S.drones.jobs.some((j) => j.target === id) ? 'a drone is working on it' : '—'));
      B.note('Hold R here to repair it by hand. Destroyed units need a Spare Parts Kit in your hands.');
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
      B.note('Outside is hard vacuum. You walk the dorsal equipment spine on mag boots, with radiators, PDC turrets, the railgun, antenna and sensor array. Hold R to repair them (spare kit needed if destroyed). Hold F with a Hull Patch to weld hull plating. If thrust goes above 0.6 g, your tether yanks you back in, and it hurts. You get no radiation shielding out there. Vacuum suits are in the emergency locker.');
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
  lift: {
    title: 'LIFT',
    build(B, ctx) {
      B.html((S) => DECKS.slice().reverse().map((d) => `<button class="btn wide ${ctx.me().deck === d.id ? 'sel' : ''}" data-act="local.lift" data-args='{"deck":${d.id}}'>${d.full}${S.breaches.some((b) => b.deck === d.id) ? ' <i class="bad">BREACH</i>' : ''}${COMP_IDS.some((id) => !COMPS[id].ext && COMPS[id].deck === d.id && S.comps[id].fire > 0) ? ' <i class="bad">FIRE</i>' : ''}</button>`).join(''));
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

function contactList(S) {
  const E = S.enc;
  if (!E) return '<div class="note">No contacts.</div>';
  return '<table class="tbl"><tr><th>Contact</th><th>Range</th><th>Closing</th><th>Integrity</th><th></th></tr>' + E.enemies.filter((e) => !e.dead && !e.gone).map((e) => {
    const known = S.sensors.lock === e.id && S.sensors.q > 0.5;
    return `<tr class="${S.sensors.lock === e.id ? 'sel' : ''}"><td>${esc(e.name)}${e.fleeing ? ' <i>(fleeing)</i>' : ''}</td><td>${e.range.toFixed(0)} km</td><td>${(-e.vr).toFixed(1)} km/s</td><td>${known ? pct(e.hp / e.maxHp) : '?'}</td><td>${S.sensors.lock === e.id ? '<b class="good">LOCKED</b>' : btn('LOCK', 'sensors.lock', { id: e.id }, 'mini')}</td></tr>`;
  }).join('') + '</table>';
}

export function statusBlock(B) {
  B.kv('Hull integrity', (S) => ({ text: `${Math.round(S.hull)}% · ${S.breaches.length} breach(es)`, cls: cls(S.hull, 50, 25) }));
  B.kv('Backup crew / credits', (S) => `${S.pods} pods · ${S.credits} cr`);
  B.kv('Stores', (S) => `${S.stores.spares} spares · ${S.stores.patch} patches · ${S.stores.medkit} medkits · ${S.stores.cartridge} cartridges · ${Math.round(S.stores.feedstock)} kg feedstock`);
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
