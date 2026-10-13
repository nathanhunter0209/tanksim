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
export function createDamage({ sim, S, plateMeshes, dyn, quality, cmap, regClip, rodD, cal }) {
  const lo = quality !== 'high', items = [], ke = sim.type === 'KE', v0 = sim.vImpact;
  const add = o => { dyn.add(o); return o; };
  const lipMat = regClip(new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: .9, metalness: .2 }));
  const glow = regClip(new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: .9, toneMapped: false, side: THREE.DoubleSide }));
  // ---- holes: cutout + lip + bulge/petals ----
  const holes = sim.holes.map(h => { const seg = sim.segs[h.seg], pm = plateMeshes[seg.plate]; if (!pm) return null;
    const n = X.clone().applyQuaternion(pm.quaternion); if (n.x < 0) n.negate(); const tanO = Math.tan(THREE.MathUtils.degToRad(Math.min(seg.obl, 80)));
    const r = Math.max(h.r, ke ? rodD * .6 : cal * .03);
    const qn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const lip = add(new THREE.Mesh(new THREE.TorusGeometry(r * 1.35, r * .35, 6, lo ? 12 : 24), lipMat)); lip.position.set(h.sIn, 0, 0).addScaledVector(n, -.001); lip.quaternion.copy(qn); lip.visible = false;
    const ring = add(new THREE.Mesh(new THREE.RingGeometry(r * .95, r * 1.5, lo ? 12 : 24), glow.clone())); regClip(ring.material); ring.position.copy(lip.position).addScaledVector(n, -.001); ring.quaternion.copy(qn); ring.visible = false;
    const pmat = pm.material, petMat = regClip(new THREE.MeshStandardMaterial({ color: 0x5a5048, roughness: .7, metalness: .5, side: THREE.DoubleSide, emissive: 0x2a0d00 })); const rb = r * 3.2;
    const bulge = add(new THREE.Mesh(new THREE.SphereGeometry(1, lo ? 10 : 18, lo ? 6 : 10, 0, Math.PI * 2, 0, Math.PI / 2), pmat)); bulge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n); bulge.position.set(h.sEnd, 0, 0); bulge.visible = false;
    const np = lo ? 4 : 7, petals = []; if (h.perforated) for (let i = 0; i < np; i++) { const hw = Math.PI * r / np * 1.05, pl = r * 1.4; const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-hw, 0, 0), new THREE.Vector3(hw, 0, 0), new THREE.Vector3(0, pl, 0)]); g.computeVertexNormals();
      const piv = new THREE.Group(); const p = new THREE.Mesh(g, petMat); piv.add(p); piv.position.set(h.sEnd, 0, 0); piv.quaternion.copy(qn); piv.rotateZ(i / np * Math.PI * 2); piv.visible = false; add(piv); petals.push({ piv, p }); }
    return { h, seg, pm, r, tanO, lip, ring, bulge, rb, petals }; }).filter(Boolean);
  // ---- ERA bricks ----
  const bricks = [];
  for (const e of sim.era) { const pm = plateMeshes[e.plate], p = S.plates[e.plate]; if (!pm) continue; const k = lo ? 3 : 5, n = 2 * k * k;
    const im = add(new THREE.InstancedMesh(new THREE.BoxGeometry(p.t / 2000, p.h / k * .96, p.w / k * .96), regClip(new THREE.MeshStandardMaterial({ color: pm.material.color, roughness: .6, metalness: .25 })), n)); im.frustumCulled = false; im.visible = false;
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
  // ---- jet particle stream ----
  let jetP = null; if (!ke) { const n = lo ? 40 : 140; const im = add(new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), regClip(new THREE.MeshBasicMaterial({ toneMapped: false })), n)); im.frustumCulled = false; im.visible = false;
    for (let i = 0; i < n; i++) im.setColorAt(i, tmpC.setRGB(1, 1, 1)); jetP = { im, n, tb: 2.16e-6 * cal * 1000 }; }
  return {
    update(t, s, sampleAt) {
      for (const o of holes) { const { h, pm, r, tanO } = o; const on = t >= h.t0; const tip = Math.min(sampleAt(Math.min(t, h.t1)).tip, h.sEnd), done = h.perforated && t >= h.t1;
        pm.material.userData.hole?.value.set(r, done ? h.sEnd + r * tanO + .01 : tip, on ? 1 : 0, h.sIn - r * tanO - .02);
        o.lip.visible = on; o.ring.visible = on; const age = t - h.t0; o.ring.material.color.setRGB(...cmap(Math.max(.05, 1 - age / 4e-4))); o.ring.material.opacity = Math.max(.15, 1 - age / 6e-4);
        const rem = h.sEnd - tip, Deff = r * 2; const bk = on && !done ? THREE.MathUtils.clamp(1 - rem / (2.5 * Deff), 0, 1) : (done ? 0 : 0);
        const stayBulge = !h.perforated && on && rem < 2.5 * Deff; o.bulge.visible = bk > .01 || stayBulge; if (o.bulge.visible) { const kk = Math.max(bk, stayBulge ? 1 - rem / (2.5 * Deff) : 0); o.bulge.scale.set(o.rb * (.5 + .5 * kk), o.rb * .6 * kk + 1e-4, o.rb * (.5 + .5 * kk)); }
        const pa = done ? Math.min(1, (t - h.t1) / 6e-5) : 0; for (const { piv, p } of o.petals) { piv.visible = done; p.rotation.x = 0; p.position.set(0, o.r, 0); p.rotation.set(pa * 1.2, 0, 0); } }
      for (const b of bricks) { const on = t >= b.e.t0; b.im.visible = on; b.pm.visible = !on; if (!on) continue; const age = Math.max(0, t - b.e.t0);
        b.parts.forEach((q, i) => { tmpP.copy(b.pm.position).add(q.off).addScaledVector(q.vel, age); tmpQ.setFromAxisAngle(q.spin, age * q.w).multiply(b.pm.quaternion); tmpM.compose(tmpP, tmpQ, tmpS.set(1, 1, 1)); b.im.setMatrixAt(i, tmpM); }); b.im.instanceMatrix.needsUpdate = true; }
      if (cone) { const age = t - cone.t0, on = age > 0 && age < 1.2e-3; cone.m.visible = on; if (on) { const L = Math.min(.6, .03 + cone.v * age * .4); cone.m.scale.set(L, L, L); cone.m.material.opacity = .3 * (1 - age / 1.2e-3); } }
      for (const f of frags) { const age = t - f.t0; f.m.visible = age > 0; if (age > 0) { f.m.position.set(f.p[0] + f.v[0] * age, f.p[1] + f.v[1] * age, f.p[2] + f.v[2] * age); f.m.rotation.set(0, age * f.w * .3, age * f.w); } }
      if (jetP) { const det = t >= sim.tDet, { im, n, tb } = jetP; im.visible = det && s.L > 0 && s.tip > sim.sDet; if (im.visible) { const tail = sim.sDet + Math.min(2000 * (t - sim.tDet), Math.max(0, s.tip - sim.sDet) * .6), len = Math.max(.001, s.tip - tail);
          const broken = t - sim.tDet > tb, r0 = cal * .07; // visually thickened ~2× for readability
          for (let i = 0; i < n; i++) { const f = i / (n - 1); const jit = broken ? (rnd() - .5) * .3 / n : 0; const x = tail + len * Math.min(1, Math.max(0, f + jit)); const rr = r0 * (broken ? .55 + .3 * ((i * 7) % 3) / 2 : .8) * (.6 + .4 * f);
            tmpM.compose(tmpP.set(x, broken ? (rnd() - .5) * r0 * .4 : 0, broken ? (rnd() - .5) * r0 * .4 : 0), tmpQ.identity(), tmpS.set(broken ? rr : Math.max(rr, len / n * .9), rr, rr)); im.setMatrixAt(i, tmpM); im.setColorAt(i, tmpC.setRGB(...cmap(.25 + .75 * f))); }
          im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; } }
    },
    hideTransient() { if (cone) cone.m.visible = false; for (const f of frags) f.m.visible = false; },
    dispose() { for (const o of holes) o.pm.material.userData.hole?.value.set(0, -1e3, 0, -1e3); for (const b of bricks) b.pm.visible = true; },
  };
}
