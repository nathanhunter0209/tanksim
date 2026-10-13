// Armor Plate Sandbox — viewport, UI, timeline playback. Physics lives in physics.js (approximate).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PROJECTILES, CORES, MATERIALS, SCENARIOS, DISCLAIMER } from './data.js';
import { simulate, impactVelocity, ribBoxes, semiInfRHA } from './physics.js';
import { buildProjectile } from './projectile.js';

const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const mobile = isTouch || innerWidth < 900;
let quality = mobile ? 'low' : 'high';
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: !mobile, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : 1)); renderer.setSize(innerWidth, innerHeight);
renderer.localClippingEnabled = true; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = quality === 'high'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xc9cbcd);
const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .7;
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, .01, 100);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 5, 4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: .5, far: 15 }); key.shadow.bias = -.0005; key.shadow.normalBias = .01; key.shadow.radius = 4;
scene.add(key, new THREE.HemisphereLight(0xffffff, 0x8a8f94, .8));
const rim = new THREE.DirectionalLight(0xdfe8ff, .8); rim.position.set(-3, 2, -4); scene.add(rim);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .18 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -1.05; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(20, 100, 0xb5b8bb, 0xbdc0c3); grid.position.y = -1.049; scene.add(grid);
const shotLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-3, 0, 0), new THREE.Vector3(4, 0, 0)]), new THREE.LineDashedMaterial({ color: 0x5577aa, dashSize: .03, gapSize: .03, transparent: true, opacity: .5 })); shotLine.computeLineDistances(); scene.add(shotLine);

// section plane (keeps z < offset), hatch cap trick on back faces
const secPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0); let sectionOn = false;
const tipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e3);
const clipMats = new Set();
const clipList = m => sectionOn ? [secPlane, ...(m.userData.tip ? [tipPlane] : [])] : (m.userData.tip ? [tipPlane] : []);
function regClip(m, tip = false) { m.userData.tip = tip; m.clippingPlanes = clipList(m); clipMats.add(m); return m; }
function capMat(color, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .25, side: THREE.DoubleSide, ...extra });
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
    if (!gl_FrontFacing) { float h = step(.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 9.)); gl_FragColor = vec4(mix(diffuseColor.rgb * .55, diffuseColor.rgb * .8, h), 1.); }`); };
  return regClip(m);
}
// colour map (ANSYS-like rainbow)
const CMAP = [[0, [.1, .2, .85]], [.25, [.1, .75, .95]], [.5, [.2, .85, .3]], [.75, [1, .85, .1]], [1, [.95, .15, .1]]];
function cmap(x) { x = Math.min(1, Math.max(0, x)); for (let i = 1; i < CMAP.length; i++) if (x <= CMAP[i][0]) { const [a, ca] = CMAP[i - 1], [b, cb] = CMAP[i], t = (x - a) / (b - a); return ca.map((c, k) => c + (cb[k] - c) * t); } return CMAP[4][1]; }
const GLSL_CMAP = `vec3 cmap(float x){ x = clamp(x,0.,1.); vec3 c0=vec3(.1,.2,.85),c1=vec3(.1,.75,.95),c2=vec3(.2,.85,.3),c3=vec3(1.,.85,.1),c4=vec3(.95,.15,.1);
  return x<.25?mix(c0,c1,x*4.):x<.5?mix(c1,c2,(x-.25)*4.):x<.75?mix(c2,c3,(x-.5)*4.):mix(c3,c4,(x-.75)*4.); }
`;
const mapU = { uOn: { value: 0 }, uMode: { value: 0 }, uVal: { value: 0 }, uTip: { value: 0 }, uHot: { value: 0 }, uJet: { value: 0 }, uTail: { value: 0 } };
function rodMat(color, rough, metal) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, mapU);
    sh.vertexShader = 'varying float vWX;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWX = (modelMatrix * vec4(transformed,1.)).x;');
    sh.fragmentShader = 'varying float vWX; uniform float uOn, uMode, uVal, uTip, uHot, uJet, uTail;\n' + GLSL_CMAP + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (uOn > .5) { float f = uVal; if (uJet > .5) f = mix(.25, 1., clamp((vWX - uTail) / max(uTip - uTail, 1e-4), 0., 1.));
        else if (uMode > .5) f = clamp(.02 + uHot * exp(-(uTip - vWX) / .025), 0., 1.); diffuseColor.rgb = cmap(f); }`); };
  m.customProgramCacheKey = () => 'rodmap'; return regClip(m, true);
}

// ---------------- state ----------------
const S = { proj: 'm829a3', core: 'du', D: 22, L: 800, pen: 500, v0: 1555, range: 1000, plates: [], target: '', mapMode: 0, sel: -1 };
let plateMeshes = [], sim = null, simT = 0, playing = false, speed = 1, built = null;
const clone = o => JSON.parse(JSON.stringify(o));

