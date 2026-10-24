import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWorkshop, TRIANGLE_HOMES } from './workshop-model.js';
import { createWorkshopFlight } from './workshop-motion.js';
import { createShowcase, orbitOffset, SLOT_ANGLES } from './workshop-showcase.js';
import { loadMillSurfaceAssets } from './surface-assets.js';
import { VORTEX_TIMING, progressToScroll, scrollToProgress, followScroll } from './motion.js';

const stage = document.querySelector('#workshop-stage');
const host = document.querySelector('#workshop-scene');
const slider = document.querySelector('#assembly-progress');
const output = document.querySelector('#progress-value');
const count = document.querySelector('#assembled-count');
const total = document.querySelector('#total-count');
const phaseName = document.querySelector('#phase-name');
const activePart = document.querySelector('#active-part');
const firstHint = document.querySelector('#first-hint');
const labelList = document.querySelector('#machine-labels');
const interactionHint = document.querySelector('#interaction-hint');
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const stageNames = { arrival: '旋转飞入', vortex: '中央旋绕', assembly: '旋转组装', complete: '装配完成' };
// One fixed viewpoint for every screen and stage: the classic mill view angle.
// Fitting may only move the target and distance, never tilt or orbit the eye.
const CAMERA_EYE = new THREE.Vector3(11, 4.5, 14).normalize();
const FILL_X = .95;
// Sampled while fitting so the taller vortex never leaves the frame.
const ENVELOPE_SAMPLES = [.24, .42, .55, .64, .72, .80, .88];
const FINAL_HOLD = .78;
const clamp = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const smoother = (value) => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10); };
// The final triangle stays the same on every screen; only the camera refits.
const layoutFor = () => 'triangle';

let renderer, scene, camera, model, flight, frame = 0, progress = 0;
let environmentTarget, floor, keyLight;
let renderedScroll = 0, targetScroll = 0, lastFrameTime = 0, manualScrollY = null;
let state = { progress: 0, assembledCount: 0, activeLabels: [], phase: 0, totalParts: 0 };
let ready = false, disposed = false, inspection = false, layout = layoutFor();
let completeBounds, motionEnvelope, finalShot, motionShot;
let completePoints = [], motionPoints = [];
let freezeProgress = false;
let showcase, completionLatch = false, wakeTimer = null, wakeAt = null, drag = null;
const toggleShowcase = document.querySelector('#toggle-showcase');
const eventScope = new AbortController();
const machineTemplates = new Map();
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const SHOT_SAMPLES = 96;
let showcaseShots = [];
const labelEntries = [];
const labelCenter = new THREE.Vector3();
const labelPoint = new THREE.Vector3();
const covers = [];
const inspectionMaterials = new Set();

function scrollLength() { return Math.max(1, document.documentElement.scrollHeight - innerHeight); }

function writeScroll(top) {
  // Hold the mirrored freeze flag so its own scroll echo cannot re-target.
  freezeProgress = true;
  window.scrollTo({ top, behavior: 'instant' });
  manualScrollY = scrollY;
  freezeProgress = false;
}

function freezeGeometry() {
  motionEnvelope = new THREE.Box3();
  motionPoints = [];
  for (const sample of ENVELOPE_SAMPLES) {
    flight.apply(sample, camera);
    model.root.updateMatrixWorld(true);
    motionEnvelope.union(new THREE.Box3().setFromObject(model.root));
    motionPoints.push(...occupiedCorners());
  }
  flight.apply(VORTEX_TIMING.assemblyEnd, camera);
  model.root.updateMatrixWorld(true);
  completePoints = occupiedCorners();
  flight.apply(progress, camera);
  model.root.updateMatrixWorld(true);
}

function occupiedCorners() {
  const points = [];
  for (const part of model.parts) {
    const box = new THREE.Box3().setFromObject(part.object);
    for (let corner = 0; corner < 8; corner++) points.push(new THREE.Vector3(
      corner & 1 ? box.max.x : box.min.x,
      corner & 2 ? box.max.y : box.min.y,
      corner & 4 ? box.max.z : box.min.z,
    ));
  }
  return points;
}

