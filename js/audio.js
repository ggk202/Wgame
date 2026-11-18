// Synthesized sounds plus a few recorded effects (sounds/). Everything falls back to synthesis if a file can't load.
import { SOUND_URLS } from './sounds.js';
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.alarmOn = false; this.alarmT = 0; }
  now() { return this.ctx.currentTime + (this.off || 0); } // `off` lets an offline renderer replay logged events at their times
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      this.startHum();
      this.loadSamples();
    } catch (e) { this.ctx = null; }
  }
  // ---- recorded samples ----
  loadSamples() {
    this.buf = {};
    for (const [k, url] of Object.entries(SOUND_URLS)) {
      const get = url.startsWith('data:')
        ? Promise.resolve(Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer)
        : fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); });
      get.then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej))).then((b) => { this.buf[k] = b; }).catch(() => {});
    }
  }
  sample(name, { vol = 1, rate = 1, delay = 0, loop = false, offset = 0, loopStart = 0, loopEnd = 0, dest = null } = {}) {
    if (!this.ctx || !this.buf || !this.buf[name]) return null;
    const c = this.ctx, t = this.now() + delay;
    const src = c.createBufferSource(); src.buffer = this.buf[name]; src.playbackRate.value = rate; src.loop = loop;
    if (loop) { src.loopStart = loopStart; src.loopEnd = loopEnd || src.buffer.duration; }
    const g = c.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(dest || this.master); src.start(t, offset);
    return { src, g, t };
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  noiseBuf() {
    if (this._nb) return this._nb;
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 1.5, this.ctx.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (this._nb = b);
  }
  startHum() {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 48;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 140;
    const g = c.createGain(); g.gain.value = 0.05;
    o.connect(f); f.connect(g); g.connect(this.master); o.start();
    const n = c.createBufferSource(); n.buffer = this.noiseBuf(); n.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 300;
    const ng = c.createGain(); ng.gain.value = 0.03;
    n.connect(nf); nf.connect(ng); ng.connect(this.master); n.start();
    this.hum = { o, g };
  }
  tone(freq, dur = 0.12, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = this.now() + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur = 0.5, vol = 0.4, freq = 800, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = this.now() + delay;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf();
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(60, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.master); n.start(t); n.stop(t + dur + 0.05);
  }
  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'shipwarn': { // a fault, fire or breach: one tone of the ship's malfunction alarm (rate-limited)
        const t = this.now(); if (t - (this.lastWarn || -9) < 1.5) break; this.lastWarn = t;
        if (!this.sample('alarmBeep', { vol: 0.28 })) { this.tone(520, 0.15, 'square', 0.06); this.tone(390, 0.2, 'square', 0.06, 0, 0.17); }
        break;
      }
      case 'click': this.tone(900, 0.04, 'square', 0.05); break;
      case 'hit': this.noise(1.2, 0.9, 1200); this.tone(70, 0.8, 'sine', 0.6, -40); break;
      case 'boom': this.noise(0.8, 0.3, 400); break;
      case 'rail': this.tone(2400, 0.35, 'sawtooth', 0.15, -2200); this.noise(0.3, 0.3, 3000); break;
      case 'launch': this.noise(1.0, 0.25, 900); this.tone(200, 0.8, 'sawtooth', 0.08, 300); break;
      case 'pdc': this.gatling(1.2, 1); break;
      case 'srm': for (let i = 0; i < 3; i++) { this.noise(0.9, 0.3, 2400 - i * 500, i * 0.06); } this.tone(140, 0.9, 'sawtooth', 0.06, 260); break;
      case 'chime': this.tone(880, 0.25, 'sine', 0.15); this.tone(1320, 0.35, 'sine', 0.12, 0, 0.12); break;
      case 'warn': this.tone(520, 0.15, 'square', 0.06); this.tone(390, 0.2, 'square', 0.06, 0, 0.16); break;
      case 'msg': this.tone(1000, 0.08, 'sine', 0.1); this.tone(1500, 0.1, 'sine', 0.1, 0, 0.1); break;
      case 'ignite': this.noise(2.0, 0.4, 300); this.tone(40, 2.0, 'sine', 0.4, 30); break;
      case 'alarm': for (let i = 0; i < 3; i++) { this.tone(700, 0.22, 'square', 0.1, 0, i * 0.5); this.tone(500, 0.22, 'square', 0.1, 0, i * 0.5 + 0.25); } break;
      case 'storm': for (let i = 0; i < 4; i++) this.tone(1200, 0.12, 'sawtooth', 0.08, -600, i * 0.3); break;
      case 'lift': this.tone(220, 0.6, 'sine', 0.12, 120); break;
      case 'repair': this.noise(0.08, 0.1, 4000); break;
      case 'hiss': this.noise(0.25, 0.15, 6000); break;
    }
  }
  // ---- 1979-style ship computer: soft data chirps, key clicks and latching switches ----
  // (in the spirit of the Nostromo's computer room: sequences of short, pure, high blips rather than loud clacks)
  chirp(f, dur, vol, delay = 0, type = 'sine') {
    if (!this.ctx || this.muted || vol <= 0.002) return;
    const c = this.ctx, t = this.now() + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.setValueAtTime(vol, t + dur - 0.006); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    o.connect(lp); lp.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.01);
  }
  click(vol, delay = 0, f = 5200) { // a small switch or key: very short high-passed tick with a little body
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = this.now() + delay;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf();
    const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = f; hp.Q.value = 1.4;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.006);
    n.connect(hp); hp.connect(g); g.connect(this.master); n.start(t, Math.random()); n.stop(t + 0.01);
  }
  // one burst of computer "talk": 3-9 blips on a small fixed scale, sometimes a fast two-tone warble, ticks between
  chatter(vol = 1, delay = 0) {
    if (!this.ctx || this.muted || vol <= 0.01) return;
    const SC = [1046, 1174, 1396, 1567, 1760, 2093, 2349, 2793, 3136];
    let t = delay;
    const n = 3 + ((Math.random() * 7) | 0), base = (Math.random() * 4) | 0;
    for (let i = 0; i < n; i++) {
      const f = SC[Math.min(SC.length - 1, base + ((Math.random() * 5) | 0))];
      const d = 0.026 + Math.random() * 0.05;
      if (Math.random() < 0.18) { for (let k = 0; k < 6; k++) this.chirp(k % 2 ? f * 1.26 : f, 0.022, 0.03 * vol, t + k * 0.024); t += 0.15; }
      else { this.chirp(f, d, 0.034 * vol, t, Math.random() < 0.25 ? 'triangle' : 'sine'); t += d + 0.018 + Math.random() * 0.05; }
      if (Math.random() < 0.35) this.click(0.05 * vol, t - 0.01);
    }
  }
  // a latching switch: a soft mechanical "tchk" (two contacts) followed by an acknowledging blip
  relay(vol = 1, delay = 0) {
    if (!this.ctx || this.muted || vol <= 0.01) return;
    const c = this.ctx, t = this.now() + delay;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 900; bp.Q.value = 3;
    const g = c.createGain(); g.gain.setValueAtTime(0.22 * vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.02);
    n.connect(bp); bp.connect(g); g.connect(this.master); n.start(t, Math.random()); n.stop(t + 0.03);
    this.click(0.09 * vol, delay + 0.011, 3800);
    if (Math.random() < 0.7) this.chirp([1567, 2093, 2349, 1760][(Math.random() * 4) | 0], 0.045, 0.03 * vol, delay + 0.04);
  }
  relayBank(n, spread = 0.6, vol = 1, delay = 0) { // a console waking up: switches, then the computer answering
    for (let i = 0; i < Math.min(4, n); i++) this.relay(vol * (0.6 + Math.random() * 0.4), delay + (i / Math.max(1, n)) * spread * 0.5);
    this.chatter(vol, delay + spread * 0.5);
    if (n > 4) this.chatter(vol * 0.8, delay + spread * 0.5 + 0.45);
  }
  crtOn(vol = 1) { // degauss thump, rising flyback whine, then the terminal's start-up blips
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = this.now();
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28 * vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.65);
    const w = c.createOscillator(); w.type = 'sine'; w.frequency.setValueAtTime(5200, t); w.frequency.linearRampToValueAtTime(7800, t + 0.9);
    const wg = c.createGain(); wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime(0.014 * vol, t + 0.3); wg.gain.exponentialRampToValueAtTime(0.0005, t + 1.6);
    w.connect(wg); wg.connect(this.master); w.start(t); w.stop(t + 1.7);
    [1046, 1396, 2093].forEach((f, i) => this.chirp(f, 0.06, 0.03 * vol, 0.55 + i * 0.08));
  }
  // weapons
  gatling(dur = 1.2, n = 1) { // ~65 rounds/s per gun: a ripping buzz of individual reports
    if (!this.ctx || this.muted) return;
    if (this.buf && this.buf.pdc) { // recorded Phalanx burst; more turrets = a second, slightly detuned gun just behind
      this.sample('pdc', { vol: 0.75, rate: 0.96 + Math.random() * 0.08 });
      if (n > 1) this.sample('pdc', { vol: 0.45, rate: 0.9 + Math.random() * 0.06, delay: 0.06 + Math.random() * 0.05 });
      return;
    }
    const c = this.ctx, t = this.now();
    const src = c.createBufferSource(); src.buffer = this.noiseBuf(); src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const am = c.createGain(); am.gain.value = 0;
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 62 + Math.random() * 8;
    const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain);
    const g = c.createGain(); const v = 0.22 * Math.min(1.6, 0.7 + n * 0.3);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.12); g.gain.setValueAtTime(v, t + dur - 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(am); am.connect(g); g.connect(this.master);
    src.start(t); lfo.start(t); src.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(65, t);
    const og = c.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.06, t + 0.1); og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const olp = c.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 180;
    o.connect(olp); olp.connect(og); og.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  bootBeep(vol = 1, delay = 0) { this.chirp(1396, 0.07, 0.04 * vol, delay); this.chirp(2093, 0.05, 0.03 * vol, delay + 0.08); }
  setConsoleHum(on) {
    if (!this.ctx) return;
    if (this.buf && this.buf.consoleLoop) { // recorded computer: start-up thunk and spin-up, then the running hum, looped
      const want = on && !this.muted;
      if (want && !this.amb) {
        const out = this.ctx.createGain(); out.gain.value = 0.55; out.connect(this.master);
        const st = this.buf.consoleStart && (!this.ambOffAt || this.now() - this.ambOffAt > 4) ? this.sample('consoleStart', { vol: 0.8, dest: out }) : null;
        const lead = st ? this.buf.consoleStart.duration - 0.7 : 0;
        const lp = this.sample('consoleLoop', { vol: 0.0001, loop: true, loopStart: 0.03, loopEnd: this.buf.consoleLoop.duration - 0.03, delay: lead, dest: out });
        if (lp) { lp.g.gain.setValueAtTime(0.0001, lp.t); lp.g.gain.exponentialRampToValueAtTime(0.9, lp.t + 0.6); }
        this.amb = { out, st, lp };
      } else if (!want && this.amb) {
        const { out, st, lp } = this.amb, t = this.now();
        out.gain.setTargetAtTime(0, t, 0.15);
        for (const x of [st, lp]) if (x) try { x.src.stop(t + 0.8); } catch (e) {}
        this.amb = null; this.ambOffAt = t;
      }
      return;
    }
    if (!this.chum) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      const w = c.createOscillator(); w.type = 'sine'; w.frequency.value = 7800;
      const wg = c.createGain(); wg.gain.value = 0.25;
      const g = c.createGain(); g.gain.value = 0;
      o.connect(f); f.connect(g); w.connect(wg); wg.connect(g); g.connect(this.master); o.start(); w.start();
      this.chum = g;
    }
    this.chum.gain.setTargetAtTime(on && !this.muted ? 0.022 : 0, this.now(), 0.25);
  }
  // occasional relay chatter: louder while working at a console, faint ambience near live consoles
  idle(dt, focused, nearConsoles) {
    if (!this.ctx || this.muted) return;
    if (this.buf && this.buf.consoleLoop) { if (!focused && Math.random() < 0.05 * Math.min(4, nearConsoles) * dt) this.relay(0.15); return; }
    const rate = focused ? 0.45 : 0.1 * Math.min(4, nearConsoles);
    if (Math.random() < rate * dt) { if (Math.random() < 0.65) this.chatter(focused ? 0.8 : 0.3); else this.relay(focused ? 0.5 : 0.18); }
  }
  // record the game's audio output (used for demo capture)
  startCapture() {
    this.unlock();
    if (!this.ctx || !window.MediaRecorder) return false;
    this.capDest = this.ctx.createMediaStreamDestination();
    this.master.connect(this.capDest);
    this.capChunks = [];
    this.rec = new MediaRecorder(this.capDest.stream);
    this.rec.ondataavailable = (e) => { if (e.data.size) this.capChunks.push(e.data); };
    this.rec.start(250);
    this.capStart = performance.now();
    return true;
  }
  stopCapture() {
    return new Promise((res) => {
      if (!this.rec) return res(null);
      this.rec.onstop = async () => {
        const buf = new Uint8Array(await new Blob(this.capChunks).arrayBuffer());
        let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        res(btoa(s));
      };
      this.rec.stop();
    });
  }
  tick(dt, alert, issue = false) {
    if (!this.ctx || this.muted) return;
    if (this.hum) this.hum.o.frequency.value = alert === 'red' ? 52 : 48;
    if (alert === 'red' || (issue && alert === 'yellow')) {
      this.alarmT -= dt;
      if (this.alarmT <= 0) {
        this.alarmT = 9;
        // ship in trouble (fire, breach, dead system, reactor down): the recorded malfunction alarm; combat alone: the synth klaxon
        if (!(issue && this.sample('alarm', { vol: 0.32 }))) { this.alarmT = 6; this.tone(620, 0.5, 'triangle', 0.07, -200); this.tone(620, 0.5, 'triangle', 0.07, -200, 0.7); }
      }
    } else this.alarmT = 0;
  }
}
