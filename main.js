import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { TANKS, SHELLS, ZONE_NAMES, LAYER_COLORS, DISCLAIMER } from './data.js';
import { shellAtRange, resolveShot } from './ballistics.js';
import { buildTank, classifyZone, CAMOS } from './models.js';
import { buildLab, makeEnvScene } from './lab.js';
import { Exploded } from './exploded.js';
import { tankThumbs, shellThumb } from './thumbs.js';

const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const labels = new CSS2DRenderer(); labels.setSize(innerWidth, innerHeight); labels.domElement.id = 'labels'; document.body.insertBefore(labels.domElement, canvas.nextSibling);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a); scene.fog = new THREE.FogExp2(0x05070a, .022);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(makeEnvScene(), .02).texture; scene.environmentIntensity = .9;
const LAB = buildLab(scene, renderer);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .1, 200);
camera.position.set(10, 4.2, 9.5);
const controls = new OrbitControls(camera, canvas); controls.target.set(0, 1.3, 0); controls.enableDamping = true; controls.dampingFactor = .07;
controls.maxPolarAngle = Math.PI * .49; controls.minDistance = 3.5; controls.maxDistance = 26;

// --- post-processing
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
let gtao = null; try { gtao = new GTAOPass(scene, camera, innerWidth, innerHeight); gtao.updateGtaoMaterial({ radius: .5, distanceFallOff: 1, thickness: 1 }); gtao.blendIntensity = .85; composer.addPass(gtao); } catch (e) { console.warn('GTAO unavailable', e); }
const bokeh = new BokehPass(scene, camera, { focus: 12, aperture: .0018, maxblur: .007 }); bokeh.enabled = false; composer.addPass(bokeh);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .7, .55, .82); composer.addPass(bloom);
composer.addPass(new OutputPass());
const vignette = new ShaderPass(VignetteShader); vignette.uniforms.offset.value = 1.0; vignette.uniforms.darkness.value = 1.15; composer.addPass(vignette);

// --- state
let tank = null, tankKey = 'm1a2', shellKey = 'm829a4', camo = 'factory', inspect = false, explodeOn = true, lastShot = null, lastZone = null;
const decals = []; const fx = []; const EX = new Exploded(scene);
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
let camAnim = null;
function flyTo(pos, target, dur = 1.6) { camAnim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), t: 0, dur }; }

