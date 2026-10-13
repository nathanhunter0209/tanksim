// Validation of physics.js against published / public-estimate reference values. Run: node validate.mjs
// References are approximate: Anderson, Walker & Hohler-type semi-infinite RHA data for tungsten rods,
// public estimates for named rounds and ERA. Everything here is an approximation.
import { simulate, semiInfRHA } from './physics.js';
import { SCENARIOS } from './data.js';
import { keEquiv, ceEquiv } from './equiv.mjs';
import { runSweep } from './sweep.js';
import { PROJECTILES } from './data.js';
const P = (mat, x, t, ax = 0, extra = {}) => ({ mat, x, y: 0, z: 0, t, ax, ay: 0, w: 1.2, h: 1.2, ...extra });
const block = front => P('rha', front + 2, 4000); // 4 m semi-infinite block, front face at `front`
const depthIn = (r, plateIdx) => { const h = r.holes.filter(h => r.segs[h.seg].plate === plateIdx).pop(); return h ? (h.sEnd - h.sIn) * 1000 : 0; };
const rows = []; let fail = 0;
const check = (name, value, lo, hi, ref, fmt = v => v.toFixed(0)) => { const ok = typeof value === 'boolean' ? value : value >= lo && value <= hi; if (!ok) fail++;
  rows.push([ok ? 'PASS' : 'FAIL', name, typeof value === 'boolean' ? String(value) : fmt(value), typeof value === 'boolean' ? '' : `${fmt(lo)}–${fmt(hi)}`, ref]); };
