// Time-stepped 1D-along-path penetration model (PUBLIC-ESTIMATE APPROXIMATION, not a hydrocode).
// KE: Alekseevskii-Tate rod erosion with per-material target resistance R_t, rod strength Y_p,
//     rear-face (exit) resistance reduction + plugging, LOS obliquity with asymmetric-erosion correction,
//     critical-angle ricochet (velocity, L/D, t/D), yaw growth after asymmetric exits and in air gaps,
//     ceramic dwell then comminuted penetration (backing-dependent), ERA/NERA moving-plate interaction.
// CE: segmented jet (tip ~8 km/s -> tail ~2 km/s) from a virtual origin, stretching + breakup time,
//     DiPersio-Simon-Merendino style cumulative penetration element by element with Bernoulli + strength,
//     ERA / NERA disruption windows, tandem precursor. Pure JS; runs in a few ms.
import { CORES, MATERIALS, PROJECTILES } from './data.js';
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const RHO_CU = 8900, R_RHA = MATERIALS.rha.R, SEC = 2.0, ERA_TINT = 160e-6, ERA_K = 2.5, TANDEM_RESID = .07; // ~5–15% loss of tandem main jets to precursor-initiated ERA debris (public estimates)

// ---------- geometry ----------
export function plateAxes(p) { const a = -rad(p.ax), b = rad(p.ay);
  return { ex: [Math.cos(a) * Math.cos(b), Math.sin(a), -Math.cos(a) * Math.sin(b)], ey: [-Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b)], ez: [Math.sin(b), 0, Math.cos(b)] }; }
function rayBox(c, ax, half) {
  let s0 = -1e9, s1 = 1e9;
  for (let k = 0; k < 3; k++) { const e = [ax.ex, ax.ey, ax.ez][k], h = half[k], oc = -(c[0] * e[0] + c[1] * e[1] + c[2] * e[2]), dc = e[0];
    if (Math.abs(dc) < 1e-9) { if (Math.abs(oc) > h) return null; continue; }
    let t1 = (-h - oc) / dc, t2 = (h - oc) / dc; if (t1 > t2) [t1, t2] = [t2, t1]; s0 = Math.max(s0, t1); s1 = Math.min(s1, t2); }
  return s0 < s1 ? [s0, s1] : null;
}
export function ribBoxes(p) { const n = p.ribs | 0, out = [], t = p.t / 1000; for (let k = 0; k < n; k++) out.push({ off: [-(t / 2 + .02), -p.h / 2 + (k + .5) * p.h / n, 0], half: [.02, .02, p.w / 2] }); return out; }
export function segments(plates) {
  const segs = [];
  plates.forEach((p, i) => { const ax = plateAxes(p), c = [p.x, p.y, p.z], obl = deg(Math.acos(clamp(Math.abs(ax.ex[0]), 0, 1)));
    const h = rayBox(c, ax, [p.t / 2000, p.h / 2, p.w / 2]); if (h) segs.push({ plate: i, sIn: h[0], sOut: h[1], obl, mat: p.mat, tn: p.t / 1000 });
    for (const r of ribBoxes(p)) { const rc = [0, 1, 2].map(k => c[k] + ax.ex[k] * r.off[0] + ax.ey[k] * r.off[1]); const h2 = rayBox(rc, ax, r.half); if (h2) segs.push({ plate: i, sIn: h2[0], sOut: h2[1], obl, mat: p.mat, tn: .04, rib: true }); } });
  segs.sort((a, b) => a.sIn - b.sIn); const out = []; let last = -1e9;
  for (const s of segs) { if (s.sIn < last) s.sIn = last; if (s.sOut - s.sIn > 1e-5) { out.push(s); last = s.sOut; } }
  out.forEach((s, k) => { s.los = s.sOut - s.sIn; const nx = out[k + 1]; s.backed = !!nx && nx.sIn - s.sOut < .01 && !MATERIALS[nx.mat].air && MATERIALS[nx.mat].R >= 3.5e9; });
  return out;
}
export const impactVelocity = (pr, v0, range) => pr.type === 'KE' ? v0 * Math.exp(-pr.kloss * range / 1000) : v0;
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// Tate: 0.5 rp (v-u)^2 + Y = 0.5 rt u^2 + R
export function tateU(v, rp, Y, rt, R) {
  if (Y >= R + .5 * rt * v * v) return v; // rigid-body penetration
  const A = .5 * (rp - rt), B = -rp * v, C = .5 * rp * v * v + Y - R; if (C <= 0) return 0;
  if (Math.abs(A) < 1e-6) return clamp(-C / B, 0, v);
  const d = Math.sqrt(Math.max(0, B * B - 4 * A * C)), r1 = (-B - d) / (2 * A), r2 = (-B + d) / (2 * A);
  return r1 >= 0 && r1 <= v ? r1 : clamp(r2, 0, v);
}
// critical ricochet angle (deg): Tate-type rod ricochet criterion with t/D (plate support) and calibration factor
export function critAngle(rp, v, L, D, Yt, tn) {
  const k = .6 * (2 * rp * v * v / (3 * Yt)) * ((L * L + D * D) / (L * D)) * clamp(.55 + .2 * tn / D, .6, 1.15);
  return deg(Math.atan(Math.cbrt(k)));
}

