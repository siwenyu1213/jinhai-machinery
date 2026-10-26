import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';
import { createWorkshop } from '../../demos/mill-assembly/workshop-model.js';
import { createWorkshopFlight } from '../../demos/mill-assembly/workshop-motion.js';
import { arrangeAssemblyRow, ASSEMBLY_EYE, ASSEMBLY_RIGHT, boxCorners } from '../../site/src/three/machine-assembly-layout.js';
import { assemblyTimeline, dampAssemblyScroll, letterPose } from '../../site/src/motion/assembly-timeline.js';

test('the homepage row places all three machines on the floor in reading order without intersecting slots', () => {
  const model = arrangeAssemblyRow(createWorkshop());
  assert.deepEqual(model.machines.map(machine => machine.id), ['mill', 'lathe', 'laser']);
  const slots = model.machines.map(machine => {
    assert.ok(Math.abs(machine.homeBounds.min.y) < 1e-7);
    const x = boxCorners(machine.homeBounds).map(point => point.dot(ASSEMBLY_RIGHT));
    return [Math.min(...x), Math.max(...x)];
  });
  assert.ok(slots[0][1] < slots[1][0] && slots[1][1] < slots[2][0]);
  const homes = model.parts.map(part => part.homePosition.clone());
  const camera = new PerspectiveCamera(35, 2, .1, 180); camera.position.copy(ASSEMBLY_EYE).multiplyScalar(50); camera.lookAt(new Vector3(0, 3, 0)); camera.updateMatrixWorld(true);
  const flight = createWorkshopFlight(model.parts);
  for (const value of [.94, .12, .74, .3, .94]) flight.apply(value, camera);
  assert.equal(flight.getState().assembledCount, 91);
  model.parts.forEach((part, index) => { assert.ok(part.object.position.equals(homes[index])); assert.ok(part.homePosition.equals(homes[index])); assert.ok(part.object.visible); });
  model.dispose();
});
test('the title flight overlaps model arrival and captions wait for all model travel', () => {
  assert.equal(assemblyTimeline(.22).flightScroll, 0);
  assert.ok(assemblyTimeline(.4).flightScroll > 0);
  assert.equal(assemblyTimeline(.89).flightScroll, 1);
  assert.equal(assemblyTimeline(.89).captions, 0);
  assert.equal(assemblyTimeline(1).captions, 1);
  assert.equal(assemblyTimeline(2).progress, 1);
});
test('scroll inertia continues after input and follows the same clock at different frame rates', () => {
  const simulate = fps => { let value = 0; for (let i = 0; i < fps; i++) value = dampAssemblyScroll(value, 1, 1 / fps); return value; };
  assert.ok(Math.abs(simulate(30) - simulate(120)) < 1e-12);
  const first = dampAssemblyScroll(0, 1, .1), second = dampAssemblyScroll(first, 1, .1);
  assert.ok(first > 0 && first < second && second < 1);
  assert.equal(dampAssemblyScroll(1, 1, .1), 1);
});
test('each letter follows a quarter ellipse with an obvious acceleration peak and converges exactly', () => {
  const start = { x: 600, y: 600 }, end = { x: 60, y: 150 };
  const at = t => letterPose(t, 0, start, end, 140, 48);
  for (const t of [.24, .3, .4, .5, .58]) {
    const pose = at(t), x = (pose.x - end.x) / (start.x - end.x), y = (pose.y - start.y) / (end.y - start.y);
    assert.ok(Math.abs(x * x + y * y - 1) < 1e-10);
  }
  const speed = t => Math.hypot(at(t + .001).x - at(t).x, at(t + .001).y - at(t).y);
  assert.ok(speed(.4) > speed(.24) * 10 && speed(.4) > speed(.58) * 10);
  assert.equal(at(.22).travel, 0); assert.equal(at(.6).travel, 1);
  assert.ok(Math.abs(at(1).x - end.x) < 1e-7); assert.equal(at(1).y, end.y);
  assert.ok(letterPose(.4, 1, start, end, 140, 48).travel < at(.4).travel);
  assert.equal(at(.22).opacity, 1);
});
