// Dark sci-fi lab environment: reflective stage, emissive wall panels, light shafts, custom HDR-like env
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { radialTex } from './textures.js';
import { TANKS } from './data.js';

export function makeEnvScene() {
  const s = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 40), new THREE.MeshBasicMaterial({ color: 0x07090c, side: THREE.BackSide })); s.add(box);
  const strip = (c, i, pos, size, rot = [0, 0, 0]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide })); m.position.set(...pos); m.rotation.set(...rot); s.add(m); };
  // studio softboxes: big overhead key, long strip lights for crisp paint highlights, warm/cool kickers
  strip(0xffffff, 4.0, [0, 9.5, 0], [12, 5], [Math.PI / 2, 0, 0]);
  strip(0xfff1e0, 6.0, [9, 7, 9], [2, 9], [0, -Math.PI / 4, 0]);
  strip(0xe8f4ff, 5.0, [-9, 7, 9], [2, 9], [0, Math.PI / 4, 0]);
  strip(0xffb36b, 4, [-19.5, 4, 0], [16, 1.5], [0, Math.PI / 2, 0]);
  strip(0x4fd9ff, 4, [19.5, 4, 0], [16, 1.5], [0, -Math.PI / 2, 0]);
  strip(0x7fbfff, 1.5, [0, 3, -19.5], [30, 4]);
  strip(0xffffff, 1.0, [0, 2, 19.5], [20, 3], [0, Math.PI, 0]);
  const fl = new THREE.Mesh(new THREE.CircleGeometry(12, 32), new THREE.MeshBasicMaterial({ color: 0x15181c })); fl.rotation.x = -Math.PI / 2; fl.position.y = -2; s.add(fl);
  return s;
}