export function simulate(shot) {
  const pr = { ...PROJECTILES[shot.proj], ...(shot.over || {}) }, segs = segments(shot.plates), rand = rng(1234);
  const v = impactVelocity(pr, shot.v0 ?? pr.v0, shot.range ?? 0);
  const res = pr.type === 'KE' ? simKE(pr, shot, segs, v, rand) : simCE(pr, shot, segs, v, rand);
  res.segs = segs; res.vImpact = v; res.proj = pr;
  res.plates = shot.plates.map((p, i) => { const ss = segs.filter(s => s.plate === i), ev = res.segEvents.filter(e => segs[e.seg].plate === i), last = ev[ev.length - 1];
    return { i, mat: p.mat, hit: ss.length > 0, los: ss.reduce((a, s) => a + s.los, 0) * 1000, obl: ss[0]?.obl ?? 0, perforated: ev.length ? ev.every(e => e.perforated) : false, reached: ev.length > 0,
      Lres: last ? last.Lout * 1000 : null, vres: last ? last.vout : null, notes: [...new Set(ev.flatMap(e => e.notes))] }; });
  return res;
}
function debrisCone(v, mres, liner) { // behind-armor debris: half-angle narrows with residual velocity; count ~ residual energy
  const half = clamp(rad(18 + 22 * (1 - clamp(v / 1800, 0, 1))), rad(10), rad(42)) * (liner ? .45 : 1);
  const n = Math.round(clamp(12 + .5 * mres * v * v / 2e5, 10, 160) * (liner ? .5 : 1)); return { half, n };
}