// ---------------- plates ----------------
const plateGroup = new THREE.Group(); scene.add(plateGroup);
const edgeMat = new THREE.LineBasicMaterial({ color: 0x2a2e33, transparent: true, opacity: .55 });
function buildPlates() {
  for (const m of plateMeshes) { plateGroup.remove(m); m.traverse(o => o.geometry?.dispose()); }
  plateMeshes = S.plates.map((p, i) => {
    const mat = MATERIALS[p.mat]; const g = new THREE.BoxGeometry(p.t / 1000, p.h, p.w);
    const m = new THREE.Mesh(g, capMat(mat.color, mat.crew ? { transparent: true, opacity: .18, depthWrite: false } : {}));
    m.castShadow = !mat.crew; m.receiveShadow = true; m.userData.i = i;
    m.position.set(p.x, p.y, p.z); m.rotation.order = 'YZX'; m.rotation.set(0, THREE.MathUtils.degToRad(p.ay), THREE.MathUtils.degToRad(p.ax));
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat); e.raycast = () => {}; m.add(e);
    for (const r of ribBoxes(p)) { const rb = new THREE.Mesh(new THREE.BoxGeometry(r.half[0] * 2, r.half[1] * 2, r.half[2] * 2), m.material); rb.position.set(...r.off); rb.castShadow = true; rb.userData.i = i; m.add(rb); const re = new THREE.LineSegments(new THREE.EdgesGeometry(rb.geometry), edgeMat); re.raycast = () => {}; rb.add(re); }
    plateGroup.add(m); return m;
  });
  if (S.sel >= S.plates.length) S.sel = S.plates.length - 1; select(S.sel, false); stale();
}
function stale() { clearSim(); }

// ---------------- gizmo / selection ----------------
const tc = new TransformControls(camera, renderer.domElement); tc.setSize(mobile ? 1.1 : .8); scene.add(tc.getHelper());
tc.addEventListener('dragging-changed', e => { controls.enabled = !e.value; });
tc.addEventListener('objectChange', () => { const m = tc.object; if (!m) return; const p = S.plates[m.userData.i];
  p.x = +m.position.x.toFixed(3); p.y = +m.position.y.toFixed(3); p.z = +m.position.z.toFixed(3);
  p.ax = Math.round(THREE.MathUtils.radToDeg(m.rotation.z)); p.ay = Math.round(THREE.MathUtils.radToDeg(m.rotation.y)); m.rotation.x = 0; syncPlateUI(); if (S.target !== 'Custom') markCustom(); stale(); });
function select(i, ui = true) {
  S.sel = i; plateMeshes.forEach((m, k) => m.material.emissive.setHex(k === i ? 0x1d3d66 : 0)); if (i >= 0 && plateMeshes[i]) tc.attach(plateMeshes[i]); else tc.detach();
  syncPlateUI(); if (ui && i >= 0) openPop(lastTap); else if (i < 0) closePop();
}
const ray = new THREE.Raycaster(); let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => { lastTap = [e.clientX + 16, e.clientY]; if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6 || tc.dragging) return;
  ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1), camera);
  const h = ray.intersectObjects(plateMeshes, true).find(x => x.object.userData.i != null); if (h) select(h.object.userData.i); else if (!tc.axis) select(-1); });
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'Delete') delSel(); if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); dup(); } if (e.key === 'c') toggleSection(); if (e.key === 'Escape' || e.key === ' ') togglePlay(); if (e.key === 'f') fire(); });

// ---------------- UI build (simple 3-step flow + Advanced drawer) ----------------
const groups = {}; for (const [k, p] of Object.entries(PROJECTILES)) (groups[p.country] ||= []).push(k);
$('round').innerHTML = Object.entries(groups).map(([g, ks]) => `<optgroup label="${g}">${ks.map(k => `<option value="${k}">${PROJECTILES[k].name}${PROJECTILES[k].type === 'KE' ? ' · APFSDS' : PROJECTILES[k].tandem ? ' · tandem HEAT' : ' · HEAT'}</option>`).join('')}</optgroup>`).join('');
$('target').innerHTML = Object.entries(SCENARIOS).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('') + '<option value="custom">Custom…</option>';
$('cores').innerHTML = Object.entries(CORES).map(([k, c]) => `<button data-c="${k}">${c.name}</button>`).join('');
const mg = {}; for (const [k, m] of Object.entries(MATERIALS)) (mg[m.group] ||= []).push(k);
$('pMat').innerHTML = Object.entries(mg).map(([g, ks]) => `<optgroup label="${g}">${ks.map(k => `<option value="${k}">${MATERIALS[k].name}</option>`).join('')}</optgroup>`).join('');
$('round').onchange = e => setProj(e.target.value);
$('target').onchange = e => { const v = e.target.value; if (v === 'custom') markCustom(); else loadScenario(v); };
document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { S.core = b.dataset.c; syncProjUI(); stale(); });
function markCustom() { $('tdesc').textContent = ''; S.target = 'Custom'; $('target').value = 'custom'; $('custom').classList.add('show'); renderChips(); overlay(); }
function renderChips() { $('chips').innerHTML = S.plates.map((p, i) => `<button class="chip${i === S.sel ? ' on' : ''}" data-chip="${i}"><b>${i + 1}</b> ${MATERIALS[p.mat].name}<br><span class="hint">${p.t} mm · ${p.ax}°</span></button>`).join('');
  document.querySelectorAll('[data-chip]').forEach(b => b.onclick = e => { const r = b.getBoundingClientRect(); lastTap = [r.right + 10, r.top]; select(+b.dataset.chip); }); }
