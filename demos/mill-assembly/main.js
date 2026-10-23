import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMill } from './model.js';
import { loadMillSurfaceAssets } from './surface-assets.js';
import { createAssemblyFlight, VORTEX_TIMING, progressToScroll, scrollToProgress, followScroll } from './motion.js';

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
const stageNames = { arrival: '旋转飞入', vortex: '中央旋绕', assembly: '旋转组装', complete: '装配完成' };
const clamp = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const smooth = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const cameraTarget = new THREE.Vector3();
const cameraEye = new THREE.Vector3(11, 4.5, 14).normalize();
let completeCameraDistance = 20;
let renderer, scene, camera, model, flight, frame = 0, progress = 0;
let environmentTarget;
let renderedScroll = 0, targetScroll = 0, lastFrameTime = 0, manualScrollY = null;
let state = { progress: 0, assembledCount: 0, activeLabels: [], phase: 0, totalParts: 0 };
let ready = false;
let disposed = false;
let inspection = false;
const covers = [];
const inspectionMaterials = new Set();

function scrollLength() { return Math.max(1, document.documentElement.scrollHeight - innerHeight); }

function setProgress(value) {
  cancelAnimationFrame(frame);
  frame = 0;
  progress = Math.min(clamp(Number(value)), VORTEX_TIMING.assemblyEnd);
  renderedScroll = targetScroll = progressToScroll(progress);
  window.scrollTo({ top: targetScroll * scrollLength(), behavior: 'instant' });
  manualScrollY = scrollY;
  draw();
}

function describe() {
  const displayed = clamp(progress / VORTEX_TIMING.assemblyEnd);
  const completed = state.stage === 'complete';
  const percent = completed ? 100 : Math.min(99, Math.round(displayed * 100));
  stage.dataset.progress = progress.toFixed(5);
  stage.dataset.assembled = String(state.assembledCount);
  stage.dataset.phase = String(state.phase);
  slider.value = String(completed ? 1000 : Math.min(999, Math.round(displayed * 1000)));
  stage.dataset.stage = state.stage;
  slider.setAttribute('aria-valuetext', `${percent}%，${progress === 0 ? '等待滚动' : stageNames[state.stage]}`);
  output.value = `${percent}%`;
  count.textContent = String(state.assembledCount);
  total.textContent = String(state.totalParts || '—');
  phaseName.textContent = progress === 0 ? '等待滚动' : stageNames[state.stage];
  firstHint.hidden = progress > .005 || !ready;
  const descriptions = {
    arrival: `${state.totalParts} 个组件边飞入边旋转，汇入较大的旋涡`,
    vortex: progress < VORTEX_TIMING.funnelSettled ? '旋涡持续旋转，逐渐收至正常大小' : '组件继续旋绕，准备同步收拢',
    assembly: '所有组件边旋转边收拢到安装位置',
    complete: inspection ? '外壳已透视，可观察内部组件' : '所有组件已就位',
  };
  activePart.textContent = progress === 0 ? '' : descriptions[state.stage];
}

function draw() {
  if (!ready || disposed) return;
  updateCameraForProgress();
  flight.apply(progress, camera);
  state = flight.getState();
  if (reducedQuery.matches) {
    // Reduced motion switches once into the complete assembly, skipping all flights.
    for (const part of model.parts) {
      part.object.visible = progress >= VORTEX_TIMING.assemblyEnd;
      part.object.position.copy(part.homePosition);
      part.object.quaternion.copy(part.homeQuaternion);
      part.object.scale.set(1, 1, 1);
    }
    state = { ...state, activeLabels: [] };
  }
  model.root.updateMatrixWorld(true);
  renderer.render(scene, camera);
  describe();
}

function setInspection(value) {
  inspection = Boolean(value);
  for (const cover of covers) {
    cover.object.material = inspection ? cover.transparent : cover.original;
    cover.object.castShadow = inspection ? false : cover.castShadow;
  }
  const button = document.querySelector('#inspect');
  button.setAttribute('aria-pressed', String(inspection));
  button.textContent = inspection ? '恢复外壳' : '查看内部';
  invalidate();
}

