// Sculpted procedural tank models: lofted/beveled hull & turret shells with creased normals,
// instanced track links, dual road wheels, detailed gun, sights, hatches, stowage, weld seams, decals.
import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { camoTex, detailSet, markingTex, CAMOS } from './textures.js';
export { CAMOS };

const V3 = THREE.Vector3, V2 = THREE.Vector2;
export const MODEL = { hq: true }; // set false on Low: fewer weld beads / bolts / chain links

// ---------- geometry helpers ----------
function loft(rings, proj, capStart = true, capEnd = true, crease = .62) {
  const pos = [], e1 = new V3(), e2 = new V3(), nn = new V3();
  const tri = (a, b, c, out) => { e1.subVectors(b, a); e2.subVectors(c, a); nn.crossVectors(e1, e2); if (nn.lengthSq() < 1e-12) return; if (nn.dot(out) < 0) [b, c] = [c, b]; pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); };
  const cen = r => r.reduce((s, p) => s.add(p), new V3()).divideScalar(r.length);
  const cs = rings.map(cen);
  for (let k = 0; k < rings.length - 1; k++) {
    const R0 = rings[k], R1 = rings[k + 1], axis = new V3().subVectors(cs[k + 1], cs[k]); const al = axis.lengthSq() > 1e-10 ? axis.clone().normalize() : null; const mc = cs[k].clone().add(cs[k + 1]).multiplyScalar(.5);
    for (let i = 0; i < R0.length; i++) {
      const j = (i + 1) % R0.length, a = R0[i], b = R0[j], c = R1[j], d = R1[i];
      const out = new V3().addVectors(a, b).add(c).add(d).multiplyScalar(.25).sub(mc); if (al) out.addScaledVector(al, -out.dot(al));
      tri(a, b, c, out); tri(a, c, d, out);
    }
  }
  const cap = (k, nb) => { const R = rings[k]; const out = new V3().subVectors(cs[k], cs[nb]); const t = THREE.ShapeUtils.triangulateShape(R.map(proj), []); for (const [a, b, c] of t) tri(R[a], R[b], R[c], out); };
  if (capStart) cap(0, 1); if (capEnd) cap(rings.length - 1, rings.length - 2);
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g = toCreasedNormals(g, crease); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.computeBoundingSphere(); g.computeBoundingBox(); return g;
}
const area2 = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
function inset(p, d) { // miter offset inward by d
  if (!d) return p.map(q => q.slice()); const s = area2(p) > 0 ? 1 : -1;
  return p.map((q, i) => {
    const a = p[(i - 1 + p.length) % p.length], b = p[(i + 1) % p.length];
    let n1 = [q[1] - a[1], -(q[0] - a[0])], n2 = [b[1] - q[1], -(b[0] - q[0])]; const l1 = Math.hypot(...n1) || 1, l2 = Math.hypot(...n2) || 1;
    n1 = [n1[0] / l1 * s, n1[1] / l1 * s]; n2 = [n2[0] / l2 * s, n2[1] / l2 * s]; // outward
    let m = [n1[0] + n2[0], n1[1] + n2[1]]; const lm = Math.hypot(...m) || 1; m = [m[0] / lm, m[1] / lm];
    const len = Math.min(d * 3, d / Math.max(.2, m[0] * n1[0] + m[1] * n1[1])); return [q[0] - m[0] * len, q[1] - m[1] * len];
  });
}
function fillet(p, r, seg = 3) { // round polygon corners
  const out = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[(i - 1 + p.length) % p.length], q = p[i], b = p[(i + 1) % p.length];
    const da = [a[0] - q[0], a[1] - q[1]], db = [b[0] - q[0], b[1] - q[1]], la = Math.hypot(...da), lb = Math.hypot(...db);
    const rr = Math.min(r, la * .45, lb * .45); if (rr < 1e-3) { out.push(q); continue; }
    const p0 = [q[0] + da[0] / la * rr, q[1] + da[1] / la * rr], p1 = [q[0] + db[0] / lb * rr, q[1] + db[1] / lb * rr];
    for (let k = 0; k <= seg; k++) { const t = k / seg, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * q[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * q[1] + t * t * p1[1]]); }
  }
  return out;
}
const mirrorHalf = pts => { const back = pts.slice().reverse().filter(([, z]) => z > 1e-4).map(([x, z]) => [x, -z]); return [...pts, ...back]; };
// prism along Z of an (x,y) profile with rounded edges at both ends
function prismZ(profile, width, r = .05, seg = 3) {
  const rings = [], w = width / 2;
  const ring = (ins, z) => rings.push(inset(profile, ins).map(([x, y]) => new V3(x, y, z)));
  for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI / 2; ring(r - r * Math.sin(a), -w + r - r * Math.cos(a)); }
  for (let k = seg; k >= 0; k--) { const a = k / seg * Math.PI / 2; ring(r - r * Math.sin(a), w - r + r * Math.cos(a)); }
  return loft(rings, v => new V2(v.x, v.y));
}
// vertical loft: bottom outline B (x,z) at y=0, top outline T at y=h, rounded top edge radius r
function prismY(B, T, h, r = .06, seg = 3, y0 = 0) {
  const rings = [B.map(([x, z]) => new V3(x, y0, z))];
  for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI / 2; rings.push(inset(T, r - r * Math.cos(a)).map(([x, z]) => new V3(x, h - r + r * Math.sin(a), z))); }
  return loft(rings, v => new V2(v.x, v.z));
}
const rbox = (sx, sy, sz, r = .02) => prismZ(fillet([[-sx / 2, -sy / 2], [sx / 2, -sy / 2], [sx / 2, sy / 2], [-sx / 2, sy / 2]], r * 1.5, 2), sz, r, 2);
function lathe(profile, seg = 32) { const g = new THREE.LatheGeometry(profile.map(([r, y]) => new V2(r, y)), seg); return g; }

