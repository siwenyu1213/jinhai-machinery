import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { createAssemblyFlight, getFlightSchedule, VORTEX_TIMING, progressToScroll, scrollToProgress, followScroll, staggerArrival } from '../../demos/mill-assembly/motion.js';
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

function forwardAngleDelta(before, after) {
  let delta = after - before;
  if (delta < -Math.PI) delta += Math.PI * 2;
  if (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

function covarianceAxisRatio(points) {
  const average = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  average.x /= points.length;
  average.y /= points.length;
  let xx = 0, xy = 0, yy = 0;
  for (const point of points) {
    const x = point.x - average.x;
    const y = point.y - average.y;
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  const trace = xx + yy;
  const discriminant = Math.hypot(xx - yy, 2 * xy);
  return (trace - discriminant) / Math.max(Number.EPSILON, trace + discriminant);
}

test('arrival is slower and rotating assembly gets more scroll time with reversible input mappings', () => {
  const span = 1.594;
  assert.ok(Math.abs(progressToScroll(.24) * span - .24 * 2.1) < 1e-12);
  assert.ok(Math.abs((progressToScroll(.64) - progressToScroll(.24)) * span - (.64 - .24) * .7) < 1e-12);
  const assemblyDistance = (progressToScroll(.94) - progressToScroll(.64)) * span;
  assert.ok(Math.abs(assemblyDistance - 2.5 * (.94 - .64)) < 1e-12);
  assert.ok(assemblyDistance > 3 * (.94 - .76) * 1.35, 'Assembly should be at least 35 percent slower than the previous version');
  for (let step = 0; step <= 1000; step++) {
    const progress = step / 1000;
    assert.ok(Math.abs(scrollToProgress(progressToScroll(progress)) - progress) < 1e-12);
  }
  assert.equal(progressToScroll(1), 1);
  assert.equal(scrollToProgress(1), 1);
  for (const value of [NaN, Infinity, -1]) {
    assert.equal(progressToScroll(value), 0);
    assert.equal(scrollToProgress(value), 0);
  }
});

test('scroll follow keeps moving after input ends, decelerates without overshoot, and settles exactly', () => {
  let progress = 0;
  let previousStep = Infinity;
  for (let frame = 0; frame < 300; frame++) {
    const next = followScroll(progress, .7, 1 / 60);
    assert.ok(next >= progress && next <= .7);
    assert.ok(next - progress <= previousStep + .0001);
    previousStep = next - progress;
    progress = next;
  }
  assert.equal(progress, .7);
  assert.ok(followScroll(0, 1, .6) > .7 && followScroll(0, 1, .6) < .8, 'A release should retain a visible tail after 600ms');
  assert.ok(followScroll(0, 1, 1.2) > .9 && followScroll(0, 1, 1.2) < .95, 'The stronger inertia should still be settling after 1.2 seconds');
  const reversed = followScroll(progress, .2, .1);
  assert.ok(reversed > .2 && reversed < progress);
  assert.equal(followScroll(.4, .8, 0), .4);
  assert.equal(followScroll(.4, .8, NaN), .4);
  const single = followScroll(.1, .9, .2);
  let subdivided = .1;
  for (let frame = 0; frame < 24; frame++) subdivided = followScroll(subdivided, .9, .2 / 24);
  assert.ok(Math.abs(single - subdivided) < 1e-12, 'Damping must follow elapsed time, not frame count');
});

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

test('one continuous revolution extends through assembly instead of finishing before contraction', () => {
  const { flight, parts, camera } = fixture();
  const start = 0;
  const end = progressToScroll(VORTEX_TIMING.assemblyEnd);
  let previousRotation = 0;
  let previousAssembly = 0;
  let overlappingSamples = 0;
  let previousCenters;
  for (let step = 0; step <= 80; step++) {
    const state = flight.apply(scrollToProgress(start + (end - start) * step / 80), camera);
    assert.ok(state.rotationProgress >= previousRotation);
    assert.ok(state.assemblyProgress >= previousAssembly);
    if (state.assemblyProgress > .05 && state.assemblyProgress < .95) {
      assert.ok(state.rotationProgress > previousRotation, 'Components must still turn while joining');
      assert.ok(state.assemblyProgress > previousAssembly, 'Contraction and rotation must advance in the same samples');
      overlappingSamples++;
    }
    const centers = parts.map(geometryCenter);
    if (previousCenters && state.assemblyProgress === 0 && state.progress >= .20) centers.forEach((point, index) => {
      assert.ok(forwardAngleDelta(Math.atan2(previousCenters[index].z, previousCenters[index].x), Math.atan2(point.z, point.x)) >= -1e-10);
    });
    previousCenters = centers;
    previousRotation = state.rotationProgress;
    previousAssembly = state.assemblyProgress;
  }
  assert.ok(overlappingSamples >= 20, 'Assembly must overlap a substantial part of the rotation');
  assert.equal(previousRotation, 1, 'The complete motion includes exactly one turn');
  assert.equal(previousAssembly, 1);
  const state = flight.apply(VORTEX_TIMING.assemblyStart, camera);
  assert.ok(state.rotationProgress > .4 && state.rotationProgress < .6, 'Assembly should continue through roughly the remaining half turn');
  assert.equal(state.assemblyProgress, 0);
});

test('equal physical scroll increments keep a clear but smooth slow-fast-slow turn through assembly', () => {
  const { flight, camera } = fixture();
  const start = 0;
  const end = progressToScroll(VORTEX_TIMING.assemblyEnd);
  const turns = [];
  for (let step = 0; step <= 10; step++) {
    turns.push(flight.apply(scrollToProgress(start + (end - start) * step / 10), camera).rotationProgress * Math.PI * 2);
  }
  const increments = turns.slice(1).map((value, index) => value - turns[index]);
  for (let step = 1; step < 5; step++) assert.ok(increments[step] > increments[step - 1]);
  for (let step = 6; step < 10; step++) assert.ok(increments[step] < increments[step - 1]);
  assert.ok(increments[4] > increments[0] * 4, 'Slow-fast-slow should remain visible');
  assert.ok(increments[4] > Math.PI * 2 * .19, 'The middle tenth should turn over 68 degrees, clearly faster than the previous 53 degrees');
  assert.ok(Math.max(...increments) < Math.PI * .4, 'No tenth should cram over 72 degrees into one scroll increment');
  assert.ok(Math.abs(increments.reduce((sum, value) => sum + value, 0) - Math.PI * 2) < 1e-8);
  // Match speeds across the old stopping point using physical scroll units.
  const boundary = progressToScroll(VORTEX_TIMING.assemblyStart);
  const samples = [-.0001, 0, .0001].map((offset) => flight.apply(scrollToProgress(boundary + offset), camera).rotationProgress);
  const before = samples[1] - samples[0], after = samples[2] - samples[1];
  assert.ok(before > 0 && after > 0);
  assert.ok(Math.abs(before - after) / before < .01, 'Rotation must not pause or jerk when contraction starts');
});

test('real components form a broad upper funnel with complete angular coverage at multiple heights', () => {
  const model = createMill();
  const flight = createAssemblyFlight(model.parts);
  const camera = cameraFor();
  try {
    for (const progress of [.24, .33, .42, .52, .63]) {
      flight.apply(progress, camera);
      const centers = model.parts.map(geometryCenter);
      const minimum = Math.min(...centers.map((point) => point.y));
      const maximum = Math.max(...centers.map((point) => point.y));
      const bands = [[], [], []];
      for (const point of centers) {
        const band = Math.min(2, Math.floor((point.y - minimum) / (maximum - minimum) * 3));
        bands[band].push(point);
      }
      for (const [band, points] of bands.entries()) {
        assert.ok(points.length >= 6, `progress ${progress}, height band ${band} needs a substantial ring of components`);
        const quadrants = new Set(points.map((point) => (point.x >= 0 ? 1 : 0) + (point.z >= 0 ? 2 : 0)));
        assert.equal(quadrants.size, 4, `progress ${progress}, height band ${band} must surround the axis rather than trace a diagonal strip`);
      }
      const meanRadius = (points) => points.reduce((sum, point) => sum + Math.hypot(point.x, point.z), 0) / points.length;
      const lowerRadius = meanRadius(bands[0]);
      const upperRadius = meanRadius(bands[2]);
      assert.ok(upperRadius > lowerRadius * 1.25, `progress ${progress}: the upper funnel must be substantially wider than its lower section`);
      assert.ok(upperRadius - lowerRadius > .45, 'A tiny radial difference does not communicate a funnel');
      for (const [width, height] of [[1280, 720], [375, 812]]) {
        const projectionCamera = cameraFor(width / height);
        const points = centers.map((center) => {
          const projected = center.clone().project(projectionCamera);
          // Compare actual pixel axes; raw NDC coordinates distort covariance
          // in portrait viewports because their X and Y scales differ.
          return { x: projected.x * width / 2, y: projected.y * height / 2 };
        });
        assert.ok(covarianceAxisRatio(points) >= .10,
          `progress ${progress}, width ${width}: projected component cloud must occupy an area, not collapse into one diagonal line`);
      }
    }
  } finally { model.dispose(); }
});

test('incoming components are already orbiting in a broad funnel that continuously shrinks to its normal radius', () => {
  const model = createMill();
  const flight = createAssemblyFlight(model.parts);
  const camera = cameraFor();
  try {
    assert.ok(flight.apply(.08, camera).rotationProgress > 0);
    let previousRadius = Infinity;
    let previousCenters;
    const radii = [];
    for (const progress of [.18, .22, .28, .34, .42]) {
      const state = flight.apply(progress, camera);
      const centers = model.parts.map(geometryCenter);
      const meanRadius = centers.reduce((sum, point) => sum + Math.hypot(point.x, point.z), 0) / centers.length;
      assert.ok(meanRadius < previousRadius, 'The broad tornado must progressively narrow while turning');
      assert.equal(state.assemblyProgress, 0, 'This is funnel contraction, before machine assembly');
      if (previousCenters) {
        const meanAngle = centers.reduce((sum, point, index) => sum + forwardAngleDelta(
          Math.atan2(previousCenters[index].z, previousCenters[index].x), Math.atan2(point.z, point.x)), 0) / centers.length;
        assert.ok(meanAngle > .06, 'Visible orbital motion must accompany each radius reduction');
      }
      radii.push(meanRadius);
      previousRadius = meanRadius;
      previousCenters = centers;
    }
    assert.ok(radii[0] > radii.at(-1) * 1.6, 'The initial rotating body should be substantially larger than the settled tornado');
    assert.equal(flight.getState().funnelScale, 1);
    for (const boundary of [.18, .24, .42]) {
      const scroll = progressToScroll(boundary);
      const samples = [-.0001, 0, .0001].map((delta) => {
        flight.apply(scrollToProgress(scroll + delta), camera);
        return model.parts.map(({ object }) => object.position.clone());
      });
      model.parts.forEach((part, index) => {
        const before = samples[1][index].distanceTo(samples[0][index]);
        const after = samples[2][index].distanceTo(samples[1][index]);
        assert.ok(before > .00001 && after > .00001, part.id + ' must never stop at a formation boundary');
        assert.ok(Math.abs(before - after) / Math.max(before, after) < .04, part.id + ' must not jump in speed at a formation boundary');
      });
    }
  } finally { model.dispose(); }
});

test('real components advance consistently with small independent orbital speed variations', () => {
  const model = createMill();
  const flight = createAssemblyFlight(model.parts);
  const camera = cameraFor();
  try {
    for (const progress of [.42, .50, .56, .60]) {
      flight.apply(progress, camera);
      const before = model.parts.map((part) => {
        const point = geometryCenter(part);
        return Math.atan2(point.z, point.x);
      });
      flight.apply(progress + .01, camera);
      const increments = model.parts.map((part, index) => {
        const point = geometryCenter(part);
        return forwardAngleDelta(before[index], Math.atan2(point.z, point.x));
      });
      assert.ok(increments.every((delta) => delta > 0), 'Independent motion must not make parts reverse against the vortex');
      assert.ok(Math.max(...increments) - Math.min(...increments) > .001,
        `progress ${progress}: independent angular variations should avoid a rigid carousel turning at identical speed`);
    }
  } finally { model.dispose(); }
});

test('independent gusts produce visible relative tumbling and simultaneous upward and downward motion', () => {
  const model = createMill();
  const flight = createAssemblyFlight(model.parts);
  const camera = cameraFor();
  const snapshot = (progress) => {
    flight.apply(progress, camera);
    return model.parts.map((part) => ({ rotation: part.object.quaternion.clone(), y: geometryCenter(part).y }));
  };
  try {
    const before = snapshot(.4), after = snapshot(.58);
    let independentlyTumbling = 0;
    for (let index = 1; index < before.length; index++) {
      const relativeBefore = before[index - 1].rotation.clone().invert().multiply(before[index].rotation);
      const relativeAfter = after[index - 1].rotation.clone().invert().multiply(after[index].rotation);
      if (relativeBefore.angleTo(relativeAfter) > .4) independentlyTumbling++;
    }
    assert.ok(independentlyTumbling >= 8, 'Many pieces must visibly change orientation relative to one another, beyond shared orbit rotation');
    const shifts = after.map((part, index) => part.y - before[index].y);
    assert.ok(shifts.filter((value) => value > .05).length >= 6);
    assert.ok(shifts.filter((value) => value < -.05).length >= 6);
    flight.apply(.94, camera);
    for (const part of model.parts) assert.ok(part.object.quaternion.angleTo(part.homeQuaternion) < 1e-10);
  } finally { model.dispose(); }
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

test('small arrival timing offsets remain monotonic and rejoin the same continuous rotating funnel', () => {
  const original = createMill();
  const adjusted = createMill();
  const reference = createAssemblyFlight(original.parts, { stagger: false });
  const flight = createAssemblyFlight(adjusted.parts);
  const camera = cameraFor();
  try {
    for (const part of adjusted.parts) {
      assert.equal(staggerArrival(0, part.id), 0);
      assert.equal(staggerArrival(1, part.id), 1);
      let previous = 0;
      for (let step = 1; step <= 100; step++) {
        const travel = staggerArrival(step / 100, part.id);
        assert.ok(travel > previous && travel <= 1);
        assert.ok(Math.abs(travel - step / 100) <= .16);
        previous = travel;
      }
    }
    for (const progress of [.18, .22, .24, .5, .76, .85, .94, 1]) {
      flight.apply(progress, camera);
      reference.apply(progress, camera);
      assert.deepEqual(transforms(adjusted.parts), transforms(original.parts));
    }
  } finally { original.dispose(); adjusted.dispose(); }
});

test('staggering continues to reduce substantial screen occlusion while the incoming streams join the funnel', () => {
  const model = createMill();
  const flight = createAssemblyFlight(model.parts);
  const reference = createMill();
  const originalFlight = createAssemblyFlight(reference.parts, { stagger: false });
  function overlaps(parts, camera) {
    const point = new Vector3();
    const boxes = parts.map(({ object }) => {
      object.updateWorldMatrix(true, true);
      const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
      object.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const vertices = mesh.geometry.attributes.position;
        for (let index = 0; index < vertices.count; index++) {
          point.fromBufferAttribute(vertices, index).applyMatrix4(mesh.matrixWorld).project(camera);
          b.x0 = Math.min(b.x0, point.x); b.x1 = Math.max(b.x1, point.x);
          b.y0 = Math.min(b.y0, point.y); b.y1 = Math.max(b.y1, point.y);
        }
      });
      return { x0: Math.max(-1, b.x0), x1: Math.min(1, b.x1), y0: Math.max(-.75, b.y0), y1: Math.min(.8, b.y1) };
    }).filter((b) => b.x1 > b.x0 && b.y1 > b.y0);
    let count = 0;
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const first = boxes[a], second = boxes[b];
      const intersection = Math.max(0, Math.min(first.x1, second.x1) - Math.max(first.x0, second.x0))
        * Math.max(0, Math.min(first.y1, second.y1) - Math.max(first.y0, second.y0));
      const area = Math.min((first.x1 - first.x0) * (first.y1 - first.y0), (second.x1 - second.x0) * (second.y1 - second.y0));
      if (intersection / area > .25) count++;
    }
    return count;
  }
  try {
    let before = 0, after = 0;
    for (const aspect of [1.6, 2.5, 375 / 812]) for (const progress of [.06, .08, .10, .12, .14, .16]) {
      const camera = cameraFor(aspect);
      originalFlight.apply(progress, camera);
      flight.apply(progress, camera);
      before += overlaps(reference.parts, camera);
      after += overlaps(model.parts, camera);
    }
    assert.ok(after < before * .9, `Substantial overlap samples should decrease: ${before} -> ${after}`);
  } finally { model.dispose(); reference.dispose(); }
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
  const emptyState = empty.apply(.5, camera);
  assert.equal(emptyState.totalParts, 0);
  assert.equal(emptyState.stage, 'vortex');
  assert.deepEqual(emptyState.activeLabels, []);
  assert.throws(() => createAssemblyFlight([parts[0], parts[0]]), /unique/);
});
