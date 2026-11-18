// Small shared helpers (no DOM, no three.js — usable in Node tests)
import { COMPS, ROOM_R } from './config.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export function randn() { // standard normal
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function weightedPick(items, wfn) {
  let tot = 0;
  const ws = items.map((it) => { const w = Math.max(0, wfn(it)); tot += w; return w; });
  if (tot <= 0) return null;
  let r = Math.random() * tot;
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

// polar (deg, r) -> x,z with angle 0 = -z (north)
export function polar(aDeg, r) {
  const a = (aDeg * Math.PI) / 180;
  return { x: Math.sin(a) * r, z: -Math.cos(a) * r };
}
export function compPos(id) {
  const c = COMPS[id];
  if (c.ext) return { x: c.ex, z: c.ez };
  return polar(c.a, c.r);
}
export const compDeck = (id) => (COMPS[id].ext ? 5 : COMPS[id].deck);

export function log(S, text, kind = 'info') {
  S.log.push({ t: S.t, text, kind });
  if (S.log.length > 60) S.log.splice(0, S.log.length - 60);
  fx(S, 'log', { text, kind });
}
export function fx(S, type, data = {}) {
  S.fx.push({ type, ...data });
  if (S.fx.length > 80) S.fx.splice(0, S.fx.length - 80);
}

// Crew decisions: every connected player can vote; majority (or timeout default) wins.
export function startVote(S, ev, title, text, options, data = {}, dur = 40) {
  const v = { id: Math.random().toString(36).slice(2, 8), ev, title, text, options, data, votes: {}, dur, ends: 0 };
  if (S.vote) { (S.voteQueue = S.voteQueue || []).push(v); return; }
  v.ends = S.t + dur;
  S.vote = v;
  fx(S, 'vote');
}
export function msg(S, from, text, lagSec = 0) {
  S.msgs.push({ t: S.t, from, text, lag: lagSec });
  if (S.msgs.length > 30) S.msgs.splice(0, S.msgs.length - 30);
  fx(S, 'msg', { from });
}

let _id = 1;
export function uid(prefix = 'x') { _id++; return prefix + (Date.now() % 1e6).toString(36) + _id.toString(36); }

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
export function fmtGameTime(sec) {
  sec = Math.max(0, sec);
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
export function fmtDist(m) {
  const a = Math.abs(m);
  if (a > 0.05 * 1.496e11) return (m / 1.496e11).toFixed(3) + ' AU';
  if (a > 1e6) return (m / 1e9).toFixed(a > 1e9 ? 2 : 3) + ' Gm';
  if (a > 1000) return (m / 1000).toFixed(0) + ' km';
  return m.toFixed(0) + ' m';
}
export const pct = (v) => Math.round(v * 100) + '%';
export const inRoom = (x, z) => Math.hypot(x, z) < ROOM_R;
