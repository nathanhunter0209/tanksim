// Procedural, tileable texture generation (camo albedo, steel detail, normal maps, decals, FX sprites)
import * as THREE from 'three';

export const TEX = { size: 1024 }; // camo resolution; set lower on mobile before first build
const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function vnoise(x, y, per, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % per) + per) % per, y0 = ((iy % per) + per) % per, x1 = (x0 + 1) % per, y1 = (y0 + 1) % per;
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
// tileable fbm over unit square (u,v in [0,1)), base period `per`
export function fbm(u, v, per, oct = 4, s = 1, gain = .5) {
  let sum = 0, amp = 1, norm = 0, p = per;
  for (let o = 0; o < oct; o++) { sum += vnoise(u * p, v * p, p, s + o * 17) * amp; norm += amp; amp *= gain; p *= 2; }
  return sum / norm;
}
const canvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const hex = c => new THREE.Color(c);
function finish(c, srgb, repeat = true) {
  const t = new THREE.CanvasTexture(c); if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
}

export const CAMOS = { factory: 'Factory', desert: 'Desert tan', nato: 'NATO 3-tone', woodland: 'Woodland', urban: 'Urban splinter', digital: 'Digital' };
const camoCache = {};
export function camoTex(scheme, base) {
  const key = scheme + base + TEX.size; if (camoCache[key]) return camoCache[key];
  const S = TEX.size, c = canvas(S), g = c.getContext('2d'), id = g.createImageData(S, S), d = id.data;
  const P = {
    factory: [hex(base)], desert: [hex(0xb39a6b)],
    nato: [hex(0x434d2d), hex(0x5a4631), hex(0x1f201c)],
    woodland: [hex(0x55613a), hex(0x3a4527), hex(0x6d5a3e), hex(0x1c1d19)],
    urban: [hex(0x7b8084), hex(0x55595c), hex(0xa4a8aa), hex(0x2f3234)],
    digital: [hex(0x6b7350), hex(0x48503a), hex(0x938a66), hex(0x2c2e25)],
  }[scheme];
  // urban splinter: anisotropic voronoi seeds
  const seeds = []; if (scheme === 'urban') for (let i = 0; i < 46; i++) seeds.push([Math.random(), Math.random(), (Math.random() * 4) | 0]);
  const col = new THREE.Color();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S; let k = 0;
    if (scheme === 'nato' || scheme === 'woodland') {
      const big = scheme === 'nato' ? 3 : 5;
      const wu = u + (fbm(u, v, 4, 3, 7) - .5) * .22, wv = v + (fbm(u, v, 4, 3, 9) - .5) * .22; // domain warp
      const a = fbm(wu, wv, big, 4, 11), b = fbm(wu, wv, big, 4, 23);
      if (a > .56) k = 1; if (b > .58) k = 2;
      if (scheme === 'woodland') { const cc = fbm(wu * 1.3, wv, big + 2, 3, 31); if (cc > .62) k = 3; else if (k === 0 && b < .38) k = 1; }
    } else if (scheme === 'digital') {
      const q = 1 / 160, qu = Math.floor(u / q) * q, qv = Math.floor(v / q) * q;
      const a = fbm(qu, qv, 6, 4, 41), b = fbm(qu, qv, 6, 4, 53), c2 = fbm(qu, qv, 12, 3, 61);
      if (a > .55) k = 1; if (b > .6) k = 2; if (c2 > .66) k = 3;
    } else if (scheme === 'urban') {
      let best = 9, bk = 0; for (const [sx, sy, sk] of seeds) for (const ox of [-1, 0, 1]) for (const oy of [-1, 0, 1]) {
        const dx = u - sx - ox, dy = v - sy - oy; const r = Math.abs(dx * .8 + dy * .6) * 2.6 + Math.abs(-dx * .6 + dy * .8) * .7; // splinter metric
        if (r < best) { best = r; bk = sk; } }
      k = bk;
    }
    col.copy(P[Math.min(k, P.length - 1)]);
    // tonal weathering: sun fade, fine mottle, faint vertical rain streaks (v axis = world up on sides)
    const fade = fbm(u, v, 3, 3, 71), mott = fbm(u, v, 24, 3, 83), streak = fbm(u * 1, v * .05, 64, 2, 97);
    const m = .9 + fade * .16 + (mott - .5) * .1 - Math.max(0, streak - .62) * .35;
    const i = (y * S + x) * 4; d[i] = Math.min(255, col.r * 255 * m); d[i + 1] = Math.min(255, col.g * 255 * m); d[i + 2] = Math.min(255, col.b * 255 * m); d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  if (scheme === 'digital') { /* crisp pixels look better unfiltered at distance */ }
  return camoCache[key] = finish(c, true);
}

