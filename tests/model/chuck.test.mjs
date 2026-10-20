import test from 'node:test';
import assert from 'node:assert/strict';
import { Raycaster, Vector3 } from 'three';
import { createChuck } from '../../site/src/three/chuck-model.js';
import { assemblyPose } from '../../site/src/data/assembly.js';

test('assembled and reassembled chuck have the same complete geometry and open spindle bore', () => {
  const model = createChuck();
  try {
    model.setPose(assemblyPose(0));
    const initial = [];
    model.root.traverse((object) => initial.push(object.matrixWorld.toArray()));
    const axis = new Raycaster(new Vector3(0, 0, 8), new Vector3(0, 0, -1));
    assert.equal(axis.intersectObject(model.root, true).length, 0, 'The spindle bore must pass through the complete chuck');
    for (const value of [.15, .55, .82, .2, 1]) model.setPose(assemblyPose(value));
    const final = [];
    model.root.traverse((object) => final.push(object.matrixWorld.toArray()));
    assert.deepEqual(final, initial, 'Reverse scrubbing and reassembly must not accumulate transform drift');
  } finally { model.dispose(); }
});

test('exploded view separates the covers and jaws, and stays symmetric around the spindle', () => {
  const model = createChuck();
  try {
    model.setPose(assemblyPose(.55));
    const { jaws, rear, fasteners, face, scroll } = model.parts;
    assert.ok(fasteners.position.z < rear.position.z && rear.position.z < 0);
    assert.ok(face.position.z > scroll.position.z && jaws[0].position.z > face.position.z);
    const centroid = jaws.reduce((sum, jaw) => sum.add(jaw.position), new Vector3()).divideScalar(3);
    assert.ok(Math.abs(centroid.x) < 1e-10 && Math.abs(centroid.y) < 1e-10, 'All three jaws must move radially without shifting the spindle axis');
    assert.ok(model.bounds().getSize(new Vector3()).z > 5, 'The assembly must have real depth separation');
  } finally { model.dispose(); }
});

test('machined parts have finite geometry, normals, UVs, and metallic reflection surfaces', () => {
  const model = createChuck();
  try {
    let meshes = 0;
    model.root.traverse((object) => {
      if (!object.isMesh) return;
      meshes++;
      for (const name of ['position', 'normal', 'uv']) {
        const attribute = object.geometry.getAttribute(name);
        assert.ok(attribute, object.name + ' requires ' + name);
        assert.ok(attribute.array.every(Number.isFinite));
      }
    });
    assert.ok(meshes > 0 && meshes <= 40, 'Static surfaces should stay batched within a mobile draw-call budget');
    for (const material of Object.values(model.materials)) {
      assert.equal(material.metalness, 1);
      assert.ok(material.roughness >= .15 && material.roughness <= .4);
      assert.ok(material.bumpMap && material.roughnessMap, 'Machining texture must affect the actual PBR material');
      assert.equal(material.roughnessMap.generateMipmaps, true, 'Texture filtering must avoid distant surface shimmer');
    }
    assert.notEqual(model.materials.face.roughness, model.materials.polished.roughness);
  } finally { model.dispose(); }
});

test('pose endpoints are bounded and continuous through opening, hold and closing', () => {
  assert.deepEqual(assemblyPose(-10), assemblyPose(0));
  assert.deepEqual(assemblyPose(Infinity), assemblyPose(0));
  assert.deepEqual(assemblyPose(10), assemblyPose(1));
  let previous = assemblyPose(0);
  for (let index = 1; index <= 1000; index++) {
    const pose = assemblyPose(index / 1000);
    for (const key of ['spread', 'jaw', 'cover', 'scroll']) {
      assert.ok(pose[key] >= 0 && pose[key] <= 1);
      assert.ok(Math.abs(pose[key] - previous[key]) < .02, 'Scrubbing must not jump between states');
    }
    previous = pose;
  }
  assert.equal(assemblyPose(.55).spread, 1);
  assert.equal(assemblyPose(0).spread, 0);
  assert.equal(assemblyPose(1).spread, 0);
});
