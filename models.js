import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

function noiseTex(base, amt = 30, size = 256, spots = true) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const col = new THREE.Color(base); g.fillStyle = '#' + col.getHexString(); g.fillRect(0, 0, size, size);
  const id = g.getImageData(0, 0, size, size), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
  if (spots) for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(40,30,20,${Math.random() * .12})`; g.beginPath(); g.arc(Math.random() * size, Math.random() * size, Math.random() * 18, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function roughTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const id = g.createImageData(128, 128);
  for (let i = 0; i < id.data.length; i += 4) { const v = 150 + Math.random() * 90; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  g.putImageData(id, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function trackTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32; const g = c.getContext('2d');
  g.fillStyle = '#222'; g.fillRect(0, 0, 64, 32); g.fillStyle = '#3a3a3a'; for (let x = 0; x < 64; x += 16) g.fillRect(x + 2, 0, 10, 32);
  g.fillStyle = '#151515'; g.fillRect(0, 13, 64, 6);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const RT = roughTex();

function shapeMirror(pts) { // pts: half outline (x,z>=0) front->back; mirrors to full
  const s = new THREE.Shape(); const all = [...pts, ...pts.slice().reverse().map(([x, z]) => [x, -z])];
  s.moveTo(all[0][0], all[0][1]); for (const p of all.slice(1)) s.lineTo(p[0], p[1]); return s;
}
// vertical extrusion of plan outline, with top taper (sloped sides) and optional front-down slope
function plateBody(pts, h, taper = 0.85, bevel = 0.04, frontDrop = 0) {
  const g = new THREE.ExtrudeGeometry(shapeMirror(pts), { depth: h, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2); // shape y -> -z, depth -> +y
  const p = g.attributes.position; let maxX = -1e9; for (let i = 0; i < p.count; i++) maxX = Math.max(maxX, p.getX(i));
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i); const t = THREE.MathUtils.clamp(y / h, 0, 1); const k = 1 - (1 - taper) * t;
    let x = p.getX(i) * (1 - (1 - taper) * 0.6 * t); const z = p.getZ(i) * k;
    p.setXYZ(i, x, y - frontDrop * Math.max(0, x / maxX) * (1 - t) * 0, z);
  }
  g.computeVertexNormals(); return g;
}
function sideProfileHull(profile, width) { // profile in (x,y), extruded across z
  const s = new THREE.Shape(); s.moveTo(...profile[0]); for (const p of profile.slice(1)) s.lineTo(...p);
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 1 });
  g.translate(0, 0, -width / 2); g.computeVertexNormals(); return g;
}

export const CAMOS = { factory: 'Factory', desert: 'Desert tan', nato: 'NATO 3-tone', woodland: 'Woodland', urban: 'Urban grey', digital: 'Digital' };
const camoCache = {};
function camoTex(scheme, base) {
  const key = scheme + base; if (camoCache[key]) return camoCache[key];
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const pal = { factory: ['#' + new THREE.Color(base).getHexString()], desert: ['#a48d5f', '#8f7a50', '#b9a173'], nato: ['#3d4a2e', '#2b2b25', '#5a4a33'],
    woodland: ['#4b5a32', '#2e3a20', '#6b5a3a', '#1d1d18'], urban: ['#6d7276', '#4a4e52', '#8d9296', '#2c2f31'], digital: ['#5d6648', '#3d4530', '#8a8461', '#2a2c22'] }[scheme];
  g.fillStyle = pal[0]; g.fillRect(0, 0, S, S);
  if (scheme === 'digital') { for (let i = 0; i < 1400; i++) { g.fillStyle = pal[1 + (i % (pal.length - 1))]; const x = Math.floor(Math.random() * 64) * 8, y = Math.floor(Math.random() * 64) * 8; g.fillRect(x, y, 8 * (1 + (Math.random() * 3 | 0)), 8 * (1 + (Math.random() * 2 | 0))); } }
  else if (pal.length > 1) for (let k = 1; k < pal.length; k++) for (let b = 0; b < 7; b++) { g.fillStyle = pal[k]; let x = Math.random() * S, y = Math.random() * S; for (let j = 0; j < 14; j++) { x += (Math.random() - .5) * 60; y += (Math.random() - .5) * 40; for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { g.beginPath(); g.ellipse(x + dx, y + dy, 20 + Math.random() * 30, 14 + Math.random() * 20, Math.random() * 3, 0, 7); g.fill(); } } }
  // grime + chips + scratches (procedural wear)
  const id = g.getImageData(0, 0, S, S), d = id.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * 16; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(id, 0, 0);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(30,24,18,${Math.random() * .18})`; g.beginPath(); g.arc(Math.random() * S, Math.random() * S, Math.random() * 26, 0, 7); g.fill(); }
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(150,150,145,${.25 + Math.random() * .4})`; g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 3, 1 + Math.random() * 3); }
  g.lineWidth = 1; for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(190,185,170,${Math.random() * .3})`; const x = Math.random() * S, y = Math.random() * S, a = Math.random() * 6.28, l = 5 + Math.random() * 30; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.repeat.set(.35, .35);
  return camoCache[key] = t;
}

