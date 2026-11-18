// Sound showcase capture: console start-up ambience at Fire Control, the gatling PDC on an external camera,
// then a hit that sets off the malfunction alarm. Same deterministic pipeline as capture-demo.cjs.
// Usage: THREE_JS=path/to/three.module.min.js node tools/capture-sounds.cjs file:///.../dist/wolfram-solo.html
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const THREE = fs.readFileSync(process.env.THREE_JS || 'three.module.min.js');
const FPS = 25, DUR = +(process.env.DUR || 22), W = 1280, H = 720;
const OUT = process.env.OUT || 'snd-frames';

const TOUR = String.raw`
(() => {
  const G = window.WOLFRAM, S = G.S;
  const st = document.createElement('style'); st.textContent = '#hint,#toast{display:none!important}'; document.head.appendChild(st);
  const s = G.sfx; window.__aev = []; let depth = 0; window.__T0 = performance.now();
  const T = () => (performance.now() - __T0) / 1000;
  for (const m of ['tone', 'noise', 'relay', 'crtOn', 'chatter', 'chirp', 'click', 'gatling', 'sample', 'play']) { const o = s[m].bind(s); s[m] = (...a) => { if (depth === 0) __aev.push({ t: T(), m, a }); depth++; try { return o(...a); } finally { depth--; } }; }
  { const o = s.setConsoleHum.bind(s); let last = null; s.setConsoleHum = (on) => { if (on !== last) { __aev.push({ t: T(), m: 'setConsoleHum', a: [on] }); last = on; } depth++; try { return o(on); } finally { depth--; } }; }
  G.ctl.deck = 4; G.ctl.x = -3.2; G.ctl.z = -3.6; G.ctl.y = 0; G.ctl.yaw = 0.73; G.ctl.pitch = -0.05;
  const done = {}, once = (k, t, at, fn) => { if (!done[k] && t >= at) { done[k] = 1; fn(); } };
  const key = (k) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); };
  const camScroll = () => { const el = document.querySelector('#panel .camview'); if (el) el.scrollIntoView({ block: 'center' }); };
  const burst = (n) => { const e = S.enc && S.enc.enemies[0]; S.weap.pdcFire = [1.5, 1.5, 1.5]; G.world.onFx({ type: 'pdc', dir: e ? e.dir : [0.5, 0.6, -0.6], n }); G.sfx.gatling(1.3, n); };
  window.__tourFrame = (t) => {
    if (t < 1.0) { G.ctl.x = -3.2 - t * 0.9; G.ctl.z = -3.6 - t * 1.0; }
    once('e1', t, 1.0, () => key('e'));                 // Fire Control: start-up thunk and whine, then the running hum
    once('contact', t, 5.6, () => { G.dbg.act('debug.event', { id: 'pirates' }); const e = S.enc && S.enc.enemies[0]; if (e) { e.dir = [0.55, 0.62, -0.56]; e.range = 900; } });
    once('cam', t, 6.6, () => { G.cams.cam = 3; camScroll(); });
    once('b1', t, 8.2, () => burst(2));
    once('b2', t, 10.4, () => burst(3));
    once('cam2', t, 12.0, () => { G.cams.cam = 3; camScroll(); });
    once('b3', t, 12.6, () => burst(2));
    once('x1', t, 14.6, () => document.querySelector('#panel-exit').click());
    once('hit', t, 15.6, () => { G.dbg.act('debug.hit'); G.dbg.act('debug.fire'); S.alert = 'red'; G.sfx.alarmT = 0; });
    if (t > 15.6 && t < 21) { G.ctl.yaw = 0.73 + (t - 15.6) * 0.35; G.ctl.pitch = -0.05; }
  };
  { const r = G.world.render.bind(G.world); G.world.render = () => {}; window.__render = () => r(); }
  window.__stepAnims = (ms) => { for (const a of document.getAnimations()) { if (a.__vt === undefined) a.__vt = 0; a.__vt += ms; a.pause(); a.currentTime = a.__vt; } };
  window.__renderAudio = async (dur) => {
    const sr = 44100, oc = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
    const X = new G.sfx.constructor(); X.ctx = oc; X.master = oc.createGain(); X.master.gain.value = 0.5; X.master.connect(oc.destination); X.startHum(); X.buf = G.sfx.buf;
    for (const e of __aev) { if (e.t > dur) continue; X.off = e.t; try { X[e.m](...e.a); } catch (err) {} }
    const buf = await oc.startRendering();
    const n = buf.length, ch = [buf.getChannelData(0), buf.getChannelData(1)];
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const ws = (o, str) => { for (let i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); };
    ws(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); ws(8, 'WAVE'); ws(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * 4, true);
    let pk = 1e-6; for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(ch[c][i]));
    const gain = Math.min(4, 0.9 / pk);
    let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) { const v = Math.max(-1, Math.min(1, ch[c][i] * gain)); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
    const u8 = new Uint8Array(out.buffer); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { b64: btoa(bin), events: __aev.length, kinds: [...new Set(__aev.map((e) => e.m + (e.m === 'sample' || e.m === 'play' ? ':' + e.a[0] : '')))] };
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
  await page.goto(process.argv[2]);
  await page.clock.runFor(500);
  await page.evaluate(() => document.querySelector('#btn-solo').click());
  for (let i = 0; i < 40; i++) { await page.clock.runFor(100); const n = await page.evaluate(() => (window.WOLFRAM.sfx.buf ? Object.keys(window.WOLFRAM.sfx.buf).length : 0)); if (n >= 5) break; await new Promise((r) => setTimeout(r, 150)); }
  console.log('samples loaded', await page.evaluate(() => Object.keys(window.WOLFRAM.sfx.buf || {})));
  await page.clock.runFor(1500);
  await page.evaluate(TOUR);
  const nowT = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(nowT + 200);
  const N = Math.round(DUR * FPS), stepMs = 1000 / FPS, t0 = Date.now();
  for (let f = 0; f < N; f++) {
    const t = f / FPS;
    await page.evaluate((tt) => window.__tourFrame(tt), t);
    await page.clock.runFor(stepMs);
    await page.evaluate((ms) => { window.__stepAnims(ms); window.__render(); }, stepMs);
    await page.screenshot({ path: `${OUT}/f${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 88 });
    if (f % 50 === 0) console.log('frame', f, '/', N, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  const a = await page.evaluate((d) => window.__renderAudio(d), DUR);
  fs.writeFileSync(`${OUT}/audio.wav`, Buffer.from(a.b64, 'base64'));
  console.log('audio events', a.events, a.kinds.join(' '), 'errors', errs);
  await browser.close();
  execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i ${OUT}/f%05d.jpg -i ${OUT}/audio.wav -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart ${process.env.VIDEO || 'sounds-demo.mp4'}`);
  console.log('done');
})();
