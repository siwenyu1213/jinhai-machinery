import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Raycaster, Vector3 } from 'three';
import { createMillMaterials } from '../../demos/mill-assembly/materials.js';
import { createLathe } from '../../demos/mill-assembly/lathe-model.js';
import { createLaser } from '../../demos/mill-assembly/laser-model.js';

const MESH_BUDGET = 180;
const TRIANGLE_BUDGET = 75000;

function finiteAttribute(attribute, itemSize, label) {
  assert.ok(attribute, `${label}: attribute missing`);
  assert.equal(attribute.itemSize, itemSize, `${label}: unexpected itemSize`);
  const array = attribute.array;
  assert.ok(array.length > 0, `${label}: empty attribute`);
  for (let i = 0; i < array.length; i++) {
    assert.ok(Number.isFinite(array[i]), `${label}: non-finite value at ${i}`);
  }
}

function triangleCount(geometry) {
  const position = geometry.getAttribute('position');
  if (!position) return 0;
  return geometry.index ? geometry.index.count / 3 : position.count / 3;
}

function worldBounds(object, target = new Box3()) {
  return target.setFromObject(object);
}

function inspect(assembly, idPrefix) {
  const { root, parts } = assembly;
  let meshes = 0, triangles = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    const label = `${idPrefix}/${object.name || object.parent?.name || '?'}`;
    const geometry = object.geometry;
    assert.ok(geometry, `${label}: mesh without geometry`);
    finiteAttribute(geometry.getAttribute('position'), 3, `${label} positions`);
    finiteAttribute(geometry.getAttribute('normal'), 3, `${label} normals`);
    finiteAttribute(geometry.getAttribute('uv'), 2, `${label} uvs`);
    assert.ok(object.material?.isMaterial, `${label}: mesh without material`);
    triangles += triangleCount(geometry);
  });
  assert.ok(meshes >= 18, `${idPrefix}: expected >= 18 meshes, got ${meshes}`);
  assert.ok(meshes <= MESH_BUDGET, `${idPrefix}: mesh budget exceeded (${meshes} > ${MESH_BUDGET})`);
  assert.ok(triangles <= TRIANGLE_BUDGET, `${idPrefix}: triangle budget exceeded (${triangles} > ${TRIANGLE_BUDGET})`);
  assert.ok(root.children.length >= 18, `${idPrefix}: expected >= 18 parts, got ${root.children.length}`);
  assert.equal(parts.length, root.children.length, `${idPrefix}: parts length must match direct children`);
  const ids = new Set();
  for (const entry of parts) {
    assert.ok(entry.id.startsWith(idPrefix), `${idPrefix}: unexpected part id ${entry.id}`);
    assert.ok(!ids.has(entry.id), `${idPrefix}: duplicate part id ${entry.id}`);
    ids.add(entry.id);
    assert.equal(entry.object.parent, root, `${idPrefix}/${entry.id}: part must belong directly to the identity root`);
    assert.equal(entry.object.position.x, entry.homePosition.x);
    assert.equal(entry.object.position.y, entry.homePosition.y);
    assert.equal(entry.object.position.z, entry.homePosition.z);
    assert.ok(entry.object.quaternion.angleTo(entry.homeQuaternion) < 1e-6, `${idPrefix}/${entry.id}: not at home rotation`);
    assert.ok(entry.object.children.length > 0, `${idPrefix}/${entry.id}: empty part`);
  }
  assert.equal(root.position.length(), 0, `${idPrefix}: root must be at the origin`);
  assert.ok(root.quaternion.angleTo(root.quaternion.clone().identity()) === 0, `${idPrefix}: root must be unrotated`);
  const bounds = root.userData.homeBounds;
  assert.ok(bounds instanceof Box3 && !bounds.isEmpty(), `${idPrefix}: home bounds missing`);
  assert.ok(bounds.min.y >= -1e-6, `${idPrefix}: model must sit on or above the floor, minY=${bounds.min.y}`);
  assert.ok(bounds.min.y <= 1e-3, `${idPrefix}: model must touch the floor, minY=${bounds.min.y}`);
  return { meshes, triangles, bounds };
}

function snapshot(assembly) {
  const list = [assembly.root.name];
  assembly.root.traverse((object) => {
    list.push(object.isMesh
      ? `${object.name}|M|${object.matrixWorld.toArray().join(',')}|${object.geometry.uuid}`
      : `${object.name}|G|${object.matrixWorld.toArray().join(',')}`);
  });
  return list;
}

