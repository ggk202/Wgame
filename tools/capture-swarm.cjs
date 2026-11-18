// Torpedo-swarm capture: gatlings tracking individual torpedoes, seen on EVA, through the bridge windows and on an
// external camera, with hull-muffled gunfire. Same deterministic pipeline as capture-demo.cjs.
// Usage: THREE_JS=path/to/three.module.min.js node tools/capture-sounds.cjs file:///.../dist/wolfram-solo.html
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const THREE = fs.readFileSync(process.env.THREE_JS || 'three.module.min.js');
const FPS = 25, DUR = +(process.env.DUR || 25), W = 1280, H = 720;
const OUT = process.env.OUT || 'snd-frames';

const TOUR = String.raw`
(() => {
  const G = window.WOLFRAM, S = G.S;
  const st = document.createElement('style'); st.textContent = '#hint,#toast{display:none!important}'; document.head.appendChild(st);
  const s = G.sfx; window.__aev = []; let depth = 0; window.__T0 = performance.now();
  const T = () => (performance.now() - __T0) / 1000;
  for (const m of ['tone', 'noise', 'relay', 'crtOn', 'chatter', 'chirp', 'click', 'gatling', 'sample', 'play']) { const o = s[m].bind(s); s[m] = (...a) => { if (depth === 0) __aev.push({ t: T(), m, a }); depth++; try { return o(...a); } finally { depth--; } }; }
  { const o = s.setConsoleHum.bind(s); let last = null; s.setConsoleHum = (on) => { if (on !== last) { __aev.push({ t: T(), m: 'setConsoleHum', a: [on] }); last = on; } depth++; try { return o(on); } finally { depth--; } }; }
  { const o = s.setEnv.bind(s); let last = null; s.setEnv = (e) => { if (e !== last) { __aev.push({ t: T(), m: 'setEnv', a: [e] }); last = e; } return o(e); }; }
  S.players[G.myId].suit = true; S.players[G.myId].god = true;
  G.dbg.act('debug.event', { id: 'pirates' });
  const enemy = S.enc.enemies[0]; enemy.missiles = 0; enemy.slugs = 0; enemy.training = true; enemy.range = 900; enemy.dir = [0.3, 0.8, -0.52];
  let wave = 0;
  const swarm = (n, dir, r0) => { wave++; enemy.dir = dir; for (let i = 0; i < n; i++) S.enc.proj.push({ id: 'w' + wave + 't' + i, type: 'missile', from: 'them', src: enemy.id, dir0: dir.slice(), range: r0 + i * 4.5, speed: 9.5, dmg: 18, off: [Math.cos(i * 1.7 + wave) * 0.85, Math.sin(i * 1.7 + wave) * 0.85] }); };
  const done = {}, once = (k, t, at, fn) => { if (!done[k] && t >= at) { done[k] = 1; fn(); } };
  const lookAt = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2]; G.ctl.yaw = Math.atan2(-dx, -dz); G.ctl.pitch = Math.atan2(dy, Math.hypot(dx, dz)); };
  const evaAt = (p, q) => { G.ctl.deck = 5; G.ctl.x = p[0]; G.ctl.y = p[1] - 1.65; G.ctl.z = p[2]; G.ctl.vx = G.ctl.vy = G.ctl.vz = 0; lookAt(p, q); };
  window.__tourFrame = (t) => {
    // 1) on EVA off the starboard bow: a four-torpedo swarm from dorsal-forward, both dorsal gatlings engage
    if (t < 9) { const k = t / 9; evaAt([72 - 10 * k, 18 + 6 * k, -18 - 6 * k], [0, 70, -170]); }
    once('w1', t, 0.4, () => swarm(4, [0.3, 0.8, -0.52], 66));
    // 2) on the bridge, looking up through the forward windows: a second swarm streaks in and is shot down overhead
    once('in', t, 9, () => { G.ctl.deck = 4; G.ctl.x = 2.6; G.ctl.y = 0.2; G.ctl.z = -5.4; G.ctl.vx = G.ctl.vy = G.ctl.vz = 0; G.ctl.yaw = -0.3; G.ctl.pitch = 0.2; });
    if (t > 9 && t < 16.5) { G.ctl.yaw = -0.3 + (t - 9) * 0.02; G.ctl.pitch = 0.2 - (t - 9) * 0.012; }
    once('w2', t, 9.3, () => swarm(4, [-0.25, 0.9, -0.35], 64));
    // 3) Fire Control, CAM 04 on gatling 2: barrels spinning up, tracers walking onto a third swarm
    once('fc', t, 16.5, () => { G.ctl.x = -4.3; G.ctl.z = -4.8; G.ctl.yaw = 0.73; G.ctl.pitch = -0.05; key('e'); });
    once('cam', t, 17.6, () => { G.cams.cam = 3; const tb = [...document.querySelectorAll('#panel .ptab')].find((b) => /camera/i.test(b.textContent)); if (tb) tb.click(); const el = document.querySelector('#panel .camview'); if (el) el.scrollIntoView({ block: 'center' }); });
    once('w3', t, 17.4, () => swarm(3, [0.55, 0.55, -0.62], 62));
  };
  const key = (k) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); };
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
  execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i ${OUT}/f%05d.jpg -i ${OUT}/audio.wav -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart ${process.env.VIDEO || 'swarm-demo.mp4'}`);
  console.log('done');
})();