function computeShot(points, eye, fillY, headerRect, controlsRect, fillX = FILL_X) {
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), eye).normalize();
  const up = new THREE.Vector3().crossVectors(eye, right).normalize();
  // Fit occupied part corners in the camera frame. A single world AABB around
  // the diagonal row includes large empty corners and makes all machines tiny.
  const viewBounds = new THREE.Box3();
  for (const point of points) viewBounds.expandByPoint(new THREE.Vector3(point.dot(right), point.dot(up), point.dot(eye)));
  const center = viewBounds.getCenter(new THREE.Vector3());
  const baseTarget = right.clone().multiplyScalar(center.x).addScaledVector(up, center.y).addScaledVector(eye, center.z);
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let distance = 0;
  for (const point of points) {
    const near = point.dot(eye) - center.z;
    distance = Math.max(distance, near + Math.abs(point.dot(right) - center.x) / (tanVertical * camera.aspect * fillX),
      near + Math.abs(point.dot(up) - center.y) / (tanVertical * fillY));
  }
  distance = Math.max(15, distance);
  const top = headerRect.bottom + 16;
  const bottom = controlsRect.top - 36; // Leave space for the device labels.
  const centerNdc = 1 - (top + bottom) / innerHeight;
  const target = new THREE.Vector3();
  for (let attempt = 0; attempt < 48; attempt++) {
    target.copy(baseTarget).addScaledVector(up, -centerNdc * distance * tanVertical);
    let fits = true;
    for (const point of points) {
      const depth = distance - (point.dot(eye) - target.dot(eye));
      const screenY = (1 - (point.dot(up) - target.dot(up)) / (depth * tanVertical)) * innerHeight / 2;
      const screenX = (1 + (point.dot(right) - target.dot(right)) / (depth * tanVertical * camera.aspect)) * innerWidth / 2;
      if (depth <= camera.near || screenY < top || screenY > bottom || screenX < 8 || screenX > innerWidth - 8) { fits = false; break; }
    }
    if (fits) break;
    distance *= 1.025;
  }
  return { target: target.clone(), distance, eye: eye.clone() };
}

function fitCamera() {
  if (!ready) return;
  const width = host.clientWidth;
  const height = host.clientHeight;
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  const narrow = width < 600;
  // Narrow screens only relax the vertical fill and pixel ratio, not the angle.
  const eye = CAMERA_EYE;
  const fillY = narrow ? .74 : .80;
  // Measure a single pristine state: flight only writes poses, never homes.
  const homes = model.parts.map((part) => ({ part, visible: part.object.visible, position: part.object.position.clone(), quaternion: part.object.quaternion.clone(), scale: part.object.scale.clone() }));
  freezeGeometry();
  completeBounds = model.root.userData.homeBounds.clone();
  const header = document.querySelector('.heading').getBoundingClientRect();
  const controls = document.querySelector('.controls').getBoundingClientRect();
  // Two shots per aspect: the tall vortex and the finished, ground-based row.
  refitShowcase();
  motionShot = computeShot(motionPoints, eye, fillY, header, controls, .92);
  // Restore the caller's progress; the fit never leaves poses behind.
  for (const saved of homes) {
    saved.part.object.visible = saved.visible;
    saved.part.object.position.copy(saved.position);
    saved.part.object.quaternion.copy(saved.quaternion);
    saved.part.object.scale.copy(saved.scale);
  }
  model.root.updateMatrixWorld(true);
  renderer.setPixelRatio(Math.min(devicePixelRatio, narrow ? 1.25 : 1.5));
  renderer.setSize(width, height, false);
  invalidate();
}

