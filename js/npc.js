// NPC ships and orbital stations (units: metres; ships point their nose along -Z, stations' docking port faces +Z at the origin).
import * as THREE from 'three';
import { PAL, mat, metal, texMat, goldMat, mliTex, solarTex, radiatorTex, struts, textSprite } from './models.js';

const glowMat = (c, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) });
function npcAdd(g) { return (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; }; }
function plumeMesh(len, rad, color = 0xffb27a) {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(rad, len, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  outer.rotation.x = -Math.PI / 2; outer.position.z = len / 2; g.add(outer);
  const core = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.35, len * 0.6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.rotation.x = -Math.PI / 2; core.position.z = len * 0.3; g.add(core);
  g.visible = false;
  return g;
}

// ---------------- hostile ships ----------------
export function buildShip(type) {
  const g = new THREE.Group();
  const add = npcAdd(g);
  const plumes = [];
  const muzzle = new THREE.Object3D();
  if (type === 'drone') { // autonomous mining drone: yellow box, drill head, four thrusters
    const yel = mat(0xd8a420), dark = mat(0x2a2d31);
    add(new THREE.BoxGeometry(4, 3, 7), yel, 0, 0, 0);
    add(new THREE.BoxGeometry(4.2, 0.4, 7.2), dark, 0, 1.0, 0);
    add(new THREE.ConeGeometry(1.4, 4, 10), metal(0x8a8f96), 0, 0, -5.5, -Math.PI / 2);
    for (const [x, y] of [[-1.6, -1.1], [1.6, -1.1], [-1.6, 1.1], [1.6, 1.1]]) { add(new THREE.CylinderGeometry(0.4, 0.55, 1.2, 8), dark, x, y, 3.9, Math.PI / 2); const p = plumeMesh(10, 0.6, 0xffd090); p.position.set(x, y, 4.5); g.add(p); plumes.push(p); }
    add(new THREE.SphereGeometry(0.3, 8, 6), glowMat(0xff3020), 0, 1.7, 2).userData.blink = true;
    add(new THREE.BoxGeometry(3, 2, 0.1), texMat(solarTex([1, 1])), 0, 2.4, 0, -0.3);
    muzzle.position.set(0, 0, -7.5);
  } else {
    const hullC = type === 'gunship' ? 0x55603f : 0x3e4248, stripe = type === 'gunship' ? 0xd8b030 : 0xa8321e;
    const hull = mat(hullC, { roughness: 0.6, metalness: 0.35 }), dark = mat(0x1e2126), str = mat(stripe), rad = new THREE.MeshStandardMaterial({ map: radiatorTex([1, 2]), color: 0x8a8f96, roughness: 0.5, metalness: 0.3 });
    const L = type === 'frigate' ? 110 : type === 'gunship' ? 80 : 58;
    const R = type === 'frigate' ? 9 : type === 'gunship' ? 8 : 5.5;
    if (type === 'gunship') { // wedge hull
      const w = add(new THREE.BoxGeometry(R * 2.2, R * 1.1, L * 0.8), hull, 0, 0, 0); w.scale.set(1, 1, 1);
      const nose = add(new THREE.ConeGeometry(R * 1.1, L * 0.3, 4), hull, 0, 0, -L * 0.55, -Math.PI / 2, 0, Math.PI / 4); nose.scale.set(1.4, 1, 0.55);
      add(new THREE.BoxGeometry(R * 2.3, 0.6, L * 0.5), str, 0, R * 0.56, 0);
    } else {
      add(new THREE.CylinderGeometry(R, R, L * 0.7, 6), hull, 0, 0, 0, Math.PI / 2, 0, Math.PI / 6);
      add(new THREE.ConeGeometry(R, L * 0.22, 6), hull, 0, 0, -L * 0.46, -Math.PI / 2, 0, Math.PI / 6);
      add(new THREE.CylinderGeometry(R * 1.02, R * 1.02, 2.2, 6), str, 0, 0, -L * 0.15, Math.PI / 2, 0, Math.PI / 6);
      add(new THREE.BoxGeometry(R * 0.8, R * 0.5, L * 0.18), dark, 0, R * 0.8, -L * 0.25); // bridge blister
      add(new THREE.BoxGeometry(R * 0.7, 0.05, L * 0.08), glowMat(0xffc070, 0.8), 0, R * 1.06, -L * 0.3);
    }
    // spinal railgun barrel out of the nose
    add(new THREE.BoxGeometry(1.4, 1.4, L * 0.55), metal(0x60656c), 0, type === 'gunship' ? R * 0.9 : 0, -L * 0.6);
    muzzle.position.set(0, type === 'gunship' ? R * 0.9 : 0, -L * 0.88);
    // radiator fins
    for (const s of [-1, 1]) {
      const fin = add(new THREE.BoxGeometry(0.3, R * 2.2, L * 0.32), rad, s * R * 1.25, 0, L * 0.12);
      fin.rotation.z = s * 0.25;
    }
    if (type === 'frigate') for (const s of [-1, 1]) add(new THREE.BoxGeometry(R * 2.8, 0.3, L * 0.22), rad, s * R * 2.4, 0, L * 0.05);
    // PDC turrets and torpedo cells
    for (const [x, y, z] of [[0, R, -L * 0.05], [0, -R, L * 0.1], ...(type === 'frigate' ? [[R, 0, -L * 0.2], [-R, 0, -L * 0.2]] : [])]) {
      add(new THREE.SphereGeometry(1.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), metal(0x777c84), x, y, z, y < 0 ? Math.PI : 0);
    }
    for (let i = 0; i < (type === 'frigate' ? 6 : 3); i++) add(new THREE.BoxGeometry(1.2, 1.2, 0.2), dark, (i % 2 ? 1 : -1) * R * 0.6, -R * 0.4, -L * 0.1 + i * 3);
    // drive section
    const nEng = type === 'frigate' ? 3 : type === 'gunship' ? 2 : 1;
    for (let i = 0; i < nEng; i++) {
      const x = nEng === 1 ? 0 : nEng === 2 ? (i ? 1 : -1) * R * 0.55 : (i - 1) * R * 0.75;
      add(new THREE.CylinderGeometry(R * 0.35, R * 0.55, L * 0.12, 12, 1, true), metal(0x34373c, { side: THREE.DoubleSide }), x, 0, L * 0.4, Math.PI / 2);
      const p = plumeMesh(L * 1.1, R * 0.7); p.position.set(x, 0, L * 0.46); g.add(p); plumes.push(p);
    }
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.4, 8, 6), glowMat(s < 0 ? 0xff3030 : 0x30ff60), s * R * 1.3, 0, -L * 0.1).userData.blink = true;
  }
  g.add(muzzle);
  g.userData = { plumes, muzzle, type };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------- stations ----------------
