import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { createAssemblyFlight, getFlightSchedule, VORTEX_TIMING } from '../../demos/mill-assembly/motion.js';
import { createMill } from '../../demos/mill-assembly/model.js';

function cameraFor(aspect = 16 / 9) {
  const camera = new PerspectiveCamera(38, aspect, .1, 100);
  camera.position.set(11, 8, 18);
  camera.lookAt(0, 4.3, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}
function fixture(count = 34, aspect = 16 / 9) {
  const root = new Group();
  const parts = Array.from({ length: count }, (_, index) => {
    const object = new Mesh(new BoxGeometry(.8, 1.2, .8), new MeshBasicMaterial());
    object.position.set((index % 3 - 1) * .6, 1 + (index % 7), .2);
    object.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), index * .11);
    root.add(object);
    return { id: 'part-' + index, label: '组件' + index, phase: Math.floor(index * 6 / count), object,
      homePosition: object.position.clone(), homeQuaternion: object.quaternion.clone() };
  });
  return { root, parts, camera: cameraFor(aspect), flight: createAssemblyFlight(parts) };
}
const transforms = (parts) => parts.map(({ object }) => ({ position: object.position.toArray(), quaternion: object.quaternion.toArray(), scale: object.scale.toArray(), visible: object.visible }));
function geometryCenter(part) {
  part.object.updateWorldMatrix(true, true);
  return new Box3().setFromObject(part.object).getCenter(new Vector3());
}

test('all components enter together, remain visible, and complete assembly at one shared instant', () => {
  const { flight, parts, camera } = fixture();
  flight.apply(0, camera);
  assert.ok(parts.every(({ object }) => !object.visible));
  assert.ok(getFlightSchedule(parts).every((item) => item.start === 0 && item.end === VORTEX_TIMING.assemblyEnd));
  for (const progress of [.00001, .06, .24, .4, .76, .85, .939999]) {
    const state = flight.apply(progress, camera);
    assert.ok(parts.every(({ object }) => object.visible), 'No component may blink out during flight or orbit');
    assert.equal(state.assembledCount, 0, 'No component may complete ahead of the others');
    assert.equal(state.activeLabels.length, parts.length);
  }
  for (const progress of [VORTEX_TIMING.assemblyEnd, 1]) {
    const state = flight.apply(progress, camera);
    assert.equal(state.assembledCount, parts.length);
    assert.equal(state.stage, 'complete');
    assert.deepEqual(state.activeLabels, []);
    for (const part of parts) {
      assert.deepEqual(part.object.position.toArray(), part.homePosition.toArray());
      assert.deepEqual(part.object.quaternion.toArray(), part.homeQuaternion.toArray());
      assert.deepEqual(part.object.scale.toArray(), [1, 1, 1]);
    }
  }
});

test('every component completes one full central Y-axis revolution before the shared assembly', () => {
  const { flight, parts, camera } = fixture();
  const angles = parts.map(() => []);
  for (let step = 0; step <= 80; step++) {
    flight.apply(VORTEX_TIMING.arrivalEnd + (VORTEX_TIMING.vortexEnd - VORTEX_TIMING.arrivalEnd) * step / 80, camera);
    parts.forEach((part, index) => {
      const center = geometryCenter(part);
      angles[index].push(Math.atan2(center.z, center.x));
      assert.ok(center.y > 0 && center.y < 9);
      assert.ok(Math.hypot(center.x, center.z) < 3.5, 'The vortex stays around the machine');
    });
  }
  for (const samples of angles) {
    let revolution = 0;
    for (let index = 1; index < samples.length; index++) {
      let delta = samples[index] - samples[index - 1];
      if (delta < -Math.PI) delta += Math.PI * 2;
      if (delta > Math.PI) delta -= Math.PI * 2;
      assert.ok(delta >= -1e-10, 'All parts follow a consistent vortex direction');
      revolution += delta;
    }
    assert.ok(Math.abs(revolution - Math.PI * 2) < 1e-8, 'Exactly one full revolution is required');
  }
});