function updateCameraForProgress() {
  if (!finalShot) return;
  const blend = smoother((progress - FINAL_HOLD) / (VORTEX_TIMING.assemblyEnd - FINAL_HOLD));
  const from = motionShot;
  let to = finalShot;
  if (completionLatch && showcaseShots.length) {
    const phase = showcase.state().phase;
    const index = ((phase % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * SHOT_SAMPLES;
    const a = showcaseShots[Math.floor(index) % SHOT_SAMPLES], b = showcaseShots[(Math.floor(index) + 1) % SHOT_SAMPLES];
    to = { target: a.target.clone().lerp(b.target, index % 1), distance: THREE.MathUtils.lerp(a.distance, b.distance, index % 1) };
  }
  const eye = CAMERA_EYE;
  const target = from.target.clone().lerp(to.target, blend);
  const distance = THREE.MathUtils.lerp(from.distance, to.distance, blend);
  camera.position.copy(target).addScaledVector(eye, distance);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  scene.fog.near = distance + 25;
  scene.fog.far = distance + 70;
}

function updateLabels() {
  labelList.hidden = !completionLatch;
  if (!completionLatch) return;
  const top = document.querySelector('.heading').getBoundingClientRect().bottom + 8;
  const bottom = document.querySelector('.controls').getBoundingClientRect().top - 8;
  const front = showcase.state().frontId;
  const plans = labelEntries.map((entry) => {
    const box = showcase.boundsOf(entry.machine.id);
    box.getCenter(labelCenter).project(camera);
    let edge = 0;
    for (let corner = 0; corner < 8; corner++) {
      labelPoint.set(corner & 1 ? box.max.x : box.min.x, corner & 2 ? box.max.y : box.min.y, corner & 4 ? box.max.z : box.min.z).project(camera);
      edge = Math.max(edge, (1 - labelPoint.y) * innerHeight / 2);
    }
    const w = entry.element.offsetWidth, h = entry.element.offsetHeight;
    entry.element.classList.toggle('is-front', front === entry.machine.id);
    entry.button.setAttribute('aria-pressed', String(front === entry.machine.id));
    return { entry, w, h, x: Math.max(w / 2 + 8, Math.min(innerWidth - w / 2 - 8, (labelCenter.x + 1) * innerWidth / 2)),
      y: Math.max(top + h / 2, Math.min(bottom - h / 2, edge + h / 2 + 8)) };
  }).sort((a, b) => a.x - b.x);
  const overlaps = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 8 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 8;
  // Three labels can avoid one another by a single row of vertical staggering.
  for (let pass = 0; pass < 3; pass++) for (let i = 1; i < plans.length; i++) for (let j = 0; j < i; j++) {
    const a = plans[i], b = plans[j];
    if (!overlaps(a, b)) continue;
    const gap = (a.h + b.h) / 2 + 8;
    a.y = b.y + gap <= bottom - a.h / 2 ? b.y + gap : Math.max(top + a.h / 2, b.y - gap);
  }
  for (const plan of plans) plan.entry.element.style.transform = `translate(${plan.x}px, ${plan.y}px) translate(-50%, -50%)`;
}

function describe() {
  const displayed = clamp(progress / VORTEX_TIMING.assemblyEnd);
  const completed = completionLatch;
  const percent = completed ? 100 : Math.min(99, Math.round(displayed * 100));
  stage.dataset.progress = progress.toFixed(5);
  stage.dataset.assembled = String(state.assembledCount);
  stage.dataset.phase = String(state.phase);
  stage.dataset.layout = layout;
  slider.value = String(completed ? 1000 : Math.min(999, Math.round(displayed * 1000)));
  stage.dataset.stage = state.stage;
  slider.setAttribute('aria-valuetext', `${percent}%，${progress === 0 ? '等待滚动' : stageNames[state.stage]}`);
  output.value = `${percent}%`;
  count.textContent = String(state.assembledCount);
  total.textContent = String(state.totalParts || '—');
  phaseName.textContent = progress === 0 ? '等待滚动' : stageNames[state.stage];
  firstHint.hidden = progress > .005 || !ready || reducedQuery.matches;
  slider.disabled = completionLatch;
  document.querySelector('#complete').hidden = completionLatch;
  toggleShowcase.hidden = !completionLatch || reducedQuery.matches;
  const paused = showcase?.state().paused || false;
  toggleShowcase.textContent = paused ? '继续轮换' : '暂停轮换';
  toggleShowcase.setAttribute('aria-pressed', String(paused));
  renderer.domElement.classList.toggle('is-showcase', completionLatch);
  interactionHint.textContent = completionLatch ? '点击移到前方 · 拖动旋转查看' : reducedQuery.matches ? '减少动效 · 拖动进度查看完成状态' : '滚动，飞入、旋绕、一起组装';
  const descriptions = {
    arrival: `${state.totalParts} 个组件边飞入边旋转，汇入较大的旋涡`,
    vortex: progress < VORTEX_TIMING.funnelSettled ? '三台设备共用一个旋涡，逐渐收至正常大小' : '组件继续旋绕，准备同步收拢',
    assembly: '三台设备在同一个旋涡里边旋转边落位',
    complete: inspection ? '外壳已透视，可观察铣床内部组件' : '每 5 秒轮换 · 点击设备可移到前方',
  };
  activePart.textContent = progress === 0 ? '' : descriptions[state.stage];
}

function applyReduced() {
  for (const part of model.parts) {
    part.object.visible = progress >= VORTEX_TIMING.assemblyEnd;
    part.object.position.copy(part.homePosition);
    part.object.quaternion.copy(part.homeQuaternion);
    part.object.scale.set(1, 1, 1);
  }
  state = { ...state, activeLabels: [], assembledCount: progress >= VORTEX_TIMING.assemblyEnd ? model.parts.length : 0, stage: progress >= VORTEX_TIMING.assemblyEnd ? 'complete' : 'arrival' };
}

function draw(now = performance.now()) {
  if (!ready || disposed) return;
  if (!completionLatch && progress >= VORTEX_TIMING.assemblyEnd) {
    progress = VORTEX_TIMING.assemblyEnd;
    renderedScroll = targetScroll = progressToScroll(progress);
    flight.apply(progress, camera);
    state = flight.getState();
    for (const part of model.parts) part.object.visible = true;
    completionLatch = true;
    showcase.start(now);
  }
  if (completionLatch) showcase.update(now);
  updateCameraForProgress();
  if (!completionLatch) {
    flight.apply(progress, camera);
    state = flight.getState();
    if (reducedQuery.matches) applyReduced();
  }
  model.root.updateMatrixWorld(true);
  describe();
  renderer.render(scene, camera);
  updateLabels();
  armWake();
}

function setProgress(value) {
  if (!ready || disposed || completionLatch) return;
  cancelAnimationFrame(frame);
  frame = 0;
  progress = Math.min(clamp(Number(value)), VORTEX_TIMING.assemblyEnd);
  renderedScroll = targetScroll = progressToScroll(progress);
  writeScroll(targetScroll * scrollLength());
  draw();
}

function schedule() { if (ready && !disposed) invalidate(); }

function setInspection(value) {
  inspection = Boolean(value);
  for (const cover of covers) {
    cover.object.material = inspection ? cover.transparent : cover.original;
    cover.object.castShadow = inspection ? false : cover.castShadow;
  }
  const button = document.querySelector('#inspect');
  button.setAttribute('aria-pressed', String(inspection));
  button.textContent = inspection ? '恢复外壳' : '查看内部';
  schedule();
}

function prepareInspection() {
  // Only the mill shell parts carry isCover. Every other part keeps its material.
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
    if (part.machineId !== 'mill' || !part.object.userData.isCover) continue;
    part.object.traverse((object) => {
      if (!object.isMesh) return;
      const original = object.material;
      covers.push({ object, original, castShadow: object.castShadow, transparent: Array.isArray(original) ? original.map(translucent) : translucent(original) });
    });
  }
}

function buildFlight() {
  flight = createWorkshopFlight(model.parts);
  flight.apply(progress, camera);
  state = flight.getState();
}

function tick(now) {
  frame = 0;
  if (!ready || disposed) return;
  if (!completionLatch && renderedScroll !== targetScroll) {
    renderedScroll = reducedQuery.matches ? targetScroll : followScroll(renderedScroll, targetScroll, (now - lastFrameTime) / 1000);
    progress = scrollToProgress(renderedScroll);
  }
  lastFrameTime = now;
  draw(now);
  if (renderedScroll !== targetScroll || showcase.needsFrame()) frame = requestAnimationFrame(tick);
}

function invalidate() {
  if (!frame && ready && !disposed) {
    lastFrameTime = performance.now();
    frame = requestAnimationFrame(tick);
  }
}

function onScroll() {
  if (completionLatch || freezeProgress || scrollY === manualScrollY) return;
  manualScrollY = null;
  targetScroll = clamp(scrollY / scrollLength());
  invalidate();
}

function onResize() {
  if (!ready) return;
  // Homes never depend on the viewport, so only the camera and renderer refit.
  // Keep progress, rendered/target scroll and any running inertia, and write the
  // native scroll for the new length so its echo cannot re-target progress.
  fitCamera();
  if (!completionLatch) writeScroll(renderedScroll * scrollLength());
  draw();
}

function noteFallback(error) {
  ready = false;
  stage.dataset.renderer = 'fallback';
  document.querySelector('#fallback').hidden = false;
  firstHint.hidden = true;
  phaseName.textContent = '三维画面不可用';
  interactionHint.hidden = false;
  interactionHint.textContent = '可在下方阅读三台设备的结构';
  window.__workshopError = String(error?.message || error);
}

function currentState() {
  return {
    ...state,
    progress, displayProgress: clamp(progress / VORTEX_TIMING.assemblyEnd), targetProgress: scrollToProgress(targetScroll),
    settling: renderedScroll !== targetScroll, ready, renderer: stage.dataset.renderer,
    reducedMotion: reducedQuery.matches, inspection, layout, completionLocked: completionLatch, showcase: showcase?.state() || null,
  };
}

function cacheTemplates() {
  for (const machine of model.machines) {
    const box = machine.homeBounds, pivot = box.getCenter(new THREE.Vector3());
    const corners = [];
    for (let c = 0; c < 8; c++) corners.push(new THREE.Vector3(c & 1 ? box.max.x : box.min.x, c & 2 ? box.max.y : box.min.y, c & 4 ? box.max.z : box.min.z).sub(pivot));
    machineTemplates.set(machine.id, { pivot, corners });
  }
}

function showcaseEnvelope(phase) {
  const points = [], poses = showcase.state().machines;
  for (const machine of poses) {
    const template = machineTemplates.get(machine.id);
    const rotation = new THREE.Quaternion().fromArray(machine.rotation);
    // World AABB corners also bound every part's AABB after arbitrary tilts.
    // The rotated OBB alone bounds pixels, but misses those conservative corners.
    const box = new THREE.Box3().setFromPoints(template.corners.map(point => point.clone().applyQuaternion(rotation)));
    const corners = Array.from({ length: 8 }, (_, c) => new THREE.Vector3(c & 1 ? box.max.x : box.min.x, c & 2 ? box.max.y : box.min.y, c & 4 ? box.max.z : box.min.z));
    const center = orbitOffset(SLOT_ANGLES[TRIANGLE_HOMES[machine.id]] + phase);
    center.y = template.pivot.y + machine.lift;
    for (const point of corners) points.push(point.clone().add(center));
  }
  return points;
}

function computeShowcaseShot(points, header, controls) {
  // Hierarchy (§2.1): use the available frame for the front machine. With a
  // deep orbit, centring the world bounds makes the camera retreat to fit a
  // large empty gap. Solve the perspective limits directly instead, keeping
  // the vertical carousel axis centred and the original viewing direction.
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), CAMERA_EYE).normalize();
  const up = new THREE.Vector3().crossVectors(CAMERA_EYE, right).normalize();
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const top = header.bottom + 16, bottom = controls.top - 36;
  const mid = 1 - (top + bottom) / innerHeight;
  const half = (bottom - top) / innerHeight * .94;
  const high = mid + half, low = mid - half;
  const horizontal = Math.min(FILL_X, 1 - 16 / innerWidth);
  let distance = -Infinity, lower = -Infinity, upper = Infinity;
  let minDepth = Infinity, maxDepth = -Infinity;
  for (const point of points) {
    const x = point.dot(right), y = point.dot(up), z = point.dot(CAMERA_EYE);
    minDepth = Math.min(minDepth, z); maxDepth = Math.max(maxDepth, z);
    distance = Math.max(distance, z + Math.abs(x) / (tan * camera.aspect * horizontal), z + camera.near + 1);
    lower = Math.max(lower, y + high * z * tan);
    upper = Math.min(upper, y + low * z * tan);
  }
  // All corners must share a feasible vertical target. These two linear
  // constraints give the nearest distance without iterative zooming out.
  distance = Math.max(distance, (lower - upper) / ((high - low) * tan));
  const targetHeight = (lower - high * distance * tan + upper - low * distance * tan) / 2;
  const targetDepth = (minDepth + maxDepth) / 2;
  return { target: up.multiplyScalar(targetHeight).addScaledVector(CAMERA_EYE, targetDepth),
    distance: distance - targetDepth, eye: CAMERA_EYE.clone() };
}

