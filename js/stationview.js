// The station concourse you walk into from the docking tunnel: market counters, a bar, the dockyard office, a lost &
// found, an information kiosk and a big observation window, populated with the people who work there.
import * as THREE from 'three';
import { mat, metal, emis, texMat, textSprite, planeLabel, floorTex, buildAvatar } from './models.js';
import { hazardTex } from './interior.js';
import { WAYPOINTS } from './config.js';
import { ST, stationNpcs } from './stationdata.js';

export const STATION_ORIGIN = new THREE.Vector3(0, 900, 0);
const THEME = {
  luna: { accent: 0x4aa8ff, wall: '#c9cdd2', floor: '#6f777f', sign: 'SHACKLETON YARD' },
  phobos: { accent: 0xff7a3a, wall: '#c8b8a8', floor: '#6a5a50', sign: 'PHOBOS STATION' },
  ceres: { accent: 0x8aff7a, wall: '#b8bcb0', floor: '#5f6458', sign: 'PIAZZI DOCK · CERES' },
  ganymede: { accent: 0xffd040, wall: '#c8c4bc', floor: '#6c6860', sign: 'NICHOLSON PORT' },
};
function stTex(key, w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
const wallTex = (tint) => stTex('wall' + tint, 256, 256, (g, w, h) => {
  g.fillStyle = tint; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2; for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } g.beginPath(); g.moveTo(0, 170); g.lineTo(w, 170); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.2)'; for (let x = 10; x < w; x += 128) for (const y of [10, 160, 180, 246]) { g.fillRect(x, y, 4, 4); g.fillRect(x + 108, y, 4, 4); }
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 196, w, 60);
  g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * 170, 30, 1);
});
const tileTex = (tint) => stTex('tile' + tint, 256, 256, (g, w, h) => {
  g.fillStyle = tint; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + Math.random() * 0.05})`; g.fillRect(x + 2, y + 2, 60, 60); }
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; for (let i = 0; i <= w; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
});
const crateTex = (c1) => stTex('crate' + c1, 128, 128, (g, w, h) => {
  g.fillStyle = c1; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
  g.beginPath(); g.moveTo(4, 4); g.lineTo(w - 4, h - 4); g.moveTo(w - 4, 4); g.lineTo(4, h - 4); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.font = 'bold 14px monospace'; g.fillText('CARGO ' + Math.floor(Math.random() * 900 + 100), 18, 70);
});
function neon(text, color, w = 3.2, h = 0.6) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
  const hex = '#' + new THREE.Color(color).getHexString();
  g.fillStyle = 'rgba(8,10,14,0.92)'; g.fillRect(0, 0, 512, 96);
  g.shadowColor = hex; g.shadowBlur = 18; g.fillStyle = hex; g.font = 'bold 52px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
  g.strokeStyle = hex; g.lineWidth = 3; g.strokeRect(6, 6, 500, 84);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

export function buildStationInterior(wid) {
  const T = THEME[wid] || THEME.luna;
  const g = new THREE.Group(); g.position.copy(STATION_ORIGIN);
  const A = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const W = ST.W, D = ST.D, H = ST.H;
  const wallM = new THREE.MeshStandardMaterial({ map: wallTex(T.wall), roughness: 0.75, metalness: 0.1 }); wallM.map.repeat.set(W / 4, 1);
  const floorM = new THREE.MeshStandardMaterial({ map: tileTex(T.floor), roughness: 0.55, metalness: 0.15 }); floorM.map.repeat.set(W / 4, D / 4);
  const dark = mat(0x23272c, { roughness: 0.6, metalness: 0.3 }), steel = metal(0x9aa2aa), accent = emis(T.accent, 1.0), wood = mat(0x5a3a24, { roughness: 0.55 });
  // shell: floor, ceiling with light troffers, walls (the north wall is mostly window)
  A(new THREE.PlaneGeometry(W, D), floorM, 0, 0, 0, -Math.PI / 2);
  const ceil = A(new THREE.PlaneGeometry(W, D), mat(0x9aa0a6, { roughness: 0.8 }), 0, H, 0, Math.PI / 2);
  void ceil;
  for (let x = -W / 2 + 4; x < W / 2 - 2; x += 6) for (let z = -D / 2 + 4; z < D / 2 - 2; z += 6) A(new THREE.BoxGeometry(2.4, 0.06, 0.8), emis(0xfff6e8, 1.2), x, H - 0.04, z);
  A(new THREE.PlaneGeometry(W, H), wallM, 0, H / 2, D / 2, 0, Math.PI);                       // south (tunnel side)
  A(new THREE.PlaneGeometry(D, H), wallM, -W / 2, H / 2, 0, 0, Math.PI / 2);                 // west
  A(new THREE.PlaneGeometry(D, H), wallM, W / 2, H / 2, 0, 0, -Math.PI / 2);                 // east
  // north: a long observation window between structural mullions
  A(new THREE.BoxGeometry(W, 1.0, 0.3), wallM, 0, 0.5, -D / 2);
  A(new THREE.BoxGeometry(W, 1.2, 0.3), wallM, 0, H - 0.6, -D / 2);
  for (let x = -W / 2; x <= W / 2 + 0.01; x += W / 8) A(new THREE.BoxGeometry(0.35, H, 0.4), dark, x, H / 2, -D / 2);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fc0e0, roughness: 0.02, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.12, depthWrite: false });
  const gl = A(new THREE.PlaneGeometry(W, H - 2.2), glass, 0, 1 + (H - 2.2) / 2, -D / 2 + 0.02); gl.castShadow = false;
  A(new THREE.BoxGeometry(W, 0.12, 0.6), steel, 0, 1.0, -D / 2 + 0.3);                         // handrail ledge
  // skirting accent strip and pillars
  for (const [x, z, ry, len] of [[0, D / 2 - 0.02, Math.PI, W], [-W / 2 + 0.02, 0, Math.PI / 2, D], [W / 2 - 0.02, 0, -Math.PI / 2, D]]) A(new THREE.PlaneGeometry(len, 0.06), accent, x, 0.25, z, 0, ry);
  for (const x of [-9, 9]) for (const z of [-6, 6]) { A(new THREE.CylinderGeometry(0.45, 0.5, H, 12), dark, x, H / 2, z); A(new THREE.CylinderGeometry(0.47, 0.47, 0.06, 12), accent, x, 2.6, z); }
  // the station's name over the docking tunnel, and the tunnel hatch itself
  const sign = neon(T.sign, T.accent, 6, 0.9); sign.position.set(0, 4.6, D / 2 - 0.05); sign.rotation.y = Math.PI; g.add(sign);
  A(new THREE.TorusGeometry(1.5, 0.18, 10, 32), steel, 0, 1.6, D / 2 - 0.12);
  A(new THREE.CircleGeometry(1.42, 32), dark, 0, 1.6, D / 2 - 0.1, 0, Math.PI);
  const hz = new THREE.MeshStandardMaterial({ map: hazardTex([6, 1]), roughness: 0.6 }); A(new THREE.PlaneGeometry(4, 0.25), hz, 0, 0.13, D / 2 - 0.05, 0, Math.PI);
  const tun = planeLabel('◀ DOCKING TUNNEL · CSV WOLFRAM ▶', 2.6, 0.32, { size: 40 }); tun.position.set(0, 3.45, D / 2 - 0.06); tun.rotation.y = Math.PI; g.add(tun);
  // west: the market (three counters with screens, shelves behind)
  const npcs = stationNpcs(wid);
  A(new THREE.BoxGeometry(2.8, 1.05, D - 6), wood, -17, 0.525, 0);
  A(new THREE.BoxGeometry(3.0, 0.06, D - 5.8), mat(0xdcd8cc, { roughness: 0.4 }), -17, 1.08, 0);
  for (const n of npcs.filter((x) => x.role === 'vendor' && x.x < 0)) {
    const s = neon(n.title.toUpperCase(), T.accent, 3.2, 0.55); s.position.set(-15.3, 3.2, n.z); s.rotation.y = Math.PI / 2; g.add(s);
    A(new THREE.BoxGeometry(0.06, 0.45, 0.7), dark, -16.1, 1.35, n.z + 1.0, 0, 0, -0.2); A(new THREE.PlaneGeometry(0.6, 0.38), emis(0x7fe0ff, 0.7), -16.06, 1.35, n.z + 1.0, 0, Math.PI / 2, -0.2);
    for (let k = 0; k < 4; k++) { A(new THREE.BoxGeometry(0.4, 0.04, 3.4), steel, -18.7, 1.4 + k * 0.55, n.z); for (let b = 0; b < 6; b++) A(new THREE.BoxGeometry(0.3, 0.3 + Math.random() * 0.12, 0.38), mat([0x3a6a9a, 0xd88a2a, 0x6a8a3a, 0xa83a2a, 0xdcd8cc][(b + k) % 5]), -18.65, 1.6 + k * 0.55, n.z - 1.4 + b * 0.55); }
  }
  // north-east: the bar, bottles lit from behind, stools, tables
  A(new THREE.BoxGeometry(9.1, 1.1, 2.6), wood, 14.05, 0.55, -12.5);
  A(new THREE.BoxGeometry(9.3, 0.08, 2.8), mat(0x1c1e22, { roughness: 0.25, metalness: 0.6 }), 14.05, 1.12, -12.5);
  A(new THREE.PlaneGeometry(8, 2.2), emis(0x2a1408, 1), 14, 2.4, -D / 2 + 0.35);
  for (let k = 0; k < 3; k++) { A(new THREE.BoxGeometry(8, 0.05, 0.3), steel, 14, 1.6 + k * 0.6, -D / 2 + 0.45); for (let b = 0; b < 14; b++) A(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 8), emis([0x40c080, 0xffa030, 0xa040ff, 0x40a0ff, 0xff4060][(b * 3 + k) % 5], 0.8), 10.5 + b * 0.52, 1.8 + k * 0.6, -D / 2 + 0.45); }
  const bs = neon('THE AIRLOCK · BAR', 0xff60a0, 3.6, 0.6); bs.position.set(14, 4.3, -D / 2 + 0.35); g.add(bs);
  for (let i = 0; i < 6; i++) { const x = 10.4 + i * 1.4; A(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 14), mat(0xa83a2a), x, 0.75, -10.6); A(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8), steel, x, 0.36, -10.6); }
  for (const [x, z] of [[12.25, -7.25], [15.75, -7.25], [12.25, -3.75]]) { A(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 18), mat(0xdcd8cc), x, 0.75, z); A(new THREE.CylinderGeometry(0.07, 0.25, 0.72, 10), steel, x, 0.36, z); }
  // south-east: the dockyard office desk with a holo display of a ship
  A(new THREE.BoxGeometry(8.1, 1.0, 2.5), mat(0x5c646c), 14.55, 0.5, 7.75);
  A(new THREE.BoxGeometry(8.3, 0.06, 2.7), mat(0xdcd8cc), 14.55, 1.03, 7.75);
  const holo = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.05, 24), emis(T.accent, 0.8)); holo.position.set(12, 1.1, 7.8); g.add(holo);
  const hship = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.15, 0.15, 1.4, 8)), new THREE.LineBasicMaterial({ color: T.accent })); hship.position.set(12, 1.7, 7.8); hship.rotation.z = Math.PI / 2; g.add(hship); g.userData.holo = hship;
  const ys = neon('DOCKYARD · REPAIRS · REFIT', 0xffb040, 4.2, 0.6); ys.position.set(14.5, 3.4, D / 2 - 0.06); ys.rotation.y = Math.PI; g.add(ys);
  // north-west: lost & found crates
  for (const [x, z, s, c] of [[-16, -12, 1.6, '#6a5a3a'], [-14.2, -12.4, 1.2, '#3a5a7a'], [-16, -10.3, 1.0, '#7a3a2a'], [-11, -12.6, 1.4, '#5a6a3a'], [-12.4, -12.6, 1.0, '#6a5a3a'], [-16, -12, 1.0, '#3a5a7a']]) A(new THREE.BoxGeometry(s, s, s), new THREE.MeshStandardMaterial({ map: crateTex(c), roughness: 0.8 }), x, s / 2 + (s === 1.0 && x === -16 && z === -12 ? 1.6 : 0), z, 0, Math.random() * 0.3);
  const lf = neon('LOST & FOUND · FREE', 0x9effa8, 3, 0.5); lf.position.set(-13, 3.2, -D / 2 + 0.35); g.add(lf);
  // centre: info kiosk, planters with real-looking greenery, benches
  A(new THREE.CylinderGeometry(0.9, 1.1, 1.0, 16), dark, 0, 0.5, 0);
  for (let k = 0; k < 4; k++) { const sc = A(new THREE.BoxGeometry(1.0, 0.7, 0.06), dark, Math.sin((k * Math.PI) / 2) * 0.75, 1.5, Math.cos((k * Math.PI) / 2) * 0.75, -0.15, (k * Math.PI) / 2, 0); void sc; A(new THREE.PlaneGeometry(0.9, 0.6), emis(0x7fe0ff, 0.65), Math.sin((k * Math.PI) / 2) * 0.79, 1.5, Math.cos((k * Math.PI) / 2) * 0.79, -0.15, (k * Math.PI) / 2, 0); }
  const ks = textSprite('INFORMATION', { width: 1.6, size: 28 }); ks.position.set(0, 2.5, 0); g.add(ks);
  const leaf = mat(0x2f6a34, { roughness: 0.8 }), leaf2 = mat(0x4a8a3a, { roughness: 0.8 });
  for (const [x, z] of [[6, -5.5], [6, 4.5], [-6, -5.5], [-6, 4.5]]) { A(new THREE.BoxGeometry(2, 0.7, 2), dark, x, 0.35, z); for (let k = 0; k < 7; k++) A(new THREE.SphereGeometry(0.35 + Math.random() * 0.25, 8, 6), k % 2 ? leaf : leaf2, x + (Math.random() - 0.5) * 1.3, 1.0 + Math.random() * 0.6, z + (Math.random() - 0.5) * 1.3); A(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 6), mat(0x4a3424), x, 1.3, z); }
  for (const [x, z, ry] of [[3, 0, Math.PI / 2], [-3, 0, Math.PI / 2]]) { A(new THREE.BoxGeometry(2.2, 0.08, 0.6), wood, x, 0.48, z, 0, ry); for (const d of [-0.9, 0.9]) A(new THREE.BoxGeometry(0.08, 0.46, 0.5), steel, x, 0.23, z + d, 0, 0); }
  // overhead route board: the next ports and their routes
  const rb = planeLabel(`DEPARTURES · ${WAYPOINTS.map((w) => w.name.split(',')[0].toUpperCase()).join('  ·  ')}`, 9, 0.55, { size: 38, bg: '#0a0e14', color: '#ffd27a' }); rb.position.set(0, 4.9, -D / 2 + 0.5); g.add(rb);
  // the people
  const people = {};
  for (const n of npcs) {
    const av = buildAvatar(n.color); av.setSuit(false); av.group.position.set(n.x, 0, n.z); av.group.rotation.y = n.yaw; g.add(av.group);
    av.item.visible = false;
    const tag = textSprite(`${n.name} · ${n.title}`, { width: Math.min(2.6, 0.06 * (n.name.length + n.title.length) + 0.5), size: 26 }); tag.position.set(0, 2.25, 0); av.group.add(tag);
    av.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    people[n.id] = { av, n, tag };
  }
  g.userData.people = people;
  g.userData.tick = (now, camPos) => {
    if (g.userData.holo) g.userData.holo.rotation.x = now * 0.6;
    for (const { av, n, tag } of Object.values(people)) {
      if (n.role === 'ambient') { // wander a slow loop round the concourse
        const ph = now * 0.12 + (n.id === 'walker1' ? 0 : Math.PI), rx = n.id === 'walker1' ? 9 : 7, rz = n.id === 'walker1' ? 8 : 9;
        av.group.position.set(Math.cos(ph) * rx, 0, Math.sin(ph) * rz);
        av.group.rotation.y = -ph - Math.PI;
        av.animate(now * 6, 1);
      } else {
        // face whoever comes close, otherwise idle
        if (camPos) { const lx = camPos.x - STATION_ORIGIN.x - av.group.position.x, lz = camPos.z - STATION_ORIGIN.z - av.group.position.z; if (Math.hypot(lx, lz) < 7) { const want = Math.atan2(lx, lz); av.group.rotation.y += (want - av.group.rotation.y) * 0.05; } }
        av.animate(0, 0); av.group.position.y = Math.sin(now * 1.3 + n.x) * 0.006;
      }
      tag.visible = !camPos || camPos.distanceTo(av.group.position.clone().add(STATION_ORIGIN)) < 9;
    }
  };
  return g;
}
