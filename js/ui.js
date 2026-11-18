// DOM UI: widget builder for console panels, HUD, toasts, crew votes.
import { COMPS, DECKS, WAYPOINTS, SHIP, ITEMS, EXT, EXT_DECK, RING_DECK, atmoDeck, deckName } from './config.js';
import { podState, POD_CRADLE } from './crew.js';
import { PARTS, repairNeeds, missingParts } from './repair.js';
import { fmtDist, fmtTime, fmtGameTime, clamp } from './util.js';
import { eff, heatFrac, deltaV, inShelter } from './sim.js';

export const $ = (s, r = document) => r.querySelector(s);
export function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export const cls = (v, warn, bad, higherIsBad = false) => (higherIsBad ? (v >= bad ? 'bad' : v >= warn ? 'warn' : 'good') : (v <= bad ? 'bad' : v <= warn ? 'warn' : 'good'));
export const bar = (v, c = '', text = '') => `<div class="bar ${c}"><i style="width:${clamp(v, 0, 1) * 100}%"></i><span>${text}</span></div>`;
export const btn = (label, act, args = {}, extra = '') => `<button class="btn ${extra}" data-act="${act}" data-args='${esc(JSON.stringify(args))}'>${label}</button>`;

// ---------------- panel widget builder ----------------
export class Builder {
  // Content before the first section is pinned at the top of the console; each section becomes a tab page.
  constructor(body, ctx) {
    this.body = body; this.ctx = ctx; this.ws = []; this.pages = [];
    this.pin = document.createElement('div'); this.pin.className = 'ppin'; body.appendChild(this.pin); this.cur = this.pin;
  }
  _add(el, update) { this.cur.appendChild(el); if (update) this.ws.push(update); return el; }
  section(title) {
    const page = document.createElement('div'); page.className = 'ppage'; page.dataset.title = title;
    this.body.appendChild(page); this.pages.push(page); this.cur = page;
    const e = document.createElement('h4'); e.textContent = title; return this._add(e);
  }
  note(text) { const e = document.createElement('div'); e.className = 'note'; if (typeof text === 'function') return this._add(e, (S) => { e.innerHTML = text(S); }); e.innerHTML = text; return this._add(e); }
  kv(label, fn) {
    const e = document.createElement('div'); e.className = 'kv';
    e.innerHTML = `<label>${label}</label><b></b>`;
    const b = e.querySelector('b');
    return this._add(e, (S) => { const r = fn(S); if (r && typeof r === 'object') { b.textContent = r.text; b.className = r.cls || ''; } else { b.textContent = r; b.className = ''; } });
  }
  bar(label, fn) {
    const e = document.createElement('div'); e.className = 'kv';
    e.innerHTML = `<label>${label}</label><div class="bar"><i></i><span></span></div>`;
    const bb = e.querySelector('.bar'), i = e.querySelector('i'), s = e.querySelector('span');
    return this._add(e, (S) => { const r = fn(S); i.style.width = clamp(r.v, 0, 1) * 100 + '%'; s.textContent = r.text || ''; bb.className = 'bar ' + (r.cls || ''); });
  }
  buttons(list) {
    const e = document.createElement('div'); e.className = 'row';
    const bs = list.map((b) => {
      const x = document.createElement('button'); x.className = 'btn ' + (b.cls || ''); x.textContent = b.label;
      x.onclick = () => { this.ctx.click(); if (b.onClick) b.onClick(); else this.ctx.act(b.act, typeof b.args === 'function' ? b.args() : b.args || {}); };
      e.appendChild(x); return x;
    });
    return this._add(e, (S) => list.forEach((b, i) => {
      if (b.labelFn) bs[i].textContent = b.labelFn(S);
      bs[i].disabled = b.enabled ? !b.enabled(S) : false;
      if (b.show) bs[i].style.display = b.show(S) ? '' : 'none';
    }));
  }
  slider(label, o) {
    const e = document.createElement('div'); e.className = 'kv slider';
    e.innerHTML = `<label>${label}</label><input type="range" min="${o.min}" max="${o.max}" step="${o.step}"><b></b>`;
    const inp = e.querySelector('input'), b = e.querySelector('b');
    let dragging = false, last = 0;
    const send = () => { last = performance.now(); this.ctx.act(o.act, o.args(+inp.value)); };
    inp.addEventListener('pointerdown', () => { dragging = true; });
    inp.addEventListener('touchstart', () => { dragging = true; }, { passive: true });
    const stop = () => { if (dragging) { dragging = false; send(); } };
    inp.addEventListener('pointerup', stop); inp.addEventListener('touchend', stop); inp.addEventListener('change', () => { send(); dragging = false; });
    inp.addEventListener('input', () => { b.textContent = o.fmt(+inp.value); if (performance.now() - last > 120) send(); });
    return this._add(e, (S) => {
      if (o.maxFn) inp.max = o.maxFn(S);
      inp.disabled = o.enabled ? !o.enabled(S) : false;
      if (!dragging && performance.now() - last > 600) { inp.value = o.get(S); b.textContent = o.fmt(o.get(S)); }
    });
  }
  toggle(label, get, act, argFn, enabled) {
    return this.buttons([{ label, labelFn: (S) => `${label}: ${get(S) ? 'ON' : 'OFF'}`, act, args: () => argFn(!get(this.ctx.S())), enabled }]);
  }
  seg(label, options, get, act, argFn, enabledOpt) {
    const e = document.createElement('div'); e.className = 'kv seg';
    e.innerHTML = `<label>${label}</label><div class="segs"></div>`;
    const segs = e.querySelector('.segs');
    const bs = options.map((o) => {
      const x = document.createElement('button'); x.className = 'btn'; x.textContent = o.l;
      x.onclick = () => { this.ctx.click(); this.ctx.act(act, argFn(o.v)); };
      segs.appendChild(x); return x;
    });
    return this._add(e, (S) => options.forEach((o, i) => { bs[i].classList.toggle('sel', get(S) === o.v); bs[i].disabled = enabledOpt ? !enabledOpt(S, o.v) : false; }));
  }
  html(fn) {
    const e = document.createElement('div'); e.className = 'dyn';
    let last = '';
    e.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act]');
      if (!t || t.disabled) return;
      this.ctx.click();
      const a = t.dataset.act, args = JSON.parse(t.dataset.args || '{}');
      if (a.startsWith('local.')) this.ctx.local(a, args); else this.ctx.act(a, args);
    });
    return this._add(e, (S) => { const s = fn(S); if (s !== last) { e.innerHTML = s; last = s; } });
  }
  canvas(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; c.className = 'pcanvas'; c.style.aspectRatio = `${w}/${h}`;
    const g = c.getContext('2d'); g.scale(2, 2);
    return this._add(c, (S) => { g.clearRect(0, 0, w, h); draw(g, S, w, h); });
  }
  view(mode, showFn) {
    const e = document.createElement('div'); e.className = 'viewhost';
    let attached = false;
    return this._add(e, (S) => {
      const on = showFn ? showFn(S) : true;
      e.style.display = on ? '' : 'none';
      if (on && !attached && this.ctx.attachView) { this.ctx.attachView(e, mode); attached = true; }
      if (!on) attached = false;
    });
  }
  pad(label, keys, showFn) { // hold buttons: keys = [[text, axisGroup('r'|'t'), index, value], ...]
    const e = document.createElement('div'); e.className = 'kv pad';
    e.innerHTML = `<label>${label}</label><div class="padbtns"></div>`;
    const box = e.querySelector('.padbtns');
    for (const [txt, grp, idx, val] of keys) {
      const b = document.createElement('button'); b.className = 'btn padb'; b.textContent = txt;
      const set = (on) => { b.classList.toggle('sel', on); this.ctx.pilotPress && this.ctx.pilotPress(grp, idx, on ? val : 0); };
      b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); b.setPointerCapture && b.setPointerCapture(ev.pointerId); set(true); });
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, () => set(false));
      box.appendChild(b);
    }
    return this._add(e, (S) => { if (showFn) e.style.display = showFn(S) ? '' : 'none'; });
  }
  update(S) { for (const w of this.ws) w(S); }
}