export function buildTank(def, camo = 'factory') {
  const root = new THREE.Group(); root.name = 'tank';
  const paint = new THREE.MeshPhysicalMaterial({ map: camoTex(camo, def.color), roughness: .62, metalness: .35, roughnessMap: RT, clearcoat: .15, clearcoatRoughness: .45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c2a, roughness: .7, metalness: .5 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: .95 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x777b80, roughness: .35, metalness: .9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: .05, metalness: .2, clearcoat: 1, emissive: 0x0a1a22 });
  const era = paint.clone(); era.color = new THREE.Color(0.82, 0.82, 0.8);
  const tTex = trackTex(); tTex.repeat.set(def.len * 4, 1);
  const trackMat = new THREE.MeshStandardMaterial({ map: tTex, roughness: .9, metalness: .4 });
  const linkMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2a, roughness: .55, metalness: .8 });
  const st = def.style, L = def.len, W = def.width, H2 = L / 2;
  const add = (geo, mat, part, parent = root, pos, rot) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); m.userData.part = part; parent.add(m); return m; };

  // --- Hull ---
  const lowW = W - 1.3, deck = st === 't90' ? 1.55 : st === 'merkava' ? 1.75 : 1.65;
  const noseY = st === 'merkava' ? 1.0 : 0.95;
  const ufpRun = st === 'abrams' || st === 'abrams3' ? 1.8 : st === 'merkava' ? 2.4 : st === 't90' ? 1.4 : 1.2;
  const prof = [[-H2, 0.45], [H2 - 0.7, 0.45], [H2, noseY], [H2 - ufpRun, deck], [-H2 + 0.15, deck], [-H2, deck - 0.25]];
  const hull = add(sideProfileHull(prof, lowW), paint, 'hull');
  hull.userData.noseY = noseY;
  const spon = sideProfileHull([[-H2, 1.0], [H2 - 0.45, 1.0], [H2 - .05, noseY + .02], [H2 - ufpRun, deck - .02], [-H2 + .15, deck - .02], [-H2, deck - .25]], W - 0.2);
  const sp = add(spon, paint, 'hull'); sp.userData.noseY = noseY;
  // running gear
  const wr = st === 't90' ? 0.38 : 0.36, n = def.wheels;
  const wGeo = new THREE.CylinderGeometry(wr, wr, .22, 24); wGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(.13, .13, .26, 12); hubGeo.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) {
    const z = s * (W / 2 - 0.42);
    for (let i = 0; i < n; i++) { const x = -H2 + 1.1 + i * (L - 2.1) / (n - 1); add(wGeo, rubber, 'wheel', root, [x, wr + .12, z]); add(hubGeo, steel, 'wheel', root, [x, wr + .12, z]); }
    const spX = def.sprocket === 'front' ? H2 - .35 : -H2 + .35; const idX = -spX;
    const sg = new THREE.CylinderGeometry(.34, .34, .28, 12); sg.rotateX(Math.PI / 2); add(sg, dark, 'wheel', root, [spX, .78, z]); add(sg, dark, 'wheel', root, [idX, .7, z]);
    for (let i = 0; i < 3; i++) { const rg = new THREE.CylinderGeometry(.09, .09, .2, 10); rg.rotateX(Math.PI / 2); add(rg, dark, 'wheel', root, [-H2 + 2 + i * 2, 1.0, z]); }
    // track: bottom, top, plus front/back slanted runs
    const tw = .62;
    { // individual track links (instanced) along the track loop
      const path = [[-H2 + .65, .06], [H2 - .65, .06], [H2 - .1, 1.0], [H2 - .35, 1.1], [-H2 + .35, 1.1], [-H2 + .1, 1.0], [-H2 + .65, .06]];
      const pts = []; for (let i = 0; i < path.length - 1; i++) { const [x0, y0] = path[i], [x1, y1] = path[i + 1]; const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / .17)); for (let k = 0; k < n; k++) pts.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, Math.atan2(y1 - y0, x1 - x0)]); }
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(.15, .07, tw), linkMat, pts.length); const pin = new THREE.InstancedMesh(new THREE.BoxGeometry(.05, .085, tw + .06), steel, pts.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      pts.forEach(([x, y, a], i) => { m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a), new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); pin.setMatrixAt(i, m4); });
      for (const o of [im, pin]) { o.castShadow = o.receiveShadow = true; o.userData.part = 'track'; root.add(o); }
    }
    // skirts (segmented)
    const segs = 7, sl = (L - .6) / segs;
    for (let i = 0; i < segs; i++) {
      const thick = i < 3 ? .1 : .05; const h = st === 't90' && i < 4 ? .7 : .62;
      const m = add(new THREE.BoxGeometry(sl - .03, h, thick), i < 3 && (st === 't90' || st === 'abrams3') ? era : paint, 'skirt', root, [H2 - .5 - sl / 2 - i * sl, 1.27 - h / 2 + .06, s * (W / 2 - .02)]);
    }
    // stowage boxes on fenders
    add(new THREE.BoxGeometry(1.2, .3, .45), paint, 'hullRoofDetail', root, [-H2 + 1.8, deck + .12, s * (W / 2 - .35)]);
  }
  // headlights, tow hooks, exhaust grille
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(.15, .14, .22), dark, 'hull', root, [H2 - ufpRun * .25, noseY + .2, s * (lowW / 2 + .4)]);
    add(new THREE.TorusGeometry(.08, .025, 6, 12), steel, 'hull', root, [H2 + .02, noseY - .15, s * .7], [0, Math.PI / 2, 0]);
  }
  const grille = add(new THREE.BoxGeometry(1.6, .04, 1.8), new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: .6, metalness: .6 }), 'hullRoofDetail', root, [st === 'merkava' ? H2 - ufpRun - 1.1 : -H2 + 1.2, deck + .02, 0]);
  if (st === 't90') { // ERA bricks on glacis
    const ang = Math.atan2(deck - noseY, ufpRun);
    for (let r = 0; r < 2; r++) for (let c = -3; c <= 3; c++) { const t = .3 + r * .35; const m = add(new THREE.BoxGeometry(.5, .08, .44), era, 'hullERA', root, [H2 - ufpRun * t, noseY + (deck - noseY) * t + .05, c * .48], [0, 0, ang]); m.userData.zone = 'ufp'; }
  }
  // driver periscopes
  add(new THREE.BoxGeometry(.2, .1, .5), glass, 'hull', root, [st === 'merkava' ? H2 - ufpRun - .1 : H2 - ufpRun - .05, deck + .05, st === 't90' ? 0 : 0]);

  // --- Turret ---
  const tur = new THREE.Group(); tur.name = 'turret'; tur.position.set(st === 'merkava' ? -0.9 : -0.2, deck, 0); root.add(tur);
  let plan, th, taper;
  switch (st) {
    case 'abrams': plan = [[2.05, .55], [1.55, 1.75], [-1.0, 1.85], [-1.4, 1.45], [-2.7, 1.45], [-2.8, 0]]; th = .85; taper = .9; break;
    case 'abrams3': plan = [[1.9, .5], [1.45, 1.7], [-1.0, 1.75], [-1.5, 1.35], [-2.4, 1.35], [-2.5, 0]]; th = .72; taper = .86; break;
    case 'chally': plan = [[1.75, .55], [1.55, 1.65], [-1.6, 1.7], [-2.1, 1.25], [-2.2, 0]]; th = .9; taper = .92; break;
    case 'merkava': plan = [[2.9, .3], [1.0, 1.4], [-1.4, 1.6], [-2.4, 1.2], [-2.6, 0]]; th = .8; taper = .72; break;
    case 'leo': plan = [[2.5, .35], [1.35, 1.75], [-1.2, 1.75], [-2.3, 1.45], [-2.4, 0]]; th = .85; taper = .9; break;
    case 't90': { plan = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI; plan.push([Math.cos(a) * 1.75 + (i < 3 ? .1 : 0), Math.sin(a) * 1.45 + .001]); } plan[plan.length - 1][1] = 0; plan[0][1] = .35; th = .7; taper = .78; break; }
  }
  const tb = add(plateBody(plan, th, taper), paint, 'turret', tur); tb.userData.th = th;
  // mantlet + gun
  const mx = plan[0][0];
  add(new THREE.BoxGeometry(.5, .5, .75), paint, 'mantlet', tur, [mx - .05, th * .5, 0]);
  const cal = st === 't90' ? .125 : .12;
  const gunGeo = new THREE.CylinderGeometry(cal * .95, cal * 1.4, def.barrel, 24, 1, false); gunGeo.rotateZ(-Math.PI / 2);
  const gun = add(gunGeo, paint, 'barrel', tur, [mx + def.barrel / 2, th * .5, 0]);
  const evGeo = new THREE.CylinderGeometry(cal * 1.9, cal * 1.9, .7, 20); evGeo.rotateZ(Math.PI / 2);
  add(evGeo, paint, 'barrel', tur, [mx + def.barrel * .45, th * .5, 0]);
  const muz = new THREE.CylinderGeometry(cal * 1.25, cal * 1.25, .35, 20); muz.rotateZ(Math.PI / 2);
  add(muz, dark, 'barrel', tur, [mx + def.barrel - .1, th * .5, 0]);
  if (st === 'chally' || st === 'abrams' || st === 'leo' || st === 'abrams3') add(new THREE.BoxGeometry(.35, .14, .2), dark, 'barrel', tur, [mx + def.barrel - .25, th * .5 + .18, 0]); // MRS
  // sights / CITV / RWS
  add(new THREE.BoxGeometry(.5, .35, .45), paint, 'turretRoofDetail', tur, [mx - .9, th + .2, -0.8]);
  add(new THREE.BoxGeometry(.06, .25, .36), glass, 'turretRoofDetail', tur, [mx - .64, th + .2, -0.8]);
  const citv = add(new THREE.CylinderGeometry(.18, .2, .5, 16), paint, 'turretRoofDetail', tur, [-0.6, th + .25, 0.9]);
  add(new THREE.SphereGeometry(.17, 16, 12), glass, 'turretRoofDetail', tur, [-0.55, th + .55, 0.9]);
  // commander cupola + RWS
  add(new THREE.CylinderGeometry(.4, .45, .18, 20), paint, 'turretRoofDetail', tur, [-.3, th + .09, .55]);
  const rws = new THREE.Group(); rws.position.set(-.3, th + .3, .55); tur.add(rws);
  add(new THREE.BoxGeometry(.45, .3, .35), dark, 'turretRoofDetail', rws);
  const mg = new THREE.CylinderGeometry(.03, .03, 1.2, 8); mg.rotateZ(Math.PI / 2); add(mg, dark, 'turretRoofDetail', rws, [.6, .05, 0]);
  add(new THREE.CylinderGeometry(.3, .32, .12, 18), paint, 'turretRoofDetail', tur, [-.3, th + .06, -.55]); // loader hatch
  // smoke dischargers
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const g = new THREE.CylinderGeometry(.05, .05, .3, 8); g.rotateZ(Math.PI / 2.6); add(g, dark, 'turretRoofDetail', tur, [plan[1][0] - .3, th * .6 + i * .07, s * (plan[1][1] - .05 - i * .02)]); }
  // antennas
  const ant = new THREE.CylinderGeometry(.01, .015, 2.2, 5);
  for (const s of [-1, 1]) add(ant, dark, 'ant', tur, [plan[plan.length - 2][0] + .1, th + 1.1, s * 1.0]);
  // bustle rack
  const bx = plan[plan.length - 1][0];
  if (st !== 't90') { add(new THREE.BoxGeometry(.06, .35, 2.4), dark, 'rack', tur, [bx - .35, th * .55, 0]); }
  if (st === 'merkava') { // ball-and-chain curtain
    const chainMat = steel; for (let i = -10; i <= 10; i++) { const z = i * .13; add(new THREE.CylinderGeometry(.008, .008, .5, 4), chainMat, 'chain', tur, [bx - .05, -.15, z]); add(new THREE.SphereGeometry(.05, 8, 6), chainMat, 'chain', tur, [bx - .05, -.42, z]); }
  }
  if (st === 't90') { // Relikt blocks on turret front
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const a = s * (.25 + i * .17); const m = add(new THREE.BoxGeometry(.25, th * .9, .38), era, 'turretERA', tur, [Math.cos(a) * 1.85, th * .45, Math.sin(a) * 1.55], [0, -a, 0]); m.userData.zone = 'turretFront'; }
    for (let i = 0; i < 3; i++) { const m = add(new THREE.BoxGeometry(.45, .08, .4), era, 'turretERA', tur, [1.0 - i * .1, th + .02, (i - 1) * .5]); m.userData.zone = 'turretRoof'; }
    add(new THREE.BoxGeometry(1.1, .55, 2.2), paint, 'turret', tur, [-1.95, th * .5, 0]);
  }
  if (st === 'abrams3') { for (const s of [-1, 1]) add(new THREE.BoxGeometry(.3, .2, .3), glass, 'turretRoofDetail', tur, [1.0, th + .1, s * 1.2]); } // APS radars
  if (st === 'leo') { for (const s of [-1, 1]) { const m = add(new THREE.BoxGeometry(.9, th * .9, .06), paint, 'turretWedge', tur, [1.9, th * .5, s * .95], [0, s * .85, 0]); m.userData.zone = 'turretFront'; } }

  // bolts on skirts / turret cheeks / glacis (instanced)
  { const bolts = []; for (const sd of [-1, 1]) { for (let x = -H2 + .4; x < H2 - .5; x += .28) bolts.push([x, 1.22, sd * (W / 2 + .035)]); }
    for (let z = -lowW / 2 + .2; z < lowW / 2; z += .25) bolts.push([H2 - ufpRun * .9, deck - (deck - noseY) * .1 + .03, z]);
    const bi = new THREE.InstancedMesh(new THREE.CylinderGeometry(.025, .025, .03, 6), steel, bolts.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    bolts.forEach(([x, y, z], i) => { m4.compose(new THREE.Vector3(x, y, z), Math.abs(z) > lowW / 2 + .2 ? q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2) : q.identity(), new THREE.Vector3(1, 1, 1)); bi.setMatrixAt(i, m4); });
    bi.userData.part = 'skirt'; root.add(bi); }
  { const tb2 = []; for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) tb2.push([plan[0][0] - .25 - i * .18, th + .045, sd * (plan[0][1] + i * .19)]);
    const bi = new THREE.InstancedMesh(new THREE.CylinderGeometry(.03, .03, .03, 6), steel, tb2.length); const m4 = new THREE.Matrix4();
    tb2.forEach((p, i) => { m4.makeTranslation(...p); bi.setMatrixAt(i, m4); }); bi.userData.part = 'turretRoofDetail'; tur.add(bi); }
  // edge highlights
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: .16 });
  root.traverse(o => { if (o.isMesh && !o.isInstancedMesh && ['hull', 'turret', 'skirt', 'mantlet', 'turretERA', 'hullERA', 'turretWedge'].includes(o.userData.part)) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), edgeMat); e.raycast = () => {}; o.add(e); } });
  root.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); });
  root.userData = { turret: tur, deck, noseY, ufpStart: H2 - ufpRun - 0.05 };
  return root;
}

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