// ---------- materials ----------
// Shared shader injection: object-space triplanar albedo / roughness / normal, curvature edge wear,
// height-based dust & mud, cavity AO. Works on instanced meshes.
function surface(mat, o) {
  const set = detailSet(o.cast ? 'cast' : 'rolled');
  mat.userData.u = { tAlb: { value: o.alb || null }, tDet: { value: set.detail }, tNrm: { value: set.normal }, uS: { value: new THREE.Vector4(o.albScale ?? .18, o.detScale ?? .9, o.nStr ?? .45, o.wear ?? 1) }, uDirt: { value: o.dirt ?? 1 } };
  const defs = (o.alb ? '#define T_ALB\n' : '') + (o.wear ? '#define T_WEAR\n' : '');
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, mat.userData.u);
    sh.vertexShader = 'varying vec3 vLP; varying vec3 vLN; varying float vWY;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec3 lp = transformed; vec4 ip = vec4(transformed,1.);
      #ifdef USE_INSTANCING
        lp += instanceMatrix[3].xyz; ip = instanceMatrix * ip;
      #endif
      vLP = lp; vLN = objectNormal; vWY = (modelMatrix * ip).y;`);
    sh.fragmentShader = defs + `uniform sampler2D tAlb, tDet, tNrm; uniform vec4 uS; uniform float uDirt; uniform mat3 normalMatrix;
      varying vec3 vLP; varying vec3 vLN; varying float vWY; float gWear, gDust, gMud, gCav; vec3 gTw;
      vec4 tri(sampler2D t, float s){ return texture2D(t, vLP.zy*s)*gTw.x + texture2D(t, vLP.xz*s)*gTw.y + texture2D(t, vLP.xy*s)*gTw.z; }
      ` + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec3 N0 = normalize(vLN); gTw = pow(abs(N0), vec3(4.)); gTw /= dot(gTw, vec3(1.));
        vec4 det = tri(tDet, uS.y); vec4 det2 = tri(tDet, uS.y*.23);
        #ifdef T_ALB
          diffuseColor.rgb *= tri(tAlb, uS.x).rgb;
        #endif
        gCav = mix(1., smoothstep(.0, .55, det.r), .6);
        gWear = 0.;
        #ifdef T_WEAR
          float curv = length(fwidth(N0)) / max(length(fwidth(vLP)), 1e-4);
          gWear = smoothstep(2.5, 9., curv) * smoothstep(.15, .7, det.b + det2.b*.6) * uS.w;
          gWear = max(gWear, smoothstep(.93, 1., det2.b) * .5 * uS.w);
        #endif
        float gN = det2.a - .5;
        gDust = (1. - smoothstep(.25, 1.35, vWY + gN*.6)) * .85 + smoothstep(.55, 1., N0.y) * smoothstep(.45, .8, det2.a) * .35;
        gDust = clamp(gDust * uDirt, 0., 1.);
        gMud = (1. - smoothstep(.05, .75, vWY + gN*.5 + det.a*.15)) * uDirt;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*1.25 + .02, smoothstep(.0, .5, gWear) * .6);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.42,.43,.44), smoothstep(.4, .8, gWear));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.30,.24,.16), gDust*.75);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.06,.045,.03), gMud*.85);`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = clamp(roughness * (.65 + det.g*.7), .04, 1.);
        roughnessFactor = mix(roughnessFactor, .32, smoothstep(.4, .8, gWear)); roughnessFactor = mix(roughnessFactor, .95, gDust*.8); roughnessFactor = mix(roughnessFactor, .5, gMud*.7);`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = mix(metalness, .95, smoothstep(.4, .8, gWear)); metalnessFactor *= 1. - gDust*.8;`)
      .replace('#include <normal_fragment_maps>', `{
        vec3 nX = texture2D(tNrm, vLP.zy*uS.y).xyz*2.-1., nY = texture2D(tNrm, vLP.xz*uS.y).xyz*2.-1., nZ = texture2D(tNrm, vLP.xy*uS.y).xyz*2.-1.;
        float k = uS.z * (1. - gDust*.6);
        nX.xy *= k; nY.xy *= k; nZ.xy *= k;
        nX = vec3(nX.xy + N0.zy, abs(nX.z) * N0.x); nY = vec3(nY.xy + N0.xz, abs(nY.z) * N0.y); nZ = vec3(nZ.xy + N0.xy, abs(nZ.z) * N0.z);
        vec3 nL = normalize(nX.zyx*gTw.x + nY.xzy*gTw.y + nZ*gTw.z);
        vec3 nV = normalize(normalMatrix * nL); normal = normalize(normal + (nV - normalize(normalMatrix*N0)) * faceDirection);
      }`)
      .replace('#include <aomap_fragment>', `float ambientOcclusion = gCav * mix(.55, 1., smoothstep(.0, 1.1, vWY));
        reflectedLight.indirectDiffuse *= ambientOcclusion; reflectedLight.indirectSpecular *= mix(1., ambientOcclusion, .7);`);
  };
  mat.customProgramCacheKey = () => 'surf' + defs;
  return mat;
}
function makeMats(def, camo) {
  const alb = camoTex(camo, def.color);
  const paint = surface(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .62, metalness: 0, clearcoat: .22, clearcoatRoughness: .5 }), { alb });
  const cast = surface(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .7, metalness: 0, clearcoat: .15, clearcoatRoughness: .6 }), { alb, cast: true, nStr: 1 });
  const era = surface(new THREE.MeshPhysicalMaterial({ color: 0xd8d8d0, roughness: .62, metalness: 0, clearcoat: .2, clearcoatRoughness: .5 }), { alb, nStr: .5 });
  return {
    paint, cast, era,
    dark: surface(new THREE.MeshStandardMaterial({ color: 0x2c2e2c, roughness: .6, metalness: .55 }), { wear: .6 }),
    steel: surface(new THREE.MeshStandardMaterial({ color: 0x8a8e93, roughness: .32, metalness: 1 }), { wear: 0, dirt: .5 }),
    rubber: surface(new THREE.MeshStandardMaterial({ color: 0x161616, roughness: .9 }), { wear: 0, nStr: .3 }),
    track: surface(new THREE.MeshStandardMaterial({ color: 0x3b3936, roughness: .5, metalness: .9 }), { wear: 1, nStr: .9 }),
    sleeve: surface(new THREE.MeshPhysicalMaterial({ color: new THREE.Color(def.color).multiplyScalar(.8), roughness: .95, sheen: 1, sheenRoughness: .6, sheenColor: 0x888877 }), { wear: 0, nStr: 1.2, detScale: 3 }),
    fabric: surface(new THREE.MeshPhysicalMaterial({ color: 0x5b5a40, roughness: .95, sheen: 1, sheenRoughness: .5, sheenColor: 0x9a9a80 }), { wear: 0, nStr: 1.5, detScale: 2.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0b1a1c, roughness: .03, metalness: .1, clearcoat: 1, clearcoatRoughness: .02, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 600], emissive: 0x041013 }),
    lamp: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .05, transmission: 0, clearcoat: 1, emissive: 0xfff2d8, emissiveIntensity: .9 }),
    tail: new THREE.MeshPhysicalMaterial({ color: 0x400000, roughness: .1, clearcoat: 1, emissive: 0xff1a08, emissiveIntensity: 1.0 }),
    weld: surface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .75, metalness: .1 }), { alb, nStr: 1.5, detScale: 4, wear: 0 }),
  };
}