let lastTap = [innerWidth / 2, innerHeight / 3];
function openPop([x, y] = lastTap) { const p = S.plates[S.sel]; if (!p) return; const pop = $('pop'); pop.classList.add('show');
  $('popT').textContent = `Plate ${S.sel + 1}`; $('pMat').value = p.mat; $('iT').value = p.t; $('vT').textContent = p.t + ' mm'; $('iAX').value = p.ax; $('vAX').textContent = p.ax + '°';
  if (innerWidth > 900) { pop.style.left = Math.min(innerWidth - 320, Math.max(390, x)) + 'px'; pop.style.top = Math.min(innerHeight - 330, Math.max(20, y - 40)) + 'px'; } }
function closePop() { $('pop').classList.remove('show'); }
$('popX').onclick = () => select(-1);
const editPlate = (k, v) => { if (S.sel < 0) return; S.plates[S.sel][k] = v; markCustom(); buildPlates(); };
$('pMat').onchange = e => editPlate('mat', e.target.value);
const bind = (id, fn) => $(id).oninput = e => { fn(+e.target.value); };
bind('iT', v => { editPlate('t', v); $('vT').textContent = v + ' mm'; }); bind('iAX', v => { editPlate('ax', v); $('vAX').textContent = v + '°'; });
bind('iD', v => { S.D = v; syncProjUI(); stale(); }); bind('iL', v => { S.L = v; syncProjUI(); stale(); }); bind('iP', v => { S.pen = v; syncProjUI(); stale(); });
bind('iV', v => { S.v0 = v; syncProjUI(); stale(); }); bind('iR', v => { S.range = v; syncProjUI(); stale(); }); bind('iPB', v => { $('vPB').textContent = v; });
const pb = (id, k) => bind(id, v => editPlate(k, v));
pb('iAY', 'ay'); pb('iX', 'x'); pb('iW', 'w'); pb('iH', 'h'); pb('iRB', 'ribs');
$('add').onclick = () => { const last = S.plates[S.plates.length - 1]; S.plates.push({ mat: 'rha', x: last ? +(last.x + Math.max(.15, last.t / 1000 + .1)).toFixed(2) : 0, y: 0, z: 0, t: 30, ax: 0, ay: 0, w: 1, h: 1 }); S.sel = S.plates.length - 1; markCustom(); buildPlates(); frame(); openPop(); };
const delSel = () => { if (S.sel < 0) return; S.plates.splice(S.sel, 1); S.sel = -1; markCustom(); buildPlates(); closePop(); };
const dup = () => { if (S.sel < 0) return; const p = clone(S.plates[S.sel]); p.x = +(p.x + .15).toFixed(2); S.plates.splice(S.sel + 1, 0, p); S.sel++; markCustom(); buildPlates(); };
$('trash').onclick = delSel; $('dup').onclick = dup; $('clr').onclick = () => { S.plates = []; S.sel = -1; markCustom(); buildPlates(); };
const setAdv = on => { $('adv').classList.toggle('show', on); $('advBtn').textContent = on ? 'Advanced ▾' : 'Advanced ▸'; if (on) $('adv').scrollTop = 0; if (innerWidth > 900 && autoFrame) frame(true); };
$('advBtn').onclick = () => setAdv(!$('adv').classList.contains('show')); $('advX').onclick = () => setAdv(false);
$('sec').onclick = () => toggleSection(); bind('iSO', v => { $('vSO').textContent = v; secPlane.constant = v / 1000; });
$('cmap').onclick = () => { S.mapMode = 1 - S.mapMode; $('cmap').textContent = 'Map: ' + (S.mapMode ? 'temperature' : 'velocity'); drawLegend(); };
$('gMove').onclick = () => { tc.setMode('translate'); pillset(); }; $('gRot').onclick = () => { tc.setMode('rotate'); tc.showX = false; pillset(); };
const pillset = () => { $('gMove').classList.toggle('on', tc.mode === 'translate'); $('gRot').classList.toggle('on', tc.mode === 'rotate'); tc.showX = tc.mode === 'translate'; };
let autoFrame = true; $('autoF').onclick = () => { autoFrame = !autoFrame; $('autoF').classList.toggle('on', autoFrame); };
$('rview').onclick = () => frame(); $('qual').onclick = () => setQuality(quality === 'high' ? 'low' : 'high');
$('pp').onclick = () => togglePlay(); $('fire').onclick = () => fire();
document.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { speed = +b.dataset.sp; document.querySelectorAll('[data-sp]').forEach(x => x.classList.toggle('on', x === b)); });
$('scrub').oninput = e => { if (!sim) return; playing = false; $('pp').textContent = '▶'; simT = +e.target.value / 1000 * sim.tEnd; };
function toggleSection(v = !sectionOn) { sectionOn = v; $('sec').textContent = 'Section: ' + (v ? 'on' : 'off'); $('sec').classList.toggle('on', v); for (const m of clipMats) { m.clippingPlanes = clipList(m); m.needsUpdate = true; } }
function togglePlay() { if (!sim) return; playing = !playing; if (playing && simT >= sim.tEnd) simT = 0; $('pp').textContent = playing ? '❚❚' : '▶'; }
function setQuality(q) { quality = q; $('qual').textContent = 'Quality: ' + (q === 'high' ? 'High' : 'Low'); renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 2 : 1)); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = q === 'high'; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }

