import assert from 'node:assert/strict';
import test from 'node:test';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { createWorkshop, RIGHT } from '../../demos/mill-assembly/workshop-model.js';
import { createWorkshopFlight } from '../../demos/mill-assembly/workshop-motion.js';
import { followScroll, progressToScroll, scrollToProgress, VORTEX_TIMING } from '../../demos/mill-assembly/motion.js';

const CAMERA = [-18, 12, 25];
const TARGET = [0, 5, 0];
const PROBES = [.06, .17, .24, .43, .63];

function makeFlight() {
  const workshop = createWorkshop();
  const flight = createWorkshopFlight(workshop.parts);
  workshop.root.updateMatrixWorld(true);
  const camera = new PerspectiveCamera(40, 16 / 9, .1, 200);
  camera.position.set(...CAMERA);
  camera.lookAt(new Vector3(...TARGET));
  camera.updateMatrixWorld(true);
  return { workshop, flight, camera };
}

const snapshot = (parts) => parts.map((part) => ({
  position: part.object.position.clone(),
  quaternion: part.object.quaternion.clone(),
  scale: part.object.scale.clone(),
  visible: part.object.visible,
}));

function assertSame(a, b, tolerance = 0) {
  assert.ok(a.position.distanceTo(b.position) <= tolerance || tolerance === 0 && a.position.equals(b.position), 'position');
  const dot = Math.abs(a.quaternion.dot(b.quaternion));
  assert.ok((1 - dot) * 2 <= Math.max(tolerance, 1e-9) || a.quaternion.equals(b.quaternion), 'quaternion');
  assert.ok(a.scale.equals(b.scale), 'scale');
}

test('one shared clock completes all 91 parts exactly at the assembly end', () => {
  const { workshop, flight, camera } = makeFlight();
  flight.apply(.939, camera);
  assert.equal(flight.getState().totalParts, 91);
  assert.equal(flight.getState().assembledCount, 0);
  flight.apply(.94, camera);
  assert.equal(flight.getState().assembledCount, 91);
  workshop.dispose();
});

// Future per-machine targets that must not leak into the shared vortex: each
// machine's homes are moved by a different XZ offset before the flight exists.
const DISTURBANCES = {
  mill: new Vector3(3, 0, 0),
  lathe: new Vector3(0, 0, -5),
  laser: new Vector3(5, 0, 4),
};

function disturbHomes(workshop) {
  for (const part of workshop.parts) {
    const offset = DISTURBANCES[part.machineId];
    part.homePosition.add(offset);
    part.object.position.add(offset);
  }
}

test('one vortex: disturbed per-machine targets share all 91 pre-assembly poses and return to their own homes', () => {
  const first = makeFlight();
  const second = makeFlight();
  disturbHomes(second.workshop);
  second.flight = createWorkshopFlight(second.workshop.parts);
  // The disturbance is real: the two workshops have genuinely different homes.
  const disturbed = second.workshop.parts.filter((part, i) => !part.homePosition.equals(first.workshop.parts[i].homePosition));
  assert.equal(disturbed.length, 91, 'every part home was moved');
  second.workshop.parts.forEach((part, i) => {
    const expected = first.workshop.parts[i].homePosition.clone().add(DISTURBANCES[part.machineId]);
    assert.ok(part.homePosition.equals(expected), `${part.id}: only its own machine offset`);
    assert.ok(part.object.position.equals(expected), `${part.id}: live pose follows disturbed home`);
  });
  for (const p of [.06, .17, .24, .43, .55, .63]) {
    first.flight.apply(p, first.camera);
    second.flight.apply(p, second.camera);
    const a = snapshot(first.workshop.parts);
    const b = snapshot(second.workshop.parts);
    assert.equal(a.length, 91);
    for (let i = 0; i < 91; i++) {
      assert.ok(a[i].position.distanceTo(b[i].position) < 1e-7, `pos ${p} ${i}`);
      assert.ok(1 - Math.abs(a[i].quaternion.dot(b[i].quaternion)) < 1e-6, `quat ${p} ${i}`);
      assert.ok(a[i].scale.distanceTo(b[i].scale) < 1e-9, `scale ${p} ${i}`);
    }
  }
  // .94: each workshop snaps back to its own disturbed homes, not the other's.
  first.flight.apply(.94, first.camera);
  second.flight.apply(.94, second.camera);
  second.workshop.parts.forEach((part, i) => {
    assert.ok(part.object.position.distanceTo(part.homePosition) < 1e-7, `disturbed home ${part.id}`);
    assert.ok(1 - Math.abs(part.object.quaternion.dot(part.homeQuaternion)) < 1e-6, `disturbed quat ${part.id}`);
  });
  first.workshop.parts.forEach((part) => {
    const other = second.workshop.parts.find((entry) => entry.id === part.id).homePosition;
    assert.ok(part.object.position.distanceTo(other) > 1, `${part.id}: first workshop did not take the disturbed target`);
  });
  // The first workshop returns to its one-row layout.
  const rightward = (part) => part.homePosition.dot(RIGHT);
  assert.ok(rightward(first.workshop.parts.find((part) => part.machineId === 'lathe')) < rightward(first.workshop.parts.find((part) => part.machineId === 'mill')));
  assert.ok(rightward(first.workshop.parts.find((part) => part.machineId === 'mill')) < rightward(first.workshop.parts.find((part) => part.machineId === 'laser')));
  first.workshop.dispose();
  second.workshop.dispose();
});