// ---------- running gear ----------
function beltPath(circles) { // circles: [x,y,r] in CCW traversal; returns sampled closed path [{x,y,a}]
  const n = circles.length, tang = [];
  for (let i = 0; i < n; i++) {
    const [x1, y1, r1] = circles[i], [x2, y2, r2] = circles[(i + 1) % n], dx = x2 - x1, dy = y2 - y1, D = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx) - Math.acos(THREE.MathUtils.clamp((r1 - r2) / D, -1, 1)); tang.push(ang); // normal direction
  }
  const segs = []; // alternating arc / line
  for (let i = 0; i < n; i++) {
    const [x, y, r] = circles[i], aIn = tang[(i - 1 + n) % n]; let aOut = tang[i]; while (aOut < aIn - 1e-6) aOut += Math.PI * 2; if (aOut - aIn > Math.PI * 1.6) aOut = aIn;
    segs.push({ arc: [x, y, r, aIn, aOut], len: r * (aOut - aIn) });
    const [x2, y2, r2] = circles[(i + 1) % n]; const p0 = [x + Math.cos(aOut) * r, y + Math.sin(aOut) * r], p1 = [x2 + Math.cos(tang[i]) * r2, y2 + Math.sin(tang[i]) * r2];
    segs.push({ line: [p0, p1], len: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) });
  }
  return { segs, total: segs.reduce((a, s) => a + s.len, 0) };
}
function sampleBelt(b, pitch) {
  const N = Math.round(b.total / pitch), step = b.total / N, out = []; let si = 0, acc = 0;
  for (let k = 0; k < N; k++) {
    const d = k * step; while (si < b.segs.length - 1 && d > acc + b.segs[si].len) { acc += b.segs[si].len; si++; }
    const s = b.segs[si], t = s.len ? (d - acc) / s.len : 0;
    if (s.arc) { const [x, y, r, a0, a1] = s.arc, a = a0 + (a1 - a0) * t; out.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, a: a + Math.PI / 2 }); }
    else { const [p0, p1] = s.line; out.push({ x: p0[0] + (p1[0] - p0[0]) * t, y: p0[1] + (p1[1] - p0[1]) * t, a: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) }); }
  }
  return { pts: out, step };
}
function linkGeos(tw, pitch) { // local: x travel, +y inward (toward wheels), z across
  const body = rbox(pitch * .82, .05, tw, .012);
  const ends = []; for (const s of [-1, 1]) { const c = new THREE.CylinderGeometry(.03, .03, .09, 10); c.rotateX(Math.PI / 2); c.translate(pitch * .45, 0, s * (tw / 2 + .03)); ends.push(c); }
  const bin = new THREE.CylinderGeometry(.022, .022, tw + .02, 8); bin.rotateX(Math.PI / 2); bin.translate(pitch * .45, 0, 0);
  const horn = prismZ([[-.035, 0], [.035, 0], [.022, .1], [-.022, .1]], .05, .01, 1); horn.translate(0, .02, 0);
  const steel = mergeGeometries([body, horn, ...ends.map(e => e.toNonIndexed()), bin.toNonIndexed()].map(g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }));
  const pads = []; for (const s of [-1, 1]) { const p = rbox(pitch * .7, .035, tw * .38, .012); p.translate(0, -.04, s * tw * .26); pads.push(p); }
  return { steel, rubber: mergeGeometries(pads) };
}
function wheelGeos(r) {
  const tire = lathe([[r * .78, -.1], [r - .015, -.1], [r, -.085], [r, .085], [r - .015, .1], [r * .78, .1]], 40); tire.rotateX(Math.PI / 2);
  const disc = lathe([[0, .085], [r * .3, .085], [r * .36, .05], [r * .72, .06], [r * .8, .1], [r * .8, -.1], [r * .3, -.1], [0, -.1]], 40); disc.rotateX(Math.PI / 2);
  const hub = lathe([[0, .14], [r * .14, .14], [r * .2, .12], [r * .22, .08], [r * .26, .08], [r * .26, .06], [0, .06]], 24); hub.rotateX(Math.PI / 2);
  return { tire, disc, hub };
}