function setProj(k, keepVals = false) {
  const p = PROJECTILES[k]; S.proj = k; if (!keepVals) { S.v0 = p.v0; if (p.type === 'KE') { S.core = p.core; S.D = p.D; S.L = p.L; } else S.pen = p.pen; }
  syncProjUI(); stale();
}
function syncProjUI() {
  const p = PROJECTILES[S.proj], ke = p.type === 'KE';
  $('round').value = S.proj;
  document.querySelectorAll('[data-c]').forEach(b => { b.classList.toggle('on', b.dataset.c === S.core); b.disabled = !ke; b.style.opacity = ke ? 1 : .4; }); spec();
  $('slD').style.display = $('slL').style.display = ke ? '' : 'none'; $('slP').style.display = ke ? 'none' : '';
  for (const [i, v] of [['iD', S.D], ['iL', S.L], ['iP', S.pen], ['iV', S.v0], ['iR', S.range]]) $(i).value = v;
  $('vD').textContent = S.D; $('vL').textContent = S.L; $('vP').textContent = S.pen; $('vV').textContent = S.v0; $('vR').textContent = S.range; $('vPB').textContent = $('iPB').value;
  buildRod(); overlay();
}
function syncPlateUI() {
  const p = S.plates[S.sel]; const m = p && MATERIALS[p.mat];
  $('plName').textContent = p ? `Plate ${S.sel + 1}: ${m.name} · ρ ${m.rho} kg/m³${m.R ? ` · R ≈ ${(m.R / 1e9).toFixed(1)} GPa` : ''} (public estimate)` : 'Tap a plate to select it.';
  renderChips(); if (!p) return;
  for (const [i, k] of [['T', 't'], ['AX', 'ax'], ['AY', 'ay'], ['X', 'x'], ['W', 'w'], ['H', 'h'], ['RB', 'ribs']]) { $('i' + i).value = p[k] || 0; $('v' + i).textContent = (p[k] || 0) + (i === 'T' ? ' mm' : i === 'AX' ? '°' : ''); }
  $('pMat').value = p.mat;
}
function spec() { const p = PROJECTILES[S.proj], vi = impactVelocity(p, S.v0, S.range), mass = rod ? rod.mass : 0;
  $('spec').textContent = p.type === 'KE' ? `${S.v0} m/s muzzle (${vi.toFixed(0)} at ${S.range} m) · rod ${S.L} mm × ${S.D} mm · ${(mass).toFixed(1)} kg · ${CORES[S.core].name}`
    : `${S.v0} m/s · ~${S.pen} mm RHA nominal${p.tandem ? ' · tandem' : ''} · ${p.cal} mm · ~${mass.toFixed(1)} kg`; }
function overlay() {
  const p = PROJECTILES[S.proj]; $('ovTitle').textContent = `${p.type === 'KE' ? p.cal + 'mm ' : ''}${p.name} ${p.type === 'KE' ? 'APFSDS' : p.tandem ? '(tandem HEAT)' : 'HEAT'}`;
  $('ovV').textContent = `${impactVelocity(p, S.v0, S.range).toFixed(0)} m/s`; $('ovR').textContent = `${S.range} m`; $('ovT').textContent = S.target || 'Custom plate setup';
}
function drawLegend() {
  const c = $('legend'), g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); c.style.display = sim ? 'block' : 'none';
  const temp = S.mapMode === 1, max = temp ? 1414 : (sim ? sim.vImpact : S.v0), min = temp ? 22 : 0;
  g.fillStyle = '#222'; g.font = '10px system-ui'; g.fillText(temp ? 'Temperature (°C, approx.)' : 'Velocity (m/s)', 2, 10);
  for (let i = 0; i < 9; i++) { const f = 1 - i / 8, col = cmap(f); g.fillStyle = `rgb(${col.map(x => x * 255 | 0)})`; g.fillRect(2, 16 + i * 22, 14, 21); g.strokeStyle = '#333'; g.strokeRect(2.5, 16.5 + i * 22, 13, 20);
    g.fillStyle = '#222'; g.font = i === 0 || i === 8 ? 'bold 10px system-ui' : '10px system-ui'; g.fillText((min + (max - min) * f).toFixed(0) + (i === 0 ? ' Max' : i === 8 ? ' Min' : ''), 20, 30 + i * 22); }
}
function drawScale() {
  const c = $('scalebar'), g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  const d = camera.position.distanceTo(controls.target), hw = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), ppm = innerHeight / hw;
  const nice = [.01, .02, .05, .1, .2, .4, .5, 1, 2, 5].find(n => n * ppm >= 120) || 5; const w = nice * ppm, x0 = (c.width - w) / 2;
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#fff' : '#111'; g.fillRect(x0 + i * w / 4, 18, w / 4, 7); } g.strokeStyle = '#111'; g.strokeRect(x0 + .5, 18.5, w, 7);
  g.fillStyle = '#111'; g.font = '10px system-ui'; g.textAlign = 'center';
  for (let i = 0; i <= 4; i++) { const v = nice * i / 4; g.fillText(v.toFixed(3), x0 + i * w / 4, i % 2 ? 38 : 13); } g.textAlign = 'left'; g.fillText('(m)', x0 + w + 6, 13);
}

