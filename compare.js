// Compare mode (stage D): two configurations side by side in a split view. Each side is the same app in an
// embedded iframe (index.html?embed=1, UI hidden); the parent drives both with one physical clock (synchronized playback).
import { PROJECTILES, SCENARIOS } from './data.js';
const $ = id => document.getElementById(id);
export function initCompare({ S, setup, playLen, speed, setActive }) {
  let on = false, frames = [], ready = false, tC = 0, tMax = 0, playing = false, last = 0, results = null;
  const kind = () => $('cmpKind').value; // 'rounds' | 'targets'
  // B selectors
  $('roundB').innerHTML = $('round').innerHTML; $('targetB').innerHTML = Object.entries(SCENARIOS).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
  $('roundB').value = 'm829'; $('targetB').value = 'rha300';
  const syncKind = () => { const r = kind() === 'rounds'; $('rowRoundB').style.display = r ? '' : 'none'; $('rowTargetB').style.display = r ? 'none' : ''; };
  $('cmpKind').onchange = () => { syncKind(); clearRow(); };
  const preset = (k, base) => { const p = PROJECTILES[k]; return p.type === 'KE' ? { ...base, proj: k, core: p.core, D: p.D, L: p.L, v0: p.v0 } : { ...base, proj: k, pen: p.pen, v0: p.v0 }; };
  const configs = () => { const a = JSON.parse(JSON.stringify(setup())); let b;
    if (kind() === 'rounds') b = preset($('roundB').value, a);
    else { const sc = SCENARIOS[$('targetB').value]; b = { ...a, target: sc.target, plates: JSON.parse(JSON.stringify(sc.plates)) }; }
    return [a, b]; };
  function build() { const box = $('split'); box.innerHTML = ''; frames = []; ready = false;
    for (const side of ['A', 'B']) { const w = document.createElement('div'); w.className = 'pane'; w.innerHTML = `<div class="tag">${side}</div>`; const f = document.createElement('iframe'); f.src = './index.html?embed=1'; f.title = 'Compare ' + side; w.appendChild(f); box.appendChild(w); frames.push(f); }
    return Promise.all(frames.map(f => new Promise(res => { const chk = () => f.contentWindow?.__ready ? res() : setTimeout(chk, 50); f.onload = chk; chk(); }))).then(() => { ready = true; }); }
  function clearRow() { document.body.classList.remove('fired'); $('cmpRow').classList.remove('show'); $('cmpRow').innerHTML = ''; results = null; }
  async function setMode(v) { on = v; document.body.classList.toggle('compare', on); $('cmpBtn').textContent = on ? 'Single shot' : 'Compare ⇆'; $('cmpBox').classList.toggle('show', on); setActive(on); syncKind(); clearRow();
    if (on && !frames.length) await build(); if (on) apply(); }
  function apply() { if (!ready) return; const cfg = configs(); frames.forEach((f, i) => f.contentWindow.__app.apply(cfg[i])); }
  async function fire() { if (!ready) await build(); apply(); clearRow(); const sims = frames.map(f => { const a = f.contentWindow.__app; a.fireStatic(); return a.sim; });
    tMax = Math.max(...sims.map(s => s.tEnd)); tC = 0; playing = true; last = performance.now(); results = frames.map(f => ({ ...f.contentWindow.__result, los: f.contentWindow.__app.sim.plates.filter(p => p.hit && p.reached && !p.notes.some(n => /CREW/.test(n))).reduce((a, p) => a + p.los, 0) })); document.body.classList.add('fired'); requestAnimationFrame(tick); }
  function tick() { if (!playing || !on) return; const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
    tC = Math.min(tMax, tC + dt / playLen() * tMax * speed()); frames.forEach(f => f.contentWindow.__app.seekT(tC));
    if (tC >= tMax) { playing = false; showRow(); } else requestAnimationFrame(tick); }
  function seekAll(frac) { if (!results) return; playing = false; tC = frac * tMax; frames.forEach(f => f.contentWindow.__app.seekT(tC)); if (frac >= 1) showRow(); }
  function showRow() { const cfg = configs(); const label = (c, i) => kind() === 'rounds' ? PROJECTILES[c.proj].name : (i ? SCENARIOS[$('targetB').value].name : (S.target || 'Custom'));
    const cell = (r, c, i) => { const los = r.los;
      const third = r.outcome === 'PERFORATED' ? (r.Lres ? `${r.Lres.toFixed(0)} mm rod left` : `${r.behind.toFixed(0)} mm RHA left`) : r.outcome === 'RICOCHET' ? 'deflected' : 'no perforation';
      return `<div class="cc"><div class="tag2">${'AB'[i]} · ${label(c, i)}</div><div class="vw ${r.outcome}">${r.outcome}</div><div class="hint">${r.vImpact.toFixed(0)} m/s · ${los.toFixed(0)} mm LOS · ${third}</div></div>`; };
    $('cmpRow').innerHTML = results.map((r, i) => cell(r, cfg[i], i)).join('') + `<div class="cc hint">${diffText()}</div>`; $('cmpRow').classList.add('show'); }
  function diffText() { const [a, b] = results; if (a.outcome !== b.outcome) return `Different outcome: A ${a.outcome.toLowerCase()}, B ${b.outcome.toLowerCase()}.`;
    if (a.outcome === 'PERFORATED') return `Both perforate; residual A ${a.behind.toFixed(0)} vs B ${b.behind.toFixed(0)} mm RHA.`; return `Same outcome (${a.outcome.toLowerCase()}).`; }
  $('cmpBtn').onclick = () => setMode(!on); $('cmpEdit').onclick = () => document.body.classList.remove('fired'); $('roundB').onchange = $('targetB').onchange = () => { clearRow(); apply(); };
  return { get on() { return on; }, setMode, fire, apply, seekAll, get results() { return results; }, get done() { return !playing && !!results && tC >= tMax; } };
}