// ---------- tank styles ----------
// plan: half outline (x forward, z>=0) front->rear; top(p) maps a bottom point to the top outline
const STYLE = {
  abrams: { plan: [[1.95, .42], [1.6, 1.74], [-.9, 1.86], [-1.35, 1.52], [-2.8, 1.46], [-2.9, 0]], th: .84, top: ([x, z]) => [x > 1 ? x - .16 : x * .985, z * .93], gx: 1.95, rack: 1, mant: 'shield', hatches: 2 },
  abrams3: { plan: [[1.85, .42], [1.5, 1.62], [-.9, 1.72], [-1.3, 1.36], [-2.35, 1.3], [-2.45, 0]], th: .68, top: ([x, z]) => [x > 1 ? x - .3 : x * .98, z * .88], gx: 1.8, rack: 1, mant: 'shield', hatches: 0, aps: 1 },
  chally: { plan: [[1.78, .58], [1.66, 1.66], [-1.55, 1.72], [-2.0, 1.38], [-2.12, 0]], th: .92, top: ([x, z]) => [x > 1 ? x - .07 : x, z * .97], gx: 1.78, rack: 1, mant: 'box', hatches: 2, slabs: 1 },
  merkava: { plan: [[3.05, .22], [1.25, 1.34], [-1.2, 1.62], [-2.2, 1.48], [-2.55, 0]], th: .8, top: ([x, z]) => [x > 0 ? x * .68 : x * .97, z * (x > 0 ? .7 : .86)], gx: 2.25, rack: 1, mant: 'wedge', hatches: 2, chains: 1 },
  leo: { plan: [[1.62, .5], [1.52, 1.76], [-1.3, 1.8], [-2.2, 1.52], [-2.36, 0]], th: .86, top: ([x, z]) => [x > 1 ? x - .05 : x, z * .95], gx: 1.62, rack: 1, mant: 'box', hatches: 2, wedges: 1 },
  t90: { plan: null, th: .74, gx: 1.78, mant: 'cast', hatches: 2, relikt: 1, cast: 1 },
};
{ const p = []; for (let i = 0; i <= 7; i++) { const a = i / 7 * Math.PI / 2; p.push([Math.cos(a) * 1.8, Math.max(Math.sin(a) * 1.5, .32)]); } p.push([-.6, 1.48], [-1.25, 1.32], [-1.6, .95], [-1.72, 0]); STYLE.t90.plan = p; STYLE.t90.top = ([x, z]) => [x * .8 - .05, z * .76]; }

