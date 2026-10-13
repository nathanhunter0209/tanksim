// Fast engineering approximation of a long-rod / shaped-charge shot through a stack of plates.
// KE: Tate-Alekseevskii erosion integrated in time, target resistance calibrated per shot so the
// semi-infinite RHA result matches Lanz-Odermatt (L/D, density, hardness, obliquity term).
// CE: jet capacity with standoff efficiency, ERA cutting, NERA disruption, tandem precursor.
// Pure JS (no three.js) so it can be unit-tested in node. NOT a hydrocode. Results are approximate.
import { CORES, MATERIALS, PROJECTILES } from './data.js';
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const RHO_RHA = 7850, RHO_CU = 8900;

export function plateAxes(p) { // R = Ry(ay) * Rz(ax); columns = local x (thickness), y (height), z (width)
  const a = -rad(p.ax), b = rad(p.ay);
  return { ex: [Math.cos(a) * Math.cos(b), Math.sin(a), -Math.cos(a) * Math.sin(b)], ey: [-Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b)], ez: [Math.sin(b), 0, Math.cos(b)] };
}
function rayBox(c, ax, half) { // ray from x=-inf along +x through y=z=0; returns [sIn, sOut, cosEntry] or null
  let s0 = -1e9, s1 = 1e9, ce = 1;
  for (let k = 0; k < 3; k++) {
    const e = [ax.ex, ax.ey, ax.ez][k], h = half[k], oc = -(c[0] * 0 + c[1] * e[1] + c[2] * e[2]) - c[0] * e[0] + 0; // dot(o - c, e) with o=(0,0,0)
    const dc = e[0];
    if (Math.abs(dc) < 1e-9) { if (Math.abs(oc) > h) return null; continue; }
    let t1 = (-h - oc) / dc, t2 = (h - oc) / dc; if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > s0) { s0 = t1; ce = Math.abs(dc); } s1 = Math.min(s1, t2);
  }
  return s0 < s1 ? [s0, s1, ce] : null;
}
// Ribs: bars on the front face of the plate (local -x), running across the width
export function ribBoxes(p) {
  const n = p.ribs | 0, out = []; if (!n) return out; const rh = .04, rw = .04, t = p.t / 1000;
  for (let k = 0; k < n; k++) out.push({ off: [-(t / 2 + rh / 2), -p.h / 2 + (k + .5) * p.h / n, 0], half: [rh / 2, rw / 2, p.w / 2] });
  return out;
}
export function segments(plates) {
  const segs = [];
  plates.forEach((p, i) => {
    const ax = plateAxes(p), c = [p.x, p.y, p.z], half = [p.t / 2000, p.h / 2, p.w / 2];
    const hit = rayBox(c, ax, half); const obl = deg(Math.acos(clamp(Math.abs(ax.ex[0]), 0, 1)));
    if (hit) segs.push({ plate: i, sIn: hit[0], sOut: hit[1], obl, mat: p.mat });
    for (const r of ribBoxes(p)) {
      const rc = [0, 1, 2].map(k => c[k] + ax.ex[k] * r.off[0] + ax.ey[k] * r.off[1] + ax.ez[k] * r.off[2]);
      const h2 = rayBox(rc, ax, r.half); if (h2) segs.push({ plate: i, sIn: h2[0], sOut: h2[1], obl, mat: p.mat, rib: true });
    }
  });
  segs.sort((a, b) => a.sIn - b.sIn);
  const out = []; let last = -1e9;
  for (const s of segs) { if (s.sIn < last) s.sIn = last; if (s.sOut - s.sIn > 1e-5) { out.push(s); last = s.sOut; } }
  for (const s of out) s.los = s.sOut - s.sIn;
  return out;
}

