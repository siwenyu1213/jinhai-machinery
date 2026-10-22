import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { createMill } from '../../demos/mill-assembly/model.js';

test('mill has independent, named assembly components and immutable home-pose snapshots', () => {
  const mill = createMill();
  try {
    assert.ok(mill.parts.length >= 28 && mill.parts.length <= 36);
    assert.equal(new Set(mill.parts.map((part) => part.id)).size, mill.parts.length);
    assert.deepEqual(mill.root.position.toArray(), [0, 0, 0]);
    assert.deepEqual(mill.root.scale.toArray(), [1, 1, 1]);
    for (const id of ['base', 'column', 'knee', 'saddle', 'table', 'turret', 'ram', 'spindle', 'quill', 'motor', 'endmill']) {
      assert.ok(mill.parts.find((part) => part.id === id), `${id} must be present`);
    }
    for (const part of mill.parts) {
      assert.equal(part.object.parent, mill.root);
      assert.ok(part.label.length > 0);
      assert.ok(Number.isInteger(part.phase) && part.phase >= 0 && part.phase <= 5);
      assert.ok(part.object.position.equals(part.homePosition));
      assert.ok(part.object.quaternion.equals(part.homeQuaternion));
      const home = part.homePosition.clone();
      part.object.position.x += 15;
      assert.ok(part.homePosition.equals(home), 'saved home must not alias the live position');
      part.object.position.copy(home);
    }
  } finally { mill.dispose(); }
});

test('assembled mill has finite detailed geometry, no textures, and proportionate machine bounds', () => {
  const mill = createMill();
  try {
    let meshes = 0;
    mill.root.traverse((object) => {
      if (!object.isMesh) return;
      meshes++;
      const positions = object.geometry.attributes.position;
      for (const coordinate of positions.array) assert.ok(Number.isFinite(coordinate));
      assert.equal(object.material.map, null);
      assert.equal(object.material.normalMap, null);
      assert.equal(object.material.roughnessMap, null);
    });
    assert.ok(meshes > 150, 'slots, handwheels, fins and screw ridges must be actual geometry');
    const bounds = new Box3().setFromObject(mill.root);
    const size = bounds.getSize(new Vector3());
    assert.ok(size.y > 8 && size.y < 9.2, `height ${size.y}`);
    assert.ok(size.x > 7 && size.x < 8.5, `width including handwheels ${size.x}`);
    assert.ok(bounds.min.y >= -.02, 'base must sit at ground level');
    const table = mill.parts.find((part) => part.id === 'table');
    const tableBounds = new Box3().setFromObject(table.object);
    assert.ok(tableBounds.getSize(new Vector3()).x > 6);
    const spindle = mill.parts.find((part) => part.id === 'spindle');
    assert.ok(spindle.homePosition.z >= tableBounds.min.z && spindle.homePosition.z <= tableBounds.max.z,
      'the spindle axis must be over the working surface');
    const cutter = mill.parts.find((part) => part.id === 'endmill');
    assert.ok(new Box3().setFromObject(cutter.object).min.y > tableBounds.max.y,
      'the resting cutter must have clearance above the table');
  } finally { mill.dispose(); }
});

test('mill disposal releases every unique geometry and material exactly once', () => {
  const mill = createMill();
  const resources = new Set();
  mill.root.traverse((object) => {
    if (object.isMesh) { resources.add(object.geometry); resources.add(object.material); }
  });
  const counts = new Map();
  for (const resource of resources) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  }
  mill.dispose();
  mill.dispose();
  assert.equal(mill.root.children.length, 0);
  for (const count of counts.values()) assert.equal(count, 1);
});