export class PanelView {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx; this.open = false; this.builder = null; this.compId = null;
    root.innerHTML = `<div class="phead"><span class="ptitle"></span><span class="pstat"></span></div><div class="pbody"></div><div class="pboot"><pre></pre><div class="pbar"><i></i></div></div><div class="pscan"></div>`;
    this.boot = root.querySelector('.pboot'); this.bootPre = this.boot.querySelector('pre'); this.bootBar = this.boot.querySelector('.pbar i');
    this.lastBoot = {};
    this.title = root.querySelector('.ptitle'); this.stat = root.querySelector('.pstat'); this.body = root.querySelector('.pbody');
    const ex = (this.exit = document.createElement('button'));
    ex.id = 'panel-exit'; ex.innerHTML = '◀ EXIT CONSOLE <kbd>ESC</kbd>';
    ex.onclick = () => { ctx.click(); ctx.closePanel(); };
    document.body.appendChild(ex);
  }
  // Screen mode: the panel is pinned onto the projected rectangle of the in-world screen.
  // Overlay mode (lockers, lift, status board via Tab): a free-standing terminal in the middle of the view.
  place(rect) {
    if (!this.open) return;
    const LW = this.root.classList.contains('two') ? 900 : 640; // two-column consoles get a wider virtual screen
    if (this.mode === 'screen') {
      if (!rect || rect.w < 40) { this.root.style.opacity = 0; this.exit.style.display = 'none'; return; }
      const scale = rect.w / LW;
      this.root.style.width = LW + 'px';
      this.root.style.height = Math.max(120, rect.h / scale) + 'px';
      this.root.style.transform = `translate(${rect.x}px, ${rect.y}px) scale(${scale})`;
      this.root.style.opacity = Math.max(0, (rect.t - 0.4) / 0.6);
      this.root.style.pointerEvents = rect.t > 0.9 ? 'auto' : 'none';
      this.exit.style.display = rect.t > 0.6 ? 'block' : 'none';
      this.exit.style.left = rect.x + rect.w / 2 + 'px';
      this.exit.style.top = Math.min(window.innerHeight - 52, rect.y + rect.h + 14) + 'px';
    } else {
      const r = this.root.getBoundingClientRect();
      this.exit.style.display = 'block';
      this.exit.style.left = r.left + r.width / 2 + 'px';
      this.exit.style.top = Math.min(window.innerHeight - 52, r.bottom + 12) + 'px';
    }
  }
  show(def, compId, mode = 'overlay') {
    this.mode = mode;
    this.root.className = 'pv-' + mode;
    this.root.style.transform = ''; this.root.style.width = ''; this.root.style.height = ''; this.root.style.opacity = mode === 'screen' ? 0 : 1; this.root.style.pointerEvents = '';
    this.compId = compId; this.def = def;
    this.title.textContent = def.title;
    this.body.innerHTML = ''; this.tabSel = null;
    this.builder = new Builder(this.body, this.ctx);
    if (compId && COMPS[compId]) {
      const b = this.builder;
      b.html((S) => {
        const c = S.comps[compId];
        if (!c) return '';
        let s = '';
        if (c.hp <= 0) s = `<div class="offline bad">DESTROYED — needs a repair procedure (press R next to it) and parts</div>`;
        else if (!c.on) s = `<div class="offline warn">Breaker OFF — reset at Power Distribution (Engineering)</div>`;
        else if (c.pw <= 0) s = `<div class="offline warn">NO POWER — load shed. Check Power Distribution.</div>`;
        if (COMPS[compId].computer && c.fault) s += `<div class="offline bad">SOFTWARE FAULT ${c.reboot > 0 ? `— rebooting ${Math.ceil(c.reboot)} s` : btn('Reboot (15 s)', 'reboot')}</div>`;
        if (c.fire > 0) s += `<div class="offline bad">ON FIRE — extinguish before repairing!</div>`;
        return s;
      });
    }
    def.build(this.builder, this.ctx, compId);
    this.makeTabs(def);
    this.root.style.display = 'flex';
    this.open = true;
    this.startBoot(def.title, compId || def.title);
  }
  // Two or more sections: a tab strip under the pinned part, one page at a time (remembered per console)
  makeTabs(def) {
    const pages = this.builder.pages;
    this.root.classList.toggle('tabbed', pages.length > 1);
    if (pages.length < 2) return;
    this.tabMem = this.tabMem || {};
    const bar = document.createElement('div'); bar.className = 'ptabs';
    const tabs = pages.map((pg, i) => {
      const b = document.createElement('button'); b.className = 'ptab'; b.textContent = pg.dataset.title; b.type = 'button';
      b.onclick = () => { this.ctx.click && this.ctx.click(); sel(i); };
      bar.appendChild(b); return b;
    });
    const sel = (i) => { this.tabMem[def.title] = i; pages.forEach((pg, k) => { pg.style.display = k === i ? '' : 'none'; tabs[k].classList.toggle('sel', k === i); }); this.body.scrollTop = 0; };
    this.body.insertBefore(bar, pages[0]);
    this.tabSel = sel; this.tabCount = pages.length;
    sel(Math.min(this.tabMem[def.title] || 0, pages.length - 1));
  }
  // [ and ] (or Q/E on a gamepad-less keyboard while not piloting) flip tabs
  cycleTab(d) { if (!this.tabSel) return; const i = ((this.tabMem[this.def.title] || 0) + d + this.tabCount) % this.tabCount; this.tabSel(i); }
  // CRT power-on + POST text, with relay clicks. Full sequence on a cold console, short one if it was used recently.
  startBoot(title, key) {
    clearTimeout(this.bootTimer); (this.bootTimers || []).forEach(clearTimeout);
    const now = performance.now();
    const warm = this.lastBoot[key] && now - this.lastBoot[key] < 30000;
    this.lastBoot[key] = now;
    const sfx = this.ctx.sfx;
    const delay = this.mode === 'screen' ? 380 : 0; // wait for the camera to arrive
    const lines = warm
      ? [`RESUME ${title}`, 'LINK ........ OK']
      : ['WOLFRAM PCS FIRMWARE 4.2.17', '(C) MTV-W1 SHIPYARD · SHACKLETON, LUNA', '', 'MEM CHECK ............ 65536K OK', 'RELAY BUS ............ 24/24 SET', 'COOLANT INTERLOCK .... CLOSED', 'DATA LINK ............ OK', '', `LOADING ${title.replace(/[^A-Z0-9]+/gi, '_').toUpperCase()}.SYS`];
    const step = warm ? 70 : 85, total = delay + 260 + lines.length * step + (warm ? 120 : 420);
    this.root.classList.add('booting'); this.root.classList.remove('booted');
    this.boot.style.display = 'flex'; this.bootPre.textContent = ''; this.bootBar.style.width = '0%';
    this.boot.classList.remove('crt'); void this.boot.offsetWidth;
    const T = (ms, fn) => this.bootTimers.push(setTimeout(fn, ms));
    this.bootTimers = [];
    T(delay, () => { this.boot.classList.add('crt'); if (sfx) { if (!warm) sfx.crtOn(0.9); sfx.relayBank(warm ? 2 : 4, 0.25, 0.9); } });
    lines.forEach((l, i) => T(delay + 260 + i * step, () => { this.bootPre.textContent += l + '\n'; if (sfx && l && Math.random() < 0.7) sfx.relay(0.55); }));
    T(delay + 260 + lines.length * step, () => { this.bootBar.style.transition = `width ${warm ? 100 : 380}ms steps(12)`; this.bootBar.style.width = '100%'; if (sfx) sfx.relayBank(warm ? 1 : 3, 0.3, 0.7); });
    T(total, () => { this.boot.style.display = 'none'; this.root.classList.remove('booting'); this.root.classList.add('booted'); if (sfx) sfx.bootBeep(1); });
  }
  hide() { (this.bootTimers || []).forEach(clearTimeout); this.root.style.display = 'none'; this.exit.style.display = 'none'; this.open = false; this.builder = null; this.compId = null; }
  update(S) {
    if (!this.open || !this.builder) return;
    if (this.compId && S.comps[this.compId]) {
      const c = S.comps[this.compId];
      const e = eff(S, this.compId);
      this.stat.innerHTML = `<span class="${cls(c.hp, 60, 25)}">INTEG ${Math.round(c.hp)}%</span> <span class="${e > 0 ? 'good' : 'bad'}">${e > 0 ? '● ONLINE' : '○ OFFLINE'}</span>`;
    } else this.stat.textContent = '';
    this.builder.update(S);
    // "desktop" layout: when the pinned part holds a live view (telescope, docking camera), it sits in a left column
    // and the tabs fill the right, so nothing needs scrolling
    if (this.mode === 'screen' && this.builder.pages.length > 1) {
      const v = [...this.builder.pin.querySelectorAll('.viewhost')].some((e) => e.style.display !== 'none');
      if (v !== this.root.classList.contains('two')) this.root.classList.toggle('two', v);
    } else if (this.root.classList.contains('two')) this.root.classList.remove('two');
  }
}