function refitShowcase() {
  const header = document.querySelector('.heading').getBoundingClientRect(), controls = document.querySelector('.controls').getBoundingClientRect();
  // Fit each phase in advance; interpolate only target/distance while moving.
  showcaseShots = Array.from({ length: SHOT_SAMPLES }, (_, index) =>
    computeShowcaseShot(showcaseEnvelope(index * Math.PI * 2 / SHOT_SAMPLES), header, controls));
  finalShot = showcaseShots[0];
}

function clearWake() {
  if (wakeTimer !== null) clearTimeout(wakeTimer);
  wakeTimer = null; wakeAt = null;
}

function armWake() {
  const due = completionLatch && !disposed ? showcase.nextWakeAt() : null;
  if (due === wakeAt) return;
  clearWake();
  if (due === null) return;
  wakeAt = due;
  wakeTimer = setTimeout(() => { wakeTimer = null; wakeAt = null; invalidate(); }, Math.max(0, due - performance.now()));
}

function replay() {
  if (!ready || disposed) return;
  endPointer(null, true);
  clearWake();
  completionLatch = false;
  showcase.reset();
  showcase.setReduced(reducedQuery.matches);
  showcase.setHidden(document.hidden);
  refitShowcase();
  setProgress(0);
}

function pickMachineAt(x, y) {
  if (!completionLatch || !ready || disposed) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
  raycaster.setFromCamera(pointerNdc, camera);
  for (const hit of raycaster.intersectObjects(model.root.children, true)) {
    let object = hit.object;
    while (object && object !== model.root) {
      if (object.userData.machineId && object.visible) return object.userData.machineId;
      object = object.parent;
    }
  }
  return null;
}