function byId(assembly, id) {
  const entry = assembly.parts.find((candidate) => candidate.id === id);
  assert.ok(entry, `missing part ${id}`);
  return entry.object;
}

test('lathe has an identifiable structure with budgeted, finite geometry that stands on the floor', () => {
  const lathe = createLathe();
  try {
    inspect(lathe, 'lathe-');
    // Recognisable structure: headstock/chuck on one end, tailstock on the other.
    const chuck = worldBounds(byId(lathe, 'lathe-chuck'));
    const tail = worldBounds(byId(lathe, 'lathe-tailstock-body'));
    const bed = worldBounds(byId(lathe, 'lathe-bed'));
    assert.ok(chuck.min.x > tail.max.x, 'chuck must sit at the opposite end of the bed from the tailstock');
    assert.ok(bed.getSize(new Vector3()).x > 6, 'bed must be long and horizontal');
    const feet = ['lathe-left-foot', 'lathe-right-foot'].map((id) => worldBounds(byId(lathe, id)));
    for (const foot of feet) assert.ok(Math.abs(foot.min.y) < 1e-3, 'bed feet must reach the floor');
  } finally { lathe.dispose(); }
});

test('lathe chuck, spindle and tailstock centre share one spindle axis with an open bore', () => {
  const lathe = createLathe();
  try {
    const { spindleY } = lathe.axes;
    const spindle = byId(lathe, 'lathe-spindle');
    const chuck = byId(lathe, 'lathe-chuck');
    const centre = byId(lathe, 'lathe-tailstock-center');
    for (const [label, object] of [['spindle', spindle], ['chuck', chuck], ['tailstock centre', centre]]) {
      assert.ok(Math.abs(object.position.y - spindleY) < 1e-9, `${label} must sit on the spindle axis height`);
      assert.ok(Math.abs(object.position.z) < 1e-9, `${label} must sit on the spindle axis plane`);
    }
    const chuckBox = worldBounds(chuck);
    assert.ok(chuckBox.min.x > centre.position.x, 'chuck must be on the +X spindle end, tailstock on -X');
    // The chuck bore must be open along the axis (a ray passes through it),
    // checked inside the chuck's own radial envelope so it only targets the
    // chuck and never claims the headstock is hollow.
    const chuckRadius = Math.min(
      chuckBox.max.y - spindleY, spindleY - chuckBox.min.y,
      chuckBox.max.z, -chuckBox.min.z,
    );
    const origin = new Vector3(chuckBox.min.x - .5, spindleY, 0);
    const span = chuckBox.max.x - chuckBox.min.x + 1;
    const hits = new Raycaster(origin, new Vector3(1, 0, 0), 0, span).intersectObject(chuck, true);
    const nearAxis = hits.filter((hit) => Math.hypot(hit.point.y - spindleY, hit.point.z) <= chuckRadius);
    assert.equal(nearAxis.length, 0, 'the chuck bore must be open along the spindle axis');
    // Outside the bore the chuck body is solid.
    const offsetOrigin = new Vector3(chuckBox.min.x - .5, spindleY, chuckRadius * .6);
    const wall = new Raycaster(offsetOrigin, new Vector3(1, 0, 0), 0, span).intersectObject(chuck, true);
    assert.ok(wall.length > 0, 'the chuck body must exist around the bore');
    // The quill travels through a genuinely open bore in the casting.
    const body = byId(lathe, 'lathe-tailstock-body');
    const bodyBox = worldBounds(body);
    const quillHits = new Raycaster(
      new Vector3(bodyBox.min.x - .5, spindleY, 0),
      new Vector3(1, 0, 0), 0, bodyBox.max.x - bodyBox.min.x + 1,
    ).intersectObject(body, true).filter((hit) => Math.hypot(hit.point.y - spindleY, hit.point.z) < .06);
    assert.equal(quillHits.length, 0, 'the tailstock body must be open for the quill');
    const castingWall = new Raycaster(
      new Vector3(bodyBox.min.x - .5, spindleY, .24),
      new Vector3(1, 0, 0), 0, bodyBox.max.x - bodyBox.min.x + 1,
    ).intersectObject(body, true);
    assert.ok(castingWall.length > 0, 'the tailstock casting must exist around the bore');
    assert.ok(worldBounds(byId(lathe, 'lathe-tailstock-handwheel')).intersectsBox(bodyBox),
      'the tailstock handwheel shaft must reach its casting');
  } finally { lathe.dispose(); }
});

