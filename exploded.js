// Exploded armor view: layers of the hit zone as 3D slabs spread along the shot axis, with callouts + penetrator animation
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const mats = {
  RHA: () => new THREE.MeshPhysicalMaterial({ color: 0x9aa4ae, metalness: 1, roughness: .28, clearcoat: .3 }),
  steel: () => new THREE.MeshPhysicalMaterial({ color: 0x4a4440, metalness: .9, roughness: .5 }),
  composite: () => new THREE.MeshPhysicalMaterial({ color: 0xf2e7cf, metalness: 0, roughness: .12, transparent: true, opacity: .42, clearcoat: 1, ior: 1.7, emissive: 0x3a2a08, emissiveIntensity: .4, depthWrite: false }),
  ceramic: () => new THREE.MeshPhysicalMaterial({ color: 0xf4f1e8, roughness: .1, transparent: true, opacity: .45, clearcoat: 1, depthWrite: false }),
  rubber: () => new THREE.MeshStandardMaterial({ color: 0x151515, roughness: .9 }),
  era: () => new THREE.MeshPhysicalMaterial({ color: 0xc8452f, metalness: .3, roughness: .45, clearcoat: .6, emissive: 0x330800 }),
};
const cyan = new THREE.LineBasicMaterial({ color: 0x5fe3ff, transparent: true, opacity: .9 });

function slab(l, S) {
  const g = new THREE.Group(); const T = l.vis;
  const box = (t, m, x = 0, sx = S, sy = S) => { const b = new THREE.Mesh(new THREE.BoxGeometry(t, sy, sx), m); b.position.x = x; b.castShadow = true; g.add(b); return b; };
  switch (l.type) {
    case 'RHA': box(T, mats.RHA()); break;
    case 'steel': box(T, mats.steel()); for (let i = -1; i <= 1; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, T * .9, 16), mats.RHA()); c.rotation.z = Math.PI / 2; c.position.set(0, i * .35, .3); g.add(c); } break;
    case 'composite': case 'ceramic': {
      box(T, mats.composite());
      const n = 4, s = S / n; const tm = mats.ceramic(); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const t = new THREE.Mesh(new THREE.BoxGeometry(T * .6, s * .92, s * .92), tm); t.position.set(0, -S / 2 + s * (i + .5), -S / 2 + s * (j + .5)); g.add(t); }
      for (const x of [-T / 2, T / 2]) box(.012, mats.RHA(), x); break; }
    case 'NERA': { const n = 3, u = T / n; for (let i = 0; i < n; i++) { const x0 = -T / 2 + u * i; box(u * .3, mats.RHA(), x0 + u * .15).rotation.z = .12; box(u * .3, mats.rubber(), x0 + u * .5).rotation.z = .12; box(u * .2, mats.RHA(), x0 + u * .85).rotation.z = .12; } break; }
    case 'ERA': { const m = mats.era(); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const b = new THREE.Mesh(new THREE.BoxGeometry(T, S / 3 * .9, S / 3 * .9), m); b.position.set(0, -S / 3 + i * S / 3, -S / 3 + j * S / 3); b.castShadow = true; g.add(b); }
      box(.015, mats.RHA(), -T / 2 - .01); break; }
    default: { const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(T, S, S)), new THREE.LineDashedMaterial({ color: 0x5fe3ff, dashSize: .08, gapSize: .06, transparent: true, opacity: .55 })); e.computeLineDistances(); g.add(e);
      const f = new THREE.Mesh(new THREE.BoxGeometry(T, S, S), new THREE.MeshBasicMaterial({ color: 0x1a4a5a, transparent: true, opacity: .07, depthWrite: false })); g.add(f); }
  }
  if (l.type !== 'spaced') { const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(T, S, S)), new THREE.LineBasicMaterial({ color: 0x9feaff, transparent: true, opacity: .35 })); g.add(e); }
  g.traverse(o => { o.userData.noAO = !!o.material?.transparent || o.isLine; o.raycast = () => {}; });
  return g;
}