function prepareInspection() {
  const cache = new Map();
  const translucent = (material) => {
    if (!cache.has(material)) {
      const copy = material.clone();
      copy.transparent = true;
      copy.opacity = .16;
      copy.depthWrite = false;
      cache.set(material, copy);
      inspectionMaterials.add(copy);
    }
    return cache.get(material);
  };
  for (const part of model.parts) {
    if (!part.object.userData.isCover) continue;
    part.object.traverse((object) => {
      if (!object.isMesh) return;
      const original = object.material;
      covers.push({ object, original, castShadow: object.castShadow, transparent: Array.isArray(original) ? original.map(translucent) : translucent(original) });
    });
  }
}

function inspectPart(id) {
  const part = model?.parts.find((candidate) => candidate.id === id);
  if (!part || !camera) return null;
  model.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(part.object);
  const projected = [];
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
    projected.push(new THREE.Vector3(x ? box.max.x : box.min.x, y ? box.max.y : box.min.y, z ? box.max.z : box.min.z).project(camera));
  }
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const ray = new THREE.Raycaster();
  let exposedSamples = 0;
  function owner(object) {
    while (object && object.parent !== model.root) object = object.parent;
    return object;
  }
  for (let x = 0; x < 9; x++) for (let y = 0; y < 15; y++) {
    ray.setFromCamera(new THREE.Vector2(THREE.MathUtils.lerp(minX, maxX, (x + .5) / 9), THREE.MathUtils.lerp(minY, maxY, (y + .5) / 15)), camera);
    const hit = ray.intersectObject(model.root, true).find((entry) => {
      let current = entry.object;
      while (current && current !== model.root) {
        if (!current.visible) return false;
        current = current.parent;
      }
      const material = entry.object.material;
      return !(!Array.isArray(material) && material.transparent && material.opacity < .3);
    });
    if (hit && owner(hit.object) === part.object) exposedSamples++;
  }
  return { id, visible: part.object.visible, projectedBounds: { minX, maxX, minY, maxY }, exposedSamples };
}

function tick(now) {
  frame = 0;
  if (!ready || disposed) return;
  if (renderedScroll !== targetScroll) {
    renderedScroll = reducedQuery.matches ? targetScroll : followScroll(renderedScroll, targetScroll, (now - lastFrameTime) / 1000);
    progress = scrollToProgress(renderedScroll);
  }
  lastFrameTime = now;
  draw();
  if (renderedScroll !== targetScroll) frame = requestAnimationFrame(tick);
}

function invalidate() {
  if (!frame && ready && !disposed) {
    lastFrameTime = performance.now();
    frame = requestAnimationFrame(tick);
  }
}