// ---------------- HUD ----------------
export class HUD {
  constructor(root) {
    this.root = root;
    this.ship = $('#hud-ship'); this.vit = $('#hud-vitals'); this.prompt = $('#hud-prompt'); this.logEl = $('#hud-log');
    this.toastEl = $('#toast'); this.voteEl = $('#vote'); this.alertEl = $('#alertbar'); this.vign = $('#vignette');
    this.toasts = [];
    this.logs = [];
  }
  addLog(text, kind) {
    const e = document.createElement('div');
    e.className = 'll ' + kind; e.textContent = text;
    this.logEl.appendChild(e);
    while (this.logEl.children.length > 8) this.logEl.removeChild(this.logEl.firstChild);
    setTimeout(() => e.classList.add('old'), 14000);
  }
  toast(text, kind = '') {
    const e = document.createElement('div'); e.className = 'toast ' + kind; e.textContent = text;
    this.toastEl.appendChild(e);
    while (this.toastEl.children.length > 3) this.toastEl.removeChild(this.toastEl.firstChild);
    setTimeout(() => e.remove(), 3500);
  }
  update(S, me, focus, ctx) {
    if (!S || !me) return;
    const N = S.nav, R = S.reactor, hf = heatFrac(S);
    const dest = WAYPOINTS[Math.min(N.leg + 1, WAYPOINTS.length - 1)];
    const rem = N.L - N.x;
    let navLine = '';
    if (N.state === 'transit') {
      const eta = Math.abs(N.v) > 10 ? rem / N.v : Infinity;
      navLine = `→ ${dest.name.split(',')[0]} · ${fmtDist(rem)} · ${(N.v / 1000).toFixed(0)} km/s${eta > 0 && eta < 1e9 ? ` · ETA ${fmtGameTime(eta)}` : ''}`;
    } else if (N.state === 'docked') navLine = `DOCKED at ${WAYPOINTS[N.leg].name.split(',')[0]}`;
    else if (N.state === 'approach' && S.prox) navLine = `APPROACH ${Math.max(0, S.prox.p[2]).toFixed(0)} m · ${(-S.prox.v[2]).toFixed(2)} m/s · off-axis ${Math.hypot(S.prox.p[0], S.prox.p[1]).toFixed(1)} m`;
    else if (N.state === 'capture' && N.cap) { const t = N.cap.tPe - N.cap.t; navLine = `CAPTURE — periapsis ${t > 0 ? 'T−' + Math.ceil(t) : 'T+' + Math.ceil(-t)} s · ${Math.round((N.cap.dvEff / N.cap.dvNeed) * 100)}% of capture Δv`; }
    else if (N.state === 'rendezvous' && N.rv) navLine = `RENDEZVOUS ${(N.rv.d / 1000).toFixed(2)} km · closing ${N.rv.vc.toFixed(1)} m/s${N.slotT > 0 ? ` · slot ${Math.ceil(N.slotT)} s` : ''}`;
    else if (N.state === 'orbit') navLine = (N.ecc || 0) > 0.08 ? `ORBIT e=${(N.ecc || 0).toFixed(2)} — circularise at periapsis` : `ORBIT — request approach at the helm`;
    else navLine = `DOCKING: latches driving…`;
    const pw = S.power;
    const battPct = S.battery.charge / (pw.cap || SHIP.batteryMWh);
    const ab = S.alert;
    this.alertEl.className = 'alert-' + ab;
    this.alertEl.textContent = ab === 'red' ? 'RED ALERT' : ab === 'yellow' ? 'CAUTION' : 'CONDITION GREEN';
    this.ship.innerHTML = `
      <div class="sl"><span>NAV</span><b>${navLine}</b></div>
      <div class="sl"><span>DRIVE</span><b class="${S.drive.ignited ? 'good' : ''}">${S.drive.flip > 0 ? `SLEWING ${Math.round(S.drive.flip)}°` : S.drive.ignited ? `${S.drive.g.toFixed(2)} g ${S.drive.orient > 0 ? 'PRO' : S.drive.orient < 0 ? 'RETRO' : 'OFF-AXIS'}` : 'COLD'} · SAS ${S.att.mode.toUpperCase()}${N.autopilot && S.settings.autopilot ? ' · AUTO' : ''} · RM ${S.mass.rmass.toFixed(0)} t</b></div>
      <div class="sl"><span>REACTOR</span><b class="${R.state === 'running' ? (R.stab < 0.4 ? 'bad' : 'good') : 'bad'}">${R.state.toUpperCase()} ${R.state === 'running' ? Math.round(pw.gen) + ' MW · stab ' + Math.round(R.stab * 100) + '%' : ''}</b></div>
      <div class="sl"><span>POWER</span>${bar(battPct, cls(battPct, 0.3, 0.1), `BATT ${Math.round(battPct * 100)}%${pw.deficit > 0.5 ? ' · SHEDDING ' + pw.deficit.toFixed(0) + ' MW' : ''}`)}</div>
      <div class="sl"><span>HEAT</span>${bar(hf, cls(hf, 0.7, 0.9, true), `${Math.round(hf * 100)}% · rad ${S.heat.radExt ? 'EXT' : 'RET'}`)}</div>
      <div class="sl"><span>HULL</span>${bar(S.hull / 100, cls(S.hull, 50, 25), `${Math.round(S.hull)}%${S.breaches.length ? ' · ' + S.breaches.length + ' BREACH' : ''}`)}</div>
      <div class="sl"><span>O₂/N₂</span><b class="${cls(S.life.o2, 400, 150)}">${Math.round(S.life.o2)} / ${Math.round(S.life.n2)} kg · pods ${S.pods}</b></div>
      ${S.enc ? `<div class="sl"><span>COMBAT</span><b class="bad">${S.enc.enemies.filter((e) => !e.dead && !e.gone).length} hostile · ${S.enc.proj.filter((p) => p.from === 'them').length} inbound</b></div>` : ''}
      ${S.effects.stormWarn > 0 ? `<div class="sl"><span>STORM</span><b class="bad">PROTONS IN ${Math.ceil(S.effects.stormWarn)} s — SHELTER!</b></div>` : S.effects.stormT > 0 ? `<div class="sl"><span>STORM</span><b class="bad">PROTON STORM ${Math.ceil(S.effects.stormT)} s</b></div>` : ''}
      ${S.effects.debris > 0 ? `<div class="sl"><span>DEBRIS</span><b class="warn">impact in ${Math.ceil(S.effects.debris)} s</b></div>` : ''}`;
    const d = S.decks[atmoDeck(me.deck)], P = d.o2 + d.n2 + d.co2;
    const shelter = inShelter(me);
    let st = me.state === 'downed' ? `<div class="big bad">DOWN — ${Math.ceil(me.downT)} s until death. A crewmate needs a medkit.</div>`
      : me.state === 'dead' ? `<div class="big bad">DEAD — ${S.pods > 0 ? `thawing a backup crew member in ${Math.ceil(me.respawnT || 0)} s` : 'no backup crew left'}</div><div class="sl"><span>GHOST</span><b>${ghostLine(me)}</b></div>`
        : me.state === 'spectator' ? `<div class="big">SPECTATING</div><div class="sl"><span>GHOST</span><b>${ghostLine(me)}</b></div>` : '';
    this.vit.innerHTML = `${st}
      <div class="sl"><span>HEALTH</span>${bar(me.hp / 100, cls(me.hp, 50, 25), `${Math.round(me.hp)} / ${Math.round(me.maxHp || 100)}`)}</div>
      ${me.suit ? `<div class="sl"><span>SUIT O₂</span>${bar(me.suitO2 / 300, cls(me.suitO2, 90, 30), Math.ceil(me.suitO2) + ' s')}</div>` : ''}
      ${me.state === 'alive' ? `<div class="sl"><span>FATIGUE</span>${bar((me.fatigue || 0) / 100, cls(me.fatigue || 0, 70, 88, true), `${Math.round(me.fatigue || 0)}%${me.sleep ? ' · ASLEEP' : (me.fatigue || 0) > 70 ? ' · find a bunk (Habitation or the ring)' : ''}`)}</div>` : ''}
      ${me.pod ? podLine(S, me) : ''}
      <div class="sl"><span>DOSE</span><b class="${cls(me.dose, 1, 3, true)}">${me.dose.toFixed(2)} Sv${shelter ? ' · SHELTERED' : ''}</b></div>
      <div class="sl"><span>HANDS</span><b>${me.item ? ITEMS[me.item.type].name + (me.item.type === 'ext' || me.item.type === 'spares' ? ` (${Math.max(0, Math.round(me.item.charge))}%)` : '') : '—'}</b></div>
      ${me.deck === EXT_DECK ? `<div class="sl"><span>EVA</span><b class="${me.suit ? 'warn' : 'bad'}">HARD VACUUM${me.suit ? '' : ' — NO SUIT!'}${d.rad > 0.01 ? ` · ☢ ${(d.rad * 3600).toFixed(0)} mSv/h` : ''}</b></div>`
        : `<div class="sl"><span>${me.deck === RING_DECK ? 'RING' : DECKS[me.deck].name.toUpperCase()}</span><b class="${P < 50 ? 'bad' : d.o2 < 16 || d.co2 > 1.2 ? 'warn' : ''}">${P.toFixed(0)} kPa · O₂ ${d.o2.toFixed(1)} · CO₂ ${d.co2.toFixed(2)} · ${d.temp.toFixed(0)}°C${d.rad > 0.01 ? ` · ☢ ${(d.rad * 3600).toFixed(0)} mSv/h` : ''}</b></div>`}
      <div class="sl"><span>G</span><b class="${S.drive.g > 2.2 || (me.deck === EXT_DECK && S.drive.g > EXT.maxG * 0.5) ? 'bad' : ''}">${me.deck === RING_DECK ? `${S.ring.g.toFixed(2)} g spin${S.drive.g > 0.01 ? ` + ${S.drive.g.toFixed(2)} g thrust (floor tilts aft)` : ''}${S.ring.g < 0.04 && S.drive.g < 0.04 ? ' · FLOATING' : ''}` : `${S.drive.g.toFixed(2)} g${S.drive.g < 0.04 ? (me.deck === EXT_DECK ? ' · ZERO-G · JET PACK (Space/C up/down)' : ' · ZERO-G · FLOATING (Space/C up/down)') : ' THRUST — floors are down'}`}${S.drive.g > 2.2 && !me.seat ? ' — GET TO A COUCH' : ''}${me.deck === EXT_DECK ? ` · tether ${Math.round((me.tether || 0) * 100)}% of ${EXT.tether} m · reels in above ${EXT.maxG} g` : ''}</b></div>`;
    document.body.classList.toggle('suited', !!me.suit && me.state === 'alive');
    // prompt
    if (ctx.ladder) this.prompt.innerHTML = `<b>On the trunk ladder</b> — ${ctx.touch ? 'stick up/down to climb · stick sideways at a deck to step off' : '<kbd>W</kbd>/<kbd>S</kbd> climb (look down to go down) · <kbd>Space</kbd>/<kbd>C</kbd> up/down · <kbd>A</kbd>/<kbd>D</kbd> at a deck to step off'}${ctx.ladderFloor ? ' · <b>landing</b>' : ''}`;
    else this.prompt.innerHTML = focus ? promptFor(S, me, focus, ctx.touch) : '';
    // vignette
    const hurt = me.state === 'alive' ? 1 - me.hp / 100 : 1;
    const gv = clamp((S.drive.g - 1.8) / 2, 0, 1);
    this.vign.style.opacity = Math.max(hurt * 0.8, gv * 0.7, P < 30 && !me.suit ? 0.7 : 0);
    this.vign.className = gv > hurt ? 'g' : '';
    this.updateVote(S, me, ctx);
  }
  updateVote(S, me, ctx) {
    const V = S.vote;
    if (!V) { this.voteEl.style.display = 'none'; this.voteId = null; return; }
    this.voteEl.style.display = 'block';
    const tally = {};
    for (const o of Object.values(V.votes)) tally[o] = (tally[o] || 0) + 1;
    const mine = V.votes[me.id];
    const html = `<div class="vt">CREW DECISION · ${Math.max(0, Math.ceil(V.ends - S.t))} s</div><h3>${esc(V.title)}</h3><p>${esc(V.text)}</p>
      <div class="vopts">${V.options.map((o) => `<button class="btn ${mine === o.id ? 'sel' : ''}" data-opt="${o.id}">${esc(o.label)}${tally[o.id] ? ` <i>(${tally[o.id]})</i>` : ''}</button>`).join('')}</div>
      <div class="vhint">${ctx.touch ? 'Tap' : 'Click (or press 1–' + V.options.length + ')'} to vote. Majority wins; timeout picks the default.</div>`;
    if (html !== this.voteHtml) {
      this.voteHtml = html; this.voteEl.innerHTML = html;
      this.voteEl.querySelectorAll('[data-opt]').forEach((b) => (b.onclick = () => ctx.act('vote', { opt: b.dataset.opt })));
    }
  }
}