// ---------------- KE ----------------
function simKE(pr, shot, segs, v0, rand) {
  const coreK = shot.core || pr.core, core = CORES[coreK], D = (shot.D ?? pr.D) / 1000, Ltot = (shot.L ?? pr.L) / 1000, rp = core.rho, Yp = core.Y;
  let L = Ltot * .93, v = v0, yaw = 0, omega = 0; // yaw angle (deg) and yaw rate (deg/s)
  const first = segs.length ? segs[0].sIn : 0, start = first - .45 - Ltot; let tip = start + Ltot, t = 0;
  const samples = [], segEvents = [], debris = [], holes = [], era = [], bulges = []; let outcome = 'PERFORATED', ric = null;
  const rec = (u, si) => samples.push({ t, tip, tail: tip - L - Ltot * .07, L, v, u, seg: si });
  const spawn = (n, s, dir, half, speed, t0, kind) => { for (let k = 0; k < n; k++) { const a = rand() * Math.PI * 2, th = half * Math.sqrt(rand()), sp = speed * (.35 + .65 * rand()); debris.push({ t0, p: [s, 0, 0], v: [dir * Math.cos(th) * sp, Math.sin(th) * Math.cos(a) * sp, Math.sin(th) * Math.sin(a) * sp], s: .003 + rand() * .01, kind }); } };
  const fly = (to) => { const n = Math.max(2, Math.ceil((to - tip) / .02)), dt = (to - tip) / v / n; for (let k = 0; k < n; k++) { tip += v * dt; t += dt; yaw += omega * dt; rec(v, -1); } };
  rec(v, -1);
  for (let si = 0; si < segs.length; si++) {
    const s = segs[si], m = MATERIALS[s.mat]; fly(s.sIn);
    const ev = { seg: si, tIn: t, Lin: L, vin: v, notes: [], perforated: false }; segEvents.push(ev);
    if (m.air) { if (m.crew) ev.notes.push('CREW COMPARTMENT REACHED'); fly(s.sOut); ev.perforated = true; ev.Lout = L; ev.vout = v; ev.tOut = t; continue; }
    const yawF = () => 1 + Math.min(1.4, .22 * L * Math.sin(rad(yaw)) / D); // yawed rod presents a wider, less efficient footprint
    // ricochet check (hard plates only)
    if (m.R >= 3e9) { const thc = critAngle(rp, v, L, D, 1.2e9 * m.R / R_RHA, s.tn) - (s.rib || shot.plates[s.plate].ribs ? 4 : 0) - yaw * .5; ev.thc = thc;
      if (s.obl > thc) { outcome = 'RICOCHET'; ric = { t, s: tip, obl: s.obl, plate: s.plate }; ev.notes.push(`ricochet (θ ${s.obl.toFixed(0)}° > θc ${thc.toFixed(0)}°)`);
        spawn(30, tip, -1, 1, v * .25, t, 'ricochet'); holes.push({ seg: si, sIn: s.sIn, sEnd: s.sIn + Math.min(s.los, 2.5 * D), r: D * 1.1, t0: t, t1: t + 1e-5, gouge: true }); ev.Lout = L * .8; ev.vout = v * .8; ev.tOut = t; break; }
      if (s.obl > thc - 6) { yaw += 3 * (s.obl - thc + 6) / 6; ev.notes.push('near-critical angle: rod bending/yaw'); } }
    // ERA / NERA moving plates: flyer momentum vs rod → tip loss + yaw (fracture)

    // ERA / NERA moving plates. Heavy ERA: the flyer interacts with the rod only while it sweeps across the shot line, so it damages
    // a roughly fixed rod LENGTH (≈ v · T_int) rather than a fraction: longer rods (and rods with sacrificial nose sections) lose a smaller share.
    const plateHit = (h, rho, vf, n, label) => { const sinT = Math.max(Math.sin(rad(s.obl)), .2), eta = n * rho * h * vf * sinT / (rp * D * v);
      let dL, dy; if (label === 'ERA') { const Ld = v * ERA_TINT, sev = clamp(ERA_K * eta, 0, .85); dL = Math.min(L * .7, Ld * sev); dy = clamp(eta * 3, 0, 1); }
      else { dL = Math.min(L * .6, .8 * eta * v * 40e-6); dy = clamp(eta * 60, 0, 18); }
      L -= dL; yaw += dy; omega += dy * 2500; ev.notes.push(`${label}: −${(dL * 1000).toFixed(0)} mm rod, +${dy.toFixed(1)}° yaw`); return dL; };
    if (m.era) { era.push({ plate: s.plate, t0: t }); plateHit(m.era.h, m.era.rho, m.era.vf, m.era.n, 'ERA'); }
    if (m.nera) { bulges.push({ plate: s.plate, t0: t }); }
    // dwell (ceramic interface defeat)
    let dwell = 0; if (m.dwell) { const d = m.dwell; dwell = d.tau * clamp(1 - (v - d.v1) / (d.v2 - d.v1), 0, 1) * (s.backed ? 1 : .35) * clamp(s.los / .04, .5, 2); if (dwell > 0) ev.notes.push(`interface dwell ${(dwell * 1e6).toFixed(1)} µs`); }
    const eObl = 1 + .18 * Math.sin(rad(s.obl)) ** 2; // asymmetric erosion at obliquity
    const dt = clamp(s.los / v / 300, 2e-8, 2.5e-7); let breakout = false, steps = 0, tIn = t;
    while (steps++ < 200000) {
      const rem = s.sOut - tip, Deff = D * yawF();
      let R = m.R * (core.rf || 1) * yawF() * (m.dwell && !s.backed ? .65 : 1);
      R *= .3 + .7 * clamp(rem / (2.2 * Deff), 0, 1); // rear-face: plastic zone reaches free surface → lower resistance
      if (m.nera && t - tIn < m.nera.T) R *= 1 + .5 * Math.sin(Math.PI * (t - tIn) / m.nera.T); // bulging plates feeding into the path
      let u;
      if (dwell > 0) { u = 0; dwell -= dt; } else u = tateU(v, rp, Yp, m.rho, R);
      if (u < v) { L -= (v - u) * eObl * dt; v -= Yp / (rp * Math.max(L, D)) * dt; } else v -= (R + .5 * m.rho * v * v) / (rp * Math.max(L, D)) * dt * .2;
      tip += u * dt; t += dt; if (steps % 12 === 0) rec(u, si);
      if (rem < .35 * Deff * Math.cos(rad(s.obl)) + 1e-4 && u > 30) { breakout = true; break; } // plug / petal failure at the rear face
      if (tip >= s.sOut) { breakout = true; break; }
      if (L < .5 * D || v < 40) break;
    }
    if (breakout) {
      if (m.nera) { const h = m.nera.h; plateHit(h, 7850, m.nera.vb, 2, 'NERA bulge'); }
      tip = s.sOut; ev.perforated = true; ev.Lout = L; ev.vout = v; ev.tOut = t; rec(v, si);
      const asym = Math.sin(rad(s.obl)) * clamp(D / Math.max(s.tn, 1e-3), .15, 1.5); if (asym > .05) { yaw += 1.2 * asym; omega += 900 * asym; ev.notes.push(`asymmetric exit: yaw ${yaw.toFixed(1)}°`); }
      const mres = rp * Math.PI * D * D / 4 * L, liner = shot.plates.slice(s.plate).some(p => MATERIALS[p.mat].liner); const dc = debrisCone(v, mres, MATERIALS[s.mat].liner || liner);
      spawn(dc.n, s.sOut, 1, dc.half, v * .75, t, 'spall'); spawn(8, s.sIn, -1, 1, v * .1, tIn + 2e-6, 'ejecta');
      holes.push({ seg: si, sIn: s.sIn, sEnd: s.sOut, r: D * (.9 + .25 * Math.min(yaw, 10) / 10 * 4), t0: tIn, t1: t, perforated: true });
    } else {
      const sec = SEC * D * R_RHA / m.R * .85; if (s.sOut - tip <= sec) { tip = s.sOut; ev.perforated = true; ev.Lout = 0; ev.vout = 0; ev.tOut = t; ev.notes.push('perforated by residual crater growth'); holes.push({ seg: si, sIn: s.sIn, sEnd: s.sOut, r: D, t0: tIn, t1: t, perforated: true }); outcome = 'STOPPED'; ev.depth = s.los * 1000; L = 0; rec(0, si); break; }
      tip += sec; ev.Lout = 0; ev.vout = 0; ev.tOut = t; outcome = 'STOPPED'; holes.push({ seg: si, sIn: s.sIn, sEnd: tip, r: D * 1.05, t0: tIn, t1: t, perforated: false });
      spawn(10, s.sIn, -1, 1, 160, tIn + 2e-6, 'ejecta'); ev.depth = (tip - s.sIn) * 1000; L = 0; rec(0, si); break;
    }
  }
  if (outcome === 'PERFORATED') fly(tip + .6);
  // behind-armor residual: semi-infinite RHA with current rod state
  const behind = outcome === 'PERFORATED' ? semiInfRHA(L, D, v, rp, Yp, yaw, R_RHA * (core.rf || 1)) * 1000 : 0;
  const crewHit = outcome === 'PERFORATED' && segs.some(s => MATERIALS[s.mat].crew);
  return { type: 'KE', samples, segEvents, debris, holes, era, bulges, outcome, ric, tEnd: t + (outcome === 'RICOCHET' ? 1.2e-3 : 3e-4), Lres: outcome === 'PERFORATED' ? L * 1000 : 0, vres: outcome === 'PERFORATED' ? v : 0, behind, crewHit, yaw, D, Ltot, start };
}
export function semiInfRHA(L, D, v, rp, Yp, yaw = 0, R = R_RHA, rt = 7850) {
  let P = 0; const dt = 2e-7; const yf = 1 + Math.min(1.4, .22 * L * Math.sin(rad(yaw)) / D);
  for (let i = 0; i < 100000 && L > .5 * D && v > 40; i++) { const u = tateU(v, rp, Yp, rt, R * yf); P += u * dt; if (u < v) { L -= (v - u) * dt; v -= Yp / (rp * Math.max(L, D)) * dt; } else break; }
  return P + SEC * D; // + early-time / secondary crater penetration (gives the observed L/D dependence)
}