test('entries start at both camera edges and are nearer and larger through perspective', () => {
  for (const aspect of [16 / 9, 375 / 812]) {
    const { flight, parts, camera } = fixture(34, aspect);
    flight.apply(.00000001, camera);
    for (const [index, part] of parts.entries()) {
      const center = geometryCenter(part);
      const projected = center.clone().project(camera);
      const side = index % 2 === 0 ? -1 : 1;
      assert.ok(projected.x * side > 1.1, 'All arrivals begin outside their left/right edge');
      const entryDepth = -center.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const homeDepth = -part.homePosition.clone().applyMatrix4(camera.matrixWorldInverse).z;
      assert.ok(entryDepth > camera.near && entryDepth < homeDepth * .65);
      assert.ok(part.object.scale.x > .99, 'Early large appearance primarily comes from near-camera placement');
    }
  }
});

test('camera-relative arrivals follow rotated cameras and resized viewports', () => {
  const { flight, parts, camera } = fixture();
  for (const [x, z, aspect] of [[-15, 10, .5], [18, -12, 2.4], [0, 24, 1]]) {
    camera.position.set(x, 8, z);
    camera.aspect = aspect;
    camera.lookAt(0, 4, 0);
    camera.updateProjectionMatrix();
    flight.apply(.00000001, camera);
    parts.forEach((part, index) => {
      const ndc = geometryCenter(part).project(camera);
      assert.ok(ndc.x * (index % 2 === 0 ? -1 : 1) > 1.1);
      assert.ok(ndc.z > -1 && ndc.z < 1);
    });
  }
});

test('stage boundaries are continuous and reversing or jumping never accumulates drift', () => {
  const { flight, parts, camera } = fixture();
  for (const boundary of Object.values(VORTEX_TIMING)) {
    flight.apply(boundary - 1e-7, camera);
    const before = parts.map(({ object }) => ({ position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() }));
    flight.apply(boundary + 1e-7, camera);
    parts.forEach(({ object }, index) => {
      assert.ok(object.position.distanceTo(before[index].position) < 1e-4);
      assert.ok(object.quaternion.angleTo(before[index].quaternion) < 1e-4);
      assert.ok(object.scale.distanceTo(before[index].scale) < 1e-4);
    });
  }
  for (const target of [.11, .4, .65, .82]) {
    flight.apply(target, camera);
    const expected = transforms(parts);
    for (const progress of [1, .93, .12, .66, 0, target]) flight.apply(progress, camera);
    assert.deepEqual(transforms(parts), expected);
  }
});

test('real castings remain above the floor in a layered vortex and all 34 install together', () => {
  const model = createMill();
  const flight = createAssemblyFlight(model.parts);
  const camera = cameraFor();
  try {
    assert.equal(model.parts.length, 34);
    const orbitHeights = [];
    for (const progress of [.001, .06, .12, .23, .24, .36, .5, .64, .76, .82, .9, .9399]) {
      flight.apply(progress, camera);
      assert.equal(flight.getState().assembledCount, 0);
      for (const { object } of model.parts) {
        object.updateWorldMatrix(true, true);
        const box = new Box3().setFromObject(object);
        assert.ok(box.min.y >= -.00001, object.name + ' must not cut through the floor');
        assert.ok([...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()].every(Number.isFinite));
        assert.ok(object.visible);
      }
      if (progress === .5) orbitHeights.push(...model.parts.map((part) => geometryCenter(part).y));
    }
    assert.ok(Math.max(...orbitHeights) - Math.min(...orbitHeights) > 3, 'The vortex needs distinct vertical layers');
    flight.apply(.94, camera);
    assert.equal(flight.getState().assembledCount, 34);
  } finally { model.dispose(); }
});

test('invalid progress is bounded, empty scenes work and returned state is isolated', () => {
  const { flight, parts, camera } = fixture();
  for (const value of [NaN, Infinity, -Infinity, -4, undefined]) {
    flight.apply(value, camera);
    assert.equal(flight.getState().progress, 0);
    assert.ok(parts.every(({ object }) => !object.visible));
  }
  flight.apply(2, camera);
  assert.equal(flight.getState().progress, 1);
  flight.apply(.45, camera);
  const state = flight.getState();
  state.activeLabels.push('mutation');
  assert.ok(!flight.getState().activeLabels.includes('mutation'));
  const empty = createAssemblyFlight([]);
  assert.deepEqual(empty.apply(.5, camera), { progress: .5, assembledCount: 0, activeLabels: [], phase: 2, stage: 'vortex', totalParts: 0 });
  assert.throws(() => createAssemblyFlight([parts[0], parts[0]]), /unique/);
});