const t0 = performance.now();
// 1. tungsten long rods, semi-infinite RHA
for (const v of [1500, 1600, 1700]) check(`W alloy L/D 20 into RHA @ ${v} m/s: P/L`, semiInfRHA(.5, .025, v, 17600, 1.2e9) / .5, .88, 1.12, 'Anderson/Hohler compendium ~0.9–1.1', x => x.toFixed(2));
const ld10 = semiInfRHA(.25, .025, 1600, 17600, 1.2e9) / .25, ld30 = semiInfRHA(.75, .025, 1600, 17600, 1.2e9) / .75;
check('P/L decreases with L/D (10 → 30) @1.6 km/s', ld10 > ld30 && ld10 - ld30 < .25, 0, 0, 'Anderson L/D effect, ~5–15%');
check('DU slightly better than W (L/D 20, 1.6 km/s)', semiInfRHA(.5, .025, 1600, 18600, 1.0e9) > semiInfRHA(.5, .025, 1600, 17600, 1.2e9), 0, 0, 'public literature');
// 2. named rounds, semi-infinite RHA
const semi = (proj, range) => { const r = simulate({ proj, range, plates: [block(.15)] }); return depthIn(r, 0); };
for (const k of ['m829a3', '3bm60', 'dm53']) check(`${k.toUpperCase()} @2 km into RHA (mm)`, semi(k, 2000), 650, 800, 'public estimates 650–800 mm');
check('3BM9 @1 km into RHA (mm)', semi('3bm9', 1000), 250, 310, 'public estimates ~250–300 mm');
check('M829 @2 km into RHA (mm)', semi('m829', 2000), 480, 600, 'public estimates ~500–570 mm');
// 3. Strv 103
const strv = SCENARIOS.strv103; const rs = simulate({ proj: '3bm9', range: 1000, plates: strv.plates });
check('3BM9 vs Strv 103 (40mm @78° + ribs): ricochet', rs.outcome === 'RICOCHET', 0, 0, 'SY Simulations-style reference case');
check('M829A3 vs 300 mm RHA @0°: perforates', simulate({ proj: 'm829a3', range: 1000, plates: [P('rha', 0, 300)] }).outcome === 'PERFORATED', 0, 0, 'expected');
check('3BM9 vs 300 mm RHA @0°: stopped', simulate({ proj: '3bm9', range: 1000, plates: [P('rha', 0, 300)] }).outcome !== 'PERFORATED', 0, 0, 'expected');
// 4. Kontakt-5 vs older APFSDS: depth into RHA behind a K-5 block vs bare RHA
const k5 = (proj, range = 1000) => { const bare = depthIn(simulate({ proj, range, plates: [block(.15)] }), 0); const w = depthIn(simulate({ proj, range, plates: [P('k5', 0, 60, 60), block(.15)] }), 1); return 1 - w / bare; };
for (const k of ['m829', '3bm32', 'm829a1']) check(`Kontakt-5 effect on ${k.toUpperCase()} (penetration reduction)`, k5(k) * 100, 20, 40, 'reported ~20–40% vs older APFSDS', x => x.toFixed(0) + '%');
check('Kontakt-5 less effective vs long modern M829A3', k5('m829a3') < k5('m829'), 0, 0, 'M829A3 designed against K-5');
// 5. shaped charges
const ceSemi = (proj, plates) => { const r = simulate({ proj, range: 0, plates }); return depthIn(r, plates.length - 1); };
check('PG-7V into RHA (mm)', ceSemi('pg7v', [block(.15)]), 280, 320, 'public ~300 mm (calibration point)');
const pgK1 = ceSemi('pg7v', [P('k1', 0, 40, 60), block(.15)]); check('Kontakt-1 cuts PG-7V jet (reduction)', (1 - pgK1 / 300) * 100, 40, 90, 'light ERA vs single HEAT ~50–80%', x => x.toFixed(0) + '%');
check('Kornet behind Kontakt-5 into RHA (mm)', ceSemi('kornet', [P('k5', 0, 60, 60), block(.15)]), 1000, 1200, 'public ~1000–1200 mm behind ERA (tandem)');
check('Non-tandem jet behind K-5 strongly reduced', ceSemi('sc', [P('k5', 0, 60, 60), block(.15)]) < .6 * ceSemi('sc', [block(.15)]), 0, 0, 'expected');
const so = cd => { const r = simulate({ proj: 'pg7v', range: 0, plates: [P('alu', 0, 1, 0, { w: .2, h: .2 }), block(.085 * cd)] }); return depthIn(r, 1); };
check('Standoff: ~6 CD deeper than built-in', so(6) > ceSemi('pg7v', [block(.15)]), 0, 0, 'classic standoff curve');
check('Standoff: 25 CD shallower (jet breakup)', so(25) < so(6) * .8, 0, 0, 'jet particulation');
let best = [0, 0]; for (let cd = 0; cd <= 20; cd++) { const d = so(cd); if (d > best[1]) best = [cd, d]; }
check('Standoff optimum (charge diameters)', best[0], 4, 8, 'classic standoff curves peak ~4–8 CD', x => x.toFixed(0) + ' CD');
check('Optimum gain vs built-in standoff (×)', best[1] / ceSemi('pg7v', [block(.15)]), 1.2, 2.0, 'typ. ~1.3–1.8×', x => x.toFixed(2));
// 5b. Stage B public-estimate turret layouts: RHA-equivalent protection and simple outcome sanity
const EST = { t90m: [800, 1050], leo2a7: [850, 1050], ch3: [800, 1000], merkava4: [800, 1000], m1a2: [850, 1000] };
for (const [k, [lo, hi]] of Object.entries(EST)) { const p = SCENARIOS[k].plates;
  check(`${k}: KE RHA-equivalent (mm)`, keEquiv(p), lo, hi, 'public estimates (turret front)');
  check(`${k}: tandem-CE RHA-equivalent (mm)`, ceEquiv(p, 'tandem'), 900, 1900, 'public estimates ~1000–1500+');
  const o = (pj, r) => simulate({ proj: pj, range: r, plates: p }).outcome;
  check(`${k}: M829 @2km and PG-7V both stopped`, o('m829', 2000) !== 'PERFORATED' && o('pg7v', 0) !== 'PERFORATED', 0, 0, 'older threats defeated');
  check(`${k}: has description + 'estimate' label`, /estimate/i.test(SCENARIOS[k].target) && !!SCENARIOS[k].desc, 0, 0, 'labeling'); }
// 5b2. Stage G: re-tuned legacy targets
{ const L = SCENARIOS.leo2a6.plates, T = SCENARIOS.t72b.plates, o = (p, pj, r) => simulate({ proj: pj, range: r, plates: p }).outcome;
  check('leo2a6: KE RHA-equivalent (mm)', keEquiv(L), 700, 850, 'public estimates ~700–800+');
  check('leo2a6: tandem-CE RHA-equivalent (mm)', ceEquiv(L, 'tandem'), 1000, 1900, 'public estimates 1000+');
  check('t72b+K5: KE RHA-equivalent incl. ERA (mm)', keEquiv(T), 750, 800, 'public estimates ~750–800');
  check('t72b+K5: single-HEAT RHA-equivalent (mm)', ceEquiv(T, 'sc'), 900, 1100, 'public estimates ~900–1100');
  check('t72b+K5: tandem RHA-equivalent (mm)', ceEquiv(T, 'tandem'), 650, 800, 'public estimates ~650–800');
  check('t72b+K5: single HEAT notably worse than tandem (×)', ceEquiv(T, 'sc') / ceEquiv(T, 'tandem'), 1.25, 2.0, 'K-5 defeats non-tandem jets', x => x.toFixed(2));
  check('M829 @2km stopped by leo2a6 and t72b', o(L, 'm829', 2000) !== 'PERFORATED' && o(T, 'm829', 2000) !== 'PERFORATED', 0, 0, '1980s DU rod vs late-80s/90s armor');
  const near = (p, pj) => { const v = keEquiv(p), pen = semi(pj, 1000); return Math.abs(pen - v) / v; };
  check('3BM60 vs leo2a6/t72b: marginal (|pen-equiv| / equiv)', Math.max(near(L, '3bm60'), near(T, '3bm60')), 0, .15, 'modern rods roughly match these fronts', x => (x * 100).toFixed(0) + '%');
  check('M829A3 vs leo2a6/t72b: marginal (|pen-equiv| / equiv)', Math.max(near(L, 'm829a3'), near(T, 'm829a3')), 0, .15, 'modern rods roughly match these fronts', x => (x * 100).toFixed(0) + '%');
  check('3BM60 @1km perforates t72b', o(T, '3bm60', 1000) === 'PERFORATED', 0, 0, 'modern Russian rod vs older T-72B'); }