function updateCameraForProgress() {
  const entering = smooth((progress - .1) / (VORTEX_TIMING.arrivalEnd - .1));
  const leaving = 1 - smooth((progress - VORTEX_TIMING.assemblyStart) / (VORTEX_TIMING.assemblyEnd - VORTEX_TIMING.assemblyStart));
  const pullback = host.clientWidth < 600 && !reducedQuery.matches ? .2 * entering * leaving : 0;
  const distance = completeCameraDistance * (1 + pullback);
  camera.position.copy(cameraTarget).addScaledVector(cameraEye, distance);
  camera.lookAt(cameraTarget);
  camera.updateMatrixWorld(true);
  scene.fog.near = distance + 12;
  scene.fog.far = distance + 55;
}

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
  cameraTarget.copy(target);
  completeCameraDistance = Math.max(15, distance);
  // Keep the machine untouched while the distant floor fades into the backdrop.
  // The mobile fit places the camera farther away, so anchor fog to that distance.
  updateCameraForProgress();
  renderer.setPixelRatio(Math.min(devicePixelRatio, narrow ? 1.35 : 1.5));
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
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);
  scene = new THREE.Scene();
  // Real HDR softboxes and dark areas create moving, contrasting reflections
  // on bare metal. Load once from our build, prefilter once, then free the HDR.
  const surfaceAssets = await loadMillSurfaceAssets();
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (surfaceAssets.environment) {
    environmentTarget = pmrem.fromEquirectangular(surfaceAssets.environment);
    surfaceAssets.environment.dispose();
    stage.dataset.environment = 'hdr';
  } else {
    const room = new RoomEnvironment();
    environmentTarget = pmrem.fromScene(room, .02);
    room.dispose();
    stage.dataset.environment = 'fallback';
  }
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 1.1;
  scene.environmentRotation.y = 2.6;
  stage.dataset.surfaces = surfaceAssets.missing.length === 0 ? 'mapped' : 'fallback';
  pmrem.dispose();
  scene.fog = new THREE.Fog(0xf8f9f6, 30, 65);
  camera = new THREE.PerspectiveCamera(36, 1, .08, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x74736e, .35));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(7, 15, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 13, bottom: -10, near: .5, far: 50 });
  key.shadow.normalBias = .025;
  key.shadow.bias = -.0002;
  key.shadow.radius = 4;
  key.target.position.set(0, 3.5, 0);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xf1f3ff, .65);
  fill.position.set(-8, 7, -5);
  scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xf8f9f6, roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.025;
  floor.receiveShadow = true;
  scene.add(floor);
  model = createMill({ surfaceMaps: surfaceAssets.surfaceMaps });
  for (const texture of model.textures || []) {
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  }
  scene.add(model.root);
  // Keep per-surface shadow flags: transparent oil films must not cast opaque
  // rectangular shadows. Geometry helpers already enable solid-part shadows.
  prepareInspection();
  bounds = new THREE.Box3().setFromObject(model.root);
  flight = createAssemblyFlight(model.parts);
  ready = true;
  stage.dataset.renderer = 'ready';
  fitCamera();
  renderedScroll = targetScroll = clamp(window.scrollY / scrollLength());
  progress = scrollToProgress(renderedScroll);
  draw();
  renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); fallback(new Error('WebGL context lost')); });
} catch (error) { fallback(error); }

window.__millDemo = {
  setProgress,
  getState: () => ({ ...state, activeLabels: [...state.activeLabels], progress, displayProgress: clamp(progress / VORTEX_TIMING.assemblyEnd), targetProgress: scrollToProgress(targetScroll), settling: renderedScroll !== targetScroll, ready, renderer: stage.dataset.renderer, reducedMotion: reducedQuery.matches, inspection }),
  getParts: () => model?.parts,
  getCamera: () => camera,
  getBounds: () => bounds?.clone(),
  getScene: () => scene,
  getRenderStats: () => renderer ? ({
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length || 0, pixelRatio: renderer.getPixelRatio(),
  }) : null,
  inspectPart,
  setInspection,
};

slider.addEventListener('input', () => setProgress(Number(slider.value) / 1000 * VORTEX_TIMING.assemblyEnd));
document.querySelector('#replay').addEventListener('click', () => setProgress(0));
document.querySelector('#complete').addEventListener('click', () => setProgress(1));
document.querySelector('#inspect').addEventListener('click', () => setInspection(!inspection));
window.addEventListener('scroll', () => {
  // Direct controls already render the exact requested pose; ignore their
  // rounded native scroll echo so they also cancel an in-flight follow.
  if (scrollY === manualScrollY) return;
  manualScrollY = null;
  targetScroll = clamp(scrollY / scrollLength());
  invalidate();
}, { passive: true });
window.addEventListener('resize', fitCamera);
function updateMotionPreference() {
  document.body.dataset.motion = reducedQuery.matches ? 'reduced' : 'full';
  if (ready) document.querySelector('#interaction-hint').textContent = reducedQuery.matches ? '减少动效 · 拖动进度查看完成状态' : '滚动，飞入、旋绕、一起组装';
  invalidate();
}
reducedQuery.addEventListener('change', updateMotionPreference);
updateMotionPreference();
window.addEventListener('pagehide', () => {
  disposed = true;
  cancelAnimationFrame(frame);
  model?.root.removeFromParent();
  model?.dispose();
  for (const material of inspectionMaterials) material.dispose();
  scene?.traverse((object) => {
    if (object.isMesh) {
      object.geometry?.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material?.dispose();
    }
    object.shadow?.map?.dispose();
  });
  renderer?.dispose();
  environmentTarget?.dispose();
}, { once: true });
