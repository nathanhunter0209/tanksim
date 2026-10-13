// Sweep charts (stage E): run the real simulate() over range (0–4 km) or one plate's angle (0–85°) and plot
// residual penetration behind the armor (0 = perforation threshold), the round's semi-infinite RHA capability,
// outcome regions (stopped / perforated / ricochet) and the crossover points (refined by bisection).
import { simulate, semiInfRHA } from './physics.js';
import { PROJECTILES, CORES, MATERIALS } from './data.js';
const R_RHA = MATERIALS.rha.R;
export function runSweep(setup, kind, plateIdx = 0) {
  const pr = PROJECTILES[setup.proj], ke = pr.type === 'KE', core = CORES[setup.core] || {};
  const shot = x => { const o = JSON.parse(JSON.stringify(setup)); if (kind === 'range') o.range = x; else if (o.plates[plateIdx]) o.plates[plateIdx].ax = x; if (!ke) o.over = { pen: setup.pen }; return o; };
  const evalAt = x => { const r = simulate(shot(x)); const cap = ke ? semiInfRHA(setup.L / 1000 * .93, setup.D / 1000, r.vImpact, core.rho, core.Y, 0, R_RHA * (core.rf || 1)) * 1000 : setup.pen;
    return { x, outcome: r.outcome, behind: r.outcome === 'PERFORATED' ? r.behind : 0, cap }; };
  const [x0, x1] = kind === 'range' ? [0, 4000] : [0, 85], N = 41, pts = [];
  for (let i = 0; i < N; i++) pts.push(evalAt(x0 + (x1 - x0) * i / (N - 1)));
  const cross = [];
  for (let i = 1; i < N; i++) { const a = pts[i - 1], b = pts[i]; if (a.outcome === b.outcome) continue; let lo = a.x, hi = b.x, oa = a.outcome;
    for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (evalAt(m).outcome === oa) lo = m; else hi = m; } cross.push({ x: (lo + hi) / 2, from: a.outcome, to: b.outcome }); }
  return { kind, pts, cross, x0, x1, ke, name: pr.name, plateIdx };
}
const COL = { PERFORATED: 'rgba(217,48,37,.16)', STOPPED: 'rgba(24,128,56,.14)', RICOCHET: 'rgba(26,115,232,.2)', MISS: 'rgba(120,120,120,.12)' };
export function drawSweep(c, d) {
  const g = c.getContext('2d'), W = c.width, H = c.height, L = 70, R = 20, T = 36, B = 52; g.clearRect(0, 0, W, H); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const yMax = Math.max(100, ...d.pts.map(p => Math.max(p.cap, p.behind))) * 1.1, X = x => L + (x - d.x0) / (d.x1 - d.x0) * (W - L - R), Y = y => H - B - y / yMax * (H - T - B);
  // outcome bands
  for (let i = 0; i < d.pts.length; i++) { const p = d.pts[i], xa = i ? (d.pts[i - 1].x + p.x) / 2 : d.x0, xb = i < d.pts.length - 1 ? (d.pts[i + 1].x + p.x) / 2 : d.x1; g.fillStyle = COL[p.outcome] || COL.MISS; g.fillRect(X(xa), T, X(xb) - X(xa), H - T - B); }
  g.strokeStyle = '#e3e6e9'; g.fillStyle = '#6b747c'; g.font = '20px system-ui'; g.lineWidth = 1;
  for (let i = 0; i <= 5; i++) { const y = yMax * i / 5; g.beginPath(); g.moveTo(L, Y(y)); g.lineTo(W - R, Y(y)); g.stroke(); g.fillText(y.toFixed(0), 8, Y(y) + 6); }
  for (let i = 0; i <= 4; i++) { const x = d.x0 + (d.x1 - d.x0) * i / 4; g.fillText(d.kind === 'range' ? (x / 1000).toFixed(1) + ' km' : x.toFixed(0) + '°', X(x) - 22, H - B + 26); }
  // perforation threshold (zero residual)
  g.strokeStyle = '#16191c'; g.lineWidth = 2; g.setLineDash([]); g.beginPath(); g.moveTo(L, Y(0)); g.lineTo(W - R, Y(0)); g.stroke();
  const line = (f, col, dash) => { g.strokeStyle = col; g.lineWidth = 4; g.setLineDash(dash); g.beginPath(); d.pts.forEach((p, i) => i ? g.lineTo(X(p.x), Y(f(p))) : g.moveTo(X(p.x), Y(f(p)))); g.stroke(); g.setLineDash([]); };
  line(p => p.cap, '#1a73e8', [10, 8]); line(p => p.behind, '#d93025', []);
  for (const cr of d.cross) { g.strokeStyle = '#16191c'; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(cr.x), T); g.lineTo(X(cr.x), H - B); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#16191c'; g.font = 'bold 20px system-ui'; const s = d.kind === 'range' ? `${(cr.x / 1000).toFixed(2)} km` : `${cr.x.toFixed(1)}°`; g.fillText(s, Math.min(X(cr.x) + 6, W - R - 90), T + 22); }
  g.font = '20px system-ui'; g.fillStyle = '#1a73e8'; g.fillText('– – capability, semi-inf. RHA', L, 24); g.fillStyle = '#d93025'; g.fillText('—— residual behind armor', L + 290, 24);
  g.fillStyle = '#6b747c'; g.fillText(d.kind === 'range' ? 'Range' : `Plate ${d.plateIdx + 1} angle`, W / 2 - 40, H - 8);
}
export function sweepSummary(d) { if (!d.cross.length) return `No crossover: ${d.pts[0].outcome.toLowerCase()} across the whole ${d.kind === 'range' ? '0–4 km range' : '0–85° sweep'}.`;
  return d.cross.map(c => `${c.from.toLowerCase()} → ${c.to.toLowerCase()} at ${d.kind === 'range' ? (c.x / 1000).toFixed(2) + ' km' : c.x.toFixed(1) + '°'}`).join('; ') + '. (Approximate model, public-estimate data.)'; }
