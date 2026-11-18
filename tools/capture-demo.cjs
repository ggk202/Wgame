// Usage: serve the repo on :8765, then THREE_JS=path/to/three.module.min.js node tools/capture-demo.cjs
// Renders a deterministic 25 s demo (fake clock, frame-by-frame screenshots, offline-rendered game audio) to demo.mp4 with ffmpeg.
// Deterministic demo capture: fake clock, per-frame screenshots, CSS animations stepped manually,
// game audio logged as events and re-rendered offline, then muxed with ffmpeg.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const THREE = fs.readFileSync(process.env.THREE_JS || 'three.module.min.js');
const FPS = 25, DUR = +(process.env.DUR || 25.5), W = 1280, H = 720;
const OUT = process.env.OUT || 'demo-frames';

const TOUR = String.raw`
(() => {
  const G = window.WOLFRAM, S = G.S;
  const st = document.createElement('style'); st.textContent = '#hint,#toast{display:none!important}'; document.head.appendChild(st);
  // --- audio event log (leaf calls only) ---
  const s = G.sfx; window.__aev = []; let depth = 0; window.__T0 = performance.now();
  for (const m of ['tone', 'noise', 'relay', 'crtOn']) { const o = s[m].bind(s); s[m] = (...a) => { if (depth === 0) __aev.push({ t: (performance.now() - __T0) / 1000, m, a }); depth++; try { return o(...a); } finally { depth--; } }; }
  { const o = s.setConsoleHum.bind(s); let last = null; s.setConsoleHum = (on) => { if (on !== last) { __aev.push({ t: (performance.now() - __T0) / 1000, m: 'setConsoleHum', a: [on] }); last = on; } return o(on); }; }
  // --- blackout on Engineering ---
  S.paused = true; S.reactor.state = 'scram'; S.reactor.actual = 0; S.battery.charge = 0; S.power.gen = 0;
  for (const c of Object.values(S.comps)) c.pw = 0;
  G.ctl.deck = 2; G.ctl.x = 0; G.ctl.z = -2.8; G.ctl.yaw = 1.45; G.ctl.pitch = 0.0;
  const done = {};
  const once = (k, t, at, fn) => { if (!done[k] && t >= at) { done[k] = 1; fn(); } };
  const lerp = (a, b, k) => a + (b - a) * k, ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const path = (t, keys) => { // keys: [t, x, z, yaw, pitch]
    if (t <= keys[0][0]) return keys[0];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const a = keys[i - 1], b = keys[i], k = ease((t - a[0]) / (b[0] - a[0])); return [t, lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k), lerp(a[4], b[4], k)]; }
    return keys[keys.length - 1];
  };
  const key = (k) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); };
  const A = [[0, 0, -2.8, 1.45, 0.0], [4.3, 0, -2.8, -1.35, 0.0], [5.1, 0.2, -3.0, -0.4, -0.04], [6.6, 1.1, -4.3, 0.22, -0.08]];
  const B = [[13.9, 0, 2.4, Math.PI, 0], [14.5, 0.5, 2.5, 4.6, 0], [15.6, 2.9, 0.2, 5.5, 0], [16.8, 0.15, -5.9, 2 * Math.PI, -0.18]];
  window.__tourFrame = (t) => {
    once('power', t, 1.3, () => { S.paused = false; S.reactor.state = 'running'; S.reactor.actual = 0.7; S.reactor.stab = 1; S.battery.charge = 2.4; });
    if (t < 6.7) { const p = path(t, A); G.ctl.x = p[1]; G.ctl.z = p[2]; G.ctl.yaw = p[3]; G.ctl.pitch = p[4]; }
    once('e1', t, 6.8, () => key('e'));
    once('x1', t, 12.2, () => document.querySelector('#panel-exit').click());
    once('lift', t, 13.1, () => G.dbg.rideLift(4));
    if (t >= 13.9 && t < 17.0) { const p = path(t, B); G.ctl.x = p[1]; G.ctl.z = p[2]; G.ctl.yaw = p[3]; G.ctl.pitch = p[4]; }
    once('e2', t, 17.2, () => key('e'));
    once('undock', t, 21.6, () => { const b = [...document.querySelectorAll('#panel button')].find((x) => /undock/i.test(x.textContent)); if (b) b.click(); });
    once('x2', t, 24.2, () => document.querySelector('#panel-exit').click());
  };
  { const r = G.world.render.bind(G.world); G.world.render = () => {}; window.__render = () => r(); }
  window.__stepAnims = (ms) => { for (const a of document.getAnimations()) { if (a.__vt === undefined) a.__vt = 0; a.__vt += ms; a.pause(); a.currentTime = a.__vt; } };
  window.__renderAudio = async (dur) => {
    const sr = 44100, oc = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
    const X = new G.sfx.constructor(); X.ctx = oc; X.master = oc.createGain(); X.master.gain.value = 0.5; X.master.connect(oc.destination); X.startHum();
    for (const e of __aev) { if (e.t > dur) continue; X.off = e.t; try { X[e.m](...e.a); } catch (err) {} }
    const buf = await oc.startRendering();
    const n = buf.length, ch = [buf.getChannelData(0), buf.getChannelData(1)];
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const ws = (o, str) => { for (let i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); };
    ws(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); ws(8, 'WAVE'); ws(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * 4, true);
    let pk = 1e-6; for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(ch[c][i]));
    const gain = Math.min(12, 0.9 / pk);
    let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) { const v = Math.max(-1, Math.min(1, ch[c][i] * gain)); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
    const u8 = new Uint8Array(out.buffer); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { b64: btoa(bin), events: __aev.length };
  };
  return true;
})()`;

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ body: THREE, contentType: 'application/javascript' }));
  await ctx.route('https://unpkg.com/**', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.clock.install({ time: 0 });
  await page.goto(process.argv[2] || 'http://localhost:8765/index.html');
  await page.clock.runFor(500);
  await page.evaluate(() => document.querySelector('#btn-solo').click());
  await page.clock.runFor(1500);
  await page.evaluate(TOUR);
  const nowT = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(nowT + 200); // stop natural time flow: only runFor() advances the game clock
  const N = Math.round(DUR * FPS), stepMs = 1000 / FPS;
  const t0 = Date.now();
  for (let f = 0; f < N; f++) {
    const t = f / FPS;
    await page.evaluate((tt) => window.__tourFrame(tt), t);
    await page.clock.runFor(stepMs);
    const info = await page.evaluate((ms) => { window.__stepAnims(ms); window.__render(); const G = window.WOLFRAM; return [G.world.focus, +G.world.focusT.toFixed(2), document.querySelector('#panel').className, document.querySelector('.pboot').style.display, document.querySelector('#panel').style.transform.slice(0, 40)]; }, stepMs);
    if (process.env.DEBUG && t > 6.5 && t < 9) console.log(t.toFixed(2), JSON.stringify(info));
    await page.screenshot({ path: `${OUT}/f${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 88 });
    if (f % 50 === 0) console.log('frame', f, '/', N, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  const a = await page.evaluate((d) => window.__renderAudio(d), DUR);
  fs.writeFileSync(`${OUT}/audio.wav`, Buffer.from(a.b64, 'base64'));
  console.log('audio events', a.events, 'errors', errs);
  await browser.close();
  execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i ${OUT}/f%05d.jpg -i ${OUT}/audio.wav -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p -c:a aac -b:a 160k -shortest -movflags +faststart ${process.env.VIDEO || 'demo.mp4'}`);
  console.log('done');
})();
