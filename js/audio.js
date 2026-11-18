// Tiny synthesized sound set (no audio files needed).
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
    } catch (e) { this.ctx = null; }
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
      case 'click': this.tone(900, 0.04, 'square', 0.05); break;
      case 'hit': this.noise(1.2, 0.9, 1200); this.tone(70, 0.8, 'sine', 0.6, -40); break;
      case 'boom': this.noise(0.8, 0.3, 400); break;
      case 'rail': this.tone(2400, 0.35, 'sawtooth', 0.15, -2200); this.noise(0.3, 0.3, 3000); break;
      case 'launch': this.noise(1.0, 0.25, 900); this.tone(200, 0.8, 'sawtooth', 0.08, 300); break;
      case 'pdc': for (let i = 0; i < 10; i++) this.noise(0.05, 0.2, 2500, i * 0.06); break;
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
  // ---- electromechanical relays & CRT terminals ----
  relay(vol = 1, delay = 0) {
    if (!this.ctx || this.muted || vol <= 0.01) return;
    const c = this.ctx, t = this.now() + delay;
    const hit = (tt, v, f) => { // sharp contact transient: band-passed noise + body thump
      const n = c.createBufferSource(); n.buffer = this.noiseBuf();
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 2.5;
      const g = c.createGain(); g.gain.setValueAtTime(v, tt); g.gain.exponentialRampToValueAtTime(0.0008, tt + 0.012);
      n.connect(bp); bp.connect(g); g.connect(this.master); n.start(tt, Math.random()); n.stop(tt + 0.02);
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220 + Math.random() * 120, tt); o.frequency.exponentialRampToValueAtTime(90, tt + 0.03);
      const og = c.createGain(); og.gain.setValueAtTime(v * 0.35, tt); og.gain.exponentialRampToValueAtTime(0.0008, tt + 0.035);
      o.connect(og); og.connect(this.master); o.start(tt); o.stop(tt + 0.04);
    };
    const f = 2600 + Math.random() * 1800;
    hit(t, 0.55 * vol, f);
    hit(t + 0.006 + Math.random() * 0.006, 0.22 * vol, f * 1.3); // contact bounce
    if (Math.random() < 0.5) hit(t + 0.05 + Math.random() * 0.12, 0.3 * vol, f * 0.8); // release / second relay
  }
  relayBank(n, spread = 0.6, vol = 1, delay = 0) { for (let i = 0; i < n; i++) this.relay(vol * (0.6 + Math.random() * 0.4), delay + Math.random() * spread); }
  crtOn(vol = 1) { // degauss thunk + flyback whine + static crackle
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = this.now();
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.65);
    const w = c.createOscillator(); w.type = 'sine'; w.frequency.setValueAtTime(5200, t); w.frequency.linearRampToValueAtTime(7800, t + 0.9);
    const wg = c.createGain(); wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime(0.018 * vol, t + 0.3); wg.gain.exponentialRampToValueAtTime(0.0005, t + 1.6);
    w.connect(wg); wg.connect(this.master); w.start(t); w.stop(t + 1.7);
    for (let i = 0; i < 14; i++) this.noise(0.012, 0.08 * vol * Math.random(), 6000, Math.random() * 0.5);
  }
  bootBeep(vol = 1, delay = 0) { this.tone(1180, 0.09, 'square', 0.045 * vol, 0, delay); }
  setConsoleHum(on) {
    if (!this.ctx) return;
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
    const rate = focused ? 0.45 : 0.1 * Math.min(4, nearConsoles);
    if (Math.random() < rate * dt) { if (focused && Math.random() < 0.3) this.relayBank(2 + ((Math.random() * 3) | 0), 0.35, 0.55); else this.relay(focused ? 0.5 : 0.18); }
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
  tick(dt, alert) {
    if (!this.ctx || this.muted) return;
    if (this.hum) this.hum.o.frequency.value = alert === 'red' ? 52 : 48;
    if (alert === 'red') {
      this.alarmT -= dt;
      if (this.alarmT <= 0) { this.alarmT = 6; this.tone(620, 0.5, 'triangle', 0.07, -200); this.tone(620, 0.5, 'triangle', 0.07, -200, 0.7); }
    } else this.alarmT = 0;
  }
}
