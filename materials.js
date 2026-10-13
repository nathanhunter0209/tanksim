// Procedural PBR plate materials (stage F): canvas-generated colour/roughness/normal maps per material family.
// Generated once per family and shared; Low quality skips normal maps and uses smaller textures.
import * as THREE from 'three';
const cache = new Map();
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function canvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return [c, c.getContext('2d')]; }
// height field -> tangent-space normal map
function normalFrom(hc, n, strength) { const src = hc.getContext('2d').getImageData(0, 0, n, n).data, [c, g] = canvas(n), out = g.createImageData(n, n), H = (x, y) => src[(((y + n) % n) * n + ((x + n) % n)) * 4] / 255;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
    out.data[i] = (-dx / l * .5 + .5) * 255; out.data[i + 1] = (-dy / l * .5 + .5) * 255; out.data[i + 2] = (1 / l * .5 + .5) * 255; out.data[i + 3] = 255; } g.putImageData(out, 0, 0); return c; }
const FAM = {
  steel: (g, h, n, r) => { g.fillStyle = '#9ba3aa'; g.fillRect(0, 0, n, n); h.fillStyle = '#808080'; h.fillRect(0, 0, n, n);
    for (let i = 0; i < n * 3; i++) { const y = r() * n, a = .03 + r() * .06, w = 20 + r() * n * .6, x = r() * n; g.fillStyle = r() < .5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`; g.fillRect(x, y, w, 1); h.fillStyle = `rgba(${r() < .5 ? 255 : 0},0,0,${a * 2})`; h.fillRect(x, y, w, 1); } // brushed/rolled streaks
    for (let i = 0; i < 26; i++) { const x = r() * n, y = r() * n, s = 10 + r() * n * .18; const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, 'rgba(60,62,70,.35)'); gr.addColorStop(1, 'rgba(60,62,70,0)'); g.fillStyle = gr; g.fillRect(x - s, y - s, 2 * s, 2 * s); } }, // mill scale
  ceramic: (g, h, n, r) => { g.fillStyle = '#e9e6de'; g.fillRect(0, 0, n, n); h.fillStyle = '#ffffff'; h.fillRect(0, 0, n, n); const k = 4, s = n / k;
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { g.fillStyle = `rgba(${200 + r() * 30 | 0},${198 + r() * 30 | 0},${190 + r() * 30 | 0},.35)`; g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); }
    g.strokeStyle = '#8f8a80'; h.strokeStyle = '#000'; g.lineWidth = h.lineWidth = 3; for (let i = 0; i <= k; i++) { for (const c of [g, h]) { c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s, n); c.moveTo(0, i * s); c.lineTo(n, i * s); c.stroke(); } } },
  rubber: (g, h, n, r) => { g.fillStyle = '#2b2e31'; g.fillRect(0, 0, n, n); h.fillStyle = '#808080'; h.fillRect(0, 0, n, n); for (let i = 0; i < n * 8; i++) { const x = r() * n, y = r() * n; g.fillStyle = `rgba(255,255,255,${r() * .04})`; g.fillRect(x, y, 2, 2); h.fillStyle = `rgba(255,255,255,${r() * .3})`; h.fillRect(x, y, 2, 2); }
    g.fillStyle = '#8b939a'; g.fillRect(0, 0, n, n * .2); g.fillRect(0, n * .8, n, n * .2); }, // steel faces sandwiching the rubber interlayer (side view)
  era: (g, h, n, r) => { g.fillStyle = '#5d6640'; g.fillRect(0, 0, n, n); h.fillStyle = '#808080'; h.fillRect(0, 0, n, n); const k = 2, s = n / k;
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { g.strokeStyle = '#3c422a'; g.lineWidth = 4; g.strokeRect(i * s + 3, j * s + 3, s - 6, s - 6); h.strokeStyle = '#000'; h.lineWidth = 4; h.strokeRect(i * s + 3, j * s + 3, s - 6, s - 6);
      for (const [bx, by] of [[.15, .15], [.85, .15], [.15, .85], [.85, .85]]) { const x = (i + bx) * s, y = (j + by) * s; g.fillStyle = '#2f3322'; g.beginPath(); g.arc(x, y, s * .05, 0, 7); g.fill(); g.fillStyle = '#7d855d'; g.beginPath(); g.arc(x - 1, y - 1, s * .03, 0, 7); g.fill();
        const gr = h.createRadialGradient(x, y, 0, x, y, s * .06); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#808080'); h.fillStyle = gr; h.beginPath(); h.arc(x, y, s * .06, 0, 7); h.fill(); } } // bolts
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(30,32,20,${r() * .12})`; g.fillRect(r() * n, r() * n, 6 + r() * 20, 2 + r() * 6); } },
  cast: (g, h, n, r) => { g.fillStyle = '#8f969c'; g.fillRect(0, 0, n, n); h.fillStyle = '#808080'; h.fillRect(0, 0, n, n); for (let i = 0; i < n * 4; i++) { const x = r() * n, y = r() * n, s = 1 + r() * 4; g.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '0,0,0'},${r() * .08})`; g.fillRect(x, y, s, s); h.fillStyle = `rgba(${r() < .5 ? 255 : 0},0,0,${r() * .5})`; h.fillRect(x, y, s, s); } },
  plain: (g, h, n, r) => { g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, n, n); h.fillStyle = '#808080'; h.fillRect(0, 0, n, n); for (let i = 0; i < n * 2; i++) { const x = r() * n, y = r() * n; g.fillStyle = `rgba(0,0,0,${r() * .05})`; g.fillRect(x, y, 3, 3); h.fillStyle = `rgba(255,255,255,${r() * .3})`; h.fillRect(x, y, 3, 3); } },
};
// material key -> family + PBR params (colour multiplies the family texture)
const SPEC = { rha: ['steel', 0xa7afb6, .45, .85], barrier: ['steel', 0xa7afb6, .45, .85], hha: ['steel', 0xb3b9be, .4, .9], cast: ['cast', 0xa9adb0, .7, .7], alu: ['plain', 0xd5dade, .35, .9], ti: ['steel', 0xb7b0c4, .38, .85],
  textolite: ['plain', 0x9a7a52, .8, 0], sic: ['ceramic', 0xd9d6cf, .85, 0], b4c: ['ceramic', 0x8d8f92, .8, 0], tib2: ['ceramic', 0xbfbcb6, .8, 0], al2o3: ['ceramic', 0xffffff, .9, 0],
  k1: ['era', 0xffffff, .75, .3], k5: ['era', 0xffffff, .7, .35], relikt: ['era', 0xe6ecd2, .7, .35], nera: ['rubber', 0xffffff, .65, .3], liner: ['plain', 0xe0c25a, .9, 0],
  engine: ['cast', 0x6c7276, .6, .6], tungsten: ['steel', 0x8e9296, .35, 1], du: ['steel', 0x55595a, .4, .95] };
function family(fam, lo) { const key = fam + (lo ? 'L' : 'H'); if (cache.has(key)) return cache.get(key); const n = lo ? 128 : 256, r = rng(fam.length * 7919);
  const [cc, g] = canvas(n), [hc, h] = canvas(n); FAM[fam](g, h, n, r);
  const map = new THREE.CanvasTexture(cc); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
  const nm = lo ? null : new THREE.CanvasTexture(normalFrom(hc, n, fam === 'ceramic' || fam === 'era' ? 3 : 1.2)); if (nm) nm.wrapS = nm.wrapT = THREE.RepeatWrapping;
  const v = { map, nm }; cache.set(key, v); return v; }
export function pbrParams(matKey, fallbackColor, lo) { const s = SPEC[matKey]; if (!s) return { color: fallbackColor, roughness: .55, metalness: .25 };
  const f = family(s[0], lo); return { color: s[1], map: f.map, normalMap: f.nm || null, normalScale: new THREE.Vector2(.35, .35), roughness: s[2], metalness: s[3] }; }
