import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createLathe } from './lathe-model.js';
import { createLaser } from './laser-model.js';
import { createMillMaterials } from './materials.js';
import { loadMillSurfaceAssets } from './surface-assets.js';

// Static model review: one viewport, two machines, no animation of any kind.
// Both machines borrow one shared material set; that owner releases it once on
// pagehide. Geometry is owned by each assembly and released by its dispose().
// Scene lights, floor, PMREM environment and the material set are created once,
// so switching devices never re-creates textures or geometry.

const FACTORIES = { lathe: createLathe, laser: createLaser };
const MACHINE_LABELS = { lathe: '车床', laser: '激光切割机' };
const VIEW_DIRECTIONS = {
  iso: new THREE.Vector3(-11, 6.5, 14).normalize(),
  front: new THREE.Vector3(0, .32, 1).normalize(),
  top: new THREE.Vector3(0, 1, .0001).normalize(),
};

const root = document.querySelector('.review');
const stage = document.querySelector('.stage');
const host = document.querySelector('#scene');
const fallback = document.querySelector('#fallback');
const fallbackParts = document.querySelector('#fallback-parts');
const deviceName = document.querySelector('#device-name');
const partCount = document.querySelector('#part-count');
const deviceButtons = [...document.querySelectorAll('.device-button')];
const viewButtons = [...document.querySelectorAll('.view-button')];

const state = { ready: false, machineId: 'lathe', partCount: 0, view: 'iso', fallback: false, environment: 'pending' };
const models = new Map();
let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let materials = null;
let environmentTarget = null;
let floor = null;
let bounds = null;
let frame = 0;

const reduceMotion = (() => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
})();

function invalidate() {
  if (frame || !renderer) return;
  frame = requestAnimationFrame(() => { frame = 0; draw(); });
}

function draw() {
  if (!renderer || !scene || !camera) return;
  renderer.render(scene, camera);
}

function updateLabels() {
  deviceName.textContent = MACHINE_LABELS[state.machineId];
  partCount.textContent = state.partCount ? String(state.partCount) : '—';
  host.setAttribute('aria-label', `${MACHINE_LABELS[state.machineId]}三维模型，可拖动旋转、滚轮缩放`);
  for (const button of deviceButtons) button.setAttribute('aria-pressed', String(button.dataset.machine === state.machineId));
  for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
}

// On-screen structure names, never code identifiers.
function structureSummary(model) {
  const names = [];
  const seen = new Set();
  const add = (value) => {
    const text = String(value || '').trim();
    if (!text || text.length > 12 || seen.has(text)) return;
    seen.add(text);
    names.push(text);
  };
  for (const part of model.parts || []) add(part?.label);
  return names;
}

function resetCameraState() {
  if (!controls) return;
  controls.reset();
  bounds = new THREE.Box3().setFromObject(models.get(state.machineId).root);
  floor.position.y = bounds.min.y - .002;
  fitCamera(state.view);
}

function fitCamera(view) {
  if (!state.ready || !bounds) return;
  const width = host.clientWidth;
  const height = host.clientHeight;
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  const target = bounds.getCenter(new THREE.Vector3());
  const eye = VIEW_DIRECTIONS[view].clone();
  camera.position.copy(target).addScaledVector(eye, 20);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const narrow = width < 600;
  const fillX = narrow ? .9 : .82;
  const fillY = narrow ? .68 : .78;
  let distance = 0;
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
    const point = new THREE.Vector3(x ? bounds.max.x : bounds.min.x, y ? bounds.max.y : bounds.min.y, z ? bounds.max.z : bounds.min.z).sub(target);
    const near = point.dot(eye);
    distance = Math.max(distance, near + Math.abs(point.dot(right)) / (tanVertical * camera.aspect * fillX), near + Math.abs(point.dot(up)) / (tanVertical * fillY));
  }
  camera.position.copy(target).addScaledVector(eye, Math.max(.5, distance));
  camera.lookAt(target);
  camera.near = Math.max(.01, distance / 500);
  camera.far = distance + 300;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  controls.target.copy(target);
  controls.minDistance = Math.max(.6, distance * .35);
  controls.maxDistance = distance * 3;
  controls.saveState();
  controls.update();
  renderer.setSize(width, height, false);
  invalidate();
}

function setMachine(id) {
  if (!FACTORIES[id] || state.fallback) return;
  state.machineId = id;
  for (const [key, model] of models) model.root.visible = key === id;
  state.partCount = models.get(id).parts.length;
  updateLabels();
  bounds = new THREE.Box3().setFromObject(models.get(id).root);
  if (floor) floor.position.y = bounds.min.y - .002;
  fitCamera(state.view);
}

function setView(view) {
  if (!Object.hasOwn(VIEW_DIRECTIONS, view) || state.fallback) return;
  state.view = view;
  for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === view));
  if (view === 'iso') resetCameraState(); else fitCamera(view);
}

function showFallback(error) {
  state.ready = false;
  state.fallback = true;
  root.dataset.renderer = 'fallback';
  stage.dataset.renderer = 'fallback';
  fallback.hidden = false;
  host.hidden = true;
  document.querySelector('.controls').dataset.disabled = 'true';
  for (const button of [...deviceButtons, ...viewButtons]) button.disabled = true;
  window.__modelReviewError = String(error?.message || error);
}

