import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWorkshop } from '../../../demos/mill-assembly/workshop-model.js';
import { createWorkshopFlight } from '../../../demos/mill-assembly/workshop-motion.js';
import { scrollToProgress } from '../../../demos/mill-assembly/motion.js';
import { loadMillSurfaceAssets } from '../../../demos/mill-assembly/surface-assets.js';
import { arrangeAssemblyRow, boxCorners, ASSEMBLY_EYE, ASSEMBLY_RIGHT, ASSEMBLY_UP } from './machine-assembly-layout.js';

export async function createInlineAssembly(host, { onLost, onRestore } = {}) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x0e1210, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, .1, 180);
  const assets = await loadMillSurfaceAssets(), pmrem = new THREE.PMREMGenerator(renderer);
  const room = assets.environment ? null : new RoomEnvironment();
  const environment = assets.environment ? pmrem.fromEquirectangular(assets.environment) : pmrem.fromScene(room, .02);
  assets.environment?.dispose(); room?.dispose(); pmrem.dispose();
  scene.environment = environment.texture; scene.environmentIntensity = 1.3; scene.environmentRotation.y = 2.6;
  scene.add(new THREE.HemisphereLight(0xfff8e9, 0x263e42, .8));
  for (const [color, intensity, position] of [[0xfff6df, 3.2, [7, 16, 12]], [0xdceeff, 1.5, [-10, 7, 4]], [0xffd2a8, 1.7, [-5, 10, -10]]]) {
    const light = new THREE.DirectionalLight(color, intensity); light.position.set(...position); scene.add(light);
  }
  const model = arrangeAssemblyRow(createWorkshop({ surfaceMaps: assets.surfaceMaps }));
  scene.add(model.root);
  for (const texture of model.textures) texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const flight = createWorkshopFlight(model.parts);
  const points = model.machines.flatMap(machine => boxCorners(machine.homeBounds));
  let disposed = false, frames = 0, current = 0;
  host.append(renderer.domElement);
  function resize() {
    const width = host.clientWidth || 1, height = host.clientHeight || 1;
    renderer.setPixelRatio(Math.min(devicePixelRatio, width < 600 ? 1 : 1.25)); renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.clearViewOffset(); camera.updateProjectionMatrix();
    const bounds = new THREE.Box3();
    for (const point of points) bounds.expandByPoint(new THREE.Vector3(point.dot(ASSEMBLY_RIGHT), point.dot(ASSEMBLY_UP), point.dot(ASSEMBLY_EYE)));
    const center = bounds.getCenter(new THREE.Vector3());
    const target = ASSEMBLY_RIGHT.clone().multiplyScalar(center.x).addScaledVector(ASSEMBLY_UP, center.y).addScaledVector(ASSEMBLY_EYE, center.z);
    // Render to the full viewport so the broad incoming vortex is never cut
    // at a rectangular model panel. Only the completed row uses a smaller
    // vertical composition window, leaving room for the title and captions.
    const fillY = width < 760 ? .342 : .3952;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); let distance = 0;
    for (const point of points) distance = Math.max(distance,
      point.dot(ASSEMBLY_EYE) - center.z + Math.abs(point.dot(ASSEMBLY_RIGHT) - center.x) / (tan * camera.aspect * .91),
      point.dot(ASSEMBLY_EYE) - center.z + Math.abs(point.dot(ASSEMBLY_UP) - center.y) / (tan * fillY));
    camera.position.copy(target).addScaledVector(ASSEMBLY_EYE, Math.max(16, distance)); camera.lookAt(target);
    camera.setViewOffset(width, height, 0, height * (width < 760 ? .025 : -.01), width, height); camera.updateMatrixWorld(true);
  }
  resize();
  const lost = event => { event.preventDefault(); onLost?.(); };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  renderer.domElement.addEventListener('webglcontextrestored', onRestore);
  return {
    render(value) { if (disposed) return; current = value; const state = flight.apply(scrollToProgress(value), camera); renderer.render(scene, camera); frames++; return state; },
    resize,
    getState: () => ({ ...flight.getState(), flightScroll: current, frames }),
    getModel: () => model,
    getCamera: () => camera,
    getRenderStats: () => ({ frames, ...renderer.info.memory, calls: renderer.info.render.calls }),
    dispose() {
      if (disposed) return; disposed = true;
      renderer.domElement.removeEventListener('webglcontextlost', lost); renderer.domElement.removeEventListener('webglcontextrestored', onRestore);
      model.dispose(); environment.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