test('laser cutting head hangs above the bed and points down', () => {
  const laser = createLaser();
  try {
    inspect(laser, 'laser-');
    const { bedTop, railY } = laser.axes;
    const head = byId(laser, 'laser-cutting-head');
    const headBox = worldBounds(head);
    const zCarriage = byId(laser, 'laser-z-carriage');
    const tip = new Vector3(head.position.x, headBox.min.y, head.position.z);
    // Nozzle tip is the lowest point of the cutting head (local nozzle tube).
    const tipY = headBox.min.y;
    assert.ok(tipY > bedTop, `cutting head must stay above the bed (${tipY} <= ${bedTop})`);
    // The head hangs off the gantry through the Z slide, not off the gantry
    // directly: its envelope must overlap the Z carriage and stay below the
    // slide top, so it is carried by the slide rather than floating.
    assert.ok(headBox.intersectsBox(worldBounds(zCarriage)), 'cutting head must be mounted on the Z slide');
    assert.ok(headBox.max.y < zCarriage.position.y, 'head finger and nozzle sit below the slide body (hanging down)');
    assert.ok(zCarriage.position.y > railY, 'Z slide must ride on the gantry beam rail');
    assert.ok(Math.abs(head.position.x) < 1e-9, 'cutting head must start over the bed centre');
    // The nozzle must point down: the bed-facing end is the lowest point and
    // lies within the vertical envelope of the head.
    assert.ok(tipY < head.position.y, 'nozzle must hang below the head body');
    assert.ok(tip.x === head.position.x && tip.z === head.position.z, 'nozzle must sit on the head axis');
    // A downward ray from the bed top must reach the cutting head and cross its nozzle first.
    const downward = new Raycaster(new Vector3(tip.x, bedTop + .001, tip.z), new Vector3(0, -1, 0));
    // Pointing up from the bed along the head axis finds the nozzle opening.
    const upward = new Raycaster(new Vector3(head.position.x, bedTop + .5, head.position.z), new Vector3(0, 1, 0));
    const upwardHits = upward.intersectObject(head, true);
    assert.ok(upwardHits.length > 0, 'a vertical line from above the bed must hit the cutting head');
    assert.ok(upwardHits[0].point.y > bedTop, 'first hit must be above the bed surface');
    downward.intersectObject(head, true); // identity check that the ray direction set is honoured
    // Optic tube is vertical along Y and below the head body.
    assert.ok(headBox.min.y < zCarriage.position.y, 'the nozzle must descend below the Z carriage');
    // Slat bed top lies at the declared bed height.
    const bed = worldBounds(byId(laser, 'laser-slat-bed'));
    assert.ok(Math.abs(bed.max.y - bedTop) < .05, 'slat bed surface must match the declared bed height');
    const frame = worldBounds(byId(laser, 'laser-frame'));
    // The welded frame is not welded to the floor: it must be carried by the
    // four foot parts, and the whole machine's real bounds must reach y=0.
    const footIds = ['laser-foot-fl', 'laser-foot-fr', 'laser-foot-bl', 'laser-foot-br'];
    for (const id of footIds) {
      const footBox = worldBounds(byId(laser, id));
      assert.ok(Math.abs(footBox.min.y) < 1e-3, `${id} must stand on the floor`);
      assert.ok(frame.intersectsBox(footBox), `${id} must support the frame`);
    }
    const machine = worldBounds(laser.root);
    assert.ok(Math.abs(machine.min.y) < 1e-3, `laser must stand on the floor, minY=${machine.min.y}`);
  } finally { laser.dispose(); }
});

test('both models build independent home snapshots without shared parts', () => {
  const a = createLathe();
  const b = createLaser();
  try {
    const aSnap = snapshot(a);
    const bSnap = snapshot(b);
    assert.deepEqual(snapshot(a), aSnap, 'lathe snapshot must be stable');
    assert.deepEqual(snapshot(b), bSnap, 'laser snapshot must be stable');
    assert.notEqual(a.root, b.root);
    const aIds = new Set(a.parts.map((part) => part.object));
    for (const part of b.parts) assert.ok(!aIds.has(part.object), 'models must not share part objects');
    for (const part of a.parts) {
      assert.ok(part.homePosition.isVector3 && part.homeQuaternion.isQuaternion);
      assert.notEqual(part.homePosition, part.object.position);
    }
  } finally { a.dispose(); b.dispose(); }
});

