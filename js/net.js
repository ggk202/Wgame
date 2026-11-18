// Networking: host-authoritative star topology. PeerJS (WebRTC) for real play,
// BroadcastChannel ("?net=local") for testing several tabs on one machine.
const PREFIX = 'wolfram-ship-';

export function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
const enc = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v));
const dec = (s) => { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { return null; } };

export class HostNet {
  constructor(code, h, mode = 'peer') {
    this.code = code; this.h = h; this.mode = mode; this.conns = {};
    if (mode === 'local') this.initLocal(); else this.initPeer();
  }
  initPeer() {
    if (!window.Peer) { this.h.onError('PeerJS failed to load (offline?)'); return; }
    const peer = (this.peer = new window.Peer(PREFIX + this.code, { debug: 1 }));
    peer.on('open', () => this.h.onReady());
    peer.on('error', (e) => this.h.onError(e.type === 'unavailable-id' ? 'code-taken' : e.type || String(e)));
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
    peer.on('connection', (conn) => {
      conn.on('open', () => { this.conns[conn.peer] = conn; });
      conn.on('data', (d) => { const m = dec(d); if (m) this.h.onMsg(conn.peer, m); });
      conn.on('close', () => { delete this.conns[conn.peer]; this.h.onLeave(conn.peer); });
      conn.on('error', () => { delete this.conns[conn.peer]; this.h.onLeave(conn.peer); });
    });
  }
  initLocal() {
    const bc = (this.bc = new BroadcastChannel(PREFIX + this.code));
    bc.onmessage = (ev) => {
      const { from, to, data } = ev.data;
      if (to !== 'host') return;
      if (data === '__join') { this.conns[from] = { local: true }; return; }
      if (data === '__leave') { delete this.conns[from]; this.h.onLeave(from); return; }
      const m = dec(data); if (m) this.h.onMsg(from, m);
    };
    setTimeout(() => this.h.onReady(), 50);
  }
  send(pid, obj) {
    const s = typeof obj === 'string' ? obj : enc(obj);
    if (this.mode === 'local') { if (this.conns[pid]) this.bc.postMessage({ from: 'host', to: pid, data: s }); return; }
    const c = this.conns[pid];
    if (c && c.open) { try { c.send(s); } catch (e) {} }
  }
  broadcast(obj) { const s = enc(obj); for (const pid in this.conns) this.send(pid, s); }
  get count() { return Object.keys(this.conns).length; }
  close() { try { if (this.peer) this.peer.destroy(); if (this.bc) { this.bc.close(); } } catch (e) {} }
}

export class ClientNet {
  constructor(code, h, mode = 'peer') {
    this.code = code; this.h = h; this.mode = mode;
    this.timer = setTimeout(() => { if (!this.ready) h.onError('timeout'); }, 15000);
    if (mode === 'local') this.initLocal(); else this.initPeer();
  }
  initPeer() {
    if (!window.Peer) { this.h.onError('PeerJS failed to load (offline?)'); return; }
    const peer = (this.peer = new window.Peer({ debug: 1 }));
    peer.on('error', (e) => this.h.onError(e.type === 'peer-unavailable' ? 'no-such-game' : e.type || String(e)));
    peer.on('open', () => {
      const conn = (this.conn = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'raw' }));
      conn.on('open', () => { this.ready = true; clearTimeout(this.timer); this.h.onOpen(); });
      conn.on('data', (d) => { const m = dec(d); if (m) this.h.onMsg(m); });
      conn.on('close', () => this.h.onClose());
      conn.on('error', () => this.h.onClose());
    });
  }
  initLocal() {
    this.id = 'c' + Math.random().toString(36).slice(2, 8);
    const bc = (this.bc = new BroadcastChannel(PREFIX + this.code));
    bc.onmessage = (ev) => {
      const { to, data } = ev.data;
      if (to !== this.id) return;
      const m = dec(data); if (m) this.h.onMsg(m);
    };
    bc.postMessage({ from: this.id, to: 'host', data: '__join' });
    setTimeout(() => { this.ready = true; clearTimeout(this.timer); this.h.onOpen(); }, 80);
    window.addEventListener('beforeunload', () => bc.postMessage({ from: this.id, to: 'host', data: '__leave' }));
  }
  send(obj) {
    const s = enc(obj);
    if (this.mode === 'local') { this.bc.postMessage({ from: this.id, to: 'host', data: s }); return; }
    if (this.conn && this.conn.open) { try { this.conn.send(s); } catch (e) {} }
  }
  close() { try { if (this.peer) this.peer.destroy(); if (this.bc) { this.bc.postMessage({ from: this.id, to: 'host', data: '__leave' }); this.bc.close(); } } catch (e) {} }
}