// ---------------- projectile & dynamic visuals ----------------
const dyn = new THREE.Group(); scene.add(dyn);
let rod = null;
function buildRod() {
  if (rod) { dyn.remove(rod.group); rod.group.traverse(o => o.geometry?.dispose()); }
  const p = PROJECTILES[S.proj]; rod = buildProjectile(p, { D: S.D, L: S.L, core: S.core }, rodMat); dyn.add(rod.group);
  $('mass').textContent = `Mass: ${(rod.mass * 1000).toFixed(0)} g ${p.type === 'KE' ? '(penetrator + fins, from geometry × density)' : '(approx.)'}`; $('pinfo').textContent = rod.info + ' · public estimate';
  placeRodIdle(); spec();
}
function placeRodIdle() { if (!rod) return; const first = Math.min(0, ...S.plates.map(p => p.x - p.t / 2000 - .1)); rod.group.position.set(first - .35, 0, 0); rod.group.rotation.set(0, 0, 0); rod.group.visible = true; tipPlane.constant = 1e3; mapU.uOn.value = 0; }
let holes = [], debrisMesh = null, jet = null, tipCap = null, flyers = [];
function clearSim() {
  sim = null; playing = false; for (const o of [...dyn.children]) if (!rod || o !== rod.group) { dyn.remove(o); o.traverse?.(x => x.geometry?.dispose()); }
  holes = []; debrisMesh = null; jet = null; tipCap = null; flyers = []; plateMeshes.forEach(m => { m.visible = true; m.scale.set(1, 1, 1); });
  placeRodIdle(); drawLegend(); $('rtab').innerHTML = 'Press FIRE to run the shot.'; $('verdict').classList.remove('show'); drawChart(); $('tread').textContent = '0.0 µs'; $('scrub').value = 0; overlay();
}
function fire() {
  clearSim(); const p = PROJECTILES[S.proj];
  sim = simulate({ proj: S.proj, core: S.core, D: S.D, L: S.L, v0: S.v0, range: S.range, plates: S.plates, over: p.type === 'CE' ? { pen: S.pen } : {} });
  window.__result = summarize();
  // holes: dark channel (visible in section) + entry/exit discs on plate faces
  const holeMat = regClip(new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3 }));
  const rimMat = regClip(new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: .9, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false }));
  for (const h of sim.holes) {
    const seg = sim.segs[h.seg], pm = plateMeshes[seg.plate]; const ch = new THREE.Mesh(new THREE.CylinderGeometry(h.r, h.r, 1, 20, 1, true).rotateZ(Math.PI / 2), holeMat); ch.visible = false; dyn.add(ch);
    const discs = []; for (const s of [h.sIn, h.perforated ? h.sEnd : null]) { if (s == null) continue;
      const d = new THREE.Mesh(new THREE.CircleGeometry(h.r * 1.15, 24), holeMat); const r = new THREE.Mesh(new THREE.RingGeometry(h.r * 1.15, h.r * 1.6, 24), rimMat.clone()); regClip(r.material);
      for (const o of [d, r]) { o.position.set(s, 0, 0); o.quaternion.copy(pm.quaternion); o.rotateY(s === h.sIn ? -Math.PI / 2 : Math.PI / 2); o.translateZ(.0015); o.scale.y = 1; o.visible = false; dyn.add(o); }
      const cosO = Math.cos(THREE.MathUtils.degToRad(seg.obl)); d.scale.x = r.scale.x = 1 / Math.max(cosO, .2); discs.push([d, r, s]); }
    holes.push({ h, ch, discs });
  }
  // debris
  const N = Math.min(sim.debris.length, quality === 'high' ? 700 : 220);
  if (N) { debrisMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), regClip(new THREE.MeshStandardMaterial({ roughness: .6, metalness: .3 })), N); debrisMesh.frustumCulled = false; debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < N; i++) debrisMesh.setColorAt(i, new THREE.Color(1, 1, 1)); dyn.add(debrisMesh); }
  if (p.type === 'CE') { jet = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2).translate(.5, 0, 0), rodMat(0xffaa66, .3, .8)); jet.visible = false; dyn.add(jet); }
  tipCap = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), regClip(new THREE.MeshBasicMaterial({ color: 0xffaa55, toneMapped: false }))); tipCap.visible = false; dyn.add(tipCap);
  for (const e of sim.era) { const pm = plateMeshes[e.plate]; const f = []; for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(S.plates[e.plate].t / 4000, S.plates[e.plate].h, S.plates[e.plate].w), pm.material); m.quaternion.copy(pm.quaternion); m.visible = false; dyn.add(m); f.push({ m, s }); } flyers.push({ e, pm, f }); }
  simT = 0; playing = true; $('pp').textContent = '❚❚'; drawLegend(); showResults(); closePop(); select(-1, false); if (autoFrame) frame(true);
}
function sampleAt(t) { const a = sim.samples; let lo = 0, hi = a.length - 1; if (t <= a[0].t) return a[0]; if (t >= a[hi].t) return a[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m].t <= t) lo = m; else hi = m; } const A = a[lo], B = a[hi], k = (t - A.t) / (B.t - A.t || 1); const o = { ...A }; for (const f of ['tip', 'tail', 'L', 'v', 'u', 'body']) if (A[f] != null) o[f] = A[f] + (B[f] - A[f]) * k; return o; }
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpC = new THREE.Color();
function updateSim() {
  if (!sim) return; const t = simT, s = sampleAt(t), p = PROJECTILES[S.proj]; mapU.uOn.value = 1; mapU.uMode.value = S.mapMode; mapU.uJet.value = 0;
  const v0 = sim.vImpact;
  if (sim.type === 'KE') {
    const ric = sim.ric && t > sim.ric.t; mapU.uVal.value = s.v / v0;
    if (!ric) { rod.group.rotation.set(0, 0, 0); rod.group.position.set(s.tail + rod.length, 0, 0); tipPlane.constant = s.tip; mapU.uTip.value = s.tip; }
    else { const dtR = t - sim.ric.t, pl = S.plates[sim.ric.plate], a = THREE.MathUtils.degToRad(pl.ax), dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).normalize(); // deflect along the face
      rod.group.position.set(sim.ric.s, 0, 0).addScaledVector(dir, v0 * .75 * dtR); rod.group.rotation.set(0, 0, a); tipPlane.constant = 1e3; }
    const eroding = s.seg >= 0 && s.u < s.v - 1; mapU.uHot.value = Math.max(mapU.uHot.value * .0 + (eroding ? 1 : 0), s.L < rod.length * .9 ? .55 * Math.exp(-(t - (sim.segEvents.at(-1)?.tOut || t)) / 3e-4) : 0);
    tipCap.visible = eroding && !ric; if (tipCap.visible) { tipCap.position.set(s.tip, 0, 0); tipCap.scale.setScalar(S.D / 1000 * .75); tipCap.material.color.setRGB(...cmap(S.mapMode ? 1 : s.v / v0)); }
    rod.group.visible = s.L > 0.001 || t < 1e-9;
  } else {
    const det = t >= sim.tDet; rod.group.visible = !det || t < sim.tDet + 4e-5; rod.group.position.set((det ? sim.samples[40].body : s.body) - 0, 0, 0); tipPlane.constant = 1e3; mapU.uVal.value = .1;
    jet.visible = det && s.L > 0; if (jet.visible) { const tail = sim.sDet + Math.min(2000 * (t - sim.tDet), Math.max(0, s.tip - sim.sDet) * .6); const r = p.cal / 1000 * .035; jet.position.set(tail, 0, 0); jet.scale.set(Math.max(.001, s.tip - tail), r, r); mapU.uJet.value = 1; mapU.uTip.value = s.tip; mapU.uTail.value = tail; }
    tipCap.visible = det && s.seg >= 0; if (tipCap.visible) { tipCap.position.set(s.tip, 0, 0); tipCap.scale.setScalar(p.cal / 1000 * .06); tipCap.material.color.setRGB(...cmap(s.v / 8500)); }
  }
  for (const { h, ch, discs } of holes) { const tip = Math.min(sampleAt(Math.min(t, h.t1)).tip, h.sEnd); const on = t >= h.t0; const len = Math.max(.0005, tip - h.sIn);
    ch.visible = on; ch.position.set(h.sIn + len / 2, 0, 0); ch.scale.set(len, 1, 1);
    for (const [d, r, sx] of discs) { const vis = on && (sx === h.sIn || t >= h.t1); d.visible = r.visible = vis; const age = t - (sx === h.sIn ? h.t0 : h.t1); r.material.color.setRGB(...cmap(Math.max(.05, 1 - age / 4e-4))); r.material.opacity = Math.max(.25, 1 - age / 6e-4); } }
  if (debrisMesh) { const n = debrisMesh.count; for (let i = 0; i < n; i++) { const d = sim.debris[i], age = t - d.t0;
      if (age < 0) { tmpM.makeScale(0, 0, 0); } else { tmpQ.setFromAxisAngle(new THREE.Vector3(1, 1, 0).normalize(), age * 4e4 + i); tmpM.compose(new THREE.Vector3(d.p[0] + d.v[0] * age, d.p[1] + d.v[1] * age, d.p[2] + d.v[2] * age), tmpQ, new THREE.Vector3(d.s, d.s, d.s)); }
      debrisMesh.setMatrixAt(i, tmpM); const sp = Math.hypot(...d.v); tmpC.setRGB(...cmap(S.mapMode ? Math.exp(-Math.max(0, age) / 4e-4) * .95 : sp / v0)); debrisMesh.setColorAt(i, tmpC); }
    debrisMesh.instanceMatrix.needsUpdate = true; debrisMesh.instanceColor.needsUpdate = true; }
  for (const { e, pm, f } of flyers) { const on = t >= e.t0; pm.visible = !on; const p2 = S.plates[e.plate]; const ex = new THREE.Vector3(1, 0, 0).applyQuaternion(pm.quaternion);
    for (const { m, s: sg } of f) { m.visible = on; m.position.copy(pm.position).addScaledVector(ex, sg * (p2.t / 4000 + Math.max(0, t - e.t0) * 350)); } }
  for (const b of sim.bulges) { const pm = plateMeshes[b.plate]; const k = t >= b.t0 ? Math.min(1, (t - b.t0) / 6e-5) : 0; pm.scale.x = 1 + .35 * k; }
  $('tread').textContent = `${(t * 1e6).toFixed(1)} / ${(sim.tEnd * 1e6).toFixed(0)} µs`; $('scrub').value = Math.round(t / sim.tEnd * 1000);
}
function summarize() { return { outcome: sim.outcome, vImpact: sim.vImpact, behind: sim.behind, Lres: sim.Lres, vres: sim.vres, crewHit: sim.crewHit, plates: sim.plates.map(p => ({ mat: p.mat, los: +p.los.toFixed(1), perforated: p.perforated, notes: p.notes })) }; }
function showResults() {
  const r = sim, ke = r.type === 'KE';
  $('rtab').innerHTML = `<span class="out ${r.outcome}">${r.outcome}</span> ${r.crewHit ? '<b class="note">· crew compartment reached</b>' : ''}
    <div class="desc" style="margin:2px 0">Impact ${r.vImpact.toFixed(0)} m/s · ${ke ? `semi-inf. RHA equivalent ${(semiInfRHA(r.Ltot * .93, r.D, r.vImpact, CORES[S.core].rho, CORES[S.core].Y) * 1000).toFixed(0)} mm · ` : ''}${ke && r.yaw ? `exit yaw ${r.yaw.toFixed(1)}° · ` : ''}behind-armor residual <b>${r.behind.toFixed(0)} mm RHA</b>${ke && r.outcome === 'PERFORATED' ? ` · rod ${r.Lres.toFixed(0)} mm @ ${r.vres.toFixed(0)} m/s` : ''}</div>
    <table><tr><th>#</th><th>Material</th><th>LOS mm</th><th>θ</th><th>${ke ? 'Rod out mm' : 'Jet left mm'}</th><th>${ke ? 'v out' : 'tip v'}</th><th>Result</th></tr>
    ${r.plates.map(p => `<tr><td>${p.i + 1}</td><td>${MATERIALS[p.mat].name}</td><td>${p.hit ? p.los.toFixed(0) : 'miss'}</td><td>${p.hit ? p.obl.toFixed(0) + '°' : ''}</td><td>${p.Lres != null ? p.Lres.toFixed(0) : '—'}</td><td>${p.vres != null ? p.vres.toFixed(0) : '—'}</td><td>${!p.reached ? (p.hit ? 'not reached' : '') : p.notes.some(n => /ricochet/.test(n)) ? 'RICOCHET' : p.perforated ? 'perforated' : 'stopped'}${p.notes.length ? `<br><i class="note">${p.notes.join('; ')}</i>` : ''}</td></tr>`).join('')}</table>
    <div class="desc">${DISCLAIMER}</div>`;
  drawChart();
}
function drawChart() {
  const c = $('chart'), g = c.getContext('2d'), W = c.width, H = c.height; g.fillStyle = '#22262a'; g.fillRect(0, 0, W, H);
  g.font = '18px system-ui'; g.fillStyle = '#9aa5ad'; if (!sim) { g.fillText('Velocity & rod length vs time', 20, 34); return; }
  const a = sim.samples, t0 = a[0].t, t1 = sim.tEnd, ke = sim.type === 'KE', vMax = ke ? sim.vImpact : 8500, lMax = ke ? S.L : Math.max(...a.map(x => x.L), 1);
  const X = t => 50 + (t - t0) / (t1 - t0) * (W - 70), Yv = v => H - 36 - v / vMax * (H - 70), Yl = l => H - 36 - l / lMax * (H - 70);
  g.strokeStyle = '#3c4248'; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(50, Yv(vMax * i / 4)); g.lineTo(W - 20, Yv(vMax * i / 4)); g.stroke(); }
  const line = (f, col) => { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); a.forEach((s, i) => { const x = X(s.t), y = f(s); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.lineWidth = 1; };
  line(s => Yv(ke ? s.v : s.v * (s.L > 0 ? 1 : 0)), '#5fb0ff'); line(s => Yl(s.L), '#ffb24a');
  g.fillStyle = '#5fb0ff'; g.fillText(ke ? `v (m/s, max ${vMax.toFixed(0)})` : `jet tip v (max ${vMax})`, 54, 22); g.fillStyle = '#ffb24a'; g.fillText(ke ? `rod length (mm, max ${lMax})` : `jet capacity (mm RHA)`, 54, 44);
  g.fillStyle = '#9aa5ad'; g.fillText(`t (µs) ${(t0 * 1e6).toFixed(0)} – ${(t1 * 1e6).toFixed(0)}`, W - 210, H - 10);
  const cx = X(simT); g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(cx, 50); g.lineTo(cx, H - 36); g.stroke();
}

