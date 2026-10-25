import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWorkshop } from '../../../demos/mill-assembly/workshop-model.js';
import { loadMillSurfaceAssets } from '../../../demos/mill-assembly/surface-assets.js';

const EYE = new THREE.Vector3(11, 5.2, 16).normalize();
const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

// The original 91 model parts and PBR surfaces, presented one machine at a
// time. Group transforms never alter their immutable assembly home snapshots.
export async function createMachineHero(host, { onChange = () => {}, onLost = () => {}, onRestore = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x172020, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, .1, 160);
  const assets = await loadMillSurfaceAssets(), pmrem = new THREE.PMREMGenerator(renderer);
  const room = assets.environment ? null : new RoomEnvironment();
  const environment = assets.environment ? pmrem.fromEquirectangular(assets.environment) : pmrem.fromScene(room, .02);
  assets.environment?.dispose(); room?.dispose(); pmrem.dispose();
  scene.environment = environment.texture; scene.environmentIntensity = 1.3; scene.environmentRotation.y = 2.6;
  scene.add(new THREE.HemisphereLight(0xfff8e9, 0x263e42, .8));
  const key = new THREE.DirectionalLight(0xfff6df, 3.2); key.position.set(7, 16, 12); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -10, right: 10, top: 12, bottom: -9, near: 1, far: 50 });
  key.shadow.normalBias = .03; key.shadow.bias = -.0002;
  const fill = new THREE.DirectionalLight(0xdceeff, 1.5); fill.position.set(-10, 7, 4);
  const rim = new THREE.DirectionalLight(0xffd2a8, 1.7); rim.position.set(-5, 10, -10); scene.add(key, key.target, fill, rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ color: 0x000000, opacity: .3 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.03; floor.receiveShadow = true; scene.add(floor);
  const model = createWorkshop({ surfaceMaps: assets.surfaceMaps }), entries = new Map();
  for (const machine of model.machines) {
    const box = machine.homeBounds, center = box.getCenter(new THREE.Vector3()), anchor = new THREE.Vector3(center.x, box.min.y, center.z);
    const group = new THREE.Group(); group.name = machine.id;
    for (const part of machine.parts) { group.add(part.object); part.object.position.copy(part.homePosition).sub(anchor); }
    scene.add(group); group.visible = false; entries.set(machine.id, { ...machine, group });
  }
  for (const texture of model.textures) texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  let active = 'mill', target = active, transition = null, reduced = false, paused = false, visible = true;
  let frame = 0, disposed = false, lost = false, lastTime = 0, clock = 0;
  const scope = new AbortController(); host.append(renderer.domElement);
  function fit() {
    if (disposed) return;
    const width = host.clientWidth || 1, height = host.clientHeight || 1;
    renderer.setPixelRatio(Math.min(devicePixelRatio, width < 600 ? 1 : 1.35)); renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.clearViewOffset(); camera.updateProjectionMatrix();
    const group = entries.get(active).group, rotation = group.rotation.y; group.rotation.y = 0;
    const box = new THREE.Box3().setFromObject(group), center = box.getCenter(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), EYE).normalize(), up = new THREE.Vector3().crossVectors(EYE, right).normalize();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); let distance = 0;
    for (let c = 0; c < 8; c++) {
      const point = new THREE.Vector3(c & 1 ? box.max.x : box.min.x, c & 2 ? box.max.y : box.min.y, c & 4 ? box.max.z : box.min.z).sub(center);
      distance = Math.max(distance, point.dot(EYE) + Math.abs(point.dot(right)) / (tan * camera.aspect * .82), point.dot(EYE) + Math.abs(point.dot(up)) / (tan * .82));
    }
    camera.position.copy(center).addScaledVector(EYE, distance); camera.lookAt(center);
    camera.setViewOffset(width, height, 0, -height * .1, width, height); camera.updateMatrixWorld(true); group.rotation.y = rotation;
  }
  function switchActive(id) { entries.get(active).group.visible = false; active = id; entries.get(active).group.visible = true; fit(); onChange(active); }
  switchActive(active);
  function draw(time = performance.now()) {
    frame = 0; if (disposed || lost || !visible) return;
    const dt = lastTime ? Math.min(.05, (time - lastTime) / 1000) : 0; lastTime = time;
    if (!reduced && !paused) clock += dt;
    entries.get(active).group.rotation.y = reduced ? 0 : Math.sin(clock * .25) * .1;
    if (transition) {
      const t = Math.min(1, (time - transition.start) / 900);
      renderer.domElement.style.opacity = String(t < .5 ? 1 - ease(t * 2) : ease((t - .5) * 2));
      if (t >= .5 && active !== target) switchActive(target);
      if (t === 1) { transition = null; renderer.domElement.style.opacity = '1'; }
    }
    renderer.render(scene, camera); if ((!reduced && !paused) || transition) frame = requestAnimationFrame(draw);
  }
  function invalidate() { if (!frame && !disposed && !lost && visible) { lastTime = 0; frame = requestAnimationFrame(draw); } }
  const resize = new ResizeObserver(() => { fit(); invalidate(); }); resize.observe(host);
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; onLost(); }, { signal: scope.signal });
  renderer.domElement.addEventListener('webglcontextrestored', onRestore, { signal: scope.signal }); draw();
  return {
    select(id, instant = false) { if (!entries.has(id) || disposed) return false; target = id;
      if (instant || reduced || !visible) { transition = null; switchActive(id); renderer.domElement.style.opacity = '1'; }
      else if (target !== active) transition = { start: performance.now() }; invalidate(); return true; },
    setPaused(value) { paused = Boolean(value); cancelAnimationFrame(frame); frame = 0; invalidate(); },
    setReduced(value) { reduced = Boolean(value); if (reduced && transition) { transition = null; switchActive(target); renderer.domElement.style.opacity = '1'; } cancelAnimationFrame(frame); frame = 0; invalidate(); },
    setVisible(value) { visible = Boolean(value); cancelAnimationFrame(frame); frame = 0; if (!visible && transition) { transition = null; switchActive(target); renderer.domElement.style.opacity = '1'; } invalidate(); },
    getState: () => ({ active, target, moving: Boolean(transition), paused, reduced, visible, disposed, lost, totalParts: model.parts.length }),
    getModels: () => [...entries.values()], getCamera: () => camera, getScene: () => scene,
    getRenderStats: () => ({ frames: renderer.info.render.frame, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
    capture: () => { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    dispose() { if (disposed) return; disposed = true; cancelAnimationFrame(frame); resize.disconnect(); scope.abort(); model.dispose(); entries.forEach(entry => entry.group.clear()); floor.geometry.dispose(); floor.material.dispose(); key.shadow.map?.dispose(); scene.traverse(object => { if (object.isLight) object.dispose?.(); }); scene.environment = null; environment.dispose(); renderer.dispose(); renderer.domElement.remove(); },
  };
}
