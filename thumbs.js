import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildTank } from './models.js';
// Render tank thumbnails with a small throw-away renderer
export async function tankThumbs(TANKS, w = 240, h = 140) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(w, h); r.setPixelRatio(1);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
  const sc = new THREE.Scene(); const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
  const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(5, 8, 6); const c1 = new THREE.DirectionalLight(0x4fd9ff, 2); c1.position.set(-6, 3, -6); sc.add(d, c1);
  const cam = new THREE.PerspectiveCamera(30, w / h, .1, 100); cam.position.set(10.5, 5, 10.5); cam.lookAt(.6, 1.1, 0);
  const out = {};
  for (const [k, def] of Object.entries(TANKS)) {
    const t = buildTank(def); sc.add(t); r.render(sc, cam); out[k] = r.domElement.toDataURL('image/png'); sc.remove(t);
    t.traverse(o => o.geometry?.dispose()); await new Promise(res => setTimeout(res, 0));
  }
  pm.dispose(); r.dispose(); r.forceContextLoss?.(); return out;
}
export function shellThumb(s, w = 240, h = 140) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const y = h / 2; g.lineWidth = 2; const col = '#' + new THREE.Color(s.color).getHexString();
  g.shadowColor = col; g.shadowBlur = 12;
  const metal = g.createLinearGradient(0, y - 20, 0, y + 20); metal.addColorStop(0, '#d9e2ea'); metal.addColorStop(.5, '#6f7b86'); metal.addColorStop(1, '#2b3238');
  g.fillStyle = metal; g.strokeStyle = '#7fe6ff';
  if (s.type === 'APFSDS') { g.fillRect(30, y - 4, 170, 8); g.beginPath(); g.moveTo(200, y - 4); g.lineTo(218, y); g.lineTo(200, y + 4); g.fill();
    g.fillStyle = 'rgba(160,140,90,.8)'; g.fillRect(90, y - 18, 50, 36); g.fillStyle = metal; for (const d of [-1, 1]) { g.beginPath(); g.moveTo(30, y); g.lineTo(52, y); g.lineTo(30, y + d * 16); g.fill(); } }
  else if (s.type === 'TANDEM') { g.beginPath(); g.roundRect(40, y - 12, 150, 24, 12); g.fill(); g.beginPath(); g.moveTo(190, y - 12); g.quadraticCurveTo(220, y, 190, y + 12); g.fill();
    g.fillStyle = col; g.fillRect(70, y - 26, 6, 52); g.fillRect(44, y - 22, 6, 44); g.fillRect(140, y - 4, 50, 2); }
  else if (s.type === 'HEAT') { g.beginPath(); g.moveTo(40, y - 16); g.lineTo(150, y - 16); g.lineTo(180, y - 6); g.lineTo(180, y + 6); g.lineTo(150, y + 16); g.lineTo(40, y + 16); g.fill(); g.fillRect(180, y - 2, 30, 4); g.fillStyle = col; g.fillRect(100, y - 16, 6, 32); }
  else { g.beginPath(); g.moveTo(40, y - 18); g.lineTo(150, y - 18); g.quadraticCurveTo(195, y - 18, 195, y); g.quadraticCurveTo(195, y + 18, 150, y + 18); g.lineTo(40, y + 18); g.fill(); g.fillStyle = col; g.fillRect(110, y - 18, 6, 36); }
  g.shadowBlur = 0; g.fillStyle = '#9feaff'; g.font = 'bold 15px system-ui'; g.fillText(s.type, 10, 20);
  return c.toDataURL();
}