function ghostLine(me) {
  const m = me.ghost || 'free';
  return `${m === 'scout' ? 'SCOUT DRONE — boosts sensor locks & point defence while out' : m === 'cams' ? 'CAMERA NET — [ ] cycle' : 'FREE CAMERA'} · <kbd>V</kbd> change job`;
}
function podLine(S, me) {
  const P = podState(S), dc = Math.hypot(P.x - POD_CRADLE.x, P.y - POD_CRADLE.y, P.z - POD_CRADLE.z);
  const c = P.carry && (S.cargo || []).find((x) => x.id === P.carry);
  const near = (S.cargo || []).filter((x) => x.id !== P.carry).map((x) => Math.hypot(x.x - P.x, x.y - P.y, x.z - P.z)).sort((a, b) => a - b)[0];
  return `<div class="sl"><span>POD</span><b class="${S.drive.ignited ? 'bad' : ''}">${c ? `towing ${c.kind === 'drone' ? 'drone' : 'container'} · ` : ''}cradle ${dc.toFixed(0)} m${near ? ` · cargo ${near.toFixed(0)} m` : ''} · <kbd>F</kbd> ${c ? 'release / deliver' : 'grapple'} · <kbd>G</kbd> exit${S.drive.ignited ? ' · SHIP UNDER THRUST!' : ''}</b></div>`;
}
function promptFor(S, me, f, touch) {
  const K = (k, t) => (touch ? `<em>${t}</em>` : `<kbd>${k}</kbd> ${t}`);
  const it = me.item;
  const parts = [];
  if (f.kind === 'comp') {
    const c = S.comps[f.id];
    parts.push(`<b>${f.label}</b> <span class="${cls(c.hp, 60, 25)}">${Math.round(c.hp)}%</span>${c.fire > 0 ? ' <span class="bad">ON FIRE</span>' : ''}${c.fault ? ' <span class="bad">FAULT</span>' : ''}`);
    parts.push(K('E', COMPS[f.id].ext ? 'Inspect' : 'Use console'));
    if (c.hp < 100 && c.fire <= 0.05) { const need = repairNeeds(S, f.id); if (need) { const miss = missingParts(S, need.parts); parts.push(K('R', `Repair: ${need.issues.map((i) => i.label).join(' + ')}`)); parts.push(miss.length ? `<span class="bad">missing ${miss.join(', ')}</span>` : `<span class="dim">uses ${Object.entries(need.parts).map(([k, n]) => `${n}× ${PARTS[k].short}`).join(' ')}</span>`); } else parts.push(K('R', 'Maintain (hold)')); }
    if (c.fire > 0 && it && it.type === 'ext') parts.push(K('F', 'Extinguish (hold)'));
    if (c.fire > 0 && (!it || it.type !== 'ext')) parts.push('<span class="warn">Get an extinguisher (emergency locker)</span>');
    if (f.id === 'scrubbers' && it && it.type === 'cartridge') parts.push(K('F', 'Swap cartridge'));
  } else if (f.kind === 'locker') parts.push(`<b>Emergency Locker</b>`, K('E', 'Open'));
  else if (f.kind === 'lift') parts.push(`<b>${f.label}</b>`, K('E', 'Call lift'));
  else if (f.kind === 'airlock') parts.push(`<b>Airlock</b>`, K('E', me.suit ? 'Cycle out for EVA' : 'Open (suit required for EVA)'));
  else if (f.kind === 'hatch') parts.push(`<b>Airlock hatch</b>`, K('E', 'Cycle in / refill suit'));
  else if (f.kind === 'hull') parts.push(`<b>Hull plating</b> ${Math.round(S.hull)}%`, K('F', 'Weld plating (hold, uses the patch)'));
  else if (f.kind === 'item') parts.push(K('E', 'Pick up ' + f.label));
  else if (f.kind === 'breach') parts.push(`<b class="bad">Hull breach</b>`, it && it.type === 'patch' ? K('F', 'Patch (hold)') : '<span class="warn">Needs a Hull Patch (locker/stores)</span>');
  else if (f.kind === 'bunk') { const who = Object.values(S.players).find((q) => q.sleep && q.sleep.bunk === f.id); parts.push(`<b>${f.label}</b>${who ? ` — ${esc(who.name)} asleep` : ''}`, K('E', 'Sleep')); }
  else if (f.kind === 'bay') parts.push(`<b>${f.label}</b>`, K('E', 'Experiments'));
  else if (f.kind === 'pod') parts.push(`<b>${f.label}</b>`, K('E', 'Board'));
  else if (f.kind === 'spoke') parts.push(`<b>${f.label}</b>`, K('E', 'Climb to the hub'));
  else if (f.kind === 'player') {
    const p = S.players[f.id];
    parts.push(`<b>${f.label}</b> ${p.state === 'downed' ? '<span class="bad">DOWN</span>' : Math.round(p.hp) + ' hp'}`);
    if (it && it.type === 'medkit') parts.push(K('F', p.state === 'downed' ? 'Revive' : 'Treat'));
  }
  if (it && f.kind !== 'item') parts.push(K('G', 'Drop item'));
  if (it && it.type === 'tablet') parts.push(K('F', 'Tablet'));
  return parts.join(' · ');
}