function selectMachine(id) {
  if (showcase?.select(id)) invalidate();
}

function onPointerDown(event) {
  if (!completionLatch || event.button !== 0 || event.isPrimary === false || drag) return;
  const id = pickMachineAt(event.clientX, event.clientY);
  if (!id || !showcase.beginDrag(id)) return;
  drag = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false, rotation: showcase.rotationOf(id),
    right: new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up: new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1) };
  renderer.domElement.setPointerCapture(event.pointerId);
  renderer.domElement.classList.add('is-dragging');
  clearWake();
  invalidate();
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointer) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (Math.hypot(dx, dy) >= 5) drag.moved = true;
  if (!drag.moved) return;
  const yaw = new THREE.Quaternion().setFromAxisAngle(drag.up, dx * .009);
  const pitch = new THREE.Quaternion().setFromAxisAngle(drag.right, dy * .009);
  showcase.rotate(drag.id, yaw.multiply(pitch).multiply(drag.rotation));
  refitShowcase();
  invalidate();
}

function endPointer(event, cancelled = false) {
  if (!drag || (event && event.pointerId !== drag.pointer)) return;
  const done = drag;
  drag = null;
  const canvas = renderer.domElement;
  canvas.classList.remove('is-dragging');
  if (canvas.hasPointerCapture(done.pointer)) canvas.releasePointerCapture(done.pointer);
  showcase.endDrag();
  if (!cancelled && !done.moved) showcase.select(done.id);
  invalidate();
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
  scene.fog = new THREE.Fog(0xf8f9f6, 40, 95);
  camera = new THREE.PerspectiveCamera(36, 1, .08, 220);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x74736e, .35));
  keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(6, 25, 12);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  Object.assign(keyLight.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 80 });
  keyLight.shadow.normalBias = .03;
  keyLight.shadow.bias = -.0002;
  keyLight.shadow.radius = 4;
  keyLight.target.position.set(0, 2, 0);
  scene.add(keyLight, keyLight.target);
  const fill = new THREE.DirectionalLight(0xf1f3ff, .65);
  fill.position.set(-14, 9, -9);
  scene.add(fill);
  floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: 0xf8f9f6, roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.025;
  floor.receiveShadow = true;
  scene.add(floor);
  model = createWorkshop({ surfaceMaps: surfaceAssets.surfaceMaps });
  for (const texture of model.textures || []) {
    if (texture.isTexture) texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  }
  scene.add(model.root);
  prepareInspection();
  labelList.replaceChildren();
  labelEntries.length = 0;
  for (const machine of model.machines) {
    const element = document.createElement('li');
    element.className = 'machine-label';
    element.dataset.machine = machine.id;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.focusMachine = machine.id;
    button.textContent = machine.label;
    button.setAttribute('aria-label', `将${machine.label}移到前方`);
    button.addEventListener('click', () => selectMachine(machine.id), { signal: eventScope.signal });
    element.append(button);
    labelList.append(element);
    labelEntries.push({ machine, element, button });
  }
  // Triangle homes are baked once, before either animation controller is built.
  layout = layoutFor();
  model.setLayout(layout);
  showcase = createShowcase({ machines: model.machines });
  showcase.setReduced(reducedQuery.matches);
  showcase.setHidden(document.hidden);
  cacheTemplates();
  buildFlight();
  progress = scrollToProgress(clamp(scrollY / scrollLength()));
  renderedScroll = targetScroll = progressToScroll(progress);
  writeScroll(renderedScroll * scrollLength());
  ready = true;
  stage.dataset.renderer = 'ready';
  fitCamera();
  draw();
  renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); cancelAnimationFrame(frame); clearWake(); showcase?.dispose(); noteFallback(new Error('WebGL context lost')); });
} catch (error) { noteFallback(error); }

