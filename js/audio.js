// Tiny synthesized sound set (no audio files needed).
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.alarmOn = false; this.alarmT = 0; }
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
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur = 0.5, vol = 0.4, freq = 800, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
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
  tick(dt, alert) {
    if (!this.ctx || this.muted) return;
    if (this.hum) this.hum.o.frequency.value = alert === 'red' ? 52 : 48;
    if (alert === 'red') {
      this.alarmT -= dt;
      if (this.alarmT <= 0) { this.alarmT = 6; this.tone(620, 0.5, 'triangle', 0.07, -200); this.tone(620, 0.5, 'triangle', 0.07, -200, 0.7); }
    } else this.alarmT = 0;
  }
}
