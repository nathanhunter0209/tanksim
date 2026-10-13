// RHA-equivalent protection of a target layout (approximate, for sanity checks):
// KE: bisect M829A3-type rod velocity until it just perforates; report its semi-infinite RHA penetration at that velocity.
// CE: bisect nominal penetration of a generic precision shaped charge (single, no tandem) and a tandem charge.
import { simulate } from './physics.js';
const block = { mat: 'rha', x: 2.15, y: 0, z: 0, t: 4000, ax: 0, ay: 0, w: 1.2, h: 1.2 };
const semi = o => { const r = simulate({ ...o, plates: [block] }); const h = r.holes.filter(h => r.segs[h.seg].plate === 0).pop(); return h ? (h.sEnd - h.sIn) * 1000 : 0; };
export function keEquiv(plates) { let lo = 400, hi = 3200;
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; const r = simulate({ proj: 'm829a3', v0: m, range: 0, plates }); if (r.outcome === 'PERFORATED') hi = m; else lo = m; }
  return semi({ proj: 'm829a3', v0: hi, range: 0 }); }
export function ceEquiv(plates, proj = 'atgm') { let lo = 100, hi = 3000;
  for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; const r = simulate({ proj, range: 0, plates, over: { pen: m } }); if (r.outcome === 'PERFORATED') hi = m; else lo = m; }
  return hi; }
