// Damage visuals (stage C): plate cutout holes, entry crater lips, rear-face bulge + exit petals, ERA bricks,
// behind-armor debris cone, rod mushroom / break-up fragments, HEAT jet particle stream. Counts scale with quality.
import * as THREE from 'three';
const X = new THREE.Vector3(1, 0, 0), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpC = new THREE.Color();
const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(12345);
// plate material hook: discard fragments inside the shot channel (world x-axis cylinder) up to the current crater bottom
export function holeHook(m) { m.userData.hole = { value: new THREE.Vector4(0, -1e3, 0, -1e3) }; const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { prev && prev(sh, r); sh.uniforms.uHole = m.userData.hole;
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = 'varying vec3 vWP; uniform vec4 uHole;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (uHole.z > .5 && length(vWP.yz) < uHole.x && vWP.x < uHole.y && vWP.x > uHole.w) discard;'); };
  m.customProgramCacheKey = () => 'plate-hole'; return m; }

// ---- smooth damage geometry helpers ----
const DISC = new THREE.CircleGeometry(1, 40);
// place object with local Y (lathe axis) or local Z (flat decal) along `nOut`, stretched 1/cosθ along in-plane dir d (elliptical hole)
function onFace(o, pos, nOut, d, cosO, lathe = false, size = 1) { const k = 1 / cosO, side = nOut.clone().cross(d).normalize(), m = new THREE.Matrix4();
  if (lathe) m.makeBasis(d.clone().multiplyScalar(k), nOut.clone(), side); else m.makeBasis(d.clone().multiplyScalar(k * size), side.clone().multiplyScalar(size), nOut.clone());
  o.matrixAutoUpdate = false; m.setPosition(pos); o.matrix.copy(m); o.userData.base = m.clone(); return o; }
// raised crater lip: smooth lathe profile (radius r..2.4r)
function lipGeo(r, sg) { const P = []; for (let i = 0; i <= 14; i++) { const u = i / 14, rr = r * (.97 + 1.45 * u), y = r * .32 * Math.sin(Math.PI * Math.min(1, u * 1.25)) * (1 - u * .55); P.push(new THREE.Vector2(rr, y)); } const g = new THREE.LatheGeometry(P, sg); g.computeVertexNormals(); return g; }
// rear bulge: smooth cos² dome of radius R (height scaled at runtime)
function domeGeo(R, sg) { const P = []; for (let i = 0; i <= 16; i++) { const u = i / 16; P.push(new THREE.Vector2(R * u, R * .28 * Math.cos(u * Math.PI / 2) ** 2)); } const g = new THREE.LatheGeometry(P.reverse(), sg); g.computeVertexNormals(); return g; }
// curled, twisted petal with thickness and jagged edges. Local: x across, y outward from hinge, z = plate normal (rear)
function petalGeo(w, len, th, nl, nw) { const top = [], rows = nl + 1, cols = nw * 2 + 1, jag = [];
  for (let j = 0; j < rows; j++) jag.push(1 + (rnd() - .5) * .5);
  let py = 0, pz = 0; const curl = 1.9 + rnd() * .8, twist = (rnd() - .5) * .9;
  for (let j = 0; j < rows; j++) { const v = j / nl, phi = curl * v ** 1.5, wv = w * .5 * (1 - v) ** .75 * jag[j] + w * .03; if (j) { py += Math.cos(phi) * len / nl; pz += Math.sin(phi) * len / nl; }
    for (let i = 0; i < cols; i++) { const u = i / (cols - 1) * 2 - 1, tw = twist * v * u, x = u * wv * Math.cos(tw), off = u * wv * Math.sin(tw); top.push(new THREE.Vector3(x, py - Math.sin(phi) * off, pz + Math.cos(phi) * off + Math.abs(u) ** 2 * wv * .25)); } }
  const pos = [], idx = [], N = top.length; for (const p of top) pos.push(p.x, p.y, p.z); for (const p of top) pos.push(p.x, p.y, p.z - th);
  const q = (a, b, c, d2) => idx.push(a, b, c, a, c, d2);
  for (let j = 0; j < nl; j++) for (let i = 0; i < cols - 1; i++) { const a = j * cols + i, b = a + 1, c = a + cols + 1, d2 = a + cols; q(a, b, c, d2); q(N + a, N + d2, N + c, N + b); }
  const border = []; for (let i = 0; i < cols; i++) border.push(i); for (let j = 1; j < rows; j++) border.push(j * cols + cols - 1); for (let i = cols - 2; i >= 0; i--) border.push(nl * cols + i); for (let j = nl - 1; j > 0; j--) border.push(j * cols);
  for (let k = 0; k < border.length; k++) { const a = border[k], b = border[(k + 1) % border.length]; q(a, N + a, N + b, b); } // edge thickness
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; }
let scorchTex = null;
function scorchMat() { if (!scorchTex) { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(15,12,10,.95)'); gr.addColorStop(.22, 'rgba(40,30,25,.85)'); gr.addColorStop(.3, 'rgba(62,70,96,.5)'); gr.addColorStop(.38, 'rgba(84,66,104,.42)'); gr.addColorStop(.47, 'rgba(120,96,70,.3)'); gr.addColorStop(.57, 'rgba(176,160,112,.24)'); gr.addColorStop(.8, 'rgba(60,55,50,.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256); scorchTex = new THREE.CanvasTexture(c); scorchTex.colorSpace = THREE.SRGBColorSpace; } // scorch + temper colours (purple/blue/straw heat tint)
  return new THREE.MeshStandardMaterial({ map: scorchTex, transparent: true, depthWrite: false, roughness: .9, metalness: .1, polygonOffset: true, polygonOffsetFactor: -4 }); }
