import { SHELLS } from './data.js';
const D = Math.PI / 180;
export function shellAtRange(key, dist) {
  const s = SHELLS[key];
  const v = Math.max(s.v0 - s.drop * dist / 1000, 50);
  let pen = s.pen;
  if (s.type === 'APFSDS') { const v2 = s.v0 - s.drop * 2; pen = s.pen2km * Math.pow(v / v2, 1.5); }
  return { ...s, key, v, penNow: pen };
}

// angleDeg = angle between reverse shell direction and surface normal
export function resolveShot(shellKey, dist, layers, angleDeg, rng = Math.random) {
  const s = shellAtRange(shellKey, dist);
  const ke = s.type === 'APFSDS';
  let eff = angleDeg;
  if (ke) eff = Math.max(0, angleDeg - s.norm);              // normalization (long-rod: small)
  const cosA = Math.cos(Math.min(eff, 82) * D);
  const losMul = 1 / cosA;
  const out = { shell: s, angle: angleDeg, effAngle: eff, losMul, layers: [], notes: [], pen0: s.penNow };

  // ricochet / fuze failure
  let pRic = 0;
  if (ke) pRic = Math.pow(Math.max(0, (eff - 68) / 17), 2);
  else if (s.type === 'HESH') pRic = Math.pow(Math.max(0, (eff - 65) / 15), 2);
  else pRic = Math.pow(Math.max(0, (eff - 75) / 12), 2);   // HEAT/ATGM graze / fuze fail
  pRic = Math.min(1, pRic); out.pRic = pRic;
  if (rng() < pRic) {
    out.outcome = ke || s.type === 'HESH' ? 'RICOCHET' : 'FUZE FAILURE / GRAZE';
    out.layers = layers.map((l, i) => ({ ...l, eff: (ke ? l.ke : l.ce) * losMul, used: 0, frac: 0, state: i ? 'untouched' : 'scratched' }));
    out.residual = s.penNow; return out;
  }

  if (s.type === 'HESH') {
    const first = layers[0];
    out.layers = layers.map(l => ({ ...l, eff: l.mm, used: 0, frac: 0, state: 'untouched' }));
    if (first.type === 'spaced' || first.type === 'ERA') {
      out.layers[0].state = 'squash head detonated'; out.layers[0].frac = 1; out.layers[0].used = first.mm;
      out.notes.push('HESH detonated on outer spaced/ERA layer — spall wave dissipated in the gap.');
      out.outcome = 'NON-PENETRATION (spaced armor defeated HESH)';
    } else if (first.type !== 'RHA' && first.type !== 'steel') {
      out.layers[0].state = 'shock absorbed'; out.layers[0].frac = 0.5;
      out.notes.push('Multi-layer composite impedance-mismatches the shock wave; no scabbing.');
      out.outcome = 'NON-PENETRATION (composite)';
    } else {
      const t = first.mm / Math.max(0.3, cosA ** 0.5);   // HESH spreads better on slopes
      const ok = t <= s.plate;
      out.layers[0].frac = Math.min(1, s.plate / t); out.layers[0].used = first.mm;
      out.layers[0].state = ok ? 'scabbed - spall ejected inward' : 'cracked';
      out.notes.push(`HESH spall threshold ≈${s.plate} mm plate; struck plate ≈${t.toFixed(0)} mm effective.`);
      out.outcome = ok ? 'SPALL PENETRATION (behind-armor spall)' : 'NON-PENETRATION';
    }
    out.residual = 0; return out;
  }

  let rem = s.penNow;
  let precursorUsed = false;
  for (const l of layers) {
    let val = ke ? l.ke : l.ce;
    let note = '';
    if (l.type === 'ERA') {
      if (s.type === 'TANDEM' && !precursorUsed) { val = 0; precursorUsed = true; note = 'precursor charge initiated ERA'; out.notes.push('Tandem precursor triggered ERA; main jet unaffected.'); }
      else if (s.type === 'HEAT') { note = 'ERA disrupted jet'; out.notes.push('ERA flyer plates disrupted single-charge HEAT jet.'); }
      else if (ke) { note = 'heavy ERA sheared rod'; }
    }
    if (l.type === 'NERA' && !ke) note = note || 'NERA bulging plates degrade jet';
    let e = val * (l.type === 'spaced' && !ke ? 1 : losMul);
    if (l.type === 'spaced' && !ke) e = val * Math.sqrt(losMul); // jet standoff loss mostly distance-based
    const used = Math.min(rem, e);
    rem -= used;
    out.layers.push({ ...l, eff: e, used, frac: e > 0 ? used / e : 1, state: rem > 0 ? 'perforated' : 'stopped here', note });
    if (rem <= 0) { rem = 0; break; }
  }
  for (let i = out.layers.length; i < layers.length; i++) out.layers.push({ ...layers[i], eff: (ke ? layers[i].ke : layers[i].ce) * losMul, used: 0, frac: 0, state: 'untouched' });
  out.residual = rem;
  out.outcome = rem > 0 ? 'PENETRATION' : 'NON-PENETRATION';
  if (rem > 0 && rem < 60) out.outcome = 'PENETRATION (marginal, low spall)';
  return out;
}
