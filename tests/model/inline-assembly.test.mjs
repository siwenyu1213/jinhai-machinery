import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';
import { createWorkshop } from '../../demos/mill-assembly/workshop-model.js';
import { createWorkshopFlight } from '../../demos/mill-assembly/workshop-motion.js';
import { arrangeAssemblyRow, ASSEMBLY_EYE, ASSEMBLY_RIGHT, boxCorners } from '../../site/src/three/machine-assembly-layout.js';
import { assemblyScrollRange, assemblyTimeline, dampAssemblyScroll, equipmentLetterPose, letterPose } from '../../site/src/motion/assembly-timeline.js';

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
  assert.equal(assemblyTimeline(.165).flightScroll, 0);
  assert.ok(assemblyTimeline(.3).flightScroll > 0);
  assert.equal(assemblyTimeline(.522).flightScroll, 1);
  assert.equal(assemblyTimeline(.5175).captions, 0);
  assert.equal(assemblyTimeline(.5925).captions, 1);
  assert.equal(assemblyTimeline(.5925).models, 1);
  assert.equal(assemblyTimeline(2).progress, 1);
});
test('the clock starts as the section enters, and departure waits for the complete captions', () => {
  const { lead, length } = assemblyScrollRange(900, 4500);
  const entering = (lead - 400) / length;
  assert.ok(entering > 0 && letterPose(entering, 0, { x: 0, y: 0 }, { x: 0, y: 0 }, 100, 40).opacity > 0);
  assert.equal(assemblyTimeline(.60).departure, 0);
  const middle = assemblyTimeline(.675);
  assert.ok(middle.models > 0 && middle.models < 1);
  assert.ok(middle.captions > 0 && middle.captions < 1);
  assert.equal(assemblyTimeline(1).models, 0); assert.equal(assemblyTimeline(1).captions, 0);
  assert.equal(assemblyTimeline(1).flightScroll, 1);
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
  for (const t of [.23, .27, .36, .45, .5]) {
    const pose = at(t), x = (pose.x - end.x) / (start.x - end.x), y = (pose.y - start.y) / (end.y - start.y);
    assert.ok(Math.abs(x * x + y * y - 1) < 1e-10);
  }
  const speed = t => Math.hypot(at(t + .001).x - at(t).x, at(t + .001).y - at(t).y);
  assert.ok(speed(.36) > speed(.23) * 10 && speed(.36) > speed(.5) * 10);
  assert.equal(at(.22).travel, 0); assert.equal(at(.52).travel, 1);
  assert.ok(Math.abs(at(1).x - end.x) < 1e-7); assert.equal(at(1).y, end.y);
  assert.ok(letterPose(.4, 1, start, end, 140, 48).travel < at(.4).travel);
  assert.equal(at(.22).opacity, 1);
});
test('letters grow and change wording during the return arc, with deterministic reverse poses', () => {
  const start = { x: 600, y: 600 }, end = { x: 60, y: 150 }, outro = { x: 500, y: 440, size: 100 };
  const at = t => letterPose(t, 3, start, end, 140, 48, outro);
  assert.equal(at(.80).returnTravel, 0); assert.equal(at(.80).morph, 0);
  const middle = at(.9);
  assert.ok(middle.x > end.x && middle.x < outro.x && middle.y > end.y && middle.y < outro.y);
  assert.ok(middle.morph > 0 && middle.morph < 1 && middle.scale > 1);
  assert.ok(middle.beforeOpacity < .05 && middle.afterOpacity > .05);
  const final = at(1);
  assert.ok(Math.abs(final.x - outro.x) < 1e-7 && Math.abs(final.y - outro.y) < 1e-7);
  assert.equal(final.morph, 1); assert.equal(final.scale, 100 / 48);
  for (const t of [.9, .85, .96, 1]) at(t);
  assert.deepEqual(at(.9), middle);
});
test('the interlude has a long hold and a fixed landing before the document handoff', () => {
  for (const value of [.75, .8, .86]) {
    const state = assemblyTimeline(value);
    assert.equal(state.content, 1); assert.equal(state.transfer, 0); assert.equal(state.phase, 'title-hold');
    assert.equal(state.models, 0); assert.equal(state.captions, 0);
  }
  const start = { x: 600, y: 420, size: 100 }, end = { x: 80, y: 720, size: 48 };
  const at = value => equipmentLetterPose(assemblyTimeline(value).transfer, 0, start, end, 48);
  assert.equal(at(.86).y, start.y);
  assert.ok(at(.94).y > start.y && at(.94).y < end.y);
  assert.equal(at(1).x, end.x); assert.equal(at(1).y, end.y); assert.equal(at(1).scale, 1);
  assert.equal(at(1).beforeOpacity, 0); assert.equal(at(1).afterOpacity, 1);
  assert.deepEqual(at(.98), at(.999));
  const range = assemblyScrollRange(900, 5400);
  assert.equal(range.tail, 405);
  assert.ok((.87 - .75) * range.length > 700);
});