// Lanz-Odermatt semi-infinite penetration (m) into steel of hardness bhn, normal incidence
export function lanzOdermatt(L, D, v, coreKey, bhn = 270) {
  const c = CORES[coreKey], lo = c.lo, vk = v / 1000;
  const s2 = lo.k ? 2.2 * (bhn / 270) : (lo.c0 + lo.c1 * bhn) * bhn / c.rho;
  const f = lo.a / Math.tanh(.283 + .0656 * L / D) * Math.sqrt(c.rho / RHO_RHA) * Math.exp(-s2 / (vk * vk)) * (c.bonus || 1);
  return Math.max(0, f * L);
}
function tateU(v, rp, Y, rt, R) {
  const A = .5 * (rp - rt), B = -rp * v, C = .5 * rp * v * v + Y - R;
  if (C <= 0) return 0;
  if (Math.abs(A) < 1e-6) return clamp(-C / B, 0, v);
  const d = Math.sqrt(Math.max(0, B * B - 4 * A * C)); const r1 = (-B - d) / (2 * A), r2 = (-B + d) / (2 * A);
  if (r1 >= 0 && r1 <= v) return r1; if (r2 >= 0 && r2 <= v) return r2; return clamp(r1, 0, v);
}
function tateSemiInf(L, D, v, rp, Y, R, dt = 5e-7) {
  let P = 0; for (let i = 0; i < 40000 && L > .3 * D && v > 1; i++) { const u = tateU(v, rp, Y, RHO_RHA, R); P += u * dt; L -= (v - u) * dt; v -= Y / (rp * Math.max(L, D)) * dt; if (u <= 0 && v < 50) break; }
  return P;
}
function calibrateR(L, D, v, core) {
  const c = CORES[core], target = lanzOdermatt(L, D, v, core); let lo = .5e9, hi = 25e9;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (tateSemiInf(L, D, v, c.rho, c.Y, m, 1e-6) > target) lo = m; else hi = m; }
  return { R: (lo + hi) / 2, P: target };
}
export const impactVelocity = (pr, v0, range) => pr.type === 'KE' ? v0 * Math.exp(-pr.kloss * range / 1000) : v0;
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// shot = { proj (key), core, cal, D, L, v0, range, plates }
export function simulate(shot) {
  const pr = { ...PROJECTILES[shot.proj], ...(shot.over || {}) };
  const segs = segments(shot.plates), rand = rng(1234);
  const v = impactVelocity(pr, shot.v0 ?? pr.v0, shot.range ?? 0);
  const res = pr.type === 'KE' ? simKE(pr, shot, segs, v, rand) : simCE(pr, shot, segs, v, rand);
  res.segs = segs; res.vImpact = v; res.proj = pr;
  // per-plate summary
  res.plates = shot.plates.map((p, i) => { const ss = segs.filter(s => s.plate === i); const ev = res.segEvents.filter(e => segs[e.seg].plate === i);
    const last = ev[ev.length - 1];
    return { i, mat: p.mat, hit: ss.length > 0, los: ss.reduce((a, s) => a + s.los, 0) * 1000, obl: ss[0]?.obl ?? 0,
      perforated: ev.length ? ev.every(e => e.perforated) : false, reached: ev.length > 0, Lres: last ? last.Lout * 1000 : null, vres: last ? last.vout : null, notes: [...new Set(ev.flatMap(e => e.notes))] }; });
  return res;
}