function silhouette(def, w = 1024, h = 640) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0c2a3a'); gr.addColorStop(1, '#05121b'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(80,200,255,.10)'; g.lineWidth = 1; for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  const L = def.len, sc = (w * .62) / L, cx = w * .45, gy = h * .72;
  const X = x => cx + x * sc, Y = y => gy - y * sc;
  g.strokeStyle = '#7fe6ff'; g.lineWidth = 4; g.shadowColor = '#4fd9ff'; g.shadowBlur = 18; g.fillStyle = 'rgba(79,217,255,.10)';
  g.beginPath(); g.moveTo(X(-L / 2), Y(.45)); g.lineTo(X(L / 2 - .7), Y(.45)); g.lineTo(X(L / 2), Y(.95)); g.lineTo(X(L / 2 - 1.5), Y(1.65)); g.lineTo(X(-L / 2 + .1), Y(1.65)); g.lineTo(X(-L / 2), Y(1.4)); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(X(-2.6), Y(1.65)); g.lineTo(X(-2.7), Y(2.4)); g.lineTo(X(.6), Y(2.5)); g.lineTo(X(1.7), Y(2.15)); g.lineTo(X(1.8), Y(1.65)); g.stroke(); g.fill();
  g.beginPath(); g.moveTo(X(1.8), Y(2.05)); g.lineTo(X(1.8 + def.barrel), Y(2.08)); g.stroke();
  for (let i = 0; i < def.wheels; i++) { g.beginPath(); g.arc(X(-L / 2 + 1.1 + i * (L - 2.1) / (def.wheels - 1)), Y(.45), .36 * sc, 0, 7); g.stroke(); }
  g.shadowBlur = 0; g.fillStyle = '#9feaff'; g.font = 'bold 34px system-ui'; g.fillText(def.name.toUpperCase(), 30, 52);
  g.font = '20px monospace'; g.fillStyle = 'rgba(160,230,255,.7)';
  const tf = def.zones.turretFront; g.fillText(`TURRET FRONT  KE ${tf.reduce((a, l) => a + l.ke, 0)}  CE ${tf.reduce((a, l) => a + l.ce, 0)} mm RHAe (est.)`, 30, 84);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildLab(scene, renderer) {
  const lab = new THREE.Group(); scene.add(lab);
  // outer floor
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: .35, metalness: .5 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.32; floor.receiveShadow = true; lab.add(floor);
  // stage plinth
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.45, .32, 96, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x101419, roughness: .25, metalness: .8, clearcoat: 1, side: THREE.DoubleSide }));
  plinth.position.y = -.16; lab.add(plinth);
  // reflective top (Reflector) + glossy overlay that dims/softens the mirror and receives shadows
  const refl = new Reflector(new THREE.CircleGeometry(7.2, 96), { textureWidth: 1024, textureHeight: 1024, color: 0x8a9096 });
  refl.rotation.x = -Math.PI / 2; refl.position.y = -0.002; lab.add(refl);
  const top = new THREE.Mesh(new THREE.CircleGeometry(7.2, 96), new THREE.MeshPhysicalMaterial({ color: 0x0b0e12, roughness: .32, metalness: .3, transparent: true, opacity: .8, clearcoat: 1, clearcoatRoughness: .25 }));
  top.rotation.x = -Math.PI / 2; top.receiveShadow = true; lab.add(top);
  const fallbackTop = new THREE.Mesh(new THREE.CircleGeometry(7.2, 96), new THREE.MeshPhysicalMaterial({ color: 0x0d1015, roughness: .18, metalness: .7, clearcoat: 1, clearcoatRoughness: .1 }));
  fallbackTop.rotation.x = -Math.PI / 2; fallbackTop.position.y = -.001; fallbackTop.receiveShadow = true; fallbackTop.visible = false; lab.add(fallbackTop);
  // rim lights (emissive rings)
  const ring = (r, c, i, y) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, .025, 8, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), toneMapped: false })); m.rotation.x = Math.PI / 2; m.position.y = y; lab.add(m); m.userData.noAO = true; return m; };
  ring(7.22, 0x39d5ff, 2.2, 0.0); ring(7.47, 0xffa040, 1.4, -.31); ring(4.6, 0x39d5ff, .6, 0.003).scale.set(1, 1, .4);
  // back wall + backlit panels
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x0b0e12, roughness: .6, metalness: .4 });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 14, 64, 1, true, Math.PI * .6, Math.PI * .8), wallMat); wall.material.side = THREE.BackSide; wall.position.y = 6.6; lab.add(wall);
  const defs = Object.values(TANKS); const panels = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (.7 + i * .12); const x = Math.sin(a) * 21.6, z = Math.cos(a) * 21.6; // behind/around
    const mat = new THREE.MeshBasicMaterial({ map: silhouette(defs[i % defs.length]), color: new THREE.Color(1.6, 1.6, 1.6) });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.75), mat); p.position.set(x, 4.3, z); p.lookAt(0, 4.3, 0); lab.add(p); panels.push(p);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6.3, 4.05, .1), new THREE.MeshStandardMaterial({ color: 0x15191e, metalness: .9, roughness: .3 })); frame.position.copy(p.position).multiplyScalar(1.005); frame.lookAt(0, 4.3, 0); lab.add(frame);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(6, .05, .05), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb060).multiplyScalar(3), toneMapped: false })); strip.position.copy(p.position).multiplyScalar(.995); strip.position.y = 2.25; strip.lookAt(0, 2.25, 0); lab.add(strip);
  }
  // ceiling beams
  for (let i = -2; i <= 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.25, .25, 40), new THREE.MeshStandardMaterial({ color: 0x0d1014, metalness: .8, roughness: .4 })); b.position.set(i * 5, 13, -2); lab.add(b); }
  // volumetric-looking light shafts (additive cones with height/fresnel fade)
  const shaftMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { col: { value: new THREE.Color(0x9fd8ff) }, k: { value: .16 } },
    vertexShader: 'varying float vy; varying vec3 vn; varying vec3 vv; void main(){ vy = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.); vn = normalize(normalMatrix*normal); vv = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 col; uniform float k; varying float vy; varying vec3 vn; varying vec3 vv; void main(){ float f = pow(abs(dot(vn,vv)),1.5); gl_FragColor = vec4(col*k*f*smoothstep(0.,1.,vy)*(.4+.6*vy),1.); }' });
  const shafts = [];
  for (const [x, z, c] of [[-4, -1, 0xffc890], [0, 0, 0xbfe6ff], [4.5, 1, 0x7fd0ff]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.35, 2.4, 13, 48, 1, true), shaftMat.clone()); m.material.uniforms.col.value = new THREE.Color(c); m.position.set(x, 6.5, z); m.userData.noAO = true; m.raycast = () => {}; lab.add(m); shafts.push(m);
  }
  // contact shadow (grounding on every quality level)
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(11, 6), new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(0,0,0,.85)'], [.55, 'rgba(0,0,0,.45)'], [1, 'rgba(0,0,0,0)']], 128), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = .004; blob.renderOrder = 1; blob.userData.noAO = true; blob.raycast = () => {}; lab.add(blob);
  // lights: key (shadow caster), softbox area fill, kicker spots, back rims
  const key = new THREE.DirectionalLight(0xfff4e6, 1.7); key.position.set(7, 13, 6); key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 2, far: 35 }); key.shadow.bias = -.0003; key.shadow.normalBias = .025; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 5; key.shadow.blurSamples = 16;
  RectAreaLightUniformsLib.init();
  const area = new THREE.RectAreaLight(0xeef4ff, 1.3, 9, 4); area.position.set(0, 8.5, 1.5); area.lookAt(0, 0, 0);
  const fill = new THREE.DirectionalLight(0xbfd8ff, .45); fill.position.set(-9, 5, 6);
  const warm = new THREE.SpotLight(0xffa860, 140, 40, .45, .7, 1.6); warm.position.set(-12, 9, 6);
  const cool = new THREE.SpotLight(0x4fd0ff, 110, 40, .45, .7, 1.6); cool.position.set(12, 7, -6);
  const rim = new THREE.SpotLight(0xd8eeff, 260, 40, .5, .8, 1.6); rim.position.set(-3, 6, -12);
  const rim2 = new THREE.SpotLight(0xffd2a0, 160, 40, .5, .8, 1.6); rim2.position.set(6, 4, -11);
  for (const l of [warm, cool, rim, rim2]) { l.target.position.set(0, 1.2, 0); lab.add(l, l.target); }
  lab.add(key, area, fill, new THREE.HemisphereLight(0x8ab4ff, 0x0a0806, .18));
  return { lab, key, area, blob, refl, top, fallbackTop, shafts, setMirror(on) { refl.visible = top.visible = on; fallbackTop.visible = !on; } };
}