export class Exploded {
  constructor(scene) { this.scene = scene; this.group = null; this.spread = 1; this.t = 0; this.playing = false; }
  dispose() { if (!this.group) return; this.group.traverse(o => { if (o.element) o.element.remove(); o.geometry?.dispose(); }); this.scene.remove(this.group); this.group = null; }
  build(res, point, dir) {
    this.dispose(); this.res = res;
    const g = this.group = new THREE.Group(); this.scene.add(g);
    // local frame: +x along shot axis
    g.position.copy(point); g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize());
    // keep the assembly upright-ish: roll so local +y is close to world up
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion); const wantUp = new THREE.Vector3(0, 1, 0).projectOnPlane(dir).normalize();
    if (wantUp.lengthSq() > .1) { const ang = Math.atan2(new THREE.Vector3().crossVectors(up, wantUp).dot(dir), up.dot(wantUp)); g.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(dir, ang)); }
    const S = 1.3;
    this.items = res.layers.map((l, i) => {
      const vis = l.type === 'spaced' ? THREE.MathUtils.clamp(l.mm / 1000 * .6, .12, .45) : THREE.MathUtils.clamp(l.mm / 1000 * 1.1, .05, .55);
      const L2 = { ...l, vis }; const m = slab(L2, S); g.add(m);
      const div = document.createElement('div'); div.className = 'callout';
      const ke = res.shell.type === 'APFSDS';
      div.innerHTML = `<b>${l.name}</b><span>${l.type} · ${l.eff.toFixed(0)} mm RHAe ${res.shell.type === 'HESH' ? 'phys' : ke ? 'KE' : 'CE'}</span><span class="r">—</span>`;
      const lab = new CSS2DObject(div); g.add(lab);
      const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); const line = new THREE.Line(lg, cyan); line.raycast = () => {}; g.add(line);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(.05, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, .4), toneMapped: false, side: THREE.DoubleSide })); hole.rotation.y = Math.PI / 2; hole.visible = false; m.add(hole);
      return { l: L2, m, lab, div, line, hole, i };
    });
    // residual after each layer
    let rem = res.pen0; for (const it of this.items) { rem = Math.max(0, rem - it.l.used); it.residAfter = rem; }
    // penetrator
    const s = res.shell, isKE = s.type === 'APFSDS';
    const pg = isKE ? new THREE.CylinderGeometry(.02, .025, .8, 12).rotateZ(Math.PI / 2) : s.type === 'HESH' ? new THREE.SphereGeometry(.09, 16, 12) : new THREE.ConeGeometry(.05, .9, 16).rotateZ(Math.PI / 2);
    this.pen = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: isKE ? new THREE.Color(2.5, 2.2, 1.8) : new THREE.Color(1.2, 3, 4), toneMapped: false })); this.pen.userData.noAO = true; g.add(this.pen);
    this.trail = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, 1, 6).rotateZ(Math.PI / 2).translate(-.5, 0, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 2.2, 3), transparent: true, opacity: .6, toneMapped: false })); g.add(this.trail);
    const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-8, 0, 0), new THREE.Vector3(.6, 0, 0)]), new THREE.LineDashedMaterial({ color: 0x5fe3ff, dashSize: .1, gapSize: .08, transparent: true, opacity: .4 })); axis.computeLineDistances(); g.add(axis);
    this.layout(); this.play();
  }
  layout() {
    if (!this.group) return;
    const gap = .08 + this.spread * .75; let total = 0; for (const it of this.items) total += it.l.vis + gap;
    let u = -total - .5; // assembly sits in front of the impact point (toward the shooter)
    this.items.forEach((it, i) => {
      it.u0 = u; it.m.position.x = u + it.l.vis / 2; u += it.l.vis + gap; it.u1 = u - gap;
      const hy = .65 + .35 + (i % 2) * .45, cx = it.m.position.x;
      it.lab.position.set(cx, (i % 2 ? -1 : 1) * hy, 0);
      const p = it.line.geometry.attributes.position; p.setXYZ(0, cx, (i % 2 ? -1 : 1) * .66, 0); p.setXYZ(1, cx, (i % 2 ? -1 : 1) * (hy - .08), 0); p.needsUpdate = true; it.line.geometry.computeBoundingSphere();
    });
    this.start = -total - 2.2; this.end = 0;
    const last = this.items.findLast(it => it.l.frac > 0 && it.l.used > 0) || this.items[0];
    const r = this.res; const ric = /RICO|FUZE/.test(r.outcome);
    this.stopU = ric ? this.items[0].u0 : r.residual > 0 ? .8 : last.u0 + (last.u1 - last.u0) * Math.min(1, last.l.frac);
    if (r.shell.type === 'HESH') this.stopU = this.items[0].u0;
  }
  center() { if (!this.group) return null; this.group.updateMatrixWorld(true); const mid = (this.start + 2.2 + this.end) / 2; return new THREE.Vector3(mid, 0, 0).applyMatrix4(this.group.matrixWorld); }
  axisLen() { return this.end - this.start; }
  play() { this.t = 0; this.playing = true; for (const it of this.items) { it.hole.visible = false; it.div.classList.remove('hit', 'stop'); it.div.querySelector('.r').textContent = '—'; } }
  update(dt) {
    if (!this.group || !this.playing) return;
    this.t += dt; const dur = 2.4; const k = Math.min(1, this.t / dur); const e = 1 - Math.pow(1 - k, 2.2);
    const ric = /RICO|FUZE/.test(this.res.outcome);
    const u = this.start + (this.stopU - this.start) * e;
    this.pen.position.set(u, 0, 0); this.trail.position.set(u, 0, 0); this.trail.scale.x = Math.max(.01, u - this.start);
    if (ric && k >= 1) { this.pen.position.set(this.stopU - .6, .9, 0); }
    for (const it of this.items) {
      if (u >= it.u0 - .001 && (it.l.used > 0 || it.l.state === 'perforated')) { it.hole.visible = it.l.used > 0; it.hole.position.x = -it.l.vis / 2 - .002; it.div.classList.add('hit'); it.div.querySelector('.r').textContent = `−${it.l.used.toFixed(0)} → residual ${it.residAfter.toFixed(0)} mm`; }
    }
    if (k >= 1) { this.playing = false; const st = this.items.find(it => it.l.state === 'stopped here'); if (st) st.div.classList.add('stop'); if (ric) this.items[0].div.querySelector('.r').textContent = this.res.outcome; if (this.res.shell.type === 'HESH') this.items[0].div.querySelector('.r').textContent = this.res.layers[0].state; }
  }
}
