import * as THREE from 'three';
import { createMill } from './model.js';
import { createAssemblyFlight } from './motion.js';

const stage = document.querySelector('#mill-stage');
const host = document.querySelector('#scene');
const slider = document.querySelector('#assembly-progress');
const output = document.querySelector('#progress-value');
const count = document.querySelector('#assembled-count');
const total = document.querySelector('#total-count');
const phaseName = document.querySelector('#phase-name');
const activePart = document.querySelector('#active-part');
const firstHint = document.querySelector('#first-hint');
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const phases = ['床身与升降机构', '工作台与进给机构', '炮塔与滑枕', '主轴与轴承', '机头与动力传动', '手轮与刀具'];
const clamp = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
let renderer, scene, camera, model, flight, frame = 0, progress = 0;
let state = { progress: 0, assembledCount: 0, activeLabels: [], phase: 0, totalParts: 0 };
let ready = false;
let disposed = false;

function scrollLength() { return Math.max(1, document.documentElement.scrollHeight - innerHeight); }

function setProgress(value) {
  progress = clamp(Number(value));
  window.scrollTo({ top: progress * scrollLength(), behavior: 'instant' });
  draw();
}

function describe() {
  stage.dataset.progress = progress.toFixed(5);
  stage.dataset.assembled = String(state.assembledCount);
  stage.dataset.phase = String(state.phase);
  slider.value = String(Math.round(progress * 1000));
  slider.setAttribute('aria-valuetext', `${Math.round(progress * 100)}%，${progress === 1 ? '装配完成' : phases[state.phase]}`);
  output.value = `${Math.round(progress * 100)}%`;
  count.textContent = String(state.assembledCount);
  total.textContent = String(state.totalParts || '—');
  phaseName.textContent = progress === 0 ? '等待第一件' : progress === 1 ? '装配完成' : phases[state.phase];
  firstHint.hidden = progress > .005 || !ready;
  activePart.textContent = progress === 1 ? '所有组件已就位' : state.activeLabels.join(' / ');
}

function draw() {
  frame = 0;
  if (!ready || disposed) return;
  flight.apply(progress, camera);
  state = flight.getState();
  if (reducedQuery.matches) {
    // Reduced motion shows completed steps immediately, without near-camera flights.
    for (const part of model.parts) {
      part.object.visible = part.object.visible && part.object.position.distanceToSquared(part.homePosition) < 1e-10
        && part.object.quaternion.angleTo(part.homeQuaternion) < 1e-6;
    }
    state = { ...state, activeLabels: [] };
  }
  model.root.updateMatrixWorld(true);
  renderer.render(scene, camera);
  describe();
}

function invalidate() { if (!frame && ready && !disposed) frame = requestAnimationFrame(draw); }

function fitCamera() {
  if (!ready) return;
  const width = host.clientWidth;
  const height = host.clientHeight;
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  // Fit the assembled geometry, not the deliberately oversized incoming components.
  const target = bounds.getCenter(new THREE.Vector3());
  const eye = new THREE.Vector3(11, 4.5, 14).normalize();
  camera.position.copy(target).addScaledVector(eye, 20);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const narrow = width < 600;
  const fillX = .84;
  const fillY = narrow ? .66 : .73;
  let distance = 0;
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
    const point = new THREE.Vector3(x ? bounds.max.x : bounds.min.x, y ? bounds.max.y : bounds.min.y, z ? bounds.max.z : bounds.min.z).sub(target);
    const near = point.dot(eye);
    distance = Math.max(distance, near + Math.abs(point.dot(right)) / (tanVertical * camera.aspect * fillX), near + Math.abs(point.dot(up)) / (tanVertical * fillY));
  }
  camera.position.copy(target).addScaledVector(eye, Math.max(15, distance));
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  // Keep the machine untouched while the distant floor fades into the backdrop.
  // The mobile fit places the camera farther away, so anchor fog to that distance.
  const cameraDistance = camera.position.distanceTo(target);
  scene.fog.near = cameraDistance + 12;
  scene.fog.far = cameraDistance + 55;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setSize(width, height, false);
  invalidate();
}

let bounds;
function fallback(error) {
  ready = false;
  stage.dataset.renderer = 'fallback';
  document.querySelector('#fallback').hidden = false;
  firstHint.hidden = true;
  phaseName.textContent = '三维画面不可用';
  document.querySelector('#interaction-hint').textContent = '可在下方阅读组件结构';
  window.__millDemoError = String(error?.message || error);
}

try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0xf8f9f6);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf8f9f6, 30, 65);
  camera = new THREE.PerspectiveCamera(36, 1, .08, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa3afab, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(7, 15, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 13, bottom: -10, near: .5, far: 50 });
  key.shadow.normalBias = .025;
  key.shadow.bias = -.0002;
  key.shadow.radius = 4;
  key.target.position.set(0, 3.5, 0);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xe1edff, 1.5);
  fill.position.set(-8, 7, -5);
  scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xf8f9f6, roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.025;
  floor.receiveShadow = true;
  scene.add(floor);
  model = createMill();
  scene.add(model.root);
  model.root.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  bounds = new THREE.Box3().setFromObject(model.root);
  flight = createAssemblyFlight(model.parts);
  ready = true;
  stage.dataset.renderer = 'ready';
  fitCamera();
  progress = clamp(window.scrollY / scrollLength());
  draw();
  renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); fallback(new Error('WebGL context lost')); });
} catch (error) { fallback(error); }

window.__millDemo = {
  setProgress,
  getState: () => ({ ...state, activeLabels: [...state.activeLabels], progress, ready, renderer: stage.dataset.renderer, reducedMotion: reducedQuery.matches }),
  getParts: () => model?.parts,
  getCamera: () => camera,
  getBounds: () => bounds?.clone(),
  getScene: () => scene,
};

slider.addEventListener('input', () => setProgress(Number(slider.value) / 1000));
document.querySelector('#replay').addEventListener('click', () => setProgress(0));
document.querySelector('#complete').addEventListener('click', () => setProgress(1));
window.addEventListener('scroll', () => { progress = clamp(scrollY / scrollLength()); invalidate(); }, { passive: true });
window.addEventListener('resize', fitCamera);
function updateMotionPreference() {
  document.body.dataset.motion = reducedQuery.matches ? 'reduced' : 'full';
  if (ready) document.querySelector('#interaction-hint').textContent = reducedQuery.matches ? '减少动效 · 拖动进度查看装配阶段' : '滚动，逐件组装';
  invalidate();
}
reducedQuery.addEventListener('change', updateMotionPreference);
updateMotionPreference();
window.addEventListener('pagehide', () => {
  disposed = true;
  cancelAnimationFrame(frame);
  model?.root.removeFromParent();
  model?.dispose();
  scene?.traverse((object) => {
    if (object.isMesh) {
      object.geometry?.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material?.dispose();
    }
    object.shadow?.map?.dispose();
  });
  renderer?.dispose();
}, { once: true });