test('all three machines spin in one central broad-at-top vortex', () => {
  const { workshop, flight, camera } = makeFlight();
  for (const p of [.42, .55]) {
    flight.apply(p, camera);
    workshop.root.updateMatrixWorld(true);
    const samples = workshop.parts.map((part) => {
      const center = new Box3().setFromObject(part.object).getCenter(new Vector3());
      for (const vector of [part.object.position, part.object.quaternion, part.object.scale]) {
        assert.ok([...vector].every(Number.isFinite), 'finite');
      }
      assert.ok(part.object.visible);
      return { center, machineId: part.machineId };
    });
    const mid = (Math.min(...samples.map((s) => s.center.y)) + Math.max(...samples.map((s) => s.center.y))) / 2;
    const radii = (list) => list.map((s) => Math.hypot(s.center.x, s.center.z));
    const upper = radii(samples.filter((s) => s.center.y >= mid));
    const lower = radii(samples.filter((s) => s.center.y < mid));
    const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
    assert.ok(mean(upper) > mean(lower) * 1.2, `radius ${p}`);
    for (const machineId of ['mill', 'lathe', 'laser']) {
      const own = samples.filter((s) => s.machineId === machineId);
      assert.ok(own.some((s) => s.center.x > 0) && own.some((s) => s.center.x < 0), `spread ${machineId}`);
    }
  }
  workshop.dispose();
});

test('rotation and scale keep changing through arrival, vortex and assembly', () => {
  const { workshop, flight, camera } = makeFlight();
  const moved = (from, to, includeScale = true) => {
    flight.apply(from, camera);
    const a = snapshot(workshop.parts);
    const funnelEarly = flight.getState().funnelScale;
    flight.apply(to, camera);
    const b = snapshot(workshop.parts);
    const count = b.filter((part, i) => !part.position.equals(a[i].position)
      && !part.quaternion.equals(a[i].quaternion)
      && (!includeScale || !part.scale.equals(a[i].scale))).length;
    return { count, funnelEarly, funnelLate: flight.getState().funnelScale };
  };
  for (const [from, to] of [[.12, .18], [.69, .74], [.80, .85]]) {
    assert.ok(moved(from, to).count >= 10, `moved ${from}`);
    assert.equal(flight.getState().assembledCount, 0);
  }
  const vortex = moved(.26, .30, false);
  assert.ok(vortex.count >= 10, 'moved .26');
  assert.ok(vortex.funnelLate < vortex.funnelEarly, 'funnel shrinking .26');
  assert.equal(flight.getState().assembledCount, 0);
  flight.apply(.69, camera);
  const early = flight.getState().rotationProgress;
  flight.apply(.74, camera);
  assert.ok(flight.getState().rotationProgress > early);
  workshop.dispose();
});

test('reverse jumps are exact, homes are immutable and arrival returns to the one row', () => {
  const first = makeFlight();
  const homes = first.workshop.parts.map((part) => part.homePosition.clone());
  first.flight.apply(.63, first.camera);
  const probe = snapshot(first.workshop.parts);
  first.flight.apply(.94, first.camera);
  first.flight.apply(.1, first.camera);
  first.flight.apply(.63, first.camera);
  snapshot(first.workshop.parts).forEach((part, i) => assertSame(part, probe[i], 1e-9));
  first.workshop.parts.forEach((part, i) => assert.ok(part.homePosition.equals(homes[i])));

  const runs = [first, makeFlight()];
  const finals = [];
  for (const run of runs) {
    for (const p of [.94, .2, .94]) run.flight.apply(p, run.camera);
    run.workshop.parts.forEach((part) => {
      assert.ok(part.object.position.distanceTo(part.homePosition) < 1e-7 || part.object.position.equals(part.homePosition));
      assert.ok(part.object.quaternion.equals(part.homeQuaternion));
      assert.deepEqual(part.object.scale.toArray(), [1, 1, 1]);
      assert.ok(part.object.visible);
    });
    finals.push(snapshot(run.workshop.parts));
    run.flight.apply(0, run.camera);
    run.workshop.parts.forEach((part) => {
      assert.equal(part.object.visible, false);
      assert.ok(part.object.position.equals(part.homePosition));
    });
  }
  // Both workshops resolve to the very same single row at .94.
  finals[0].forEach((part, i) => assert.ok(part.position.distanceTo(finals[1][i].position) < 1e-7, `arrival row ${i}`));
  runs[1].workshop.dispose();
  first.workshop.dispose();
});

test('scroll mapping stays shared and angular speed peaks mid-turn', () => {
  const { workshop, flight, camera } = makeFlight();
  assert.ok(followScroll(0, 1, .45) > .6);
  const step = .0005;
  const samples = [];
  for (let scroll = 0; scroll <= progressToScroll(VORTEX_TIMING.assemblyEnd) + 1e-9; scroll += step) {
    flight.apply(scrollToProgress(scroll), camera);
    samples.push(flight.getState().rotationProgress);
  }
  for (let i = 1; i < samples.length; i++) assert.ok(samples[i] >= samples[i - 1] - 1e-12);
  assert.ok(samples.at(-1) > .999 && samples[0] === 0);
  const slope = (i) => samples[Math.min(i + 10, samples.length - 1)] - samples[Math.max(i - 10, 0)];
  const end = slope(Math.floor(samples.length * .5));
  assert.ok(end > slope(2) * 2 && end > slope(samples.length - 3) * 2, 'mid speed');
  workshop.dispose();
});
