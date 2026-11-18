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
// Atmospheres, in planet radii. Optical depths are for a vertical path through the whole atmosphere
// (tau = beta * H), taken from real values: Earth's Rayleigh tau ~ 0.05/0.11/0.27 (R/G/B), Mie ~ 0.02;
// Mars: almost no Rayleigh, dust-dominated (tau ~ 0.4, reddish single-scatter albedo); Jupiter: thin Rayleigh plus a yellowish haze.
const ATM = {
  earth: { hR: 8 / 6371, hM: 1.2 / 6371, tauR: [0.046, 0.108, 0.265], tauM: 0.021, mieAlb: [0.9, 0.9, 0.9], g: 0.76, sun: 4.2 },
  phobos: { hR: 11.1 / 3390, hM: 11.1 / 3390, tauR: [0.004, 0.008, 0.019], tauM: 0.22, mieAlb: [0.94, 0.72, 0.5], g: 0.63, sun: 4.2 },
  ganymede: { hR: 27 / 69911, hM: 27 / 69911, tauR: [0.05, 0.12, 0.29], tauM: 0.05, mieAlb: [0.95, 0.85, 0.65], g: 0.7, sun: 4.2 },
};
const vec3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

const surfVS = `varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
// Surface: sunlight arrives through the atmosphere (air-mass formula), which reddens and dims it towards the terminator.
const surfFS = `uniform sampler2D map; uniform vec3 sunDir; uniform vec3 tauR; uniform float tauM; uniform float alphaMode;
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
vec3 sunTrans(float mu){
  float z = degrees(acos(clamp(mu, -1.0, 1.0)));
  float am = 1.0 / (max(mu, 0.0) + 0.50572 * pow(max(96.07995 - z, 0.01), -1.6364)); // Kasten–Young air mass
  return exp(-(tauR + vec3(tauM * 1.1)) * min(am, 40.0));
}
void main(){
  vec4 tex = texture2D(map, vUv);
  vec3 N = normalize(vN);
  float ndl = dot(N, sunDir);
  vec3 sunCol = sunTrans(ndl) * smoothstep(-0.03, 0.02, ndl);
  vec3 col = tex.rgb * (0.012 + 1.05 * max(ndl, 0.0) * sunCol);
  gl_FragColor = vec4(col, alphaMode > 0.5 ? tex.a * (0.12 + 0.88 * length(sunCol) * 0.58) : 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
// Atmosphere: no geometry sphere. A camera-facing quad just in front of the planet covers its disc on screen,
// and every pixel ray-marches single Rayleigh + Mie scattering through the shell (16 view samples x 6 sun samples).
// Output = in-scattered light, with alpha = transmittance so the planet behind is attenuated (dst * alpha + src).
const atmVS = `uniform float topR; varying vec3 vW; varying vec3 vC; varying float vRw;
void main(){
  vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vC = c; vRw = length(modelMatrix[0].xyz);
  float R = vRw * topR;
  vec3 cv = (viewMatrix * vec4(c, 1.0)).xyz;
  float d = length(cv);
  float ang = asin(clamp(R / d, 0.0, 0.9999));
  float z = min(cv.z + R, -0.2);                      // just in front of the planet, never behind the camera
  vec3 dir = cv / d;
  vec3 ctr = dir * (z / dir.z);                       // the disc centre projected onto that depth
  float half_ = abs(z) * tan(ang) * 1.12 / max(abs(dir.z), 0.2);
  vec3 vp = ctr + vec3(position.xy * half_, 0.0);
  vW = (inverse(viewMatrix) * vec4(vp, 1.0)).xyz;
  gl_Position = projectionMatrix * vec4(vp, 1.0);
}`;
const atmFS = `uniform vec3 sunDir; uniform float topR; uniform float hR; uniform float hM; uniform vec3 betaR; uniform float betaM; uniform vec3 mieAlb; uniform float g; uniform float sunI;
varying vec3 vW; varying vec3 vC; varying float vRw;
vec2 sph(vec3 o, vec3 d, float r){ float b = dot(o, d); float c = dot(o, o) - r * r; float h = b * b - c; if (h < 0.0) return vec2(1e9, -1e9); h = sqrt(h); return vec2(-b - h, -b + h); }
void main(){
  vec3 o = (cameraPosition - vC) / vRw, d = normalize(vW - cameraPosition);
  vec2 ta = sph(o, d, topR);
  if (ta.x > ta.y) discard;
  vec2 tp = sph(o, d, 1.0);
  float t0 = max(ta.x, 0.0), t1 = tp.x > 0.0 && tp.x < tp.y ? tp.x : ta.y;
  if (t1 <= t0) discard;
  const int N = 16; const int M = 6;
  // sample more densely near the bottom of the shell along limb rays: quadratic spacing from the nearer end
  float ds = (t1 - t0) / float(N);
  vec3 sumR = vec3(0.0), sumM = vec3(0.0); vec3 tauV = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec3 p = o + d * (t0 + (float(i) + 0.5) * ds);
    float h = length(p) - 1.0;
    float dR = exp(-h / hR) * ds, dM = exp(-h / hM) * ds;
    tauV += betaR * dR + vec3(betaM * 1.1 * dM);
    vec2 tl = sph(p, sunDir, topR);
    vec2 tg = sph(p, sunDir, 1.0);
    if (tg.x > 0.0 && tg.x < tg.y) continue;          // this sample is in the planet's shadow
    float ls = tl.y / float(M); float lR = 0.0, lM = 0.0;
    for (int j = 0; j < M; j++) { float hh = length(p + sunDir * ((float(j) + 0.5) * ls)) - 1.0; lR += exp(-hh / hR) * ls; lM += exp(-hh / hM) * ls; }
    vec3 att = exp(-(tauV + betaR * lR + vec3(betaM * 1.1 * lM)));
    sumR += att * dR; sumM += att * dM;
  }
  float mu = dot(d, sunDir);
  float pR = 0.0596831 * (1.0 + mu * mu);
  float g2 = g * g;
  float pM = 0.1193662 * (1.0 - g2) * (1.0 + mu * mu) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5));
  vec3 L = sunI * (sumR * betaR * pR + sumM * betaM * mieAlb * pM);
  vec3 T = exp(-tauV);
  gl_FragColor = vec4(L, dot(T, vec3(0.3333)));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function buildPlanet(kind) {
  const sun = new THREE.Vector3(-0.6, 0.35, 0.72).normalize();
  const atm = ATM[kind];
  const res = kind === 'earth' ? [640, 320] : [512, 256];
  const map = sphereCanvas('s-' + kind, res[0], res[1], SURF[kind] || SURF.luna);
  const g = new THREE.Group();
  const tauR = atm ? vec3(atm.tauR) : new THREE.Vector3(), tauM = atm ? atm.tauM : 0;
  const mk = (tex, r, alpha) => new THREE.Mesh(new THREE.SphereGeometry(r, 64, 32), new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, sunDir: { value: sun }, tauR: { value: tauR }, tauM: { value: tauM }, alphaMode: { value: alpha ? 1 : 0 } },
    vertexShader: surfVS, fragmentShader: surfFS, transparent: !!alpha, depthWrite: !alpha,
  }));
  const surface = mk(map, 1, false); g.add(surface);
  // cloud deck sits inside the atmosphere (a few km up), so it is lit and hazed by it
  if (CLOUDS[kind]) { const cl = mk(sphereCanvas('c-' + kind, 512, 256, CLOUDS[kind]), 1 + (atm ? atm.hR * 0.9 : 0.004), true); g.add(cl); g.userData.clouds = cl; }
  if (atm) {
    const top = 1 + Math.max(atm.hR, atm.hM) * 10;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: {
        sunDir: { value: sun }, topR: { value: top }, hR: { value: atm.hR }, hM: { value: atm.hM },
        betaR: { value: tauR.clone().divideScalar(atm.hR) }, betaM: { value: atm.tauM / atm.hM },
        mieAlb: { value: vec3(atm.mieAlb) }, g: { value: atm.g }, sunI: { value: atm.sun },
      },
      vertexShader: atmVS, fragmentShader: atmFS, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    }));
    quad.frustumCulled = false; quad.renderOrder = 2;
    g.add(quad); g.userData.atmosphere = quad;
  }
  g.userData.sun = sun;
  g.userData.setSun = (v) => { sun.copy(v).normalize(); };
  g.userData.tick = (now) => { surface.rotation.y = now * 0.002; if (g.userData.clouds) g.userData.clouds.rotation.y = now * 0.0032; };
  return g;
}
