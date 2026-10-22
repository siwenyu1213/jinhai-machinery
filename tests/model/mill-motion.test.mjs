import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { createAssemblyFlight, getFlightSchedule } from '../../demos/mill-assembly/motion.js';

function fixture(count = 30, aspect = 16 / 9) {
  const root = new Group();
  const parts = Array.from({ length: count }, (_, index) => {
    const object = new Mesh(new BoxGeometry(.8, 1.2, .8), new MeshBasicMaterial());
    object.position.set((index % 3 - 1) * .6, 1 + (index % 7), .2);
    object.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), index * .11);
    root.add(object);
    return { id: 'part-' + index, label: '组件' + index, phase: Math.floor(index * 6 / count), object,
      homePosition: object.position.clone(), homeQuaternion: object.quaternion.clone() };
  });
  const camera = new PerspectiveCamera(38, aspect, .1, 100);
  camera.position.set(11, 8, 18);
  camera.lookAt(0, 4.3, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return { root, parts, camera, flight: createAssemblyFlight(parts) };
}

function transforms(parts) {
  return parts.map(({ object }) => ({ position: object.position.toArray(), quaternion: object.quaternion.toArray(), scale: object.scale.toArray(), visible: object.visible }));
}

test('flight starts empty, assembles exactly and restores immutable home transforms after arbitrary scrubbing', () => {
  const { flight, parts, camera } = fixture();
  flight.apply(0, camera);
  assert.ok(parts.every(({ object }) => !object.visible));
  assert.equal(flight.getState().assembledCount, 0);
  flight.apply(.47, camera);
  const middle = transforms(parts);
  for (const progress of [1, .93, .12, .66, 0, .47]) flight.apply(progress, camera);
  assert.deepEqual(transforms(parts), middle, 'Pose must depend only on the current progress and camera');
  flight.apply(1, camera);
  assert.equal(flight.getState().assembledCount, parts.length);
  assert.equal(flight.getState().phase, 5);
  assert.deepEqual(flight.getState().activeLabels, []);
  for (const part of parts) {
    assert.ok(part.object.visible);
    assert.deepEqual(part.object.position.toArray(), part.homePosition.toArray());
    assert.deepEqual(part.object.quaternion.toArray(), part.homeQuaternion.toArray());
    assert.deepEqual(part.object.scale.toArray(), [1, 1, 1]);
  }
});

test('entries originate beyond alternating camera left/right edges, in front of the lens, at genuinely closer depth', () => {
  for (const aspect of [16 / 9, 375 / 812]) {
    const { flight, parts, camera } = fixture(30, aspect);
    for (const timing of getFlightSchedule(parts).slice(0, 6)) {
      const part = parts.find(({ id }) => id === timing.id);
      flight.apply(timing.start + 1e-7, camera);
      const projected = part.object.position.clone().project(camera);
      assert.ok(projected.x * timing.side > 1.1, 'Entry should begin outside the visible side edge');
      const entryDepth = -part.object.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const homeDepth = -part.homePosition.clone().applyMatrix4(camera.matrixWorldInverse).z;
      assert.ok(entryDepth > camera.near, 'Entry cannot begin behind or through the camera');
      assert.ok(entryDepth < homeDepth * .6, 'Near entry must be larger through perspective');
      assert.deepEqual(part.object.scale.toArray(), [1, 1, 1], 'Perspective supplies the visual size change');
    }
  }
});

test('flight rotates during approach, moves into depth, and slows down into an exact unscaled final position', () => {
  const { flight, parts, camera } = fixture();
  const timing = getFlightSchedule(parts)[9];
  const part = parts.find(({ id }) => id === timing.id);
  const poseAt = (fraction) => {
    flight.apply(timing.start + (timing.end - timing.start) * fraction, camera);
    return { position: part.object.position.clone(), rotation: part.object.quaternion.clone() };
  };
  const early = poseAt(.1);
  const middle = poseAt(.5);
  const late = poseAt(.9);
  const nearEnd = poseAt(.99);
  assert.ok(early.rotation.angleTo(middle.rotation) > .2, 'The part must visibly rotate while flying');
  assert.ok(late.rotation.angleTo(part.homeQuaternion) < middle.rotation.angleTo(part.homeQuaternion));
  const depth = (position) => -position.clone().applyMatrix4(camera.matrixWorldInverse).z;
  assert.ok(depth(early.position) < depth(middle.position));
  assert.ok(depth(middle.position) < depth(late.position));
  assert.ok(nearEnd.position.distanceTo(part.homePosition) < .005);
  assert.ok(late.position.distanceTo(nearEnd.position) < early.position.distanceTo(middle.position) * .1);
});

test('camera-relative entry follows rotated cameras and resized viewports', () => {
  const { flight, parts, camera } = fixture();
  const timing = getFlightSchedule(parts)[2];
  const part = parts.find(({ id }) => id === timing.id);
  const progress = timing.start + .000001;
  for (const [x, z, aspect] of [[-15, 10, .5], [18, -12, 2.4], [0, 24, 1]]) {
    camera.position.set(x, 8, z);
    camera.aspect = aspect;
    camera.lookAt(0, 4, 0);
    camera.updateProjectionMatrix();
    flight.apply(progress, camera);
    const ndc = part.object.position.clone().project(camera);
    assert.ok(ndc.x * timing.side > 1.1);
    assert.ok(ndc.z > -1 && ndc.z < 1);
  }
});

test('phase order is stable, overlapping arrivals stay readable, and future parts remain hidden', () => {
  const { flight, parts, camera } = fixture(36);
  const timing = getFlightSchedule([...parts].reverse());
  assert.equal(timing.length, parts.length);
  assert.ok(timing.every((entry, index) => index === 0 || entry.phase >= timing[index - 1].phase));
  for (let step = 0; step <= 1000; step++) {
    flight.apply(step / 1000, camera);
    const state = flight.getState();
    assert.ok(state.activeLabels.length <= 4);
    assert.equal(parts.filter(({ object }) => object.visible).length, state.assembledCount + state.activeLabels.length);
  }
});

test('invalid progress is bounded, empty scenes work, and returned state cannot mutate the controller', () => {
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
  for (const { object } of parts) {
    assert.ok([...object.position.toArray(), ...object.quaternion.toArray()].every(Number.isFinite));
  }
  const empty = createAssemblyFlight([]);
  assert.deepEqual(empty.apply(.5, camera), { progress: .5, assembledCount: 0, activeLabels: [], phase: 0, totalParts: 0 });
  assert.throws(() => createAssemblyFlight([parts[0], parts[0]]), /unique/);
});