// --- UI
const pill = (el, on) => el.classList.toggle('on', on);
$('disc').textContent = DISCLAIMER;
function updateTitle() {
  const t = TANKS[tankKey], s = shellAtRange(shellKey, +$('dist').value);
  $('kicker').textContent = t.speculative ? 'SPECULATIVE VEHICLE · ARMOR LAB' : 'ARMOR LAB · TARGET';
  $('title').textContent = t.name.replace(' (SPECULATIVE)', '').toUpperCase();
  $('sub').innerHTML = `<span class="pillx">${s.type}</span> ${s.name}`;
  $('stats').innerHTML = `<div><b>${$('dist').value}</b><i>m range</i></div><div><b>${s.v.toFixed(0)}</b><i>m/s impact</i></div><div><b>${s.type === 'HESH' ? '≤' + s.plate : s.penNow.toFixed(0)}</b><i>${s.type === 'HESH' ? 'mm plate' : 'mm RHA pen'}</i></div>`;
  $('spec').style.display = t.speculative ? '' : 'none';
  $('dv').textContent = $('dist').value;
}
function loadTank(k, fly = true) {
  tankKey = k; EX.dispose(); if (tank) { scene.remove(tank); tank.traverse(o => o.geometry?.dispose()); }
  decals.length = 0; tank = buildTank(TANKS[k], camo); scene.add(tank);
  tank.userData.turret.rotation.y = THREE.MathUtils.degToRad(+$('trav').value);
  document.querySelectorAll('#tankStrip .card').forEach(c => pill(c, c.dataset.k === k));
  updateTitle(); lastZone = null;
  if (fly) { const a = Math.random() * .8 + .35; flyTo(new THREE.Vector3(Math.cos(a) * 12, 3.6 + Math.random(), Math.sin(a) * 12), new THREE.Vector3(0, 1.3, 0), 2.0); }
}
function buildStrips(thumbs = {}) {
  $('tankStrip').innerHTML = Object.entries(TANKS).map(([k, t]) => `<button class="card ${k === tankKey ? 'on' : ''}" data-k="${k}"><img alt="" ${thumbs[k] ? `src="${thumbs[k]}"` : ''}><span>${t.name.replace(' (SPECULATIVE)', ' *')}</span></button>`).join('');
  $('shellStrip').innerHTML = Object.entries(SHELLS).map(([k, s]) => `<button class="card ${k === shellKey ? 'on' : ''}" data-k="${k}"><img alt="" src="${shellThumb(s)}"><span>${s.name.split(' (')[0]}</span></button>`).join('');
  $('tankStrip').querySelectorAll('.card').forEach(c => c.onclick = () => loadTank(c.dataset.k));
  $('shellStrip').querySelectorAll('.card').forEach(c => c.onclick = () => { shellKey = c.dataset.k; $('shellStrip').querySelectorAll('.card').forEach(x => pill(x, x === c)); updateTitle(); });
}
$('camos').innerHTML = Object.entries(CAMOS).map(([k, n]) => `<button class="pill ${k === camo ? 'on' : ''}" data-k="${k}">${n}</button>`).join('');
$('camos').querySelectorAll('.pill').forEach(b => b.onclick = () => { camo = b.dataset.k; $('camos').querySelectorAll('.pill').forEach(x => pill(x, x === b)); loadTank(tankKey, false); });
$('dist').oninput = updateTitle;
$('trav').oninput = e => { $('tv').textContent = e.target.value; tank.userData.turret.rotation.y = THREE.MathUtils.degToRad(+e.target.value); };
$('spread').oninput = e => { EX.spread = +e.target.value; EX.layout(); };
const toggles = { ric: true, fx: true, dof: false, inspect: false, explode: true };
document.querySelectorAll('[data-t]').forEach(b => { pill(b, toggles[b.dataset.t]); b.onclick = () => setToggle(b.dataset.t, !toggles[b.dataset.t]); });
function setToggle(k, v) {
  toggles[k] = v; document.querySelectorAll(`[data-t="${k}"]`).forEach(b => pill(b, v));
  if (k === 'dof') bokeh.enabled = v;
  if (k === 'inspect') inspect = v;
  if (k === 'explode') { explodeOn = v; if (v && lastShot) showExploded(lastShot); else if (!v) { EX.dispose(); $('exctl').classList.remove('show'); flyTo(new THREE.Vector3(10, 4.2, 9.5), new THREE.Vector3(0, 1.3, 0)); } }
}
document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => applyQuality(b.dataset.q));
$('kReset').onclick = () => flyTo(new THREE.Vector3(10, 4.2, 9.5), new THREE.Vector3(0, 1.3, 0));
$('kClear').onclick = () => { for (const d of decals) d.removeFromParent(); decals.length = 0; };
$('kExplode').onclick = () => setToggle('explode', !toggles.explode);
$('kReplay').onclick = () => EX.play();
$('kCtl').onclick = () => $('ctrl').classList.toggle('open');
$('kXray').onclick = () => $('xr').classList.toggle('open');
for (const id of ['res', 'xr', 'ctrl']) $(id).querySelector('.hd').onclick = () => $(id).classList.toggle('open');

