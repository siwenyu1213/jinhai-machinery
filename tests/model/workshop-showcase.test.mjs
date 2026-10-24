import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Quaternion, Vector3 } from 'three';
import { createWorkshop, EYE, RIGHT, TRIANGLE_OFFSETS, TRIANGLE_HOMES, TRIANGLE_DEPTH } from '../../demos/mill-assembly/workshop-model.js';
import { createShowcase, orbitOffset, SHOWCASE_TIMING } from '../../demos/mill-assembly/workshop-showcase.js';

const close = (a, b, message = '') => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} != ${b}`);
function fixture(run) {
  const model = createWorkshop();
  model.setLayout('triangle');
  let time = 0;
  const show = createShowcase({ machines: model.machines, now: () => time });
  const at = (t) => { time = t; return show.update(t); };
  try { run({ model, show, at }); } finally { show.dispose(); model.dispose(); }
}
const homes = (model) => model.parts.map(p => [p.homePosition.toArray(), p.homeQuaternion.toArray()]);
const poses = (model) => model.parts.map(p => [p.object.position.toArray(), p.object.quaternion.toArray()]);

test('triangle centres occupy front and rear slots on the ground; old row layouts remain available', () => fixture(({ model }) => {
  for (const machine of model.machines) {
    const center = machine.homeBounds.getCenter(new Vector3());
    const slot = TRIANGLE_OFFSETS[TRIANGLE_HOMES[machine.id]];
    close(center.dot(RIGHT), slot[0]); close(center.dot(EYE), slot[1]); close(machine.homeBounds.min.y, 0);
  }
  model.setLayout('wide');
  assert.equal(model.parts.length, 91);
  model.setLayout('triangle');
  for (const p of model.parts) assert.deepEqual(p.object.position.toArray(), p.homePosition.toArray());
}));

test('auto starts at 5000ms, follows the deep ellipse and cycles right-front-left every five seconds', () => fixture(({ show, at, model }) => {
  const home = homes(model), initial = poses(model);
  show.start(0); at(4999); assert.equal(show.state().moving, false); assert.equal(show.state().frontId, 'mill');
  at(5000); assert.equal(show.state().moving, true);
  at(5700);
  const mid = show.state();
  close(mid.phase, -Math.PI / 3);
  for (const machine of mid.machines) {
    const center = new Vector3().fromArray(machine.center);
    close((center.dot(RIGHT) / 9) ** 2 + (center.dot(EYE) / TRIANGLE_DEPTH) ** 2, 1, 'elliptical orbit');
  }
  at(6400); assert.equal(show.state().frontId, 'laser');
  const states = Object.fromEntries(show.state().machines.map(m => [m.id, new Vector3().fromArray(m.center)]));
  close(states.mill.dot(RIGHT), -Math.sqrt(3) * 4.5); close(states.lathe.dot(RIGHT), Math.sqrt(3) * 4.5);
  close(states.laser.dot(EYE), 22.5);
  close(states.mill.dot(EYE), -11.25);
  close(states.lathe.dot(EYE), -11.25);
  assert.ok(states.laser.dot(EYE) - states.mill.dot(EYE) > 30, 'strong front/back separation');
  at(9999); assert.equal(show.state().moving, false);
  at(10000); assert.equal(show.state().moving, true);
  at(11400); assert.equal(show.state().frontId, 'lathe');
  at(15000); at(16400); assert.equal(show.state().frontId, 'mill');
  poses(model).forEach((pose, i) => pose[0].forEach((value, a) => close(value, initial[i][0][a])));
  assert.deepEqual(homes(model), home);
}));

test('selecting any machine and retargeting during a move starts at the current position', () => fixture(({ show, at, model }) => {
  show.start(0); show.select('lathe', 0); at(400);
  const before = poses(model);
  show.select('laser', 400);
  assert.deepEqual(poses(model), before);
  at(1800); assert.equal(show.state().frontId, 'laser');
  show.select('mill', 1800); at(3200); assert.equal(show.state().frontId, 'mill');
  assert.equal(show.select('unknown'), false);
}));

test('dragging freezes the live orbit without a jump and rotates only that rigid machine', () => fixture(({ model, show, at }) => {
  const home = homes(model);
  show.start(0); at(5000); at(5600);
  const before = poses(model);
  show.beginDrag('lathe', 5600);
  assert.deepEqual(poses(model), before);
  at(9000); assert.deepEqual(poses(model), before);
  const partList = model.machines.find(m => m.id === 'lathe').parts;
  const distance = partList[0].object.position.distanceTo(partList[10].object.position);
  show.rotate('lathe', new Quaternion().setFromAxisAngle(new Vector3(1, .6, 0).normalize(), 2));
  close(partList[0].object.position.distanceTo(partList[10].object.position), distance, 'rigid part distance');
  model.parts.forEach((p, i) => { if (p.machineId !== 'lathe') assert.deepEqual([p.object.position.toArray(), p.object.quaternion.toArray()], before[i]); });
  close(show.boundsOf('lathe').min.y, 0, 'rotation remains above floor');
  show.endDrag(9000); at(10400);
  assert.ok(show.state().frontId); assert.equal(show.state().moving, false);
  at(13999); assert.equal(show.state().moving, false);
  at(14000); assert.equal(show.state().moving, true);
  assert.deepEqual(homes(model), home);
}));

test('rotation and height remain stable while travelling and through repeated apply calls', () => fixture(({ show, at, model }) => {
  show.start(0);
  show.rotate('mill', new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2));
  const distance = show.boundsOf('mill').min.y;
  const rotation = show.rotationOf('mill').toArray();
  const first = poses(model); show.apply();
  poses(model).forEach((pose, i) => pose.flat().forEach((value, a) => close(value, first[i].flat()[a])));
  show.select('lathe', 0); at(1400); close(show.boundsOf('mill').min.y, distance);
  assert.deepEqual(show.rotationOf('mill').toArray(), rotation);
  const parts = model.machines.find(m => m.id === 'mill').parts;
  const inverse = parts[0].homeQuaternion.clone().invert();
  close(parts[0].object.quaternion.clone().multiply(inverse).angleTo(show.rotationOf('mill')), 0);
  show.rotate('mill', new Quaternion());
  close(show.boundsOf('mill').min.y, 0);
  show.select('mill', 1400); at(2800);
  close(show.boundsOf('mill').min.y, 0);
  model.machines.find(m => m.id === 'mill').parts.forEach(p => p.object.position.toArray().forEach((v, a) => close(v, p.homePosition.toArray()[a])));
}));

test('paused and reduced states suppress auto but keep manual selection usable', () => fixture(({ show, at }) => {
  show.start(0); show.setPaused(true, 0); at(20000); assert.equal(show.state().frontId, 'mill');
  assert.equal(show.nextWakeAt(), null);
  show.select('laser', 20000); at(21400); assert.equal(show.state().frontId, 'laser');
  show.setPaused(false, 21400); at(26399); assert.equal(show.state().moving, false);
  at(26400); assert.equal(show.state().moving, true);
  show.setReduced(true, 26600); assert.equal(show.state().moving, false);
  assert.equal(show.nextWakeAt(), null); show.select('mill', 27000); assert.equal(show.state().frontId, 'mill');
  at(50000); assert.equal(show.state().frontId, 'mill');
}));

test('hidden tab freezes without snapping, resumes with a fresh clock, reset restores every original pose', () => fixture(({ show, at, model }) => {
  const initial = poses(model);
  show.start(0); at(5000); at(5500); const live = poses(model);
  show.setHidden(true, 5500); assert.deepEqual(poses(model), live);
  at(25000); assert.deepEqual(poses(model), live); assert.equal(show.needsFrame(), false);
  show.setHidden(false, 25000); at(26400); assert.ok(show.state().frontId);
  show.rotate('laser', new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 1));
  show.reset(); assert.deepEqual(poses(model), initial); assert.equal(show.state().active, false);
  assert.equal(show.nextWakeAt(), null);
  at(100000); assert.deepEqual(poses(model), initial);
}));

test('dispose drops scheduled work and never changes model-owned resources', () => fixture(({ show, model }) => {
  show.start(0); show.dispose();
  assert.equal(show.needsFrame(), false); assert.equal(show.nextWakeAt(), null);
  assert.equal(show.select('mill'), false); assert.equal(model.parts.length, 91);
  close(orbitOffset(0).dot(EYE), 22.5); assert.equal(SHOWCASE_TIMING.interval, 5000);
  assert.ok(new Box3().setFromObject(model.root).isEmpty() === false);
}));

test('three idle seconds start a smooth return; only the inspected machine changes and its exact home pose is restored', () => fixture(({ model, show, at }) => {
  show.start(0); show.setPaused(true, 0);
  const initial = poses(model), q = new Quaternion().setFromAxisAngle(new Vector3(1, .4, 0).normalize(), 2);
  show.beginDrag('mill', 0); show.rotate('mill', q); show.endDrag(100);
  assert.equal(show.nextWakeAt(), 3100); assert.equal(show.needsFrame(), false);
  at(3099); close(show.rotationOf('mill').angleTo(q), 0);
  at(3100); assert.equal(show.needsFrame(), true); close(show.rotationOf('mill').angleTo(q), 0);
  at(3450); close(show.rotationOf('mill').angleTo(new Quaternion()), 1);
  close(show.boundsOf('mill').min.y, 0);
  model.parts.forEach((p, i) => { if (p.machineId !== 'mill') assert.deepEqual([p.object.position.toArray(), p.object.quaternion.toArray()], initial[i]); });
  at(3800); assert.deepEqual(show.rotationOf('mill').toArray(), [0, 0, 0, 1]);
  assert.deepEqual(poses(model), initial); assert.equal(show.needsFrame(), false); assert.equal(show.nextWakeAt(), null);
}));

test('dragging another machine leaves the first deadline running; only the clicked machine restarts its clock', () => fixture(({ model, show, at }) => {
  show.start(0); show.setPaused(true, 0);
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1.6);
  show.beginDrag('mill', 0); show.rotate('mill', q); show.endDrag(0);
  at(2000); show.beginDrag('lathe', 2000); show.rotate('lathe', q);
  assert.equal(show.nextWakeAt(), 3000);
  at(3350); assert.equal(show.needsFrame(), true);
  close(show.rotationOf('mill').angleTo(new Quaternion()), .8);
  close(show.rotationOf('lathe').angleTo(q), 0);
  at(3700); assert.deepEqual(show.rotationOf('mill').toArray(), [0, 0, 0, 1]);
  show.endDrag(4000); assert.equal(show.nextWakeAt(), 7000);
  show.select('mill', 5000); assert.equal(show.nextWakeAt(), 7000);
  show.select('lathe', 6000); assert.equal(show.nextWakeAt(), 9000);
  at(8999); close(show.rotationOf('lathe').angleTo(q), 0);
  at(9350); const live = poses(model);
  show.beginDrag('lathe', 9350); assert.deepEqual(poses(model), live);
  at(12000); assert.deepEqual(poses(model), live);
  show.endDrag(12000); at(15700);
  assert.deepEqual(show.rotationOf('lathe').toArray(), [0, 0, 0, 1]);
}));

test('all three machines return on independent deadlines, including an uninterrupted return when another is clicked', () => fixture(({ show, at }) => {
  show.start(0); show.setPaused(true, 0);
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1);
  show.rotate('mill', q, 0); show.rotate('lathe', q, 500); show.rotate('laser', q, 1000);
  show.select('lathe', 1400);
  assert.deepEqual(show.state().machines.map(m => m.returnAt), [3000, 4400, 4000]);
  at(3000); assert.equal(show.state().machines.find(m => m.id === 'mill').returning, true);
  show.select('laser', 3100);
  assert.equal(show.state().machines.find(m => m.id === 'mill').returning, true);
  assert.equal(show.state().machines.find(m => m.id === 'lathe').returnAt, 4400);
  at(3700); assert.deepEqual(show.rotationOf('mill').toArray(), [0, 0, 0, 1]);
  at(5100); assert.deepEqual(show.rotationOf('lathe').toArray(), [0, 0, 0, 1]);
  close(show.rotationOf('laser').angleTo(q), 0);
  at(6800); assert.deepEqual(show.rotationOf('laser').toArray(), [0, 0, 0, 1]);
  assert.equal(show.nextWakeAt(), null); assert.equal(show.needsFrame(), false);
}));

test('hidden, reduced-motion, replay and disposal do not leave stale restoration work', () => fixture(({ show, at, model }) => {
  show.start(0); show.setPaused(true, 0);
  show.rotate('laser', new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 1));
  show.setViewScale('laser', .6);
  show.setHidden(true, 1000); at(100000); assert.equal(show.nextWakeAt(), null);
  assert.ok(show.rotationOf('laser').angleTo(new Quaternion()) > .9);
  show.setHidden(false, 100000); assert.equal(show.nextWakeAt(), 102000);
  show.setReduced(true, 100001); at(102000);
  assert.deepEqual(show.rotationOf('laser').toArray(), [0, 0, 0, 1]);
  assert.equal(show.state().machines.find(m => m.id === 'laser').viewScale, 1);
  assert.equal(show.needsFrame(), false);
  show.rotate('mill', new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1));
  show.reset(); assert.equal(show.nextWakeAt(), null);
  assert.ok(model.parts.every(p => p.object.scale.x === 1));
  show.dispose(); at(200000); assert.equal(show.needsFrame(), false); assert.equal(show.nextWakeAt(), null);
}));

test('desktop spread only separates the rear slots; changing viewport spread preserves homes, angles and the orbit clock', () => fixture(({ model, show, at }) => {
  const initial = homes(model);
  show.start(0); show.setSpread(1.15);
  const state = show.state();
  for (const machine of state.machines) {
    const center = new Vector3().fromArray(machine.center);
    const slot = TRIANGLE_OFFSETS[TRIANGLE_HOMES[machine.id]];
    close(center.dot(RIGHT), slot[0] * 1.15); close(center.dot(EYE), slot[1]);
  }
  assert.equal(state.nextMoveAt, 5000);
  at(5000); at(5500); const phase = show.state().phase;
  show.setSpread(1); close(show.state().phase, phase);
  assert.equal(show.state().moving, true); assert.deepEqual(homes(model), initial);
}));