// Detail set: RGBA = height, roughness variation, chip mask, dirt mask; + derived normal map
const detCache = {};
export function detailSet(kind = 'rolled') {
  if (detCache[kind]) return detCache[kind];
  const S = 512, c = canvas(S), g = c.getContext('2d'), id = g.createImageData(S, S), d = id.data, H = new Float32Array(S * S);
  const pits = []; if (kind === 'cast') for (let i = 0; i < 900; i++) pits.push([Math.random() * S, Math.random() * S, 1 + Math.random() * 3.5]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    let h = kind === 'cast' ? fbm(u, v, 8, 5, 3) * .7 + fbm(u, v, 32, 3, 5) * .3 : fbm(u, v, 16, 3, 3) * .6 + fbm(u, v, 64, 2, 6) * .4;
    H[y * S + x] = h;
    const i = (y * S + x) * 4;
    d[i + 1] = 255 * Math.min(1, Math.max(0, .35 + fbm(u, v, 12, 4, 13) * .5 + (h - .5) * .4));
    const chip = fbm(u, v, 24, 4, 19, .6); d[i + 2] = 255 * Math.min(1, Math.max(0, (chip - .45) * 3.2));
    d[i + 3] = 255 * fbm(u, v, 6, 4, 29); d[i] = 255 * h;
  }
  for (const [px, py, r] of pits) for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) { const q = Math.hypot(x, y) / r; if (q < 1) { const ix = ((Math.round(px) + x) % S + S) % S, iy = ((Math.round(py) + y) % S + S) % S; H[iy * S + ix] -= .18 * (1 - q * q); } }
  for (let i = 0; i < S * S; i++) d[i * 4] = Math.max(0, Math.min(255, H[i] * 255));
  g.putImageData(id, 0, 0);
  // normal map (sobel, wrapped)
  const nc = canvas(S), ng = nc.getContext('2d'), nid = ng.createImageData(S, S), nd = nid.data, k = kind === 'cast' ? 5 : 2;
  const at = (x, y) => H[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k; const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    nd[i] = (-dx / l * .5 + .5) * 255; nd[i + 1] = (dy / l * .5 + .5) * 255; nd[i + 2] = (1 / l * .5 + .5) * 255; nd[i + 3] = 255;
  }
  ng.putImageData(nid, 0, 0);
  return detCache[kind] = { detail: finish(c, false), normal: finish(nc, false) };
}

// Markings: tactical number + chevron/marking, transparent background
export function markingTex(text, style) {
  const c = canvas(512, 256), g = c.getContext('2d');
  g.fillStyle = style === 't90' ? 'rgba(235,235,225,.92)' : style === 'merkava' ? 'rgba(20,20,20,.85)' : 'rgba(25,25,22,.85)';
  g.font = '900 150px "Arial Black", Impact, sans-serif'; g.textBaseline = 'middle'; g.fillText(text, 30, 135);
  g.lineWidth = 16; g.strokeStyle = g.fillStyle; const x0 = 380;
  if (style === 'merkava') { g.beginPath(); g.moveTo(x0, 70); g.lineTo(x0 + 100, 70); g.moveTo(x0, 200); g.lineTo(x0 + 100, 200); g.stroke(); }
  else if (style === 't90') { g.beginPath(); g.moveTo(x0, 80); g.lineTo(x0 + 50, 190); g.lineTo(x0 + 100, 80); g.stroke(); }
  else { g.beginPath(); g.moveTo(x0, 190); g.lineTo(x0 + 50, 80); g.lineTo(x0 + 100, 190); g.stroke(); g.fillRect(x0 + 20, 205, 60, 14); }
  // wear the decal: knock out random specks
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .8})`; g.fillRect(Math.random() * 512, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 3); }
  return finish(c, true, false);
}

export function radialTex(stops, size = 64) {
  const c = canvas(size), g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col); g.fillStyle = gr; g.fillRect(0, 0, size, size); return finish(c, true, false);
}
export function smokeTex() {
  const S = 128, c = canvas(S), g = c.getContext('2d'), id = g.createImageData(S, S), d = id.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x / S - .5, dy = y / S - .5, r = Math.hypot(dx, dy) * 2; const n = fbm(x / S, y / S, 4, 4, 5);
    const a = Math.max(0, 1 - r * (1.1 - n * .5)); const i = (y * S + x) * 4; const v = 150 + n * 90;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255 * a * a;
  }
  g.putImageData(id, 0, 0); return finish(c, true, false);
}