function verdict() { const r = sim, ke = r.type === 'KE'; const los = r.plates.filter(p => p.hit && p.reached).reduce((a, p) => a + p.los, 0);
  const third = r.outcome === 'RICOCHET' ? [`${(r.plates.find(p => p.notes.some(n => /ricochet/.test(n)))?.obl ?? 0).toFixed(0)}°`, 'impact obliquity']
    : r.outcome === 'PERFORATED' ? (ke ? [`${r.Lres.toFixed(0)} mm`, `rod left @ ${r.vres.toFixed(0)} m/s`] : [`${r.behind.toFixed(0)} mm`, 'RHA left in jet']) : [`${(r.plates.filter(p => p.reached).length)}/${r.plates.length}`, 'plates reached'];
  $('vWord').className = r.outcome; $('vWord').textContent = r.outcome;
  $('vNums').innerHTML = [[`${r.vImpact.toFixed(0)}`, 'impact m/s'], [`${los.toFixed(0)} mm`, 'armor LOS hit'], third].map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join('');
  $('verdict').classList.add('show'); }

// ---------------- scenarios, save/load/share ----------------
function loadScenario(k) { const sc = SCENARIOS[k]; S.plates = clone(sc.plates); S.target = sc.target; S.range = sc.range; S.sel = -1; setProj(sc.proj); buildPlates(); frame(); $('target').value = k; $('custom').classList.remove('show'); $('tdesc').textContent = sc.desc || ''; overlay(); }
const setup = () => ({ proj: S.proj, core: S.core, D: S.D, L: S.L, pen: S.pen, v0: S.v0, range: S.range, target: S.target, plates: S.plates });
function applySetup(o) { Object.assign(S, { proj: o.proj in PROJECTILES ? o.proj : 'm829a3', core: o.core in CORES ? o.core : 'du', D: +o.D || 22, L: +o.L || 800, pen: +o.pen || 500, v0: +o.v0 || 1500, range: +o.range || 0, target: String(o.target || 'Custom'), plates: (o.plates || []).filter(p => p.mat in MATERIALS).map(p => ({ mat: p.mat, x: +p.x || 0, y: +p.y || 0, z: +p.z || 0, t: +p.t || 10, ax: +p.ax || 0, ay: +p.ay || 0, w: +p.w || 1, h: +p.h || 1, ribs: +p.ribs || 0 })), sel: -1 }); syncProjUI(); buildPlates(); const sk = Object.keys(SCENARIOS).find(k => SCENARIOS[k].target === S.target); if (sk) { $('target').value = sk; $('custom').classList.remove('show'); } else markCustom(); frame(); }
const store = () => { try { return JSON.parse(localStorage.getItem('armorSandbox.setups') || '{}'); } catch { return {}; } };
function refreshLoad() { $('load').innerHTML = '<option value="">Load…</option>' + Object.keys(store()).map(n => `<option>${n.replace(/</g, '')}</option>`).join(''); }
$('save').onclick = () => { const s = store(); const name = `${PROJECTILES[S.proj].name} vs ${S.target || 'custom'} ${new Date().toLocaleTimeString()}`; s[name] = setup(); localStorage.setItem('armorSandbox.setups', JSON.stringify(s)); refreshLoad(); $('save').textContent = 'Saved ✓'; setTimeout(() => $('save').textContent = 'Save', 1200); };
$('load').onchange = e => { const o = store()[e.target.value]; if (o) applySetup(o); e.target.value = ''; };
const enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
$('share').onclick = () => { const h = '#s=' + enc(setup()); history.replaceState(null, '', h); navigator.clipboard?.writeText(location.href).catch(() => {}); $('share').textContent = 'Link copied'; setTimeout(() => $('share').textContent = 'Share', 1500); };
refreshLoad();

