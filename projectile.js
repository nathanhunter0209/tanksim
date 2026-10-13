// Procedural projectile models (approximate public dimensions) + mass from geometry and density
import * as THREE from 'three';
import { CORES } from './data.js';

function frustumVol(prof) { let v = 0; for (let i = 0; i < prof.length - 1; i++) { const [r1, y1] = prof[i], [r2, y2] = prof[i + 1]; v += Math.PI * Math.abs(y2 - y1) * (r1 * r1 + r1 * r2 + r2 * r2) / 3; } return v; }
function lathe(prof, seg) { const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-5), y)), seg); g.rotateZ(-Math.PI / 2); return g; } // axis -> +x
function finSet(n, root, span, th, x0, r0, mat, group) {
  const g = new THREE.Shape(); g.moveTo(0, 0); g.lineTo(-root, 0); g.lineTo(-root * 1.02, span); g.lineTo(-root * .55, span); g.closePath();
  const geo = new THREE.ExtrudeGeometry(g, { depth: th, bevelEnabled: true, bevelThickness: th * .3, bevelSize: th * .3, bevelSegments: 1 }); geo.translate(0, r0 * .9, -th / 2);
  for (let k = 0; k < n; k++) { const m = new THREE.Mesh(geo, mat); m.position.x = x0; m.rotation.x = k / n * Math.PI * 2; m.castShadow = true; group.add(m); }
  return geo;
}
// returns { group, mass (kg), length (m), mats: [materials needing clip/colour], noseX: 0 }
export function buildProjectile(pr, o, makeMat) {
  const group = new THREE.Group(), mats = [];
  const body = makeMat(0x8fa3a8, .45, .6), dark = makeMat(0x5d6a6e, .5, .5), alu = makeMat(0xa9b4b8, .35, .7); mats.push(body, dark, alu);
  let mass = 0, length = 0, info = '';
  if (pr.type === 'KE') {
    const D = o.D / 1000, L = o.L / 1000, R = D / 2, cal = pr.cal / 1000; length = L;
    const nose = Math.min(3.2 * D, L * .2), prof = [[0, -L]];
    prof.push([R * .7, -L], [R * .7, -L + D * .4], [R, -L + D * .5]); // tracer step
    const thr0 = -L * .62, thr1 = -L * .3, pitch = Math.max(D * .28, (thr1 - thr0) / 40); prof.push([R, thr0]);
    for (let y = thr0; y < thr1 - pitch; y += pitch) prof.push([R * 1.12, y + pitch * .2], [R * 1.12, y + pitch * .55], [R, y + pitch * .65], [R, y + pitch]); // buttress threads / sabot grooves
    prof.push([R, thr1], [R, -nose]);
    for (let k = 1; k <= 8; k++) { const t = k / 8; prof.push([R * Math.sqrt(1 - t * t * .985) * (1 - t * .15), -nose * (1 - t)]); } // ogive tip
    prof.push([0, 0]);
    const g = lathe(prof, 36); const m = new THREE.Mesh(g, body); m.castShadow = true; group.add(m);
    const core = CORES[o.core]; const vol = frustumVol(prof); mass = vol * core.rho;
    const span = Math.max(1.6 * D, cal * .3), root = Math.min(Math.max(4 * D, L * .14), L * .25), th = Math.max(.0015, D * .08);
    finSet(pr.fins || 6, root, span - R, th, -L + D * .6 + root, R, alu, group);
    mass += (pr.fins || 6) * root * .78 * (span - R) * th * 2700;
    info = `${core.name} rod Ø${o.D} × ${o.L} mm, L/D ${(o.L / o.D).toFixed(1)}`;
  } else {
    const c = pr.cal / 1000, r = c / 2; let prof;
    if (pr.kind === 'rpg') { length = c * 6.5; prof = [[0, -length], [r * .44, -length], [r * .44, -c * 1.9], [r * .6, -c * 1.75], [r, -c * 1.35], [r, -c * 1.1], [r * .8, -c * .6], [r * .35, -c * .12], [r * .12, 0], [0, 0]];
      finSet(6, c * 1.1, c * .5, .002, -length + c * 1.1, r * .44, alu, group); }
    else if (pr.kind === 'atgm') { length = c * 7.5; prof = [[0, -length], [r * .9, -length], [r, -length + c * .3], [r, -c * 1.2], [r * .85, -c * .7], [r * .3, -c * .45], [r * .2, -c * .45], [r * .2, -c * .05], [r * .1, 0], [0, 0]];
      finSet(4, c * 1.5, c * .55, .003, -c * 2.6, r, alu, group); finSet(4, c * .7, c * .35, .003, -length + c * .8, r, dark, group); }
    else { length = c * 6; prof = [[0, -length], [r * .5, -length], [r * .5, -c * 3.6], [r * .75, -c * 3.4], [r, -c * 3.2], [r, -c * 1.3], [r * .45, -c * .5], [r * .16, -c * .5], [r * .16, 0], [0, 0]];
      finSet(6, c * 1.0, c * .5, .002, -length + c * 1.0, r * .5, alu, group); }
    const m = new THREE.Mesh(lathe(prof, 36), body); m.castShadow = true; group.add(m);
    mass = frustumVol(prof) * 1500; info = `Ø${pr.cal} mm ${pr.tandem ? 'tandem ' : ''}shaped charge, ~${pr.pen} mm RHA nominal (est.)`;
  }
  return { group, mass, length, mats, info };
}