let temperTex = null; // temper colours on steel along the lip profile: blue-grey (hottest, inner) -> blue -> purple -> bronze -> straw -> plain steel
function temper() { if (!temperTex) { const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
    [[0, '#4b5058'], [.12, '#3e4f73'], [.24, '#5a4a76'], [.36, '#7a6a52'], [.5, '#a49a72'], [.68, '#8e9092'], [1, '#8e9092']].forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
    temperTex = new THREE.CanvasTexture(c); temperTex.colorSpace = THREE.SRGBColorSpace; } return temperTex; }
const glowMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6 });
const heatMat = (c, rough, metal, tex) => new THREE.MeshStandardMaterial({ color: c, map: tex ? temper() : null, roughness: rough, metalness: metal, side: THREE.DoubleSide, emissive: 0x000000 });
// cooling curve (sim time): white-hot -> orange -> dull red -> off over ~2.5 ms
function hc(age) { const k = Math.max(0, age) / 6e-4; if (k >= 1) return [0, 0, 0]; const e = (1 - k) ** 2; return [3.2 * e, (1.6 * e) * (1 - k * .7) ** 2, .5 * e ** 3]; }
function heat(m, age) { const [r, g, b] = hc(age); m.emissive.setRGB(r * .12, g * .08, b * .05); }
function glow(m, age) { const [r, g, b] = hc(age); m.color.setRGB(r + .4 * (r > 0), g + .35 * (r > 0), b + .3 * (r > 0)); m.opacity = Math.min(1, r * .8); return r > .01; } // white-hot flash -> orange -> gone
export function createDamage({ sim, S, plateMeshes, dyn, quality, cmap, regClip, rodD, cal }) {
  const lo = quality !== 'high', items = [], ke = sim.type === 'KE', v0 = sim.vImpact;
  const add = o => { dyn.add(o); return o; };
  // ---- holes: cutout + smooth lip + scorch/heat tint + glowing rim + rear dome + curled petals ----
  const holes = sim.holes.map(h => { const seg = sim.segs[h.seg], pm = plateMeshes[seg.plate]; if (!pm) return null;
    const n = X.clone().applyQuaternion(pm.quaternion); if (n.x < 0) n.negate(); const cosO = Math.max(.2, Math.abs(n.x)), tanO = Math.sqrt(1 - cosO * cosO) / cosO;
    const r = Math.max(h.r, ke ? rodD * 1.25 : cal * .11); // visual crater: several rod diameters (KE) / ~0.2 CD (jet)
    const d = X.clone().addScaledVector(n, -n.x); if (d.lengthSq() < 1e-8) d.set(0, 1, 0).addScaledVector(n, -n.y); d.normalize(); // in-plane direction of the elliptical hole
    const entry = new THREE.Vector3(h.sIn, 0, 0), exit = new THREE.Vector3(h.sEnd, 0, 0), sg = lo ? 20 : 40;
    const lip = add(onFace(new THREE.Mesh(lipGeo(r, sg), regClip(heatMat(0xd8d8d8, .5, .7, true))), entry, n.clone().negate(), d, cosO, true)); lip.visible = false;
    const sc = add(onFace(new THREE.Mesh(DISC, regClip(scorchMat())), entry.clone().addScaledVector(n, -.0012), n.clone().negate(), d, cosO, false, r * 5)); sc.visible = false;
    const rim = add(onFace(new THREE.Mesh(new THREE.RingGeometry(r * .98, r * 1.25, sg), regClip(glowMat())), entry.clone().addScaledVector(n, -.0018), n.clone().negate(), d, cosO)); rim.visible = false;
    const dome = add(onFace(new THREE.Mesh(domeGeo(r * 3, sg), pm.material), exit, n, d, cosO, true)); dome.visible = false;
    const exitDeco = [], petals = [];
    if (h.perforated) { exitDeco.push(add(onFace(new THREE.Mesh(DISC, regClip(scorchMat())), exit.clone().addScaledVector(n, .0012), n, d, cosO, false, r * 4)), add(onFace(new THREE.Mesh(new THREE.RingGeometry(r * .98, r * 1.2, sg), regClip(glowMat())), exit.clone().addScaledVector(n, .0018), n, d, cosO)));
      exitDeco.forEach(o => o.visible = false); const np = lo ? 5 : 8, pmat = regClip(heatMat(0x9a9894, .42, .8));
      for (let i = 0; i < np; i++) { const a = i / np * Math.PI * 2 + rnd() * .3, rad = d.clone().multiplyScalar(Math.cos(a) / cosO).add(n.clone().cross(d).multiplyScalar(Math.sin(a))), rl = rad.length(); rad.normalize();
        const piv = new THREE.Group(); piv.position.copy(exit).addScaledVector(rad, r * rl); const z = n.clone(), y = rad.clone(), x = y.clone().cross(z); piv.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
        const m = new THREE.Mesh(petalGeo(Math.PI * r * rl / np * 1.1, r * (1.1 + .5 * rnd()), Math.max(.0006, r * .08), lo ? 6 : 12, lo ? 2 : 4), pmat); piv.add(m); piv.visible = false; add(piv); petals.push({ piv, m }); } }
    return { h, pm, r, tanO, lip, sc, rim, dome, exitDeco, petals }; }).filter(Boolean);
  // ---- ERA bricks ----
  const bricks = [];
  for (const e of sim.era) { const pm = plateMeshes[e.plate], p = S.plates[e.plate]; if (!pm) continue; const k = lo ? 3 : 5, n = 2 * k * k;
    const im = add(new THREE.InstancedMesh(new THREE.BoxGeometry(p.t / 2000, p.h / k * .96, p.w / k * .96), regClip(new THREE.MeshStandardMaterial({ color: pm.material.color, map: pm.material.map, normalMap: pm.material.normalMap, roughness: pm.material.roughness, metalness: pm.material.metalness })) /* same PBR look as the intact ERA */, n)); im.frustumCulled = false; im.visible = false;
    const nrm = X.clone().applyQuaternion(pm.quaternion), parts = [];
    for (let s = 0; s < 2; s++) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { const off = new THREE.Vector3((s ? 1 : -1) * p.t / 4000, (i + .5) / k * p.h - p.h / 2, (j + .5) / k * p.w - p.w / 2).applyQuaternion(pm.quaternion);
      const rad = off.clone().sub(nrm.clone().multiplyScalar(off.dot(nrm))); const vel = nrm.clone().multiplyScalar((s ? 1 : -1) * (250 + 150 * rnd())).addScaledVector(rad.normalize(), 60 + 120 * rnd());
      parts.push({ off, vel, spin: new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).normalize(), w: 2e4 * (.5 + rnd()) }); }
    bricks.push({ e, pm, im, parts }); }
  // ---- behind-armor debris cone (sized from physics debris spread) ----
  let cone = null; const lastPerf = [...holes].reverse().find(o => o.h.perforated);
  if (lastPerf && sim.debris.length) { const ang = sim.debris.map(d => Math.atan2(Math.hypot(d.v[1], d.v[2]), Math.max(d.v[0], 1))).sort((a, b) => a - b); const half = Math.min(.7, ang[Math.floor(ang.length * .9)] || .3);
    const m = add(new THREE.Mesh(new THREE.ConeGeometry(Math.tan(half), 1, lo ? 16 : 32, 1, true).rotateZ(Math.PI / 2).translate(.5, 0, 0), regClip(new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: .25, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))));
    m.position.set(lastPerf.h.sEnd, 0, 0); m.visible = false; cone = { m, t0: lastPerf.h.t1, half, v: Math.max(300, ke ? sim.vres || 600 : 1500) }; }
  // ---- rod fragments: ERA broken segments + break-up when stopped ----
  const frags = [];
  if (ke) { const fm = regClip(new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: .4, metalness: .8 }));
    sim.segEvents.forEach(ev => { const nt = ev.notes.find(n => /ERA: −(\d+) mm rod/.test(n)); if (!nt) return; const dL = +nt.match(/−(\d+)/)[1] / 1000; if (dL < .005) return;
      const nf = lo ? 2 : 4; for (let i = 0; i < nf; i++) frags.push({ t0: ev.tIn ?? 0, p: [sim.segs[ev.seg].sIn, 0, 0], v: [v0 * .25, (rnd() - .3) * 160, (rnd() - .5) * 120], len: dL / nf, w: 3e3 * (rnd() + .5) }); });
    if (sim.outcome === 'STOPPED') { const last = sim.samples.at(-1); const nf = lo ? 3 : 7; for (let i = 0; i < nf; i++) frags.push({ t0: last.t - 2e-5, p: [last.tip - rodD, 0, 0], v: [-40 - 60 * rnd(), (rnd() - .5) * 120, (rnd() - .5) * 120], len: rodD * (1 + 2 * rnd()), w: 5e3 * rnd() }); }
    for (const f of frags) { f.m = add(new THREE.Mesh(new THREE.CylinderGeometry(rodD / 2, rodD / 2, f.len, 8).rotateZ(Math.PI / 2), fm)); f.m.visible = false; } }
  // ---- impact FX (High only): hot spark streaks (velocity-stretched = motion blur), smoke puffs at entry/exit, flash pulse ----
  const fx = []; const fxOn = !lo && holes.length;
  if (fxOn) { const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.6, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    const pts = []; const h0 = holes[0]; pts.push({ x: h0.h.sIn, t0: h0.h.t0, dir: -1 }); const hp = holes.find(o => o.h.perforated && o === holes.at(-1)); if (hp) pts.push({ x: hp.h.sEnd, t0: hp.h.t1, dir: 1 });
    for (const q of pts) { const n = 40, sp = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), regClip(new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false, transparent: true })), n)); sp.frustumCulled = false; sp.visible = false;
      const vs = []; for (let i = 0; i < n; i++) { const a = rnd() * 6.283, th = .35 + rnd() * 1.1, v = 250 + 900 * rnd(); vs.push(new THREE.Vector3(q.dir * Math.cos(th) * v, Math.sin(th) * Math.cos(a) * v, Math.sin(th) * Math.sin(a) * v)); }
      const smoke = []; for (let i = 0; i < 6; i++) { const m = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x9a9690, transparent: true, depthWrite: false, opacity: 0 }))); m.visible = false; smoke.push({ m, o: new THREE.Vector3(q.dir * (.01 + rnd() * .04), (rnd() - .5) * .05, (rnd() - .5) * .05), k: .6 + rnd() * .8 }); }
      const flash = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xfff1d6, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }))); flash.visible = false;
      fx.push({ ...q, sp, vs, smoke, flash }); } }
  // ---- jet particle stream ----
  let jetP = null; if (!ke) { const n = lo ? 40 : 140; const im = add(new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), regClip(new THREE.MeshBasicMaterial({ toneMapped: false })), n)); im.frustumCulled = false; im.visible = false;
    for (let i = 0; i < n; i++) im.setColorAt(i, tmpC.setRGB(1, 1, 1)); jetP = { im, n, tb: 2.16e-6 * cal * 1000 }; }
  return {
    update(t, s, sampleAt) {
      for (const o of holes) { const { h, pm, r, tanO } = o; const on = t >= h.t0; const tip = Math.min(sampleAt(Math.min(t, h.t1)).tip, h.sEnd), done = h.perforated && t >= h.t1;
        pm.material.userData.hole?.value.set(r, done ? h.sEnd + r * tanO + .01 : tip, on ? 1 : 0, h.sIn - r * tanO - .02);
        const age = t - h.t0; o.lip.visible = o.sc.visible = o.rim.visible = on; if (on) { heat(o.lip.material, age); o.rim.visible = glow(o.rim.material, age); }
        const rem = h.sEnd - tip, kk = on && !done ? THREE.MathUtils.clamp(1 - rem / (5 * r), 0, 1) : 0; o.dome.visible = kk > .01; if (o.dome.visible) o.dome.matrix.copy(o.dome.userData.base).multiply(tmpM.makeScale(1, kk + 1e-3, 1)); // rear-face bulge grows as the crater nears the rear face
        for (const e of o.exitDeco) e.visible = done; if (done) o.exitDeco[1].visible = glow(o.exitDeco[1].material, t - h.t1);
        const pa = done ? Math.min(1, (t - h.t1) / 8e-5) : 0, ease = 1 - (1 - pa) ** 3; for (const { piv, m } of o.petals) { piv.visible = done; piv.rotation.set(0, 0, 0); piv.rotateX(.08 + ease * 1.1); piv.scale.setScalar(.25 + .75 * ease); if (done) heat(m.material, t - h.t1); } }
      for (const b of bricks) { const on = t >= b.e.t0; b.im.visible = on; b.pm.visible = !on; if (!on) continue; const age = Math.max(0, t - b.e.t0);
        b.parts.forEach((q, i) => { tmpP.copy(b.pm.position).add(q.off).addScaledVector(q.vel, age); tmpQ.setFromAxisAngle(q.spin, age * q.w).multiply(b.pm.quaternion); tmpM.compose(tmpP, tmpQ, tmpS.set(1, 1, 1)); b.im.setMatrixAt(i, tmpM); }); b.im.instanceMatrix.needsUpdate = true; }
      if (cone) { const age = t - cone.t0, on = age > 0 && age < 1.2e-3; cone.m.visible = on; if (on) { const L = Math.min(.6, .03 + cone.v * age * .4); cone.m.scale.set(L, L, L); cone.m.material.opacity = .3 * (1 - age / 1.2e-3); } }
      for (const f of frags) { const age = t - f.t0; f.m.visible = age > 0; if (age > 0) { f.m.position.set(f.p[0] + f.v[0] * age, f.p[1] + f.v[1] * age, f.p[2] + f.v[2] * age); f.m.rotation.set(0, age * f.w * .3, age * f.w); } }
      for (const f of fx) { const age = t - f.t0; const on = age > 0;
        const spOn = on && age < 9e-4; f.sp.visible = spOn; if (spOn) { f.sp.material.opacity = 1 - age / 9e-4; f.vs.forEach((v, i) => { const sl = v.length(), L = Math.max(.004, sl * Math.min(age, 6e-5)); tmpP.set(f.x, 0, 0).addScaledVector(v, age); tmpQ.setFromUnitVectors(X, tmpS.copy(v).normalize()); tmpM.compose(tmpP, tmpQ, tmpS.set(L, .0018, .0018)); f.sp.setMatrixAt(i, tmpM); }); f.sp.instanceMatrix.needsUpdate = true; }
        const fl = on && age < 2.5e-4; f.flash.visible = fl; if (fl) { const k = 1 - age / 2.5e-4; f.flash.position.set(f.x + f.dir * .01, 0, 0); f.flash.scale.setScalar(.06 + .25 * (1 - k)); f.flash.material.color.setRGB(3 * k, 2.6 * k, 2 * k); }
        for (const q of f.smoke) { q.m.visible = on; if (on) { const g = Math.min(1, age / 2.5e-3); q.m.position.set(f.x + q.o.x * (1 + 6 * g), q.o.y * (1 + 6 * g) + g * .05, q.o.z * (1 + 6 * g)); q.m.scale.setScalar((.04 + .22 * g) * q.k); q.m.material.opacity = .55 * Math.min(1, age / 1e-4) * (1 - .5 * g); } } }
      if (jetP) { const det = t >= sim.tDet, { im, n, tb } = jetP; im.visible = det && s.L > 0 && s.tip > sim.sDet; if (im.visible) { const tail = sim.sDet + Math.min(2000 * (t - sim.tDet), Math.max(0, s.tip - sim.sDet) * .6), len = Math.max(.001, s.tip - tail);
          const broken = t - sim.tDet > tb, r0 = cal * .07; // visually thickened ~2× for readability
          for (let i = 0; i < n; i++) { const f = i / (n - 1); const jit = broken ? (rnd() - .5) * .3 / n : 0; const x = tail + len * Math.min(1, Math.max(0, f + jit)); const rr = r0 * (broken ? .55 + .3 * ((i * 7) % 3) / 2 : .8) * (.6 + .4 * f);
            tmpM.compose(tmpP.set(x, broken ? (rnd() - .5) * r0 * .4 : 0, broken ? (rnd() - .5) * r0 * .4 : 0), tmpQ.identity(), tmpS.set(broken ? rr : Math.max(rr, len / n * .9), rr, rr)); im.setMatrixAt(i, tmpM); im.setColorAt(i, S.mapMode ? tmpC.setRGB(...cmap(.25 + .75 * f)).multiplyScalar(2.2) : tmpC.setRGB(1.2 + 2.6 * f ** 2, .45 + 2.4 * f ** 2.5, .12 + 2.2 * f ** 4)); } // map mode: velocity colours; else white-hot core at tip, cooling orange tail
          im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; } }
    },
    hideTransient() { if (cone) cone.m.visible = false; for (const f of frags) f.m.visible = false; for (const f of fx) { f.sp.visible = f.flash.visible = false; } },
    dispose() { for (const o of holes) o.pm.material.userData.hole?.value.set(0, -1e3, 0, -1e3); for (const b of bricks) b.pm.visible = true; },
  };
}
