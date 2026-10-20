import {
  ACESFilmicToneMapping, Box3, Color, DirectionalLight, Group, Mesh,
  MeshBasicMaterial, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry,
  PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createChuck } from './chuck-model.js';
import { assemblyPose } from '../data/assembly.js';

function createStudioEnvironment(renderer) {
  // Broad studio reflection cards make the metal read as metal even without
  // network access. Smaller strips produce crisp moving highlights at bevels.
  const environment = new RoomEnvironment();
  const cards = [];
  for (const [position, size, color, intensity] of [
    [[-4, 5, 5], [5, 3], 0xeaf3ff, 7],
    [[5, 1, 4], [1.0, 5], 0xffffff, 11],
    [[-5, -1, 1], [.55, 5], 0xf2d6a4, 6],
    [[1, 5, -4], [4, 2], 0xffffff, 6],
    [[-4, -2, 6], [1.6, 7], 0xeaf3ff, 6],
  ]) {
    const card = new Mesh(new PlaneGeometry(...size), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity) }));
    card.position.set(...position);
    card.lookAt(0, 0, 0);
    environment.add(card);
    cards.push(card);
  }
  const generator = new PMREMGenerator(renderer);
  const target = generator.fromScene(environment, .025);
  generator.dispose();
  environment.dispose();
  cards.forEach((card) => { card.geometry.dispose(); card.material.dispose(); });
  return target;
}

export function createChuckScene(host) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.13;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.className = 'assembly-canvas';
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, .1, 80);
  const viewDirection = new Vector3(6.7, 3.3, 11).normalize();
  let environmentTarget = createStudioEnvironment(renderer);
  scene.environment = environmentTarget.texture;

  const key = new DirectionalLight(0xf1f5ff, 3.2);
  key.position.set(-3, 6, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: .1, far: 25 });
  key.shadow.bias = -.0006;
  key.shadow.normalBias = .035;
  const rim = new DirectionalLight(0xc4daee, 1.4);
  rim.position.set(5, 1, -3);
  scene.add(key, rim);
  const chuck = createChuck();
  const rig = new Group();
  rig.add(chuck.root);
  scene.add(rig);
  const fitSamples = [];
  chuck.root.traverse((object) => {
    if (!object.isMesh) return;
    const position = object.geometry.attributes.position;
    const stride = Math.max(1, Math.floor(position.count / 48));
    const points = [];
    for (let index = 0; index < position.count; index += stride) points.push(new Vector3().fromBufferAttribute(position, index));
    fitSamples.push({ object, points });
  });
  const bounds = new Box3();
  let progress = 0;
  let visible = true;
  let contextLost = false;
  let frame = 0;
  let disposed = false;
  host.append(renderer.domElement);

  function render() {
    frame = 0;
    if (disposed || contextLost || !visible || document.hidden) return;
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    const pose = assemblyPose(progress);
    chuck.setPose(pose);
    rig.rotation.set(.10 + pose.spread * .03, -.15 - pose.spread * .26, -.09);
    rig.updateMatrixWorld(true);
    bounds.setFromObject(rig);
    const center = bounds.getCenter(new Vector3());
    camera.position.copy(center).addScaledVector(viewDirection, 15);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    // Fit sampled surface vertices, rather than the empty corners around a
    // round object's box. This keeps the chuck large without clipping jaws.
    const aspect = width / height;
    const tangent = Math.tan(camera.fov * Math.PI / 360);
    let distance = 8.2;
    const point = new Vector3();
    for (const sample of fitSamples) {
      for (const local of sample.points) {
          point.copy(local).applyMatrix4(sample.object.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
          const depth = point.z + 15;
          distance = Math.max(distance, Math.abs(point.x) * 1.12 / (tangent * aspect) + depth, Math.abs(point.y) * 1.12 / tangent + depth);
      }
    }
    camera.aspect = aspect;
    camera.position.copy(center).addScaledVector(viewDirection, distance);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    host.dataset.frames = String(Number(host.dataset.frames || 0) + 1);
    host.dataset.drawCalls = String(renderer.info.render.calls);
  }
  function invalidate() {
    if (!frame && !disposed) frame = requestAnimationFrame(render);
  }
  function resize() {
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    invalidate();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) invalidate();
  }, { rootMargin: '100px' });
  visibilityObserver.observe(host);
  const lost = (event) => {
    event.preventDefault();
    contextLost = true;
    host.closest('[data-assembly]').dataset.renderer = 'fallback';
  };
  const restored = () => {
    try {
      // Render-target contents are lost with the context; regenerate the
      // reflection map before revealing the metal again.
      environmentTarget.dispose();
      environmentTarget = createStudioEnvironment(renderer);
      scene.environment = environmentTarget.texture;
      key.shadow.needsUpdate = true;
      contextLost = false;
      host.closest('[data-assembly]').dataset.renderer = 'webgl';
      invalidate();
    } catch {
      host.closest('[data-assembly]').dataset.renderer = 'fallback';
    }
  };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  renderer.domElement.addEventListener('webglcontextrestored', restored);
  document.addEventListener('visibilitychange', invalidate);
  resize();
  // Render synchronously once so fallback is hidden only after a real frame.
  render();
  return {
    setProgress(value) { progress = value; invalidate(); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', invalidate);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('webglcontextrestored', restored);
      chuck.dispose();
      key.shadow.map?.dispose();
      environmentTarget.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