// ---------------- camera framing, resize, loop ----------------
// frame(shot): fit rod start → last plate (+ debris room) so the rod and plates stay visible; animated
let camTween = null;
function frame(shot = false) { const b = new THREE.Box3().setFromObject(plateGroup); if (b.isEmpty()) b.set(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5));
  const x0 = Math.min(b.min.x, rod.group.position.x - rod.length) - .05, x1 = b.max.x + (shot ? .45 : .2), cy = (Math.max(b.min.y, -.9) + Math.min(b.max.y, .9)) / 2;
  const w = x1 - x0, h = Math.min(b.max.y - b.min.y, 1.8) + .2, vis = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  // leave room for the control card: left card on desktop, bottom sheet on phones
  const narrow = innerWidth <= 900, advOpen = !narrow && $('adv').classList.contains('show'), left = narrow ? 0 : 400, right = innerWidth - (advOpen ? 410 : 0);
  const effW = (right - left) / innerWidth, effH = narrow ? .55 : 1;
  const d = Math.max(w / (camera.aspect * effW), h / effH) / vis * 1.12, cx = (x0 + x1) / 2 - ((left + right) / 2 / innerWidth - .5) * camera.aspect * vis * d;
  const tgt = new THREE.Vector3(cx, cy - (narrow ? .22 : .02) * d * vis, 0), pos = new THREE.Vector3(cx + d * .18, cy + d * .2, d);
  if (shot) camTween = { t: 0, p0: camera.position.clone(), q0: controls.target.clone(), p1: pos, q1: tgt }; else { camTween = null; controls.target.copy(tgt); camera.position.copy(pos); controls.update(); } }