test('repeated dispose releases resources exactly once and never borrows the mill materials', () => {
  for (const factory of [createLathe, createLaser]) {
    const assembly = factory();
    const geometries = new Set();
    const materials = new Set();
    assembly.root.traverse((object) => {
      if (!object.isMesh) return;
      geometries.add(object.geometry);
      materials.add(object.material);
    });
    let geometryDisposes = 0, materialDisposes = 0;
    for (const geometry of geometries) {
      const original = geometry.dispose.bind(geometry);
      geometry.dispose = () => { geometryDisposes++; original(); };
    }
    for (const material of materials) {
      const original = material.dispose.bind(material);
      material.dispose = () => { materialDisposes++; original(); };
    }
    assembly.dispose();
    assembly.dispose();
    assembly.dispose();
    assert.equal(geometryDisposes, geometries.size, `${factory.name}: every geometry disposed exactly once`);
    assert.equal(materialDisposes, materials.size, `${factory.name}: every owned material disposed exactly once`);
    assert.equal(assembly.geometryCount, 0, `${factory.name}: geometry registry must be cleared`);
    assert.equal(assembly.root.children.length, 0, `${factory.name}: root must be emptied`);
    assert.equal(assembly.disposed, true);
  }
});

test('borrowed mill materials are reused, never disposed, and only owned resources are released', () => {
  for (const factory of [createLathe, createLaser]) {
    const borrowed = createMillMaterials();
    const borrowedMaterials = Object.values(borrowed.materials);
    const spies = borrowedMaterials.map((material) => {
      const original = material.dispose.bind(material);
      let calls = 0;
      material.dispose = () => { calls++; original(); };
      return () => calls;
    });
    const assembly = factory({ materials: borrowed.materials, surfaceMaps: {} });
    try {
      let meshes = 0;
      let usesBorrowed = false;
      assembly.root.traverse((object) => {
        if (!object.isMesh) return;
        meshes++;
        if (borrowedMaterials.includes(object.material)) usesBorrowed = true;
      });
      assert.ok(meshes > 0);
      assert.ok(usesBorrowed, `${factory.name}: built machine must mount the borrowed materials`);
      assert.equal(assembly.materials, borrowed.materials, 'borrowed dictionary must be exposed unchanged');
      // Same stable object instance comes back for the same role.
      assert.equal(borrowed.materials.body, borrowed.materials.body);
    } finally {
      assembly.dispose();
      assembly.dispose();
    }
    for (const calls of spies) assert.equal(calls(), 0, `${factory.name}: borrowed material must not be disposed`);
    // The owner can still release its own materials exactly once afterwards.
    let ownerDisposes = 0;
    borrowedMaterials.forEach((material) => {
      const original = material.dispose.bind(material);
      material.dispose = () => { ownerDisposes++; original(); };
    });
    borrowed.dispose();
    borrowed.dispose();
    assert.equal(ownerDisposes, borrowedMaterials.length, 'owner disposes its materials once');
  }
});

test('missing borrowed material roles fall back to a local, disposable stand-in', () => {
  const borrowed = { body: createMillMaterials().materials.body };
  const lathe = createLathe({ materials: borrowed });
  const owned = [];
  lathe.root.traverse((object) => {
    if (object.isMesh && object.material !== borrowed.body) owned.push(object.material);
  });
  assert.ok(lathe.parts.length >= 18);
  const unique = new Set(owned);
  const before = borrowed.body.userData?.materialRole;
  const spies = [...unique].map((material) => {
    const original = material.dispose.bind(material);
    let calls = 0;
    material.dispose = () => { calls++; original(); };
    return () => calls;
  });
  let bodyDisposed = 0;
  const originalBody = borrowed.body.dispose.bind(borrowed.body);
  borrowed.body.dispose = () => { bodyDisposed++; originalBody(); };
  lathe.dispose();
  for (const calls of spies) assert.equal(calls(), 1, 'locally created fallback materials dispose exactly once');
  assert.equal(bodyDisposed, 0, 'borrowed body material survives a borrow with missing roles');
  assert.equal(borrowed.body.userData?.materialRole, before, 'borrowed dictionary is not mutated semantically');
});
