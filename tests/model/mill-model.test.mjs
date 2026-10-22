import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, MathUtils, PerspectiveCamera, Raycaster, Vector3 } from 'three';
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

test('endmill has exposed helical cutting edges, an inserted shank and actual table clearance', () => {
  const mill = createMill();
  try {
    const cutter = mill.parts.find((part) => part.id === 'endmill');
    const collet = new Box3().setFromObject(mill.parts.find((part) => part.id === 'collet').object);
    const table = new Box3().setFromObject(mill.parts.find((part) => part.id === 'table').object);
    const flute = cutter.object.children.find((object) => object.userData.toolSection === 'cutting-end');
    const shank = cutter.object.children.find((object) => object.userData.toolSection === 'shank');
    assert.ok(flute && shank);
    const cuttingBounds = new Box3().setFromObject(flute);
    const shankBounds = new Box3().setFromObject(shank);
    const cuttingSize = cuttingBounds.getSize(new Vector3());
    assert.ok(cuttingSize.x >= .32 && cuttingSize.x <= .36, 'flutes need a readable overview silhouette');
    assert.ok(cuttingSize.y >= .40, 'cutting length must remain exposed');
    assert.ok(cuttingBounds.max.y < collet.min.y - .1, 'cutting edges stay outside the collet');
    assert.ok(cuttingBounds.min.y > table.max.y + .15, 'cutting edges must not intersect the table');
    assert.ok(shankBounds.max.y > collet.min.y + .15, 'shank must visibly enter its holder');
    assert.ok(shankBounds.max.y <= collet.max.y, 'shank insertion must stop within the holder');
    assert.ok(shankBounds.min.y < cuttingBounds.max.y, 'shank and cutting end must stay connected');
    for (const object of cutter.object.children) assert.equal(object.material.depthTest, true);
    assert.equal(mill.parts.length, 34);
    assert.deepEqual(mill.parts.filter((part) => part.object.userData.isCover).map((part) => part.id).sort(),
      ['belt-cover', 'belt-housing', 'head-shell', 'quill']);
  } finally { mill.dispose(); }
});

function fittedOverviewCamera(root, width, height) {
  // Exercise the same final overview direction and fit margins used by the
  // preview, including the farther camera needed by a narrow phone viewport.
  const bounds = new Box3().setFromObject(root);
  const target = bounds.getCenter(new Vector3());
  const camera = new PerspectiveCamera(36, width / height, .08, 200);
  const eye = new Vector3(11, 4.5, 14).normalize();
  camera.position.copy(target).addScaledVector(eye, 20);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const tangent = Math.tan(MathUtils.degToRad(camera.fov / 2));
  let distance = 0;
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
    const point = new Vector3(x ? bounds.max.x : bounds.min.x, y ? bounds.max.y : bounds.min.y, z ? bounds.max.z : bounds.min.z).sub(target);
    distance = Math.max(distance, point.dot(eye) + Math.abs(point.dot(right)) / (tangent * camera.aspect * .84),
      point.dot(eye) + Math.abs(point.dot(up)) / (tangent * (width < 600 ? .66 : .73)));
  }
  camera.position.copy(target).addScaledVector(eye, Math.max(15, distance));
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return camera;
}

for (const [width, height] of [[1280, 800], [375, 812]]) {
  test(`assembled cutting edges remain first visible geometry from the ${width}px preview camera`, () => {
    const mill = createMill();
    try {
      const camera = fittedOverviewCamera(mill.root, width, height);
      const cutter = mill.parts.find((part) => part.id === 'endmill');
      for (const heightOffset of [-.25, -.18, -.12]) {
        const point = cutter.homePosition.clone().add(new Vector3(0, heightOffset, 0));
        const ray = new Raycaster(camera.position, point.sub(camera.position).normalize());
        const first = ray.intersectObject(mill.root, true)[0];
        assert.ok(first, 'ray towards each cutting-edge sample must hit real geometry');
        let owner = first.object;
        while (owner && !owner.userData.partId) owner = owner.parent;
        assert.equal(owner?.userData.partId, 'endmill', 'no housing, table or other part may hide the cutting end');
        assert.equal(first.object.userData.toolSection, 'cutting-end');
      }
      const left = cutter.homePosition.clone().add(new Vector3(-.165, -.14, 0)).project(camera);
      const right = cutter.homePosition.clone().add(new Vector3(.165, -.14, 0)).project(camera);
      assert.ok(Math.abs(right.x - left.x) * width / 2 >= 8, 'blade width needs at least 8 CSS pixels in the final overview');
    } finally { mill.dispose(); }
  });
}

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