// 5c. sweep charts (stage E)
const ks = (k, plates, range = 0) => { const p = PROJECTILES[k]; return { proj: k, core: p.core, D: p.D, L: p.L, pen: p.pen, v0: p.v0, range, plates }; };
// 5d. Stage H: M829A3 vs T-72B+K5 range crossover, and every default scenario's expected outcome
{ const d = runSweep(ks('m829a3', SCENARIOS.t72b.plates), 'range'); const c = d.cross.find(c => c.from === 'PERFORATED' && c.to !== 'PERFORATED');
  check('M829A3 vs T-72B+K5: perforates close, stopped far (crossover km)', c ? c.x / 1000 : -1, 1, 4, 'marginal at typical ranges', x => x.toFixed(2));
  const EXPECT = { strv103: 'RICOCHET', abrams: 'PERFORATED', t72b: 'PERFORATED', leo2a6: 'STOPPED', t90m: 'STOPPED', leo2a7: 'STOPPED', ch3: 'STOPPED', merkava4: 'STOPPED', m1a2: 'STOPPED', rha300: 'PERFORATED' };
  for (const [k, sc] of Object.entries(SCENARIOS)) { const out = simulate({ proj: sc.proj, range: sc.range, plates: sc.plates }).outcome;
    check(`Default ${k} (${sc.proj} @${sc.range} m): ${EXPECT[k] ?? '?'}`, out === EXPECT[k], 0, 0, 'plausible default outcome'); } }
{ const t0 = performance.now(); const d = runSweep(ks('m829', [P('rha', 0, 480)]), 'range'); const c = d.cross.find(c => c.from === 'PERFORATED' && c.to !== 'PERFORATED');
  check('Range sweep M829 vs 480 mm RHA: perforation limit (km)', c ? c.x / 1000 : -1, .5, 4, 'crossover found; lower velocity at range', x => x.toFixed(2));
  const d2 = runSweep(ks('3bm9', [P('rha', 0, 40)], 1000), 'angle', 0); const c2 = d2.cross.find(c => c.to === 'RICOCHET');
  check('Angle sweep 3BM9 vs 40 mm plate: ricochet onset (°)', c2 ? c2.x : -1, 60, 80, 'Strv-103-type glacis ricochets at high obliquity', x => x.toFixed(1));
  check('Two sweeps run time (ms)', performance.now() - t0, 0, 1500, 'interactive', x => x.toFixed(0)); }
// 6. scenarios + performance
let tmax = 0; for (const [k, sc] of Object.entries(SCENARIOS)) for (const pj of [sc.proj, 'm829a3', 'kornet', 'pg7v']) { const a = performance.now(); simulate({ proj: pj, range: sc.range, plates: sc.plates }); tmax = Math.max(tmax, performance.now() - a); }
check('Max simulate() time per shot (ms)', tmax, 0, 50, 'interactive budget', x => x.toFixed(1));
// print
const w = [5, 52, 9, 13, 44]; console.log(['RES', 'Check', 'Model', 'Range', 'Reference (public estimates)'].map((c, i) => c.padEnd(w[i])).join(' '));
console.log('-'.repeat(126)); for (const r of rows) console.log(r.map((c, i) => String(c).padEnd(w[i])).join(' '));
console.log(`\n${rows.length - fail}/${rows.length} passed in ${(performance.now() - t0).toFixed(0)} ms. All values are approximate public-estimate comparisons.`);
process.exit(fail ? 1 : 0);
