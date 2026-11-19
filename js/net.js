// Networking: host-authoritative star topology. PeerJS (WebRTC) for real play,
// BroadcastChannel ("?net=local") for testing several tabs on one machine.
const PREFIX = 'wolfram-ship-';

export function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
// ICE servers. STUN finds each side's public address so the peers can connect directly; when routers, mobile
// networks or firewalls block that (common between different networks), WebRTC needs a TURN relay. PeerJS's public
// relay is listed, but it is best-effort, so a player can add their own relay (e.g. a free Open Relay / Metered
// account) in the lobby's connection settings, or with ?turn=turn:host:port&turnuser=…&turnpass=…
export function relayCfg() {
  try {
    const q = new URLSearchParams(location.search), r = JSON.parse(localStorage.getItem('wolfram-relay') || 'null') || {};
    const url = q.get('turn') || r.url; if (!url) return null;
    return { urls: url.split(/[\s,]+/).filter(Boolean), username: q.get('turnuser') || r.user || '', credential: q.get('turnpass') || r.pass || '' };
  } catch (e) { return null; }
}
function peerOpts() {
  const ice = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  ];
  const t = relayCfg(); if (t) ice.unshift(t);
  return { debug: 1, config: { iceServers: ice, iceCandidatePoolSize: 4 } };
}
// follow a connection's ICE negotiation, so failures say which step broke
function watchIce(conn, onState) {
  let last = '', n = 0;
  const iv = setInterval(() => {
    const pc = conn.peerConnection; if (!pc) { if (++n > 120) clearInterval(iv); return; }
    const st = pc.iceConnectionState; if (st !== last) { last = st; onState(st); }
    if (st === 'connected' || st === 'completed' || st === 'failed' || st === 'closed') clearInterval(iv);
  }, 250);
  return () => clearInterval(iv);
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
    const peer = (this.peer = new window.Peer(PREFIX + this.code, peerOpts()));
    peer.on('open', () => this.h.onReady());
    peer.on('error', (e) => this.h.onError(e.type === 'unavailable-id' ? 'code-taken' : e.type || String(e)));
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
    peer.on('connection', (conn) => {
      if (this.h.onStatus) this.h.onStatus('A crewmate is connecting…');
      watchIce(conn, (st) => { if (st === 'failed' && this.h.onStatus) this.h.onStatus('A crewmate could not connect: your networks block a direct link and the relay failed. See Connection settings in the lobby.', 'bad'); });
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
    this.stage = 'broker';
    this.timer = setTimeout(() => { if (!this.ready) { h.onError('timeout-' + this.stage); this.close(); } }, 35000);
    if (mode === 'local') this.initLocal(); else this.initPeer();
  }
  initPeer() {
    if (!window.Peer) { this.h.onError('PeerJS failed to load (offline?)'); return; }
    const peer = (this.peer = new window.Peer(peerOpts()));
    peer.on('error', (e) => { if (this.ready) return; clearTimeout(this.timer); this.h.onError(e.type === 'peer-unavailable' ? 'no-such-game' : e.type || String(e)); });
    peer.on('open', () => {
      this.stage = 'host';
      if (this.h.onStatus) this.h.onStatus(`Reached the matchmaking broker. Calling ship ${this.code}…`);
      const conn = (this.conn = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'raw' }));
      watchIce(conn, (st) => {
        if (this.ready) return;
        if (st === 'checking') { this.stage = 'ice'; this.h.onStatus && this.h.onStatus('Found the host. Negotiating a link (direct, or via relay)…'); }
        if (st === 'failed') { clearTimeout(this.timer); this.h.onError('ice-failed'); }
      });
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