function renderFallbackParts() {
  const entries = [['lathe', createLathe()], ['laser', createLaser()]];
  fallbackParts.innerHTML = '';
  for (const [id, model] of entries) {
    if (id === state.machineId) state.partCount = model.parts.length;
    for (const name of structureSummary(model)) {
      const item = document.createElement('li');
      item.textContent = name;
      fallbackParts.append(item);
    }
    model.dispose();
  }
  updateLabels();
}

async function boot() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0xe9edeb);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);

  scene = new THREE.Scene();
  // Local HDR softboxes give real reflections. If the HDR (or any surface map)
  // is missing, procedural maps plus RoomEnvironment keep the same machines
  // readable, so a partial failure never blocks the review.
  const assets = await loadMillSurfaceAssets();
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (assets.environment) {
    environmentTarget = pmrem.fromEquirectangular(assets.environment);
    assets.environment.dispose();
    state.environment = 'hdr';
  } else {
    const room = new RoomEnvironment();
    environmentTarget = pmrem.fromScene(room, .02);
    room.dispose();
    state.environment = 'fallback';
  }
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 1.1;
  scene.environmentRotation.y = 2.6;
  pmrem.dispose();
  root.dataset.environment = state.environment;
  root.dataset.surfaces = assets.missing.length === 0 ? 'mapped' : 'fallback';
  root.dataset.missing = assets.missing.join(',');

  materials = createMillMaterials({ surfaceMaps: assets.surfaceMaps });
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  for (const texture of materials.textures) texture.anisotropy = anisotropy;

  camera = new THREE.PerspectiveCamera(36, 1, .08, 200);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x74736e, .35));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(7, 15, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 13, bottom: -10, near: .5, far: 50 });
  key.shadow.normalBias = .025;
  key.shadow.bias = -.0002;
  key.shadow.radius = 4;
  key.target.position.set(0, 2.5, 0);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xf1f3ff, .65);
  fill.position.set(-8, 7, -5);
  scene.add(fill);

  for (const id of Object.keys(FACTORIES)) {
    const model = FACTORIES[id]({ materials: materials.materials, surfaceMaps: assets.surfaceMaps });
    models.set(id, model);
    model.root.visible = false;
    scene.add(model.root);
  }

  floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0xe9edeb, roughness: .95, metalness: 0 }));
  floor.name = 'review-floor';
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.rotateSpeed = reduceMotion ? .5 : .8;
  controls.zoomSpeed = .9;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI * .5 - .02;
  controls.addEventListener('change', invalidate);

  state.ready = true;
  root.dataset.renderer = 'ready';
  stage.dataset.renderer = 'ready';
  setMachine('lathe');
  setView('iso');
  draw();
  renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); showFallback(new Error('WebGL context lost')); });
  window.addEventListener('resize', () => { if (state.ready) fitCamera(state.view); });
}

// Release shared resources exactly once, on unload.
let released = false;
function release() {
  if (released) return;
  released = true;
  if (frame) cancelAnimationFrame(frame);
  controls?.dispose();
  for (const model of models.values()) model.dispose();
  models.clear();
  materials?.dispose();
  environmentTarget?.dispose();
  floor?.geometry.dispose();
  floor?.material.dispose();
  renderer?.dispose();
  renderer?.domElement?.remove();
}
window.addEventListener('pagehide', release);

function projectedBounds(model) {
  camera.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model.root);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
    const point = new THREE.Vector3(x ? box.max.x : box.min.x, y ? box.max.y : box.min.y, z ? box.max.z : box.min.z).project(camera);
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  }
  return {
    minX, maxX, minY, maxY,
    worldMinY: box.min.y, floorY: floor.position.y,
    viewport: { width: host.clientWidth, height: host.clientHeight },
  };
}

function modelInfo(model) {
  let meshes = 0;
  const meshMaterials = new Set();
  model.root.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) meshMaterials.add(material);
  });
  const box = new THREE.Box3().setFromObject(model.root);
  return {
    name: model.root.name,
    parts: model.parts.length,
    meshes,
    materials: meshMaterials.size,
    geometryCount: model.geometryCount,
    bounds: { min: box.min.toArray(), max: box.max.toArray() },
    visible: model.root.visible,
  };
}

for (const button of deviceButtons) button.addEventListener('click', () => setMachine(button.dataset.machine));
for (const button of viewButtons) button.addEventListener('click', () => setView(button.dataset.view));
updateLabels();

window.__modelReview = {
  setMachine,
  setView,
  getState: () => ({ ready: state.ready, machineId: state.machineId, partCount: state.partCount, view: state.view, fallback: state.fallback, environment: state.environment }),
  getModels: () => Object.fromEntries([...models].map(([id, model]) => [id, model.root])),
  getModelInfo: () => Object.fromEntries([...models].map(([id, model]) => [id, modelInfo(model)])),
  getProjected: () => projectedBounds(models.get(state.machineId)),
  getCamera: () => camera,
  getScene: () => scene,
  getRenderStats: () => renderer ? ({
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length || 0, pixelRatio: renderer.getPixelRatio(),
  }) : null,
  getLayout: () => {
    const rect = (element) => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return {
      stage: rect(stage),
      controls: rect(document.querySelector('.controls')),
      header: rect(document.querySelector('.heading')),
      viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
    };
  },
};

boot().catch((error) => { renderFallbackParts(); showFallback(error); });