function simKE(pr, shot, segs, v0, rand) {
  const core = CORES[shot.core || pr.core], D = (shot.D ?? pr.D) / 1000, Ltot = (shot.L ?? pr.L) / 1000;
  const rp = core.rho, Y = core.Y; let L = Ltot * .92; // working length (nose cap excluded)
  const cal = calibrateR(L, D, v0, shot.core || pr.core); const R = cal.R;
  const first = segs.length ? segs[0].sIn : 0, start = first - .45 - Ltot;
  const dt = 2.5e-7; let t = 0, tip = start + Ltot, v = v0, yaw = 0, si = 0, inSeg = false, dwell = 0, consumed = 0;
  const samples = [], segEvents = [], debris = [], holes = [], era = [], bulges = []; let outcome = 'MISS', ric = null, stopped = false, perfAll = true;
  let cur = null; const rec = u => samples.push({ t, tip, tail: tip - L - (Ltot * .08), L, v, u, seg: inSeg ? si : -1 });
  const spawn = (n, p, dir, cone, speed, t0, kind) => { for (let k = 0; k < n; k++) { const a = rand() * Math.PI * 2, th = cone * Math.sqrt(rand()); const sp = speed * (.35 + .65 * rand());
    const d = [dir * Math.cos(th), Math.sin(th) * Math.cos(a), Math.sin(th) * Math.sin(a)]; debris.push({ t0, p: [p, 0, 0], v: d.map(x => x * sp), s: .004 + rand() * .01, kind }); } };
  for (let step = 0; step < 400000; step++) {
    // enter segment?
    if (!inSeg && si < segs.length && tip >= segs[si].sIn) {
      const s = segs[si], m = MATERIALS[s.mat]; inSeg = true; consumed = 0;
      cur = { seg: si, tIn: t, Lin: L, vin: v, notes: [], perforated: false, teBase: m.te };
      if (m.te > .25 && !m.crew) { // ricochet / yaw check
        const Yt = 1.2e9 * Math.max(m.te, .3); const k = .6 * (2 * rp * v * v / (3 * Yt)) * ((L * L + D * D) / (L * D));
        const thc = deg(Math.atan(Math.cbrt(k))) - (shot.plates[s.plate].ribs ? 4 : 0);
        cur.thc = thc;
        if (s.obl > thc) { outcome = 'RICOCHET'; ric = { t, s: tip, obl: s.obl, plate: s.plate }; cur.notes.push(`ricochet (θ ${s.obl.toFixed(0)}° > θc ${thc.toFixed(0)}°)`);
          spawn(30, tip, -1, 1.0, v * .25, t, 'ricochet'); holes.push({ seg: si, sIn: s.sIn, sEnd: s.sIn + Math.min(s.los, 3 * D), r: D * 1.2, t0: t, t1: t + 1e-5, gouge: true });
          cur.Lout = L * .85; cur.vout = v * .8; segEvents.push(cur); break; }
        if (s.obl > thc - 8) { const y = (s.obl - (thc - 8)) / 8; yaw += .5 * y; cur.notes.push(`yaw induced (${(y * 100).toFixed(0)}%)`); }
      }
      if (m.era) { const f = m.era.ke * clamp(Math.sin(rad(s.obl)) / Math.sin(rad(60)), .3, 1.25); L *= 1 - f; yaw += m.era.yaw; cur.notes.push(`ERA triggered: rod −${(f * 100).toFixed(0)}% length`); era.push({ plate: s.plate, t0: t }); }
      if (m.dwell) { dwell = m.dwell * 12e-6 * (s.los / .05) * clamp((1850 - v) / 800, 0, 1); if (dwell > 0) cur.notes.push(`ceramic dwell ${(dwell * 1e6).toFixed(1)} µs`); }
      if (m.nera) bulges.push({ plate: s.plate, t0: t });
      if (m.crew) cur.notes.push('CREW COMPARTMENT REACHED');
      cur.te = m.te * Math.pow(Math.cos(rad(s.obl)), .224) * (1 + yaw);
    }
    let u = v;
    if (inSeg) {
      const s = segs[si], m = MATERIALS[s.mat];
      if (cur.te < .01) u = v; // air-like volume
      else if (dwell > 0) { u = 0; dwell -= dt; }
      else u = tateU(v, rp, Y, RHO_RHA, R);
      if (u < v && cur.te >= .01) { L -= (v - u) * dt; v -= Y / (rp * Math.max(L, D)) * dt; }
      const adv = cur.te < .01 ? u * dt : u * dt / cur.te; tip += adv; consumed += adv;
      // break-out near the back face (plug/bulge failure) or stop
      const remain = (s.sOut - tip) * cur.te;
      if (tip >= s.sOut || (remain < D * (m.te >= .8 && !m.nera ? .5 : .2) * clamp(v / 1500, .4, 1.2) && u > 50)) {
        const plugT = t; tip = Math.max(tip, s.sOut); inSeg = false; cur.perforated = true; cur.Lout = L; cur.vout = v; cur.tOut = t;
        if (m.nera) { L *= 1 - m.nera.ke; yaw += .05; cur.notes.push('NERA bulge: rod disrupted'); }
        const th = s.los * cur.te; if (cur.te >= .05) { const cone = shot.plates.slice(s.plate).some(p => MATERIALS[p.mat].liner) && m.liner ? .15 : .45;
          spawn(Math.round(clamp(25 + th * 900 * (v / 1500), 10, 120)), s.sOut, 1, m.liner ? .15 : cone, v * .7, plugT, 'spall'); spawn(8, s.sIn, -1, .9, v * .12, cur.tIn + 2e-6, 'ejecta'); }
        if (cur.te >= .01) holes.push({ seg: si, sIn: s.sIn, sEnd: s.sOut, r: D * (1 + .4 * yaw) * (m.te > .3 ? 1 : .8), t0: cur.tIn, t1: t, perforated: true });
        segEvents.push(cur); si++;
        if (si >= segs.length) { outcome = 'PERFORATED'; }
      }
      if (inSeg && (L <= .35 * D || v < 60)) {
        cur.Lout = 0; cur.vout = 0; cur.tOut = t; segEvents.push(cur); holes.push({ seg: si, sIn: s.sIn, sEnd: tip, r: D * 1.1, t0: cur.tIn, t1: t, perforated: false });
        spawn(10, s.sIn, -1, .9, 150, cur.tIn + 2e-6, 'ejecta'); outcome = 'STOPPED'; stopped = true; L = 0; rec(0); break;
      }
    } else tip += v * dt;
    t += dt; if (step % 8 === 0) rec(u);
    if (outcome === 'PERFORATED' && tip > (segs.length ? segs[segs.length - 1].sOut : 0) + .6) break;
    if (!segs.length && tip > 1.5) break;
  }
  if (outcome === 'MISS' && segs.length && !ric && !stopped) outcome = 'PERFORATED';
  const tEnd = t + (outcome === 'RICOCHET' ? 1.2e-3 : 3e-4);
  const crewHit = segEvents.some(e => MATERIALS[segs[e.seg].mat].crew) && outcome !== 'STOPPED' || (outcome === 'PERFORATED' && segs.some(s => MATERIALS[s.mat].crew));
  const behind = outcome === 'PERFORATED' && L > .3 * D ? tateSemiInf(L, D, v, rp, Y, R) * 1000 : 0;
  return { type: 'KE', samples, segEvents, debris, holes, era, bulges, outcome, ric, tEnd, Lres: outcome === 'PERFORATED' ? L * 1000 : 0, vres: outcome === 'PERFORATED' ? v : 0, behind, crewHit, R: cal.R, Plo: cal.P * 1000, D, Ltot, start };
}

