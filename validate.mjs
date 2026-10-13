// Validation of physics.js against published / public-estimate reference values. Run: node validate.mjs
// References are approximate: Anderson, Walker & Hohler-type semi-infinite RHA data for tungsten rods,
// public estimates for named rounds and ERA. Everything here is an approximation.
import { simulate, semiInfRHA } from './physics.js';
import { SCENARIOS } from './data.js';
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
// 6. scenarios + performance
let tmax = 0; for (const [k, sc] of Object.entries(SCENARIOS)) for (const pj of [sc.proj, 'm829a3', 'kornet', 'pg7v']) { const a = performance.now(); simulate({ proj: pj, range: sc.range, plates: sc.plates }); tmax = Math.max(tmax, performance.now() - a); }
check('Max simulate() time per shot (ms)', tmax, 0, 50, 'interactive budget', x => x.toFixed(1));
// print
const w = [5, 52, 9, 13, 44]; console.log(['RES', 'Check', 'Model', 'Range', 'Reference (public estimates)'].map((c, i) => c.padEnd(w[i])).join(' '));
console.log('-'.repeat(126)); for (const r of rows) console.log(r.map((c, i) => String(c).padEnd(w[i])).join(' '));
console.log(`\n${rows.length - fail}/${rows.length} passed in ${(performance.now() - t0).toFixed(0)} ms. All values are approximate public-estimate comparisons.`);
process.exit(fail ? 1 : 0);