controls.addEventListener('start', () => { camTween = null; });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
  if (sim && playing) { simT += dt / +$('iPB').value * sim.tEnd * speed; if (simT >= sim.tEnd) { simT = sim.tEnd; playing = false; $('pp').textContent = '▶'; } }
  if (camTween) { camTween.t = Math.min(1, camTween.t + dt / .6); const k = camTween.t * camTween.t * (3 - 2 * camTween.t); camera.position.lerpVectors(camTween.p0, camTween.p1, k); controls.target.lerpVectors(camTween.q0, camTween.q1, k); if (camTween.t >= 1) camTween = null; }
  if (sim) { updateSim(); drawChart(); if (!playing && simT >= sim.tEnd && !$('verdict').classList.contains('show')) verdict(); }
  controls.update(); drawScale(); renderer.render(scene, camera);
});

// boot
let booted = false;
try { if (location.hash.startsWith('#s=')) { const o = dec(location.hash.slice(3)); rod = null; buildRod(); applySetup(o); booted = true; } } catch (e) { console.warn('bad share link', e); }
if (!booted) { buildRod(); loadScenario('strv103'); }
setQuality(quality); toggleSection(false); pillset();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW', e));
window.__app = { S, loadScenario, openAdv: () => setAdv(true), markCustom, addPlate: () => $('add').click(), editPlate, setProj: k => setProj(k), fire, seek: f => { if (sim) { playing = false; $('pp').textContent = '▶'; simT = f * sim.tEnd; } }, section: toggleSection, setMap: m => { S.mapMode = m; drawLegend(); }, get sim() { return sim; }, select, frame };
window.__ready = true;