function simCE(pr, shot, segs, v0, rand) {
  const cal = pr.cal / 1000, first = segs.length ? segs[0].sIn : 0, sDet = first - 1.6 * cal; // liner position at detonation
  const e = sd => sd <= 6 ? .8 + .2 * sd / 6 : Math.max(.3, 1 - .045 * (sd - 6)); const e0 = e(1.6);
  let C = pr.pen / 1000, used = 0, precursor = pr.tandem; const vT = pr.kind === 'rpg' ? 7000 : 8500, vB = 2000;
  const bodyStart = first - .35; const tDet = (first - bodyStart) / v0;
  const dt = 5e-8; let t = tDet, tip = sDet, si = 0, inSeg = false, cur = null; const samples = [], segEvents = [], debris = [], holes = [], era = [], bulges = []; let outcome = 'PERFORATED';
  for (let k = 0; k <= 40; k++) samples.push({ t: tDet * k / 40, tip: bodyStart + (first - bodyStart) * k / 40, body: bodyStart + (first - bodyStart) * k / 40, L: C * 1000, v: v0, u: v0, seg: -1, pre: true });
  const spawn = (n, p, dir, cone, speed, t0, kind) => { for (let k = 0; k < n; k++) { const a = rand() * Math.PI * 2, th = cone * Math.sqrt(rand()), sp = speed * (.3 + .7 * rand()); const d = [dir * Math.cos(th), Math.sin(th) * Math.cos(a), Math.sin(th) * Math.sin(a)]; debris.push({ t0, p: [p, 0, 0], v: d.map(x => x * sp), s: .003 + rand() * .008, kind }); } };
  for (let step = 0; step < 400000; step++) {
    const frac = clamp(used / C, 0, 1), vj = vT - (vT - vB) * frac;
    if (!inSeg && si < segs.length && tip >= segs[si].sIn) {
      const s = segs[si], m = MATERIALS[s.mat]; inSeg = true; cur = { seg: si, tIn: t, Lin: (C - used) * 1000, vin: vj, notes: [], perforated: false };
      if (m.era) { if (precursor) { precursor = false; cur.notes.push('ERA initiated by tandem precursor — main jet unaffected'); era.push({ plate: s.plate, t0: t - 6e-5 }); }
        else { const f = m.era.ce * clamp(Math.sin(rad(Math.max(s.obl, 20))) / Math.sin(rad(60)), .4, 1.15); const rem = C - used; C = used + rem * (1 - f); cur.notes.push(`ERA cut jet: −${(f * 100).toFixed(0)}% of remaining jet`); era.push({ plate: s.plate, t0: t }); } }
      if (m.nera) { const rem = C - used; C = used + rem * (1 - m.nera.ce); cur.notes.push(`NERA bulge disrupted jet −${(m.nera.ce * 100).toFixed(0)}%`); bulges.push({ plate: s.plate, t0: t }); }
      if (m.crew) cur.notes.push('CREW COMPARTMENT REACHED');
      cur.sd = (s.sIn - sDet) / cal; cur.eff = e(cur.sd) / e0; if (cur.sd > 8 && cur.eff < .98) cur.notes.push(`standoff ${cur.sd.toFixed(1)} CD: jet particulated (eff ${(cur.eff * 100).toFixed(0)}%)`);
    }
    let u = vj;
    if (inSeg) {
      const s = segs[si], m = MATERIALS[s.mat];
      if (m.tc < .01) u = vj; else { const rt = Math.max(m.rho, 1000); u = vj / (1 + Math.sqrt(rt / RHO_CU)); used += u * dt * m.tc * Math.max(1, RHO_RHA / Math.max(m.rho, 1000)) ** 0 / cur.eff; }
      tip += u * dt;
      if (tip >= s.sOut) { inSeg = false; cur.perforated = true; cur.Lout = (C - used) * 1000; cur.vout = vj; cur.tOut = t;
        if (m.tc >= .05) { spawn(Math.round(clamp(20 + (C - used) * 120, 8, 90)), s.sOut, 1, m.liner ? .12 : .35, 1500 + 2500 * (1 - frac), t, 'spall'); holes.push({ seg: si, sIn: s.sIn, sEnd: s.sOut, r: cal * .12, t0: cur.tIn, t1: t, perforated: true }); }
        segEvents.push(cur); si++; }
      if (inSeg && used >= C) { cur.Lout = 0; cur.vout = 0; cur.tOut = t; cur.perforated = false; segEvents.push(cur); holes.push({ seg: si, sIn: s.sIn, sEnd: tip, r: cal * .14, t0: cur.tIn, t1: t, perforated: false }); spawn(12, s.sIn, -1, .8, 400, cur.tIn + 1e-6, 'ejecta'); outcome = 'STOPPED'; break; }
    } else tip += vj * dt;
    t += dt; if (step % 20 === 0) samples.push({ t, tip, body: first, L: Math.max(0, C - used) * 1000, v: vj, u, seg: inSeg ? si : -1, jet: true });
    if (si >= segs.length && tip > (segs.length ? segs[segs.length - 1].sOut : 0) + .6) break;
  }
  if (outcome === 'PERFORATED' && C - used < .002) outcome = 'STOPPED';
  const residual = outcome === 'PERFORATED' ? Math.max(0, C - used) * 1000 : 0;
  const crewHit = outcome === 'PERFORATED' && segs.some(s => MATERIALS[s.mat].crew) || segEvents.some(e => MATERIALS[segs[e.seg].mat].crew && e.Lin > 0);
  return { type: 'CE', samples, segEvents, debris, holes, era, bulges, outcome, ric: null, tEnd: t + 2e-4, Lres: residual, vres: outcome === 'PERFORATED' ? vB : 0, behind: residual, crewHit, tDet, sDet, bodyStart, start: bodyStart };
}