export function buildTank(def, camo = 'factory') {
  const root = new THREE.Group(); root.name = 'tank';
  const M = makeMats(def, camo);
  const st = def.style, S = STYLE[st], L = def.len, W = def.width, H2 = L / 2, hq = MODEL.hq;
  const add = (geo, mat, part, parent = root, pos, rot) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); if (part) m.userData.part = part; parent.add(m); return m; };
  const inst = (geo, mat, part, mats, parent = root) => { const im = new THREE.InstancedMesh(geo, mat, mats.length); mats.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = im.receiveShadow = true; if (part) im.userData.part = part; im.computeBoundingSphere(); parent.add(im); return im; };
  const mtx = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(s, s, s));
  const welds = [], twelds = [];
  const seam = (a, b, step = .035, arr = welds) => { const n = Math.max(2, Math.round(a.distanceTo(b) / (hq ? step : step * 3))); for (let i = 0; i <= n; i++) arr.push(a.clone().lerp(b, i / n)); };

  // --- Hull ---
  const lowW = W - 1.5, deck = st === 't90' ? 1.55 : st === 'merkava' ? 1.75 : 1.65, noseY = st === 'merkava' ? 1.0 : .95;
  const ufpRun = st === 'abrams' || st === 'abrams3' ? 1.8 : st === 'merkava' ? 2.4 : st === 't90' ? 1.4 : 1.2;
  const lower = [[-H2 + .25, .5], [H2 - .75, .5], [H2 - .05, noseY], [H2 - .05, 1.2], [-H2 + .05, 1.2], [-H2 + .05, .75]];
  const hull = add(prismZ(lower, lowW, .06), M.paint, 'hull'); 
  const sponW = W - .2, upper = [[-H2, 1.12], [H2 - .4, 1.12], [H2, noseY + .04], [H2 - ufpRun, deck], [-H2 + .18, deck], [-H2, deck - .28]];
  const sp = add(prismZ(upper, sponW, .07), M.paint, 'hull');
  seam(new V3(H2 - ufpRun, deck + .005, -sponW / 2 + .1), new V3(H2 - ufpRun, deck + .005, sponW / 2 - .1));
  seam(new V3(H2 - .05, noseY + .06, -sponW / 2 + .1), new V3(H2 - .05, noseY + .06, sponW / 2 - .1));
  for (const s of [-1, 1]) { seam(new V3(-H2 + .2, deck + .005, s * (sponW / 2 - .05)), new V3(H2 - ufpRun, deck + .005, s * (sponW / 2 - .05))); seam(new V3(H2 - ufpRun, deck, s * (sponW / 2 - .02)), new V3(H2 - .03, noseY + .05, s * (sponW / 2 - .02))); }

  // --- running gear ---
  const wr = st === 't90' ? .37 : .36, n = def.wheels, tw = .62, pitch = .16;
  const wy = wr + .08, sprY = .70, rollY = .91;
  const roadX = i => -H2 + 1.15 + i * (L - 2.25) / (n - 1);
  const frontX = H2 - .38, rearX = -H2 + .38, sprX = def.sprocket === 'front' ? frontX : rearX, idX = def.sprocket === 'front' ? rearX : frontX;
  const rollers = [-H2 + 1.9, -.2, H2 - 2.1].map(x => [x, rollY, .13]);
  const circles = [[rearX, sprY, .34], ...Array.from({ length: n }, (_, i) => [roadX(i), wy, wr + .04]), [frontX, sprY, .34], ...rollers.slice().reverse()];
  const belt = sampleBelt(beltPath(circles), pitch), LG = linkGeos(tw, belt.step), WG = wheelGeos(wr);
  const tireM = [], discM = [], hubM = [], linkM = [], idlerM = [];
  for (const s of [-1, 1]) {
    const z = s * (W / 2 - .42);
    for (let i = 0; i < n; i++) for (const dz of [-.16, .16]) { tireM.push(mtx(roadX(i), wy, z + dz)); discM.push(mtx(roadX(i), wy, z + dz, 0, dz * s > 0 ? 0 : Math.PI)); }
    for (let i = 0; i < n; i++) hubM.push(mtx(roadX(i), wy, z + s * .16, 0, s > 0 ? 0 : Math.PI));
    for (const p of belt.pts) linkM.push(mtx(p.x, p.y, z, 0, 0, p.a));
    for (const [x, y] of rollers) idlerM.push(mtx(x, y, z, 0, 0, 0, .25));
    // sprocket: toothed disc pair + hub
    const teeth = new THREE.Shape(); const NT = 11; for (let k = 0; k < NT * 2; k++) { const a = k / (NT * 2) * Math.PI * 2, r = k % 2 ? .27 : .32; k ? teeth.lineTo(Math.cos(a) * r, Math.sin(a) * r) : teeth.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const tg = new THREE.ExtrudeGeometry(teeth, { depth: .05, bevelEnabled: true, bevelThickness: .01, bevelSize: .01, bevelSegments: 1 });
    for (const dz of [-.13, .09]) add(tg, M.dark, 'wheel', root, [sprX, sprY, z + dz]);
    add(WG.hub, M.steel, 'wheel', root, [sprX, sprY, z + s * .1], [0, s > 0 ? 0 : Math.PI, 0]);
    for (const dz of [-.16, .16]) { add(WG.disc, M.paint, 'wheel', root, [idX, sprY, z + dz], [0, 0, 0]).scale.set(.85, .85, 1); }
    add(WG.hub, M.steel, 'wheel', root, [idX, sprY, z + s * .16], [0, s > 0 ? 0 : Math.PI, 0]);
  }
  inst(WG.tire, M.rubber, 'wheel', tireM); inst(WG.disc, M.paint, 'wheel', discM); inst(WG.hub, M.steel, 'wheel', hubM);
  inst(WG.disc, M.dark, 'wheel', idlerM);
  inst(LG.steel, M.track, 'track', linkM); inst(LG.rubber, M.rubber, 'track', linkM);

  // --- skirts: segmented beveled plates, heavier front section, bolts ---
  const bolts = [];
  for (const s of [-1, 1]) {
    const segs = 7, sl = (L - .5) / segs;
    for (let i = 0; i < segs; i++) {
      const front = i < 3, thick = front ? .1 : .055, h = st === 't90' && i < 4 ? .72 : .64, x = H2 - .35 - sl / 2 - i * sl;
      const useEra = front && (st === 't90' || st === 'abrams3');
      const m = add(rbox(sl - .035, h, thick, .015), useEra ? M.era : M.paint, 'skirt', root, [x, 1.3 - h / 2, s * (W / 2 - .01 + thick / 2 - .05)]);
      if (useEra) for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) add(rbox(sl / 2 - .05, h / 2 - .05, .07, .012), M.era, 'skirt', root, [x - sl / 4 + k * sl / 2, 1.3 - h / 4 - j * h / 2, s * (W / 2 + .06)]).userData.zone = 'skirt';
      if (hq) for (const bx of [-sl / 2 + .06, sl / 2 - .06]) for (const by of [.06, h - .06]) bolts.push(mtx(x + bx, 1.3 - by, s * (W / 2 + .035 + (useEra ? .07 : thick - .055)), Math.PI / 2, 0, 0));
    }
    // fender stowage boxes + tow cable
    add(rbox(1.25, .32, .46, .03), M.paint, 'hullRoofDetail', root, [-H2 + 1.75, deck + .16, s * (sponW / 2 - .3)]);
    const cab = new THREE.CatmullRomCurve3([new V3(-H2 + .6, deck + .05, s * (sponW / 2 - .62)), new V3(-1, deck + .05, s * (sponW / 2 - .66)), new V3(1.2, deck + .05, s * (sponW / 2 - .62)), new V3(H2 - ufpRun - .1, deck + .05, s * (sponW / 2 - .55))]);
    add(new THREE.TubeGeometry(cab, 40, .022, 6), M.steel, 'hullRoofDetail');
  }
  if (bolts.length) { const bg = new THREE.CylinderGeometry(.022, .026, .025, 6); inst(bg, M.steel, 'skirt', bolts); }

  // --- hull details: lights, tow hooks, grilles, hatch, periscopes ---
  for (const s of [-1, 1]) {
    const hx = H2 - ufpRun * .22, hy = noseY + (deck - noseY) * .22 + .1, hz = s * (sponW / 2 - .28);
    add(rbox(.18, .16, .3, .02), M.dark, 'hull', root, [hx, hy, hz]);
    for (const dz of [-.07, .07]) add(new THREE.CylinderGeometry(.045, .05, .02, 16).rotateZ(Math.PI / 2), M.lamp, null, root, [hx + .095, hy, hz + dz]);
    add(rbox(.06, .08, .14, .01), M.tail, null, root, [-H2 + .02, deck - .12, s * (sponW / 2 - .2)]);
    for (const x of [H2 - .02, -H2 + .05]) { const y = x > 0 ? noseY - .1 : .8; add(rbox(.12, .16, .1, .015), M.dark, 'hull', root, [x - Math.sign(x) * .02, y, s * .75]); add(new THREE.TorusGeometry(.075, .024, 8, 16), M.steel, 'hull', root, [x + Math.sign(x) * .05, y - .04, s * .75], [0, Math.PI / 2, 0]); }
    // mudflap
    add(rbox(.04, .3, tw + .05, .01), M.rubber, 'skirt', root, [H2 - .12, 1.0, s * (W / 2 - .42)]);
  }
  // engine deck grille with slats
  const gX = st === 'merkava' ? H2 - ufpRun - 1.15 : -H2 + 1.25, slats = [];
  add(rbox(1.7, .05, 1.9, .015), M.dark, 'hullRoofDetail', root, [gX, deck + .02, 0]);
  for (let i = 0; i < 14; i++) slats.push(mtx(gX - .78 + i * .12, deck + .055, 0, 0, 0, .5));
  inst(rbox(.09, .012, 1.8, .004), M.dark, 'hullRoofDetail', slats);
  // driver hatch + periscopes
  const dX = st === 'merkava' ? H2 - ufpRun + .15 : H2 - ufpRun - .25, dZ = st === 'merkava' ? -.7 : 0;
  add(lathe([[0, .05], [.3, .05], [.34, .02], [.34, 0], [0, 0]], 28), M.paint, 'hullRoofDetail', root, [dX - .25, deck, dZ]);
  for (const k of [-1, 0, 1]) { add(rbox(.14, .1, .16, .015), M.dark, 'hullRoofDetail', root, [dX + .12, deck + .04, dZ + k * .2], [0, k * .25, 0]); add(new THREE.PlaneGeometry(.12, .06), M.glass, null, root, [dX + .195, deck + .05, dZ + k * .2], [0, Math.PI / 2 + k * .25, 0]); }
  if (st === 't90') { const era = []; const ang = Math.atan2(deck - noseY, ufpRun); for (let r = 0; r < 2; r++) for (let c = -3; c <= 3; c++) { const t = .28 + r * .36; era.push([H2 - ufpRun * t, noseY + (deck - noseY) * t + .05, c * .48]); }
    for (const p of era) add(rbox(.5, .08, .44, .015), M.era, 'hullERA', root, p, [0, 0, ang]).userData.zone = 'ufp'; }
  // rear exhaust grille
  add(rbox(.05, .35, lowW * .7, .015), M.dark, 'hull', root, [st === 'merkava' ? -H2 + .02 : -H2 - .005, deck - .45, 0]);

  // --- Turret ---
  const tur = new THREE.Group(); tur.name = 'turret'; tur.position.set(st === 'merkava' ? -.9 : -.2, deck, 0); root.add(tur);
  const th = S.th, B = fillet(mirrorHalf(S.plan), S.cast ? .25 : .07, S.cast ? 4 : 2), T = B.map(S.top);
  const shellMat = S.cast ? M.cast : M.paint;
  const tb = add(prismY(B, T, th, S.cast ? .3 : .06, S.cast ? 5 : 3), shellMat, 'turret', tur); tb.userData.th = th;
  const fx = S.gx, gy = th * .52, halfW = Math.max(...S.plan.map(p => p[1])), rearX2 = S.plan[S.plan.length - 1][0];
  if (!S.cast) for (let i = 0; i < B.length; i += 1) { const a = T[i], b = T[(i + 1) % T.length]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) > .5) { const ia = inset([...T], .07); seam(new V3(ia[i][0], th + .004, ia[i][1]), new V3(ia[(i + 1) % T.length][0], th + .004, ia[(i + 1) % T.length][1]), .04, twelds); } }

  // mantlet
  if (S.mant === 'shield') add(prismZ(fillet([[-.25, -.3], [.12, -.3], [.22, -.18], [.22, .22], [.05, .32], [-.25, .32]], .04, 2), .9, .04), M.paint, 'mantlet', tur, [fx + .02, gy, 0]);
  else if (S.mant === 'box') add(rbox(.5, .62, .95, .04), M.paint, 'mantlet', tur, [fx + .05, gy, 0]);
  else if (S.mant === 'wedge') add(prismZ([[-.6, -.25], [.25, -.12], [.3, .1], [-.6, .28]], .7, .04), M.paint, 'mantlet', tur, [fx, gy, 0]);
  else add(lathe([[0, -.35], [.32, -.33], [.38, 0], [.32, .33], [0, .35]], 24).rotateX(Math.PI / 2), M.cast, 'mantlet', tur, [fx - .1, gy, 0]);
  // gun: lathe barrel with thermal sleeve bands, fume extractor, muzzle crown, MRS
  const cal = st === 't90' ? .125 : .12, BL = def.barrel, gun = new THREE.Group(); gun.position.set(fx + .2, gy, 0); tur.add(gun);
  const r0 = cal * 1.45, r1 = cal * .98, rr = t => r0 + (r1 - r0) * t;
  add(lathe([[0, 0], [r0 * 1.12, 0], [r0 * 1.12, .25], [rr(.05), .3], [rr(1) * 1.02, BL - .25], [rr(1) * 1.16, BL - .22], [rr(1) * 1.16, BL - .02], [rr(1) * .8, BL], [cal * .5, BL], [cal * .5, BL - .1]], 40).rotateZ(-Math.PI / 2), M.dark, 'barrel', gun);
  const sleeve = []; const fe = .42; // fume extractor position (fraction)
  for (const [a, b] of [[.06, fe - .07], [fe + .08, .62], [.64, .8], [.82, .95]]) { const y0 = BL * a, y1 = BL * b; const g = lathe([[rr(a) * 1.01, y0], [rr(a) * 1.12, y0 + .02], [rr(b) * 1.12, y1 - .02], [rr(b) * 1.01, y1]], 32).rotateZ(-Math.PI / 2); add(g, M.sleeve, 'barrel', gun); sleeve.push(y1); }
  for (const y of sleeve) add(new THREE.TorusGeometry(rr(y / BL) * 1.13, .012, 6, 28).rotateY(Math.PI / 2), M.steel, 'barrel', gun, [y, 0, 0]);
  { const y0 = BL * (fe - .07), y1 = BL * (fe + .08), rf = rr(fe) * 1.75; add(lathe([[rr(fe) * 1.02, y0], [rf * .9, y0 + .06], [rf, y0 + .2], [rf, y1 - .2], [rf * .9, y1 - .06], [rr(fe) * 1.02, y1]], 36).rotateZ(-Math.PI / 2), M.paint, 'barrel', gun); }
  if (st !== 't90') { add(rbox(.3, .1, .14, .015), M.dark, 'barrel', gun, [BL - .35, rr(.95) + .07, 0]); add(new THREE.PlaneGeometry(.1, .07), M.glass, null, gun, [BL - .5, rr(.95) + .07, 0], [0, -Math.PI / 2, 0]); }

  // sights: gunner primary sight (box + glass), commander panoramic sight (stalk + head + glass)
  const gps = [fx - .55, .9 * halfW * .55], cps = [st === 'chally' ? -.2 : -.55, -halfW * .45];
  if (st !== 'abrams3') { add(rbox(.55, .38, .42, .035), M.paint, 'turretRoofDetail', tur, [gps[0], th + .19, gps[1]]); add(new THREE.PlaneGeometry(.36, .22), M.glass, null, tur, [gps[0] + .277, th + .22, gps[1]], [0, Math.PI / 2, 0]);
    for (const d of [-1, 1]) add(rbox(.5, .32, .03, .01), M.dark, null, tur, [gps[0] + .05, th + .2, gps[1] + d * .24]); }
  add(new THREE.CylinderGeometry(.11, .14, .36, 20), M.dark, 'turretRoofDetail', tur, [cps[0], th + .18, cps[1]]);
  const head = add(rbox(.42, .3, .38, .05), M.paint, 'turretRoofDetail', tur, [cps[0], th + .5, cps[1]]);
  add(new THREE.PlaneGeometry(.26, .16), M.glass, null, head, [.215, .02, 0], [0, Math.PI / 2, 0]); add(new THREE.PlaneGeometry(.2, .14), M.glass, null, head, [-.215, .02, 0], [0, -Math.PI / 2, 0]);
  // hatches: commander cupola with vision blocks + loader hatch
  if (S.hatches) {
    const cz = halfW * .48, cx = -.5;
    add(lathe([[0, .14], [.34, .14], [.4, .1], [.44, 0], [0, 0]], 32), M.paint, 'turretRoofDetail', tur, [cx, th, cz]);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; add(new THREE.PlaneGeometry(.1, .06), M.glass, null, tur, [cx + Math.cos(a) * .425, th + .06, cz + Math.sin(a) * .425], [0, -a + Math.PI / 2, 0]); }
    add(new THREE.CylinderGeometry(.3, .32, .06, 28), M.paint, 'turretRoofDetail', tur, [cx, th + .17, cz]);
    add(new THREE.CylinderGeometry(.05, .05, .2, 10).rotateX(Math.PI / 2), M.steel, null, tur, [cx - .3, th + .17, cz]);
    // RWS on cupola
    const rws = new THREE.Group(); rws.position.set(cx + .05, th + .33, cz); tur.add(rws);
    add(rbox(.45, .28, .34, .03), M.dark, 'turretRoofDetail', rws); add(new THREE.PlaneGeometry(.14, .1), M.glass, null, rws, [.227, .05, .08], [0, Math.PI / 2, 0]);
    add(new THREE.CylinderGeometry(.025, .028, 1.1, 10).rotateZ(Math.PI / 2), M.dark, 'turretRoofDetail', rws, [.7, -.02, -.08]);
    add(rbox(.3, .18, .16, .02), M.fabric, null, rws, [-.05, -.02, -.25]);
    if (S.hatches > 1) { const lz = -halfW * .48 + (st === 'chally' ? .2 : 0); add(lathe([[0, .08], [.3, .08], [.33, .04], [.33, 0], [0, 0]], 28), M.paint, 'turretRoofDetail', tur, [-.55, th, lz]);
      add(new THREE.TorusGeometry(.12, .015, 6, 16, Math.PI), M.steel, null, tur, [-.55, th + .08, lz], [Math.PI / 2, 0, 0]); }
  }
  // smoke grenade launchers
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const sx = (S.plan[1][0] + fx) / 2 - .35 - i * .08, sz = s * (halfW * .8 + .1 - i * .02); add(new THREE.CylinderGeometry(.045, .05, .26, 12).rotateZ(Math.PI / 2.5), M.dark, 'turretRoofDetail', tur, [sx, th + .1 + i * .02, sz]); }
  // antennas with bases
  for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(.04, .05, .08, 10), M.dark, 'ant', tur, [rearX2 + .45, th + .04, s * halfW * .7]); add(new THREE.CylinderGeometry(.006, .012, 2.4, 5), M.dark, 'ant', tur, [rearX2 + .45, th + 1.25, s * halfW * .7]); }
  // bustle rack (bar cage) with stowage
  if (S.rack) { const rx = rearX2 + (st === 'merkava' ? .1 : 0), depth = .55, rw = halfW * 1.7; const bars = [];
    for (const y of [-.1, th * .5, th - .05]) { bars.push(mtx(rx - depth, y, 0, Math.PI / 2, 0, 0)); for (const s of [-1, 1]) bars.push(mtx(rx - depth / 2, y, s * rw / 2, 0, 0, Math.PI / 2)); }
    for (let k = 0; k <= 8; k++) bars.push(mtx(rx - depth, th * .45 - .05, -rw / 2 + k * rw / 8, 0, 0, 0));
    const bargeo = new THREE.CylinderGeometry(.018, .018, 1, 6); const im = new THREE.InstancedMesh(bargeo, M.dark, bars.length); im.userData.part = 'rack'; im.castShadow = true;
    bars.forEach((m, i) => { const sc = new THREE.Matrix4(); const len = i < 9 ? (i % 3 === 0 ? rw : depth) : th + .1; im.setMatrixAt(i, m.clone().multiply(sc.makeScale(1, len, 1))); });
    im.computeBoundingSphere(); tur.add(im);
    for (let k = 0; k < 3; k++) add(rbox(.42, .38 + (k % 2) * .08, rw / 3 - .08, .08), M.fabric, 'rack', tur, [rx - depth / 2, .2 + (k % 2) * .04, -rw / 3 + k * rw / 3]);
    add(new THREE.CylinderGeometry(.13, .13, rw * .8, 16).rotateX(Math.PI / 2), M.fabric, 'rack', tur, [rx - depth / 2, th + .08, 0]);
  }
  if (S.chains) { const n2 = hq ? 24 : 12, ch = []; for (let i = 0; i < n2; i++) { const a = -1.3 + i / (n2 - 1) * 2.6; const x = rearX2 + .15 - Math.cos(a) * .2, z = Math.sin(a) * halfW * 1.05; ch.push(mtx(x, -.32, z)); }
    const ballG = new THREE.SphereGeometry(.05, 10, 8), chainG = new THREE.CylinderGeometry(.008, .008, .5, 4); chainG.translate(0, .25, 0);
    inst(ballG, M.steel, 'chain', ch, tur); inst(chainG, M.steel, 'chain', ch, tur); }
  if (S.relikt) { const cubes = []; for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const a = s * (.28 + i * .2); const x = Math.cos(a) * 1.78, z = Math.sin(a) * 1.48;
      const m = add(prismY([[-.16, -.22], [.18, -.22], [.18, .22], [-.16, .22]], [[-.16, -.2], [.05, -.2], [.05, .2], [-.16, .2]], th * .95, .03, 2), M.era, 'turretERA', tur, [x, .02, z], [0, -a, 0]); m.userData.zone = 'turretFront'; }
    for (let i = 0; i < 4; i++) { const m = add(rbox(.42, .07, .38, .015), M.era, 'turretERA', tur, [1.0 - i * .12, th - .02 + .03, (i - 1.5) * .42], [0, 0, -.18]); m.userData.zone = 'turretRoof'; }
    add(rbox(1.0, .55, 2.1, .06), M.paint, 'turret', tur, [-2.1, th * .5, 0]);
    const cage = []; for (let k = 0; k < 8; k++) cage.push(mtx(-2.62, th * .5, -1 + k * .285, 0, 0, 0)); inst(new THREE.CylinderGeometry(.015, .015, .7, 5), M.dark, 'rack', cage, tur);
    const spare = []; for (let k = 0; k < 6; k++) spare.push(mtx(.55 - k * .17, th + .01, halfW * .55, 0, 0, Math.PI / 2 + .15)); inst(LG.steel, M.track, 'turretRoofDetail', spare, tur);
  }
  if (S.aps) for (const s of [-1, 1]) { add(rbox(.32, .26, .08, .02), M.dark, 'turretRoofDetail', tur, [.9, th * .55, s * (halfW - .02)], [0, s * .6, 0]); add(new THREE.PlaneGeometry(.26, .2), M.glass, null, tur, [.92, th * .55, s * (halfW + .03)], [0, s > 0 ? .6 : Math.PI - .6, 0]); add(new THREE.CylinderGeometry(.14, .16, .3, 14), M.dark, 'turretRoofDetail', tur, [-1.4, th + .15, s * halfW * .75]); }
  if (S.wedges) for (const s of [-1, 1]) {
    const tri3 = [[1.52, s * 1.78], [1.6, s * .56], [2.58, s * .62]]; const B2 = s > 0 ? tri3 : tri3.slice().reverse(); const T2 = B2.map(([x, z]) => [x > 2 ? x - .25 : x, z * .97]);
    const m = add(prismY(fillet(B2, .05, 2), fillet(T2, .05, 2), th * .9, .03, 2, .04), M.paint, 'turretWedge', tur); m.userData.zone = 'turretFront';
  }
  if (S.slabs) for (const s of [-1, 1]) { const m = add(rbox(.28, th * .85, 1.0, .03), M.paint, 'turretWedge', tur, [fx + .1, th * .45, s * 1.15], [0, -s * .12, 0]); m.userData.zone = 'turretFront'; }
  if (st === 'chally') add(rbox(.5, .45, .45, .04), M.paint, 'turretRoofDetail', tur, [-1.0, th + .23, -halfW * .1]);

  // weld beads (instanced, squashed spheres)
  { const wg = new THREE.SphereGeometry(.022, 6, 4); wg.scale(1, .45, 1); const mk = arr => arr.map(p => mtx(p.x, p.y, p.z, 0, Math.random() * 3, 0, .8 + Math.random() * .4));
    if (welds.length) inst(wg, M.weld, null, mk(welds)); if (twelds.length) inst(wg, M.weld, null, mk(twelds), tur); }

  // decals: tactical number + marking, projected onto turret sides & hull front
  root.updateMatrixWorld(true);
  const markTex = markingTex(numFor(def), st);
  const decalMat = new THREE.MeshStandardMaterial({ map: markTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: .8, metalness: 0 });
  const rc = new THREE.Raycaster();
  for (const s of [-1, 1]) {
    rc.set(new V3(tur.position.x - .4, deck + th * .5, s * 5), new V3(0, 0, -s));
    const h = rc.intersectObject(tb, false)[0]; if (!h) continue;
    const o = new THREE.Object3D(); o.position.copy(h.point); o.lookAt(h.point.clone().add(new V3(0, 0, s))); if (s < 0) o.rotateZ(0);
    try { const dg = new DecalGeometry(tb, h.point, o.rotation, new V3(1.1, .55, .6)); const dm = new THREE.Mesh(dg, decalMat); dm.userData.isDecal = true; dm.receiveShadow = true; tur.attach(dm); } catch (e) { }
  }
  root.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); });
  root.userData = { turret: tur, deck, noseY, ufpStart: H2 - ufpRun - .05, gun };
  return root;
}
const numFor = def => ({ abrams: 'B23', abrams3: 'X01', chally: '31B', merkava: '4', leo: '211', t90: '534' })[def.style] || '00';

// Classify an armor zone from hit mesh + local-space normal/point
export function classifyZone(obj, nLocal, pLocal, tank) {
  if (obj.userData.zone) return obj.userData.zone;
  const p = obj.userData.part;
  const turretish = ['turret', 'mantlet', 'barrel', 'turretRoofDetail', 'rack', 'chain', 'ant', 'turretWedge'].includes(p);
  if (p === 'skirt' || p === 'wheel' || p === 'track') return 'skirt';
  if (turretish) {
    if (p === 'mantlet' || p === 'barrel') return 'turretFront';
    if (p === 'chain' || p === 'rack') return 'turretRear';
    if (nLocal.y > .6 || p === 'turretRoofDetail' || p === 'ant') return 'turretRoof';
    if (nLocal.x > .45) return 'turretFront';
    if (nLocal.x < -.6) return 'turretRear';
    return 'turretSide';
  }
  if (p === 'hullRoofDetail') return 'hullRoof';
  if (nLocal.x > .2 && pLocal.x > tank.userData.ufpStart) return pLocal.y > tank.userData.noseY + .02 ? 'ufp' : 'lfp';
  if (nLocal.y > .75) return 'hullRoof';
  if (nLocal.x < -.6) return 'hullRear';
  return 'hullSide';
}