// Centreline docking target (ISS style): a black cross on a standoff in front of a white backplate.
// Aligned when the cross sits in the middle of the plate's circle as seen from our docking camera (port + 1.5 m up).
export function dockingTarget() {
  const g = new THREE.Group();
  const add = npcAdd(g);
  add(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }), 0, 0, 0);
  add(new THREE.RingGeometry(0.3, 0.33, 32), new THREE.MeshBasicMaterial({ color: 0x111111 }), 0, 0, 0.005);
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), new THREE.MeshBasicMaterial({ color: 0x222222 }), 0, 0, 0.25, Math.PI / 2);
  const cross = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
  add(new THREE.BoxGeometry(0.34, 0.05, 0.02), cross, 0, 0, 0.5);
  add(new THREE.BoxGeometry(0.05, 0.34, 0.02), cross, 0, 0, 0.5);
  add(new THREE.BoxGeometry(0.06, 0.06, 0.06), glowMat(0xffffff), 0, 0.17, 0.5);
  return g;
}
const STATIONS = {
  luna: { name: 'SHACKLETON YARD', ring: 0, yard: true, mods: 5, color: 0x2e5b96 },
  phobos: { name: 'PHOBOS STATION', ring: 0, yard: false, mods: 4, color: 0xc0392b },
  ceres: { name: 'PIAZZI DOCK', ring: 46, yard: false, mods: 3, color: 0xd8a420 },
  ganymede: { name: 'NICHOLSON PORT', ring: 70, yard: false, mods: 6, color: 0x3aa060, ring2: true },
};
export function buildStation(id) {
  const P = STATIONS[id] || STATIONS.luna;
  const g = new THREE.Group();
  const add = npcAdd(g);
  const white = mat(PAL.white), grey = mat(PAL.grey), dark = mat(PAL.dark), rail = mat(PAL.rail), acc = mat(P.color);
  const mli = (rx, ry) => texMat(mliTex([rx, ry]));
  // docking port module: axis along +Z, mating face at z = 0
  add(new THREE.CylinderGeometry(1.7, 1.7, 7, 24), mli(2, 1), 0, 0, -3.5, Math.PI / 2);
  add(new THREE.TorusGeometry(1.75, 0.18, 8, 28), metal(0x9aa0a8), 0, 0, -0.05);
  add(new THREE.CircleGeometry(1.55, 24), metal(0x7a8088), 0, 0, -0.02);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + Math.PI / 2; add(new THREE.BoxGeometry(0.25, 0.5, 0.45), metal(0xc8ccd0), Math.cos(a) * 1.55, Math.sin(a) * 1.55, 0.18); } // guide petals
  const tgt = dockingTarget(); tgt.position.set(0, 1.5, -0.04); g.add(tgt);
  const blink = [];
  for (const [x, y, c] of [[-1.9, -0.9, 0xff2a20], [1.9, -0.9, 0x20ff60], [0, -2.0, 0xffffff]]) { const b = add(new THREE.SphereGeometry(0.12, 8, 6), glowMat(c), x, y, -0.3); b.userData.blink = c; blink.push(b); }
  // core node and modules
  add(new THREE.SphereGeometry(4.2, 24, 16), mli(3, 2), 0, 0, -11);
  add(new THREE.CylinderGeometry(3.6, 3.6, 18, 28), mli(4, 2), 0, 0, -24, Math.PI / 2);
  for (let i = 0; i < P.mods; i++) {
    const a = (i / P.mods) * Math.PI * 2;
    const m = add(new THREE.CylinderGeometry(2.6, 2.6, 14, 24), mli(3, 1), Math.cos(a) * 10, Math.sin(a) * 10, -11 - (i % 2) * 5, 0, 0, a + Math.PI / 2);
    m.rotation.set(0, 0, a - Math.PI / 2);
    add(new THREE.CylinderGeometry(2.62, 2.62, 1.0, 24), acc, Math.cos(a) * 14, Math.sin(a) * 14, -11 - (i % 2) * 5, 0, 0, a - Math.PI / 2);
  }
  // main truss with solar arrays and radiators
  const tL = 90, S = [];
  for (let z = -33; z > -33 - tL; z -= 6) for (const [x, y] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) S.push([x, y, z, x, y, z - 6, 0.25]);
  for (let z = -33; z > -33 - tL; z -= 6) { S.push([-2, -2, z, 2, 2, z - 6, 0.15]); S.push([2, -2, z, -2, 2, z - 6, 0.15]); }
  g.add(struts(S, mat(0xc8ccd0)));
  for (const zz of [-50, -90]) for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.3, 0.3, 30, 8), grey, s * 17, 0, zz, 0, 0, Math.PI / 2);
    for (const dz of [-3.3, 3.3]) add(new THREE.BoxGeometry(30, 0.06, 5.8), texMat(solarTex([4, 1]), { metalness: 0.4, roughness: 0.35 }), s * 18, 0, zz + dz);
  }
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.15, 18, 12), new THREE.MeshStandardMaterial({ map: radiatorTex([1, 2]), roughness: 0.55 }), s * 3, s * 11, -72);
  if (P.yard) { // shipyard: an open construction cage with a hull being built
    const C = [];
    for (let z = -120; z > -200; z -= 10) for (const [x, y] of [[-14, -14], [14, -14], [14, 14], [-14, 14]]) { C.push([x, y, z, x, y, z - 10, 0.45]); }
    for (let z = -120; z >= -200; z -= 10) { C.push([-14, -14, z, 14, -14, z, 0.35]); C.push([14, -14, z, 14, 14, z, 0.35]); C.push([14, 14, z, -14, 14, z, 0.35]); C.push([-14, 14, z, -14, -14, z, 0.35]); }
    g.add(struts(C, mat(0xd8b040)));
    add(new THREE.CylinderGeometry(8, 8, 50, 24, 1, true), mli(6, 3), 0, 0, -165, Math.PI / 2);
    for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.6, 0.6, 0.6), glowMat(0xffe0a0), -13 + (i % 2) * 26, -13 + Math.floor(i / 2) * 13, -150 - i * 6);
  }
  if (P.ring) { // spin gravity ring on spokes
    const ring = new THREE.Group(); ring.position.z = -60; g.add(ring);
    const tor = new THREE.Mesh(new THREE.TorusGeometry(P.ring, 4.5, 14, 72), mli(24, 2)); ring.add(tor);
    for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, P.ring, 8), grey); sp.rotation.z = (i / 4) * Math.PI * 2; sp.position.set(Math.cos((i / 4) * Math.PI * 2 + Math.PI / 2) * P.ring / 2, Math.sin((i / 4) * Math.PI * 2 + Math.PI / 2) * P.ring / 2, 0); ring.add(sp); }
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const w = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.1), glowMat(0xffe6b0, 0.9)); w.position.set(Math.cos(a) * P.ring, Math.sin(a) * P.ring, 4.55); ring.add(w); }
    if (P.ring2) { const t2 = new THREE.Mesh(new THREE.TorusGeometry(P.ring * 0.62, 3.5, 12, 60), mli(18, 2)); t2.position.z = -40; ring.add(t2); }
    g.userData.ring = ring;
  }
  const label = textSprite(P.name, { width: 26, size: 40, color: '#ffe0a0' }); label.position.set(0, 14, -20); g.add(label);
  g.traverse((o) => { if (o.isMesh && o.material && !o.material.isMeshBasicMaterial) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.blink = blink; g.userData.name = P.name;
  g.userData.tick = (now) => { if (g.userData.ring) g.userData.ring.rotation.z = now * 0.08; for (const b of blink) b.visible = b.userData.blink === 0xffffff ? Math.sin(now * 9) > 0.7 : Math.sin(now * 2.2) > 0; };
  return g;
}