// ---------------- CE (shaped charge jet, element-wise DPSM) ----------------
const JET = { rpg: { vt: 7400, vtail: 2000, tb: 1.15 }, atgm: { vt: 8500, vtail: 2000, tb: 1.25 }, heat: { vt: 8200, vtail: 2000, tb: 1.2 } };
function jetElements(pr, k = 1) { const J = JET[pr.kind] || JET.heat, N = 160, els = [];
  for (let i = 0; i < N; i++) { const v1 = J.vt - (J.vt - J.vtail) * i / N, v2 = J.vt - (J.vt - J.vtail) * (i + 1) / N; els.push({ v: (v1 + v2) / 2, dv: v1 - v2, k, alive: 1 }); }
  return { els, tb: J.tb * pr.cal * 1e-6 * 1.8 }; } // breakup time ~2.1 µs per mm cone diameter: puts the standoff optimum near 4–8 CD (classic curves)
// march jet elements into a material stack along the path; returns penetration depth, per-element arrivals
function dpsm(pr, layers, xLiner, scale, disrupt) {
  const { els, tb } = jetElements(pr, scale); let P = layers.length ? layers[0].sIn : xLiner + .3, li = 0; const arrivals = [];
  const rj = RHO_CU;
  for (let i = 0; i < els.length; i++) {
    const e = els[i]; if (li >= layers.length) { arrivals.push({ i, t: (P - xLiner) / e.v, P, free: true }); continue; }
    let ta = (P - xLiner) / e.v; let len = e.dv * Math.min(ta, tb) * e.k; // element stretches until breakup time, then particulates
    const particulated = ta > tb; let eff = particulated ? Math.max(.12, 1 - .7 * Math.min(1, (ta - tb) / (1.5 * tb))) : 1; // drift/tumble after breakup
    eff *= disrupt ? disrupt(e, ta, P) : 1;
    let budget = len * eff;
    while (budget > 1e-6 && li < layers.length) {
      const L = layers[li]; if (P < L.sIn) { P = L.sIn; ta = (P - xLiner) / e.v; }
      const m = MATERIALS[L.mat]; if (m.air) { P = L.sOut; li++; continue; }
      const u = tateU(e.v, rj, 0, m.rho, m.R * .55); if (u <= 1) { budget = 0; break; } // jets see a lower effective strength (high strain rate)
      const depthPerLen = u / (e.v - u), can = budget * depthPerLen, room = L.sOut - P;
      if (can >= room) { P = L.sOut; budget -= room / depthPerLen; li++; L.out = L.out ?? ta; } else { P += can; budget = 0; }
    }
    arrivals.push({ i, t: ta, P, v: e.v });
  }
  return { P, arrivals, done: li >= layers.length, tb };
}
function simCE(pr, shot, segs, v0, rand) {
  const cal = pr.cal / 1000, first = segs.length ? segs[0].sIn : 0, standoff0 = 1.8 * cal, xLiner = first - standoff0;
  // calibrate jet element length scale so semi-infinite RHA at built-in standoff == nominal (public) penetration
  const ref = l => dpsm(pr, [{ sIn: 0, sOut: 5, mat: 'rha' }], -standoff0, l).P; let lo = .1, hi = 20;
  for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (ref(mid) < pr.pen / 1000) lo = mid; else hi = mid; } const scale = (lo + hi) / 2;
  // tandem precursor clears ERA ahead of the main charge
  const segEvents = segs.map((s, si) => ({ seg: si, notes: [], perforated: false, Lin: 0 })), era = [], bulges = [], debris = [], holes = [];
  let precursor = pr.tandem; const eraWin = [], cleared = [];
  segs.forEach((s, si) => { const m = MATERIALS[s.mat]; if (m.era) { if (precursor) { precursor = false; segEvents[si].notes.push('ERA initiated early by tandem precursor — main jet only grazes residual debris'); era.push({ plate: s.plate, t0: -2e-4 }); cleared.push(s); }
      else eraWin.push({ si, s, m, eta: m.era.n * m.era.rho * m.era.h * m.era.vf * Math.max(Math.sin(rad(s.obl)), .25) }); }
    if (m.nera) eraWin.push({ si, s, m, nera: true, eta: 2 * 7850 * m.nera.h * m.nera.vb * Math.max(Math.sin(rad(s.obl)), .25) }); });
  const disrupt = (e, ta, P) => { let f = 1; for (const c of cleared) if (P >= c.sIn - 1e-6) f *= 1 - TANDEM_RESID; /* flyer/casing debris left by the precursor */ for (const w of eraWin) { const tArrW = (w.s.sIn - xLiner) / e.v; if (P < w.s.sIn - 1e-6) continue; // element passes through this plate's location
      const firstArr = (w.s.sIn - xLiner) / JET[pr.kind || 'heat'].vt; const delay = tArrW - firstArr; const tAct = w.nera ? 4e-6 : 6e-6; if (delay < tAct) continue; // jet tip passes before plates move
      if (w.nera && delay > w.m.nera.T + tAct) continue; const dJet = cal * .06; const cut = clamp(w.eta / (RHO_CU * dJet * e.v) * (w.nera ? 2.2 : 3.5), 0, .97); f *= 1 - cut; } return f; };
  const sim = dpsm(pr, segs.map(s => ({ ...s })), xLiner, scale, disrupt);
  for (const w of eraWin) { segEvents[w.si].notes.push(w.nera ? 'NERA bulge disrupted jet' : 'ERA flyers cut the jet'); (w.nera ? bulges : era).push({ plate: w.s.plate, t0: (w.s.sIn - xLiner) / JET[pr.kind || 'heat'].vt }); }
  // reconstruct timeline: crater bottom position vs time
  const tFly = .35 / Math.max(v0, 50), samples = []; const bodyStart = first - .35;
  for (let k = 0; k <= 40; k++) samples.push({ t: tFly * k / 40, tip: bodyStart + (first - bodyStart) * k / 40, body: bodyStart + (first - bodyStart) * k / 40, L: pr.pen, v: v0, u: v0, seg: -1, pre: true });
  const J = JET[pr.kind] || JET.heat; let lastP = xLiner, outcome = sim.done ? 'PERFORATED' : 'STOPPED';
  const arr = sim.arrivals; const lastSeg = segs.length ? segs[segs.length - 1].sOut : 0;
  for (const a of arr) { const P = a.free ? Math.min(lastSeg + .6, xLiner + J.vt * a.t) : a.P; const segI = segs.findIndex(s => P >= s.sIn && P <= s.sOut + 1e-6); samples.push({ t: tFly + a.t, tip: P, body: first, L: Math.max(0, (1 - a.i / arr.length)) * pr.pen, v: a.v || J.vtail, u: 0, seg: segI, jet: true }); lastP = P; }
  samples.sort((x, y) => x.t - y.t);
  // per-segment events
  let behind = 0; segs.forEach((s, si) => { const ev = segEvents[si]; const reachT = samples.find(x => x.jet && x.tip >= s.sIn - 1e-6); const exitT = samples.find(x => x.jet && x.tip >= s.sOut - 1e-6);
    ev.tIn = reachT ? reachT.t : null; ev.perforated = !!exitT; ev.tOut = exitT?.t; ev.Lout = 0; ev.vout = exitT ? exitT.v : 0; if (MATERIALS[s.mat].crew && reachT) ev.notes.push('CREW COMPARTMENT REACHED');
    if (reachT && !MATERIALS[s.mat].air) { holes.push({ seg: si, sIn: s.sIn, sEnd: exitT ? s.sOut : sim.P, r: cal * .1, t0: reachT.t, t1: exitT ? exitT.t : samples[samples.length - 1].t, perforated: !!exitT });
      if (exitT) { const dc = debrisCone(3000, .05, MATERIALS[s.mat].liner); for (let k = 0; k < dc.n; k++) { const a = rand() * 6.283, th = dc.half * Math.sqrt(rand()), sp = 1500 + 2500 * rand(); debris.push({ t0: exitT.t, p: [s.sOut, 0, 0], v: [Math.cos(th) * sp, Math.sin(th) * Math.cos(a) * sp, Math.sin(th) * Math.sin(a) * sp], s: .003 + rand() * .007, kind: 'spall' }); } } } });
  segEvents.forEach(e => { if (e.tIn == null) e.skip = true; });
  if (outcome === 'PERFORATED') { // residual: continue remaining jet into semi-infinite RHA behind last plate
    const rest = dpsm(pr, [...segs.map(s => ({ ...s })), { sIn: lastSeg + .05, sOut: lastSeg + 5, mat: 'rha' }], xLiner, scale, disrupt); behind = Math.max(0, (rest.P - lastSeg - .05) * 1000); if (behind < 2) outcome = 'STOPPED'; }
  const crewHit = outcome === 'PERFORATED' && segs.some(s => MATERIALS[s.mat].crew);
  return { type: 'CE', samples, segEvents: segEvents.filter(e => !e.skip), debris, holes, era, bulges, outcome, ric: null, tEnd: samples[samples.length - 1].t + 2e-4, Lres: behind, vres: outcome === 'PERFORATED' ? J.vtail : 0, behind, crewHit, tDet: tFly, sDet: xLiner, bodyStart, start: bodyStart, scale };
}
// convenience for validation: semi-infinite RHA penetration of a shaped charge at a given standoff (calibrated)
export function cePenetration(projKey, standoffCD = 1.8, layersFn) { const r = simulate({ proj: projKey, range: 0, plates: layersFn ? layersFn() : [{ mat: 'rha', x: 2.5, y: 0, z: 0, t: 5000, ax: 0, ay: 0, w: 1, h: 1 }] }); return r; }
