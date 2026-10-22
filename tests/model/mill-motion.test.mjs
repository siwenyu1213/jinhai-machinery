import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { createAssemblyFlight, getFlightSchedule, VORTEX_TIMING, progressToScroll, scrollToProgress, followScroll } from '../../demos/mill-assembly/motion.js';
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

test('only the final assembly receives triple the physical scroll while input mappings stay reversible', () => {
  const span = 1.36;
  for (const progress of [0, .12, .24, .5, .76]) {
    assert.ok(Math.abs(progressToScroll(progress) * span - progress) < 1e-12,
      'The arrival and vortex must keep their previous physical scroll positions');
  }
  const assemblyDistance = (progressToScroll(.94) - progressToScroll(.76)) * span;
  assert.ok(Math.abs(assemblyDistance - 3 * (.94 - .76)) < 1e-12);
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

test('every component completes one full central Y-axis revolution before the shared assembly', () => {
  const { flight, parts, camera } = fixture();
  const angles = parts.map(() => []);
  for (let step = 0; step <= 80; step++) {
    flight.apply(VORTEX_TIMING.arrivalEnd + (VORTEX_TIMING.vortexEnd - VORTEX_TIMING.arrivalEnd) * step / 80, camera);
    parts.forEach((part, index) => {
      const center = geometryCenter(part);
      angles[index].push(Math.atan2(center.z, center.x));
      assert.ok(center.y > 0 && center.y < 9);
      assert.ok(Math.hypot(center.x, center.z) < 4.2, 'The wider upper funnel stays within the preview staging area');
    });
  }
  for (const samples of angles) {
    let revolution = 0;
    for (let index = 1; index < samples.length; index++) {
      const delta = forwardAngleDelta(samples[index - 1], samples[index]);
      assert.ok(delta >= -1e-10, 'All parts follow a consistent vortex direction');
      revolution += delta;
    }
    assert.ok(Math.abs(revolution - Math.PI * 2) < 1e-8, 'Exactly one full revolution is required');
  }
});

test('equal scroll increments create an unmistakable slow-fast-slow single revolution', () => {
  const { flight, parts, camera } = fixture();
  const angles = [];
  for (let step = 0; step <= 10; step++) {
    flight.apply(VORTEX_TIMING.arrivalEnd + (VORTEX_TIMING.vortexEnd - VORTEX_TIMING.arrivalEnd) * step / 10, camera);
    angles.push(parts.map((part) => {
      const center = geometryCenter(part);
      return Math.atan2(center.z, center.x);
    }));
  }
  const meanSteps = Array.from({ length: 10 }, (_, step) => parts.reduce((sum, _, index) =>
    sum + forwardAngleDelta(angles[step][index], angles[step + 1][index]), 0) / parts.length);
  for (let step = 1; step < 5; step++) assert.ok(meanSteps[step] > meanSteps[step - 1], 'The first half must visibly accelerate under constant scrolling');
  for (let step = 6; step < 10; step++) assert.ok(meanSteps[step] < meanSteps[step - 1], 'The second half must progressively slow down');
  const peak = Math.min(meanSteps[4], meanSteps[5]);
  assert.ok(peak > meanSteps[0] * 200 && peak > meanSteps[9] * 200,
    'Middle scroll steps must turn far more than the equal-sized first and last steps');
  assert.ok(peak > Math.PI * .55, 'The fast middle tenth must cover over 99 degrees, making the acceleration clearly perceptible');
  assert.ok(Math.abs(meanSteps.reduce((sum, angle) => sum + angle, 0) - Math.PI * 2) < 1e-8,
    'Acceleration changes the pacing, never the total turn count');
});

test('real components form a broad upper funnel with complete angular coverage at multiple heights', () => {
  const model = createMill();
  const flight = createAssemblyFlight(model.parts);
  const camera = cameraFor();
  try {
    for (const progress of [.24, .37, .50, .63, .76]) {
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

test('real components advance consistently with small independent orbital speed variations', () => {
  const model = createMill();
  const flight = createAssemblyFlight(model.parts);
  const camera = cameraFor();
  try {
    for (const progress of [.30, .42, .55, .67]) {
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

test('entries start beyond the sides and all four corners with bounded near-camera footprints', () => {
  for (const aspect of [16 / 9, 375 / 812]) {
    const { flight, parts, camera } = fixture(34, aspect);
    flight.apply(.00000001, camera);
    const corners = new Map();
    for (const [index, part] of parts.entries()) {
      const center = geometryCenter(part);
      const projected = center.clone().project(camera);
      const side = index % 2 === 0 ? -1 : 1;
      assert.ok(projected.x * side > 1.1, 'All arrivals begin outside their left/right edge');
      const entryDepth = -center.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const homeDepth = -part.homePosition.clone().applyMatrix4(camera.matrixWorldInverse).z;
      assert.ok(entryDepth > camera.near && entryDepth < homeDepth * .65);
      assert.ok(part.object.scale.x > 0 && part.object.scale.x <= 1);
      const vertical = getFlightSchedule(parts)[index].vertical;
      if (vertical !== 0) {
        assert.ok(projected.y * vertical > 1.05, 'Diagonal arrivals begin above or below the screen');
        const key = `${side},${vertical}`;
        corners.set(key, (corners.get(key) || 0) + 1);
      }
    }
    assert.equal(corners.size, 4);
    assert.ok([...corners.values()].every((count) => count >= 5));
  }
});

test('incoming real castings keep separate projected silhouettes instead of hiding small components', () => {
  const model = createMill();
  const flight = createAssemblyFlight(model.parts);
  try {
    for (const aspect of [1.6, 2.5, 375 / 812]) {
      const camera = cameraFor(aspect);
      for (const progress of [.08, .10, .14, .17]) {
        flight.apply(progress, camera);
        const boxes = model.parts.map((part) => {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          part.object.updateWorldMatrix(true, true);
          const point = new Vector3();
          part.object.traverse((object) => {
            if (!object.isMesh) return;
            const vertices = object.geometry.attributes.position;
            for (let index = 0; index < vertices.count; index++) {
              point.fromBufferAttribute(vertices, index).applyMatrix4(object.matrixWorld).project(camera);
              x0 = Math.min(x0, point.x); x1 = Math.max(x1, point.x);
              y0 = Math.min(y0, point.y); y1 = Math.max(y1, point.y);
            }
          });
          return { id: part.id, x0, x1, y0, y1 };
        });
        for (let first = 0; first < boxes.length; first++) for (let second = first + 1; second < boxes.length; second++) {
          const a = boxes[first], b = boxes[second];
          const overlap = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
          const area = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
          assert.ok(overlap / area < .03, `${aspect}, ${progress}: ${a.id} overlaps ${b.id}`);
        }
      }
    }
  } finally { model.dispose(); }
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

test('separated arrivals stay continuous instead of changing avoidance lanes abruptly', () => {
  const model = createMill();
  const flight = createAssemblyFlight(model.parts);
  const camera = cameraFor();
  let previous;
  try {
    for (let step = 60; step <= 180; step++) {
      flight.apply(step / 1000, camera);
      const centers = model.parts.map((part) => geometryCenter(part).project(camera));
      if (previous) centers.forEach((point, index) => {
        assert.ok(Math.hypot(point.x - previous[index].x, point.y - previous[index].y) < .065,
          `${model.parts[index].id} must stay on its continuous flight corridor`);
      });
      previous = centers;
    }
  } finally { model.dispose(); }
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
        if (progress >= VORTEX_TIMING.arrivalEnd) assert.ok(box.min.y >= -.00001, object.name + ' must not cut through the visible machine floor');
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
