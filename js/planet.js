// Planets and moons: procedural surfaces, day/night terminator, Rayleigh-style limb scattering,
// and an fbm cloud layer (3D noise sampled on the sphere, so no seams or pole pinching).
import * as THREE from 'three';

// ---------- 3D value noise / fbm ----------
function hash(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h & 0xffff) / 0xffff;
}
function vnoise(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz, seed);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x, y, z, oct, seed) { let a = 0.5, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f, seed + i * 17); n += a; a *= 0.5; f *= 2.03; } return s / n; }

const CACHE = {};
function sphereCanvas(key, W, H, fn) {
  if (CACHE[key]) return CACHE[key];
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let j = 0; j < H; j++) {
    const lat = (0.5 - (j + 0.5) / H) * Math.PI, cl = Math.cos(lat), y = Math.sin(lat);
    for (let i = 0; i < W; i++) {
      const lon = ((i + 0.5) / W) * Math.PI * 2;
      const rgba = fn(Math.cos(lon) * cl, y, Math.sin(lon) * cl, lat);
      const o = (j * W + i) * 4; d[o] = rgba[0]; d[o + 1] = rgba[1]; d[o + 2] = rgba[2]; d[o + 3] = rgba[3] ?? 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return (CACHE[key] = t);
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const sat = (t) => Math.max(0, Math.min(1, t));

const SURF = {
  earth: (x, y, z, lat) => {
    const wx = fbm(x * 1.5 + 9, y * 1.5, z * 1.5, 3, 5) - 0.5;
    const h = fbm(x * 2.2 + wx, y * 2.2 + wx, z * 2.2, 6, 11);
    const ice = Math.abs(lat) > 1.2 - 0.15 * fbm(x * 6, y * 6, z * 6, 3, 3);
    if (ice) return [236, 242, 248];
    if (h < 0.52) { const t = sat((0.52 - h) * 6); return mix([40, 105, 160], [10, 38, 92], t); }
    const t = sat((h - 0.52) * 5), dry = fbm(x * 4, y * 4, z * 4, 4, 23);
    const green = mix([62, 112, 48], [40, 82, 38], t), desert = [178, 152, 104];
    return mix(green, desert, sat((dry - 0.5) * 3 + (0.35 - Math.abs(lat)) * 1.2));
  },
  luna: (x, y, z) => { const h = fbm(x * 3, y * 3, z * 3, 6, 41), m = fbm(x * 1.4, y * 1.4, z * 1.4, 4, 7); const k = 120 + (h - 0.5) * 120 - (m > 0.56 ? 38 : 0); return [k, k, k * 0.98]; },
  phobos: (x, y, z, lat) => { // Mars as seen from Phobos Station
    if (Math.abs(lat) > 1.32) return [236, 230, 222];
    const h = fbm(x * 2.5, y * 2.5, z * 2.5, 6, 61), dark = fbm(x * 1.6 + 4, y * 1.6, z * 1.6, 4, 13);
    return mix(mix([190, 98, 58], [150, 72, 44], sat((h - 0.45) * 3)), [96, 52, 36], sat((dark - 0.58) * 4));
  },
  ceres: (x, y, z) => { const h = fbm(x * 3, y * 3, z * 3, 6, 71); const k = 92 + (h - 0.5) * 90; const spot = fbm(x * 9, y * 9, z * 9, 2, 5) > 0.82 ? 120 : 0; return [k + spot, k * 0.96 + spot, k * 0.9 + spot]; },
  ganymede: (x, y, z, lat) => { // Jupiter: turbulent zonal bands
    const turb = (fbm(x * 3, y * 3, z * 3, 5, 91) - 0.5) * 0.35;
    const b = Math.sin((y + turb) * 15), b2 = Math.sin((y + turb * 0.5) * 37);
    const base = mix([214, 186, 150], [160, 112, 78], sat(b * 0.5 + 0.5));
    const c = mix(base, [236, 224, 206], sat(b2 * 0.4));
    const spot = Math.hypot(Math.atan2(z, x) - 1.2, (lat + 0.38) * 2.2);
    return spot < 0.16 ? mix([196, 94, 66], c, spot / 0.16) : c;
  },
};
const CLOUDS = {
  earth: (x, y, z, lat) => {
    const w = fbm(x * 2 + 3, y * 2, z * 2, 3, 101) * 1.6;
    const n = fbm(x * 3.2 + w, y * 5.2 + w, z * 3.2, 6, 113);
    const band = 0.08 * Math.cos(lat * 6); // storm tracks + ITCZ
    const a = sat((n + band - 0.5) * 3.2);
    return [255, 255, 255, a * 235];
  },
  phobos: (x, y, z) => { const n = fbm(x * 4, y * 4, z * 4, 5, 131); return [255, 236, 220, sat((n - 0.62) * 3) * 120]; },
};
const ATM = {
  earth: { color: new THREE.Color(0.35, 0.6, 1.0), strength: 1.3, halo: 1.0 },
  phobos: { color: new THREE.Color(1.0, 0.62, 0.45), strength: 0.45, halo: 0.45 },
  ganymede: { color: new THREE.Color(1.0, 0.85, 0.65), strength: 0.6, halo: 0.5 },
};

const surfVS = `varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const surfFS = `uniform sampler2D map; uniform vec3 sunDir; uniform vec3 atmColor; uniform float atmStrength; uniform float alphaMode;
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main(){
  vec4 tex = texture2D(map, vUv);
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float ndl = dot(N, sunDir);
  float day = smoothstep(-0.08, 0.3, ndl);
  vec3 col = tex.rgb * (0.025 + 1.15 * max(ndl, 0.0) * 0.9 + 0.1 * day);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  col += atmColor * rim * atmStrength * smoothstep(-0.25, 0.35, ndl);
  col = mix(col, col * vec3(1.0, 0.82, 0.7), (1.0 - smoothstep(0.0, 0.25, ndl)) * day * 0.6 * step(0.01, atmStrength)); // reddened terminator
  gl_FragColor = vec4(col, alphaMode > 0.5 ? tex.a * (0.15 + 0.85 * day) : 1.0);
  #include <colorspace_fragment>
}`;
const haloFS = `uniform vec3 sunDir; uniform vec3 atmColor; uniform float strength; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float f = pow(clamp(1.0 + dot(N, V) * 1.0, 0.0, 1.0), 3.0) * 0.0;
  float edge = pow(max(0.0, 1.0 - abs(dot(N, V))), 5.0);
  float lit = smoothstep(-0.35, 0.4, dot(N, sunDir));
  gl_FragColor = vec4(atmColor * edge * lit * strength * 1.4 + f, 1.0);
  #include <colorspace_fragment>
}`;

export function buildPlanet(kind) {
  const sun = new THREE.Vector3(-0.6, 0.35, 0.72).normalize();
  const atm = ATM[kind] || { color: new THREE.Color(0, 0, 0), strength: 0, halo: 0 };
  const res = kind === 'earth' ? [640, 320] : [512, 256];
  const map = sphereCanvas('s-' + kind, res[0], res[1], SURF[kind] || SURF.luna);
  const g = new THREE.Group();
  const mk = (tex, r, alpha) => new THREE.Mesh(new THREE.SphereGeometry(r, 64, 32), new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, sunDir: { value: sun }, atmColor: { value: atm.color }, atmStrength: { value: atm.strength * (alpha ? 0.4 : 1) }, alphaMode: { value: alpha ? 1 : 0 } },
    vertexShader: surfVS, fragmentShader: surfFS, transparent: !!alpha, depthWrite: !alpha,
  }));
  const surface = mk(map, 1, false); g.add(surface);
  if (CLOUDS[kind]) { const cl = mk(sphereCanvas('c-' + kind, 512, 256, CLOUDS[kind]), 1.012, true); g.add(cl); g.userData.clouds = cl; }
  if (atm.halo > 0) {
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 32), new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: sun }, atmColor: { value: atm.color }, strength: { value: atm.halo } },
      vertexShader: surfVS, fragmentShader: haloFS, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    g.add(halo);
  }
  g.userData.sun = sun;
  g.userData.setSun = (v) => { sun.copy(v).normalize(); };
  g.userData.tick = (now) => { surface.rotation.y = now * 0.002; if (g.userData.clouds) g.userData.clouds.rotation.y = now * 0.0032; };
  return g;
}