// --- quality
const Q = { low: { pr: 1, ao: false, bloom: .55, sh: 1024, aa: 0, mirror: false }, medium: { pr: 1.5, ao: false, bloom: .65, sh: 1024, aa: 2, mirror: true }, high: { pr: 2, ao: true, bloom: .7, sh: 2048, aa: 4, mirror: true } };
let quality = 'high';
function applyQuality(q) {
  quality = q; const c = Q[q]; document.querySelectorAll('[data-q]').forEach(b => pill(b, b.dataset.q === q));
  renderer.setPixelRatio(Math.min(devicePixelRatio, c.pr)); renderer.setSize(innerWidth, innerHeight);
  rt.samples = c.aa; composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  if (gtao) gtao.enabled = c.ao; bloom.strength = c.bloom; LAB.setMirror(c.mirror);
  const rtt = LAB.refl.getRenderTarget(); const rs = q === 'high' ? 1024 : 512; rtt.setSize(rs, rs);
  if (LAB.key.shadow.mapSize.x !== c.sh) { LAB.key.shadow.mapSize.set(c.sh, c.sh); LAB.key.shadow.map?.dispose(); LAB.key.shadow.map = null; }
  renderer.shadowMap.type = c.sh > 1024 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  scene.traverse(o => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
}

// --- picking
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
const pickables = () => { const a = []; tank.traverse(o => { if (o.isMesh && o.userData.part && !o.userData.isDecal) a.push(o); }); return a; };
function hitInfo(hit, dir) {
  const obj = hit.object; const nW = hit.face.normal.clone();
  if (obj.isInstancedMesh && hit.instanceId != null) { const m = new THREE.Matrix4(); obj.getMatrixAt(hit.instanceId, m); nW.transformDirection(m); }
  nW.transformDirection(obj.matrixWorld).normalize(); if (nW.dot(dir) > 0) nW.negate();
  let frame = tank; let p = obj; while (p && p !== tank) { if (p === tank.userData.turret) { frame = p; break; } p = p.parent; }
  const nL = nW.clone().transformDirection(new THREE.Matrix4().copy(frame.matrixWorld).invert());
  const pL = hit.point.clone().applyMatrix4(new THREE.Matrix4().copy(tank.matrixWorld).invert());
  const zone = classifyZone(obj, nL, pL, tank);
  const angle = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(-dir.dot(nW), -1, 1)));
  return { obj, nW, zone, angle };
}
function setMouse(e) { mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera); }
function showZone(e) {
  setMouse(e); const h = ray.intersectObjects(pickables(), false)[0]; const tip = $('tip');
  if (!h) { tip.style.display = 'none'; return false; }
  const hi = hitInfo(h, ray.ray.direction); const z = TANKS[tankKey].zones[hi.zone];
  tip.innerHTML = `<b>${ZONE_NAMES[hi.zone]}</b> <i>${hi.angle.toFixed(0)}°</i><table>${z.map(l => `<tr><td><span class="sw" style="background:${LAYER_COLORS[l.type]}"></span>${l.name}</td><td>${l.ke}</td><td>${l.ce}</td></tr>`).join('')}<tr class="tot"><td>Total KE / CE (est.)</td><td>${z.reduce((a, l) => a + l.ke, 0)}</td><td>${z.reduce((a, l) => a + l.ce, 0)}</td></tr></table>`;
  tip.style.display = 'block'; const w = tip.offsetWidth, hh = tip.offsetHeight;
  tip.style.left = Math.min(innerWidth - w - 8, Math.max(8, e.clientX + 16)) + 'px'; tip.style.top = Math.min(innerHeight - hh - 8, Math.max(8, e.clientY + 16)) + 'px';
  return true;
}
const ptrs = new Map(); let tap = null, lpTimer = 0, multi = false;
canvas.addEventListener('pointerdown', e => {
  ptrs.set(e.pointerId, e); if (ptrs.size > 1) { multi = true; tap = null; clearTimeout(lpTimer); return; }
  multi = false; tap = { x: e.clientX, y: e.clientY, t: performance.now(), long: false };
  if (e.pointerType !== 'mouse') lpTimer = setTimeout(() => { if (tap) { tap.long = true; showZone({ clientX: tap.x, clientY: tap.y }); navigator.vibrate?.(15); } }, 500);
});
canvas.addEventListener('pointermove', e => {
  if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > (e.pointerType === 'mouse' ? 5 : 10)) { tap = null; clearTimeout(lpTimer); }
  if (e.pointerType === 'mouse' && !ptrs.size) showZone(e);
});
const endPtr = e => {
  ptrs.delete(e.pointerId); clearTimeout(lpTimer);
  if (tap && !multi && !tap.long && e.type === 'pointerup' && performance.now() - tap.t < 600) { if (inspect) showZone(e); else { $('tip').style.display = 'none'; fire(e); } }
  if (!ptrs.size) tap = null;
};
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('pointerleave', () => { if (!isTouch) $('tip').style.display = 'none'; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

window.__fireAt = (x, y) => fire({ clientX: x, clientY: y });
function fire(e) {
  setMouse(e); const s = SHELLS[shellKey];
  let hit = ray.intersectObjects(pickables(), false)[0]; if (!hit) return;
  let dir = ray.ray.direction.clone(), origin = camera.position.clone();
  if (s.topAttack) { const tgt = hit.point.clone(); const back = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    dir = new THREE.Vector3(back.x * .5, -.87, back.z * .5).normalize(); origin = tgt.clone().addScaledVector(dir, -30);
    ray.set(origin, dir); hit = ray.intersectObjects(pickables(), false)[0]; if (!hit) return; }
  const hi = hitInfo(hit, dir);
  const res = resolveShot(shellKey, +$('dist').value, TANKS[tankKey].zones[hi.zone], hi.angle, toggles.ric ? Math.random : () => 1);
  res.zone = hi.zone;
  const start = origin.clone().addScaledVector(dir, s.topAttack ? 0 : 1.5).add(new THREE.Vector3(0, -.4, 0));
  spawnTracer(start, hit.point, s, () => {
    impactFX(hit, hi, res, dir); showResult(res); drawXray(res);
    lastShot = { res, point: hit.point.clone(), dir: dir.clone() };
    if (explodeOn) showExploded(lastShot);
    else if (lastZone !== hi.zone) { const off = camera.position.clone().sub(hit.point).normalize().multiplyScalar(8); flyTo(hit.point.clone().add(off).setY(Math.max(1.5, hit.point.y + off.y)), hit.point.clone().lerp(new THREE.Vector3(0, 1.3, 0), .5), 1.4); }
    lastZone = hi.zone;
  });
}
function showExploded(sh) {
  EX.spread = +$('spread').value; EX.build(sh.res, sh.point, sh.dir); $('exctl').classList.add('show');
  // cinematic side view perpendicular to the shot axis
  const c = EX.center(); const side = new THREE.Vector3().crossVectors(sh.dir, new THREE.Vector3(0, 1, 0)); if (side.lengthSq() < .01) side.set(1, 0, 0); side.normalize();
  const dist = Math.max(9.5, EX.axisLen() * (camera.aspect < 1 ? 2.6 : 1.8));
  const away = new THREE.Vector3(c.x, 0, c.z); if (side.dot(away) < 0) side.negate(); // camera on the side away from the tank
  const pos = c.clone().addScaledVector(side, dist).addScaledVector(away.normalize(), dist * .2).add(new THREE.Vector3(0, dist * .22, 0)); pos.y = Math.max(pos.y, 1.2);
  flyTo(pos, c, 1.8);
}
window.__explode = () => lastShot && showExploded(lastShot);

// --- effects
function spawnTracer(a, b, s, done) {
  const len = a.distanceTo(b); const isMissile = s.type === 'TANDEM';
  const g = new THREE.CylinderGeometry(isMissile ? .06 : .03, isMissile ? .06 : .03, isMissile ? .9 : 2.5, 8); g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color).multiplyScalar(6), toneMapped: false })); m.userData.noAO = true;
  m.position.copy(a); m.lookAt(b); scene.add(m);
  const trail = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, 1, 6).rotateX(Math.PI / 2).translate(0, 0, .5), new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color).multiplyScalar(2.5), transparent: true, opacity: .6, toneMapped: false }));
  trail.userData.noAO = true; trail.position.copy(a); trail.lookAt(b); scene.add(trail);
  const dur = isMissile ? .9 : .22; let t = 0;
  fx.push(dt => { t += dt; const k = Math.min(1, t / dur); m.position.lerpVectors(a, b, k); trail.scale.z = Math.max(.01, len * k);
    if (k >= 1) { scene.remove(m); done(); let f = 0; fx.push(dt2 => { f += dt2; trail.material.opacity = .6 * (1 - f / .5); if (f > .5) { scene.remove(trail); return true; } }); return true; } });
}
const decalTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.18, 'rgba(15,10,8,1)'); gr.addColorStop(.3, 'rgba(70,40,20,.9)'); gr.addColorStop(.55, 'rgba(30,25,20,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(200,200,200,.35)'; for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28; g.beginPath(); g.moveTo(64 + Math.cos(a) * 10, 64 + Math.sin(a) * 10); g.lineTo(64 + Math.cos(a) * (25 + Math.random() * 30), 64 + Math.sin(a) * (25 + Math.random() * 30)); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const sparkTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
function impactFX(hit, hi, res, dir) {
  const p = hit.point, n = hi.nW; const pen = /^(PEN|SPALL)/.test(res.outcome); const ric = /RICO|FUZE/.test(res.outcome);
  if (!hit.object.isInstancedMesh && (!ric || Math.random() < .5)) try {
    const o = new THREE.Object3D(); o.position.copy(p); o.lookAt(p.clone().add(n)); o.rotateZ(Math.random() * 6.28);
    const size = pen ? .45 : ric ? .25 : .35;
    const dm = new THREE.Mesh(new DecalGeometry(hit.object, p, o.rotation, new THREE.Vector3(size, ric ? size * .5 : size, .5)), new THREE.MeshStandardMaterial({ map: decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: .9 }));
    dm.userData.isDecal = dm.userData.noAO = true; scene.add(dm); hit.object.attach(dm); decals.push(dm);
  } catch (e) { console.warn('decal fail', e); }
  const light = new THREE.PointLight(0xffaa55, 25, 8, 2); light.position.copy(p).addScaledVector(n, .3); scene.add(light);
  const N = 120, pos = new Float32Array(N * 3), vel = []; const refl = dir.clone().reflect(n);
  for (let i = 0; i < N; i++) { pos.set([p.x, p.y, p.z], i * 3); vel.push((ric ? refl : n).clone().multiplyScalar(4 + Math.random() * 8).add(new THREE.Vector3().randomDirection().multiplyScalar(4))); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: .12, map: sparkTex, color: new THREE.Color(3, 1.6, .5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); scene.add(pts);
  const smokes = []; for (let i = 0; i < 10; i++) { const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color: 0x555048, transparent: true, opacity: .45, depthWrite: false })); sm.position.copy(p); sm.userData.v = n.clone().multiplyScalar(.6 + Math.random()).add(new THREE.Vector3().randomDirection().multiplyScalar(.5)).add(new THREE.Vector3(0, .5, 0)); scene.add(sm); smokes.push(sm); }
  let t = 0;
  fx.push(dt => { t += dt; light.intensity = 25 * Math.max(0, 1 - t / .25);
    for (let i = 0; i < N; i++) { vel[i].y -= 9.8 * dt; pos[i * 3] += vel[i].x * dt; pos[i * 3 + 1] += vel[i].y * dt; pos[i * 3 + 2] += vel[i].z * dt; }
    pg.attributes.position.needsUpdate = true; pts.material.opacity = Math.max(0, 1 - t / .8);
    for (const sm of smokes) { sm.position.addScaledVector(sm.userData.v, dt); const s = .5 + t * 2.5; sm.scale.set(s, s, s); sm.material.opacity = .45 * Math.max(0, 1 - t / 2.5); }
    if (t > 2.5) { scene.remove(light, pts, ...smokes); return true; } });
}
function showResult(r) {
  $('res').classList.add('open'); if (!isTouch) $('xr').classList.add('open');
  const cls = r.outcome.slice(0, 3).toUpperCase(); const ke = r.shell.type === 'APFSDS';
  $('zoneTag').textContent = ZONE_NAMES[r.zone];
  $('rinfo').innerHTML = `<div class="out ${cls}">${r.outcome}</div>
  <div class="meta">${ZONE_NAMES[r.zone]} · ${r.angle.toFixed(1)}° from normal${ke ? ` → ${r.effAngle.toFixed(1)}° normalized` : ''} · LOS ×${r.losMul.toFixed(2)} · ricochet ${(r.pRic * 100).toFixed(0)}%</div>
  <table><tr><th>Layer</th><th>Eff.</th><th>Used</th><th>State</th></tr>
  ${r.layers.map(l => `<tr><td><span class="sw" style="background:${LAYER_COLORS[l.type]}"></span>${l.name}${l.note ? `<br><i class="note">${l.note}</i>` : ''}</td><td>${l.eff.toFixed(0)}</td><td>${l.used.toFixed(0)}</td><td>${l.state}</td></tr>`).join('')}</table>
  <div class="meta">Residual: <b>${r.residual.toFixed(0)} mm</b> · values RHAe ${ke ? 'KE' : r.shell.type === 'HESH' ? '(mm physical)' : 'CE'}</div>${r.notes.map(n => `<div class="note">• ${n}</div>`).join('')}`;
}
function drawXray(r) {
  const c = $('xc'), g = c.getContext('2d'); const W = c.width, H = c.height; g.clearRect(0, 0, W, H);
  const total = r.layers.reduce((a, l) => a + Math.max(l.eff, 20), 0); const x0 = 70, w = W - 100; let x = x0;
  g.font = '15px system-ui'; g.fillStyle = '#9feaff'; g.fillText('Shell →', 4, 128);
  let stopX = x0; const ric = /RICO|FUZE/.test(r.outcome);
  r.layers.forEach(l => {
    const lw = Math.max(l.eff, 20) / total * w;
    g.fillStyle = LAYER_COLORS[l.type]; g.globalAlpha = l.type === 'spaced' ? .35 : .85; g.fillRect(x, 40, lw - 2, 170); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(127,230,255,.5)'; g.strokeRect(x + .5, 40.5, lw - 3, 169);
    if (l.type === 'NERA' || l.type === 'ERA') { g.strokeStyle = 'rgba(0,0,0,.35)'; for (let k = 6; k < lw - 4; k += 9) { g.beginPath(); g.moveTo(x + k, 40); g.lineTo(x + k, 210); g.stroke(); } }
    g.fillStyle = 'rgba(255,90,40,.4)'; g.fillRect(x, 105, (lw - 2) * Math.min(1, l.frac), 40);
    if (l.frac > 0) stopX = x + (lw - 2) * Math.min(1, l.frac);
    g.save(); g.translate(x + 4, 225); g.rotate(Math.PI / 5); g.fillStyle = '#cfefff'; g.font = '13px system-ui'; g.fillText(l.name.slice(0, 26), 0, 0); g.restore();
    g.fillStyle = '#000'; g.font = 'bold 13px system-ui'; g.fillText(l.eff.toFixed(0), x + 4, 58); x += lw;
  });
  const col = r.residual > 0 && !ric ? '#ff4d4d' : ric ? '#4fd9ff' : '#ffd040';
  g.strokeStyle = col; g.lineWidth = 5; g.shadowColor = col; g.shadowBlur = 10; g.beginPath(); g.moveTo(10, 125);
  if (ric) { g.lineTo(x0, 125); g.lineTo(x0 - 50, 20); } else g.lineTo(r.residual > 0 ? W - 8 : stopX, 125); g.stroke(); g.lineWidth = 1; g.shadowBlur = 0;
  g.fillStyle = col; g.font = 'bold 16px system-ui'; g.fillText(`${r.outcome} · residual ${r.residual.toFixed(0)} mm`, 70, 24);
}

