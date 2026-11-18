// Hand-held items, modelled properly: what you carry, what lies on the deck or floats about in zero-g.
// All sizes in metres; each model sits with its base at y = 0 and its "front" toward +z.
import * as THREE from 'three';
import { mat, metal, emis, PAL } from './models.js';

const IM = {};
function itemTex(key, w, h, draw) {
  if (IM[key]) return IM[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return (IM[key] = t);
}
const labelMat = (key, w, h, draw) => new THREE.MeshStandardMaterial({ map: itemTex(key, w, h, draw), roughness: 0.6 });
function im(geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; return o; }

export function buildItemModel(type) {
  const g = new THREE.Group();
  const A = (...a) => { const o = im(...a); g.add(o); return o; };
  const dark = mat(PAL.dark, { roughness: 0.6, metalness: 0.3 }), steel = metal(0xb0b6bc), black = mat(0x15181c, { roughness: 0.8 });
  switch (type) {
    case 'ext': { // CO2 extinguisher: red cylinder, label band, valve head with lever and gauge, horn on a hose
      const red = mat(0xc22a22, { roughness: 0.35, metalness: 0.2 });
      A(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 20), red, 0, 0.23, 0);
      A(new THREE.SphereGeometry(0.075, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 0.44, 0);
      A(new THREE.CylinderGeometry(0.077, 0.077, 0.14, 20), labelMat('extLbl', 256, 64, (c, w, h) => { c.fillStyle = '#f2efe6'; c.fillRect(0, 0, w, h); c.fillStyle = '#c22a22'; c.font = 'bold 30px sans-serif'; c.fillText('CO₂  FIRE', 14, 40); c.fillStyle = '#222'; c.font = '12px monospace'; c.fillText('CLASS B/C · 2.3 kg · PULL PIN', 14, 58); }), 0, 0.22, 0);
      A(new THREE.CylinderGeometry(0.028, 0.034, 0.06, 12), steel, 0, 0.5, 0);
      A(new THREE.BoxGeometry(0.05, 0.05, 0.09), black, 0, 0.55, 0.01);
      A(new THREE.BoxGeometry(0.03, 0.012, 0.16), steel, 0, 0.59, 0.05, -0.25);           // lever
      A(new THREE.BoxGeometry(0.03, 0.012, 0.14), steel, 0, 0.555, 0.06);               // handle
      A(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 14), mat(0xf2f2f2), 0.036, 0.55, 0.0, 0, 0, Math.PI / 2); // gauge
      A(new THREE.TorusGeometry(0.012, 0.003, 6, 10), mat(0xe8c040), -0.03, 0.57, 0.03);  // pull pin
      const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.54, -0.03), new THREE.Vector3(0, 0.5, -0.1), new THREE.Vector3(0, 0.3, -0.11), new THREE.Vector3(0.0, 0.12, -0.09)]), 16, 0.012, 6), black); g.add(hose);
      A(new THREE.ConeGeometry(0.035, 0.1, 12, 1, true), black, 0, 0.08, -0.09, Math.PI);
      break;
    }
    case 'patch': { // hull patch kit: a grey hard case, yellow-black hazard edge, latches, carry handle
      const caseM = mat(0x8d97a3, { roughness: 0.45, metalness: 0.3 });
      A(new THREE.BoxGeometry(0.44, 0.13, 0.32), caseM, 0, 0.065, 0);
      A(new THREE.BoxGeometry(0.445, 0.02, 0.325), mat(0x5c6570), 0, 0.12, 0);
      A(new THREE.BoxGeometry(0.42, 0.003, 0.3), labelMat('patchLid', 256, 192, (c, w, h) => { c.fillStyle = '#8d97a3'; c.fillRect(0, 0, w, h); for (let i = -h; i < w; i += 24) { c.fillStyle = '#e8c040'; c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 12, 0); c.lineTo(i + 12 + h, h); c.lineTo(i + h, h); c.fill(); } c.fillStyle = '#8d97a3'; c.fillRect(14, 14, w - 28, h - 28); c.fillStyle = '#15181c'; c.font = 'bold 30px sans-serif'; c.fillText('HULL PATCH', 34, 80); c.font = '14px monospace'; c.fillText('KEVLAR/EPOXY · 0.5 m²', 34, 108); c.fillText('CURE 90 s · VACUUM RATED', 34, 130); }), 0, 0.131, 0);
      for (const x of [-0.13, 0.13]) A(new THREE.BoxGeometry(0.05, 0.04, 0.02), steel, x, 0.1, 0.165);
      A(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), black, 0, 0.13, 0.17, 0, 0, 0);
      break;
    }
    case 'medkit': { // trauma kit: white soft-sided bag, red cross, zips, side pockets, a strap
      const bag = mat(0xf2f0ea, { roughness: 0.85 });
      A(new THREE.BoxGeometry(0.38, 0.18, 0.24), bag, 0, 0.09, 0);
      for (const s of [-1, 1]) A(new THREE.BoxGeometry(0.06, 0.12, 0.18), bag, s * 0.215, 0.07, 0);
      A(new THREE.BoxGeometry(0.12, 0.004, 0.035), mat(0xc22a22), 0, 0.182, 0); A(new THREE.BoxGeometry(0.035, 0.004, 0.12), mat(0xc22a22), 0, 0.182, 0);
      A(new THREE.BoxGeometry(0.385, 0.006, 0.006), dark, 0, 0.17, 0.12); A(new THREE.BoxGeometry(0.385, 0.006, 0.006), dark, 0, 0.17, -0.12);
      A(new THREE.BoxGeometry(0.02, 0.03, 0.01), steel, 0.12, 0.17, 0.125);
      A(new THREE.TorusGeometry(0.09, 0.012, 6, 14, Math.PI), black, 0, 0.18, 0);
      break;
    }
    case 'cartridge': { // LiOH scrubber canister: brushed steel with grip ribs, end caps, a colour band and a QR placard
      const can = metal(0xc8ccd0), green = mat(0x3fae86);
      A(new THREE.CylinderGeometry(0.085, 0.085, 0.4, 24), can, 0, 0.2, 0);
      for (let i = 0; i < 6; i++) A(new THREE.TorusGeometry(0.087, 0.006, 6, 24), can, 0, 0.06 + i * 0.055, 0, Math.PI / 2);
      for (const y of [0.0, 0.4]) A(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 24), dark, 0, y + (y ? -0.005 : 0.012), 0);
      A(new THREE.CylinderGeometry(0.088, 0.088, 0.05, 24), green, 0, 0.33, 0);
      A(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), steel, 0, 0.42, 0);
      A(new THREE.PlaneGeometry(0.09, 0.07), labelMat('cartLbl', 128, 96, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#000'; for (let i = 0; i < 60; i++) if (Math.random() < 0.5) c.fillRect(6 + (i % 8) * 6, 6 + Math.floor(i / 8) * 6, 6, 6); c.font = 'bold 14px monospace'; c.fillText('LiOH', 62, 24); c.font = '10px monospace'; c.fillText('CO2 SCRUB', 58, 44); c.fillText('S/N 4471', 58, 60); }), 0, 0.18, 0.0865);
      break;
    }
    case 'tablet': { // the rugged maintenance tablet: bumpers, screen, strap, stylus
      const body = mat(0x3a4a3a, { roughness: 0.7 }), bump = mat(0xe07a2a, { roughness: 0.8 });
      A(new THREE.BoxGeometry(0.3, 0.022, 0.21), body, 0, 0.011, 0);
      for (const [x, z] of [[-0.15, -0.105], [0.15, -0.105], [-0.15, 0.105], [0.15, 0.105]]) A(new THREE.BoxGeometry(0.04, 0.03, 0.04), bump, x, 0.014, z);
      A(new THREE.PlaneGeometry(0.24, 0.16), new THREE.MeshBasicMaterial({ map: itemTex('tabScr', 128, 96, (c, w, h) => { c.fillStyle = '#020803'; c.fillRect(0, 0, w, h); c.strokeStyle = '#2fbf4a'; c.lineWidth = 1; for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(64, 48, 40 - i * 2, 12, 0, 0, 7); c.stroke(); } c.fillStyle = '#39ff6a'; c.font = '9px monospace'; c.fillText('SYS OK', 6, 12); c.fillStyle = '#ffc030'; c.fillRect(70, 40, 5, 5); }) }), 0, 0.0225, 0, -Math.PI / 2);
      A(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), dark, 0.162, 0.015, 0, Math.PI / 2);
      break;
    }
    default: { // the old universal spare kit: a battered toolbox
      const tb = mat(0xd8a020, { roughness: 0.5, metalness: 0.3 });
      A(new THREE.BoxGeometry(0.42, 0.18, 0.2), tb, 0, 0.09, 0);
      A(new THREE.BoxGeometry(0.43, 0.03, 0.21), mat(0xa87818), 0, 0.17, 0);
      A(new THREE.TorusGeometry(0.08, 0.012, 6, 12, Math.PI), black, 0, 0.19, 0);
      for (const x of [-0.16, 0.16]) A(new THREE.BoxGeometry(0.04, 0.05, 0.015), steel, x, 0.15, 0.105);
    }
  }
  return g;
}
// held in the right hand in first person: a cached model per type
const HELD = {};
export function heldItemModel(type) { if (!HELD[type]) HELD[type] = buildItemModel(type); return HELD[type]; }
