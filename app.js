// Armor Plate Sandbox — viewport, UI, timeline playback. Physics lives in physics.js (approximate).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PROJECTILES, CORES, MATERIALS, SCENARIOS, DISCLAIMER } from './data.js';
import { simulate, impactVelocity, ribBoxes } from './physics.js';
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
  p.ax = Math.round(THREE.MathUtils.radToDeg(m.rotation.z)); p.ay = Math.round(THREE.MathUtils.radToDeg(m.rotation.y)); m.rotation.x = 0; syncPlateUI(); stale(); });
function select(i, ui = true) {
  S.sel = i; plateMeshes.forEach((m, k) => m.material.emissive.setHex(k === i ? 0x1d3d66 : 0)); if (i >= 0 && plateMeshes[i]) tc.attach(plateMeshes[i]); else tc.detach();
  syncPlateUI(); if (ui && mobile && i >= 0) $('right').classList.add('open');
}
const ray = new THREE.Raycaster(); let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6 || tc.dragging) return;
  ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1), camera);
  const h = ray.intersectObjects(plateMeshes, true).find(x => x.object.userData.i != null); if (h) select(h.object.userData.i); else if (!tc.axis) select(-1); });
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'Delete') delSel(); if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); dup(); } if (e.key === 'c') toggleSection(); if (e.key === 'Escape' || e.key === ' ') togglePlay(); if (e.key === 'f') fire(); });