// --- resize / loop
const onResize = () => { camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 1 ? 38 / Math.max(camera.aspect, .45) * .85 : 38; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight); };
addEventListener('resize', onResize); addEventListener('orientationchange', () => setTimeout(onResize, 200)); onResize();

buildStrips(); loadTank('m1a2', false); applyQuality(isTouch ? 'low' : 'high');
if (isTouch) { $('ctrl').classList.remove('open'); $('xr').classList.remove('open'); $('hint').textContent = 'Tap tank to fire · drag to orbit · pinch to zoom · long-press for armor info'; }
camera.position.set(16, 7, 15); flyTo(new THREE.Vector3(10, 4.2, 9.5), new THREE.Vector3(0, 1.3, 0), 2.2);
setTimeout(() => tankThumbs(TANKS, isTouch ? 160 : 240, isTouch ? 94 : 140).then(buildStrips).then(() => { window.__thumbs = true; }).catch(e => console.warn('thumbs', e)), 300);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW', e));

const clock = new THREE.Clock(); let time = 0;
renderer.setAnimationLoop(() => {
  const raw = clock.getDelta(); const dt = Math.min(raw, .05); const rdt = Math.min(raw, .25); time += dt;
  if (camAnim) { camAnim.t += rdt; const k = ease(Math.min(1, camAnim.t / camAnim.dur)); camera.position.lerpVectors(camAnim.p0, camAnim.p1, k); controls.target.lerpVectors(camAnim.t0, camAnim.t1, k); if (k >= 1) camAnim = null; }
  controls.update();
  for (let i = fx.length - 1; i >= 0; i--) if (fx[i](dt)) fx.splice(i, 1);
  EX.update(rdt);
  LAB.shafts.forEach((s, i) => s.material.uniforms.k.value = .13 + .03 * Math.sin(time * .7 + i * 2));
  if (bokeh.enabled) bokeh.uniforms.focus.value = camera.position.distanceTo(controls.target);
  if (toggles.fx) composer.render(); else renderer.render(scene, camera);
  labels.render(scene, camera);
});
window.__ready = true;