window.__workshopDemo = {
  setProgress,
  getShowcaseState: () => showcase?.state(),
  pickMachineAt,
  getState: currentState,
  getParts: () => model?.parts,
  getMachines: () => model?.machines.map((machine) => ({ ...machine })) || [],
  getCamera: () => camera,
  getBounds: () => completeBounds?.clone(),
  getScene: () => scene,
  getRenderStats: () => renderer ? ({
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, frames: renderer.info.render.frame,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length || 0, pixelRatio: renderer.getPixelRatio(),
  }) : null,
  setInspection,
  getMotionEnvelope: () => motionEnvelope?.clone(),
};

slider.addEventListener('input', () => setProgress(Number(slider.value) / 1000 * VORTEX_TIMING.assemblyEnd), { signal: eventScope.signal });
document.querySelector('#replay').addEventListener('click', replay, { signal: eventScope.signal });
document.querySelector('#complete').addEventListener('click', () => setProgress(1), { signal: eventScope.signal });
document.querySelector('#inspect').addEventListener('click', () => setInspection(!inspection), { signal: eventScope.signal });
window.addEventListener('scroll', onScroll, { passive: true, signal: eventScope.signal });
window.addEventListener('resize', onResize, { signal: eventScope.signal });

function updateMotionPreference() {
  document.body.dataset.motion = reducedQuery.matches ? 'reduced' : 'full';
  showcase?.setReduced(reducedQuery.matches);
  armWake();
  invalidate();
}
reducedQuery.addEventListener('change', updateMotionPreference, { signal: eventScope.signal });
updateMotionPreference();
toggleShowcase.addEventListener('click', () => {
  showcase?.setPaused(!showcase.state().paused);
  invalidate();
}, { signal: eventScope.signal });
if (ready) {
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', onPointerDown, { signal: eventScope.signal });
  canvas.addEventListener('pointermove', onPointerMove, { signal: eventScope.signal });
  canvas.addEventListener('pointerup', endPointer, { signal: eventScope.signal });
  canvas.addEventListener('pointercancel', event => endPointer(event, true), { signal: eventScope.signal });
  canvas.addEventListener('lostpointercapture', event => endPointer(event, true), { signal: eventScope.signal });
}
document.addEventListener('visibilitychange', () => {
  endPointer(null, true);
  showcase?.setHidden(document.hidden);
  if (document.hidden) { clearWake(); cancelAnimationFrame(frame); frame = 0; }
  else invalidate();
}, { signal: eventScope.signal });

window.addEventListener('pagehide', () => {
  if (disposed) return;
  endPointer(null, true);
  disposed = true;
  eventScope.abort();
  clearWake();
  showcase?.dispose();
  cancelAnimationFrame(frame);
  frame = 0;
  model?.root.removeFromParent();
  model?.dispose();
  for (const material of inspectionMaterials) material.dispose();
  inspectionMaterials.clear();
  floor?.geometry.dispose();
  floor?.material.dispose();
  floor?.removeFromParent();
  keyLight?.shadow?.map?.dispose();
  scene?.traverse((object) => { if (object.isLight) object.dispose?.(); });
  if (scene) scene.environment = null;
  scene?.removeFromParent();
  renderer?.dispose();
  environmentTarget?.dispose();
}, { once: true });