// ---------------- UI build ----------------
const groups = {}; for (const [k, p] of Object.entries(PROJECTILES)) (groups[p.country] ||= []).push(k);
$('projList').innerHTML = Object.entries(groups).map(([g, ks]) => `<div class="grp">${g}</div><div class="btns">${ks.map(k => `<button class="b" data-p="${k}">${PROJECTILES[k].name}</button>`).join('')}</div>`).join('');
$('cores').innerHTML = Object.entries(CORES).map(([k, c]) => `<button class="b" data-c="${k}">${c.name}</button>`).join('');
const mg = {}; for (const [k, m] of Object.entries(MATERIALS)) (mg[m.group] ||= []).push(k);
$('mats').innerHTML = Object.entries(mg).map(([g, ks]) => `<div class="grp">${g}</div><div class="btns">${ks.map(k => `<button class="b" data-m="${k}">${MATERIALS[k].name}</button>`).join('')}</div>`).join('');
$('scen').innerHTML = '<option value="">Scenario…</option>' + Object.entries(SCENARIOS).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => setProj(b.dataset.p));
document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { S.core = b.dataset.c; syncProjUI(); stale(); });
document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { if (S.sel < 0) return; S.plates[S.sel].mat = b.dataset.m; buildPlates(); });
const bind = (id, fn) => $(id).oninput = e => { fn(+e.target.value); };
bind('iD', v => { S.D = v; syncProjUI(); stale(); }); bind('iL', v => { S.L = v; syncProjUI(); stale(); }); bind('iP', v => { S.pen = v; syncProjUI(); stale(); });
bind('iV', v => { S.v0 = v; syncProjUI(); stale(); }); bind('iR', v => { S.range = v; syncProjUI(); stale(); }); bind('iPB', v => { $('vPB').textContent = v; });
const pb = (id, k, f = x => x) => bind(id, v => { if (S.sel < 0) return; S.plates[S.sel][k] = f(v); buildPlates(); });
pb('iT', 't'); pb('iAX', 'ax'); pb('iAY', 'ay'); pb('iX', 'x'); pb('iW', 'w'); pb('iH', 'h'); pb('iRB', 'ribs');
$('add').onclick = () => { const last = S.plates[S.plates.length - 1]; S.plates.push({ mat: 'rha', x: last ? +(last.x + .25).toFixed(2) : 0, y: 0, z: 0, t: 30, ax: 0, ay: 0, w: 1, h: 1 }); S.sel = S.plates.length - 1; buildPlates(); };
const delSel = () => { if (S.sel < 0) return; S.plates.splice(S.sel, 1); S.sel = -1; buildPlates(); };
const dup = () => { if (S.sel < 0) return; const p = clone(S.plates[S.sel]); p.x = +(p.x + .15).toFixed(2); S.plates.splice(S.sel + 1, 0, p); S.sel++; buildPlates(); };
$('del').onclick = delSel; $('del2').onclick = delSel; $('dup').onclick = dup; $('clr').onclick = () => { S.plates = []; S.sel = -1; S.target = 'Custom'; buildPlates(); };
$('scen').onchange = e => { if (e.target.value) loadScenario(e.target.value); };
$('tLeft').onclick = () => { $('left').classList.toggle('open'); $('right').classList.remove('open'); };
$('tRight').onclick = () => { $('right').classList.toggle('open'); $('left').classList.remove('open'); };
$('viewHd').onclick = () => $('view').classList.toggle('col'); $('resHd').onclick = () => $('results').classList.toggle('col');
$('sec').onclick = () => toggleSection(); bind('iSO', v => { $('vSO').textContent = v; secPlane.constant = v / 1000; });
$('cmap').onclick = () => { S.mapMode = 1 - S.mapMode; $('cmap').textContent = 'Map: ' + (S.mapMode ? 'temperature' : 'velocity'); drawLegend(); };
$('gMove').onclick = () => { tc.setMode('translate'); pillset(); }; $('gRot').onclick = () => { tc.setMode('rotate'); tc.showX = false; pillset(); };
const pillset = () => { $('gMove').classList.toggle('on', tc.mode === 'translate'); $('gRot').classList.toggle('on', tc.mode === 'rotate'); tc.showX = tc.mode === 'translate'; };
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
  document.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === S.proj));
  document.querySelectorAll('[data-c]').forEach(b => { b.classList.toggle('on', b.dataset.c === S.core); b.disabled = !ke; b.style.opacity = ke ? 1 : .4; });
  $('slD').style.display = $('slL').style.display = ke ? '' : 'none'; $('slP').style.display = ke ? 'none' : '';
  for (const [i, v] of [['iD', S.D], ['iL', S.L], ['iP', S.pen], ['iV', S.v0], ['iR', S.range]]) $(i).value = v;
  $('vD').textContent = S.D; $('vL').textContent = S.L; $('vP').textContent = S.pen; $('vV').textContent = S.v0; $('vR').textContent = S.range; $('vPB').textContent = $('iPB').value;
  buildRod(); overlay();
}
function syncPlateUI() {
  const p = S.plates[S.sel]; $('plName').innerHTML = p ? `Plate_${S.sel + 1}<br>${MATERIALS[p.mat].name}` : 'No plate selected';
  document.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', !!p && b.dataset.m === p.mat));
  $('mdesc').textContent = p ? (MATERIALS[p.mat].desc || `${MATERIALS[p.mat].name}: ρ ${MATERIALS[p.mat].rho} kg/m³, KE eff. ×${MATERIALS[p.mat].te}, CE eff. ×${MATERIALS[p.mat].tc} vs RHA (est.)`) : 'Tap a plate to select it. Drag the gizmo to move/rotate.';
  if (!p) return;
  for (const [i, k, f] of [['T', 't'], ['AX', 'ax'], ['AY', 'ay'], ['X', 'x'], ['W', 'w'], ['H', 'h'], ['RB', 'ribs']]) { $('i' + i).value = p[k] || 0; $('v' + i).textContent = p[k] || 0; }
}
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
  placeRodIdle();
}
function placeRodIdle() { if (!rod) return; const first = Math.min(0, ...S.plates.map(p => p.x - p.t / 2000 - .1)); rod.group.position.set(first - .35, 0, 0); rod.group.rotation.set(0, 0, 0); rod.group.visible = true; tipPlane.constant = 1e3; mapU.uOn.value = 0; }
let holes = [], debrisMesh = null, jet = null, tipCap = null, flyers = [];
function clearSim() {
  sim = null; playing = false; for (const o of [...dyn.children]) if (!rod || o !== rod.group) { dyn.remove(o); o.traverse?.(x => x.geometry?.dispose()); }
  holes = []; debrisMesh = null; jet = null; tipCap = null; flyers = []; plateMeshes.forEach(m => { m.visible = true; m.scale.set(1, 1, 1); });
  placeRodIdle(); drawLegend(); $('rtab').innerHTML = 'Press FIRE to run the shot.'; drawChart(); $('tread').textContent = '0.0 µs'; $('scrub').value = 0; overlay();
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
  simT = 0; playing = true; $('pp').textContent = '❚❚'; drawLegend(); showResults(); if (mobile) { $('left').classList.remove('open'); $('right').classList.remove('open'); }
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
    <div class="desc" style="margin:2px 0">Impact ${r.vImpact.toFixed(0)} m/s · ${ke ? `semi-inf. RHA (Lanz–Odermatt) ${r.Plo.toFixed(0)} mm · ` : ''}behind-armor residual <b>${r.behind.toFixed(0)} mm RHA</b>${ke && r.outcome === 'PERFORATED' ? ` · rod ${r.Lres.toFixed(0)} mm @ ${r.vres.toFixed(0)} m/s` : ''}</div>
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

// ---------------- scenarios, save/load/share ----------------
function loadScenario(k) { const sc = SCENARIOS[k]; S.plates = clone(sc.plates); S.target = sc.target; S.range = sc.range; S.sel = -1; setProj(sc.proj); buildPlates(); frame(); $('scen').value = k; overlay(); }
const setup = () => ({ proj: S.proj, core: S.core, D: S.D, L: S.L, pen: S.pen, v0: S.v0, range: S.range, target: S.target, plates: S.plates });
function applySetup(o) { Object.assign(S, { proj: o.proj in PROJECTILES ? o.proj : 'm829a3', core: o.core in CORES ? o.core : 'du', D: +o.D || 22, L: +o.L || 800, pen: +o.pen || 500, v0: +o.v0 || 1500, range: +o.range || 0, target: String(o.target || 'Custom'), plates: (o.plates || []).filter(p => p.mat in MATERIALS).map(p => ({ mat: p.mat, x: +p.x || 0, y: +p.y || 0, z: +p.z || 0, t: +p.t || 10, ax: +p.ax || 0, ay: +p.ay || 0, w: +p.w || 1, h: +p.h || 1, ribs: +p.ribs || 0 })), sel: -1 }); syncProjUI(); buildPlates(); frame(); }
const store = () => { try { return JSON.parse(localStorage.getItem('armorSandbox.setups') || '{}'); } catch { return {}; } };
function refreshLoad() { $('load').innerHTML = '<option value="">Load…</option>' + Object.keys(store()).map(n => `<option>${n.replace(/</g, '')}</option>`).join(''); }
$('save').onclick = () => { const s = store(); const name = `${PROJECTILES[S.proj].name} vs ${S.target || 'custom'} ${new Date().toLocaleTimeString()}`; s[name] = setup(); localStorage.setItem('armorSandbox.setups', JSON.stringify(s)); refreshLoad(); $('save').textContent = 'Saved ✓'; setTimeout(() => $('save').textContent = 'Save', 1200); };
$('load').onchange = e => { const o = store()[e.target.value]; if (o) applySetup(o); e.target.value = ''; };
const enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
$('share').onclick = () => { const h = '#s=' + enc(setup()); history.replaceState(null, '', h); navigator.clipboard?.writeText(location.href).catch(() => {}); $('share').textContent = 'Link copied'; setTimeout(() => $('share').textContent = 'Share', 1500); };
refreshLoad();

// ---------------- camera framing, resize, loop ----------------
function frame() { const b = new THREE.Box3().setFromObject(plateGroup); if (b.isEmpty()) b.set(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5));
  const x0 = Math.min(b.min.x, rod.group.position.x - rod.length) - .05, x1 = b.max.x + .2, cx = (x0 + x1) / 2, cy = (b.min.y + b.max.y) / 2;
  const w = x1 - x0, h = b.max.y - b.min.y + .2, vis = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const d = Math.max(w / camera.aspect, h) / vis * (mobile ? 1.5 : 2.0); controls.target.set(cx, cy - (mobile ? .1 : .12) * d, 0); camera.position.set(cx + d * .05, cy + d * .1, d); controls.update(); }
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
  if (sim && playing) { simT += dt / +$('iPB').value * sim.tEnd * speed; if (simT >= sim.tEnd) { simT = sim.tEnd; playing = false; $('pp').textContent = '▶'; } }
  if (sim) { updateSim(); drawChart(); }
  controls.update(); drawScale(); renderer.render(scene, camera);
});

// boot
let booted = false;
try { if (location.hash.startsWith('#s=')) { const o = dec(location.hash.slice(3)); rod = null; buildRod(); applySetup(o); booted = true; } } catch (e) { console.warn('bad share link', e); }
if (!booted) { buildRod(); loadScenario('strv103'); }
setQuality(quality); toggleSection(false); pillset();
if (mobile) { $('view').classList.add('col'); }
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW', e));
window.__app = { S, loadScenario, setProj: k => setProj(k), fire, seek: f => { if (sim) { playing = false; simT = f * sim.tEnd; } }, section: toggleSection, setMap: m => { S.mapMode = m; drawLegend(); }, get sim() { return sim; }, select, frame };
window.__ready = true;
