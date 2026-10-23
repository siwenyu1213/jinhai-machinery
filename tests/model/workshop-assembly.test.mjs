import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Quaternion, Vector3 } from 'three';
import { createWorkshop, EYE, LAYOUT_OFFSETS, RIGHT, WORKSHOP_SCALE } from '../../demos/mill-assembly/workshop-model.js';
import { WORKSHOP_PALETTES } from '../../demos/mill-assembly/workshop-palette.js';
import { createMill } from '../../demos/mill-assembly/model.js';
import { createLathe } from '../../demos/mill-assembly/lathe-model.js';
import { createLaser } from '../../demos/mill-assembly/laser-model.js';

const EPS = 1e-6;
const LAYOUTS = ['wide', 'compact'];
const FACTORIES = [['mill', createMill], ['lathe', createLathe], ['laser', createLaser]];
const ROW = { mill: new Vector3(0, 0, 0), lathe: RIGHT.clone().multiplyScalar(-9), laser: RIGHT.clone().multiplyScalar(9) };
const PAINT_ROLES = ['body', 'bodyLight', 'motorPaint'];

function machineOf(workshop, id) {
  const machine = workshop.machines.find((candidate) => candidate.id === id);
  assert.ok(machine, `missing machine ${id}`);
  return machine;
}

function snapshot(workshop) {
  return workshop.parts.map((part) => ({
    id: part.id,
    homePosition: part.homePosition.toArray(),
    homeQuaternion: part.homeQuaternion.toArray(),
    position: part.object.position.toArray(),
    quaternion: part.object.quaternion.toArray(),
    scale: part.object.scale.toArray(),
  }));
}

function spy(object, key) {
  const original = object[key].bind(object);
  const counter = { calls: 0 };
  object[key] = () => { counter.calls++; original(); };
  return counter;
}

function machineBox(machine) {
  const box = new Box3();
  for (const part of machine.parts) box.union(new Box3().setFromObject(part.object));
  return box;
}

// Disjoint in XZ: the Y ranges may overlap, but the footprints may not.
function disjointXZ(a, b) {
  return b.min.x > a.max.x || a.min.x > b.max.x || b.min.z > a.max.z || a.min.z > b.min.z;
}

function meshesOf(workshop) {
  const meshes = [];
  workshop.root.traverse((object) => { if (object.isMesh) meshes.push(object); });
  return meshes;
}

test('workshop holds 34 + 31 + 26 = 91 unique parts directly under an identity root', () => {
  const workshop = createWorkshop();
  try {
    assert.equal(workshop.machines.length, 3);
    assert.deepEqual(workshop.machines.map((machine) => machine.id), ['mill', 'lathe', 'laser']);
    assert.deepEqual(workshop.machines.map((machine) => machine.label), ['铣床', '车床', '激光切割机']);
    assert.deepEqual(workshop.machines.map((machine) => machine.parts.length), [34, 31, 26]);
    assert.equal(workshop.parts.length, 91);
    assert.equal(workshop.root.children.length, 91);
    assert.equal(workshop.root.position.length(), 0);
    assert.equal(workshop.root.quaternion.angleTo(new Quaternion()), 0);
    assert.equal(workshop.root.scale.toArray().join(), '1,1,1');
    const ids = new Set();
    for (const part of workshop.parts) {
      assert.ok(!ids.has(part.id), `duplicate id ${part.id}`);
      ids.add(part.id);
      for (const key of ['id', 'label', 'phase', 'object', 'homePosition', 'homeQuaternion']) {
        assert.notEqual(part[key], undefined, `${part.id}: missing ${key}`);
      }
      assert.equal(part.object.parent, workshop.root, `${part.id}: direct child of root`);
      assert.equal(part.object.name, part.id);
      assert.equal(part.object.userData.partId, part.id);
      assert.equal(part.object.userData.sourceId, part.sourceId);
      assert.equal(part.object.userData.machineId, part.machineId);
      assert.ok(['mill', 'lathe', 'laser'].includes(part.machineId));
      if (part.machineId === 'mill') {
        assert.equal(part.id, `mill-${part.sourceId}`);
        assert.ok(!part.sourceId.startsWith('mill-'), `${part.sourceId}: raw mill id must stay unprefixed`);
      } else {
        assert.equal(part.id, part.sourceId);
        assert.ok(part.id.startsWith(`${part.machineId}-`), `${part.id}: existing prefix kept`);
      }
      // Scale is baked once into the part's direct child transforms.
      const scale = WORKSHOP_SCALE[part.machineId];
      assert.equal(part.object.scale.toArray().join(), '1,1,1', `${part.id}: part scale stays 1`);
      assert.ok(part.object.children.length > 0, `${part.id}: empty part`);
      for (const child of part.object.children) {
        assert.ok(Math.abs(child.scale.x - scale) < EPS, `${part.id}: child scale.x ${child.scale.x} != ${scale}`);
        assert.ok(Math.abs(child.scale.y - scale) < EPS, `${part.id}: child scale.y ${child.scale.y} != ${scale}`);
        assert.ok(Math.abs(child.scale.z - scale) < EPS, `${part.id}: child scale.z ${child.scale.z} != ${scale}`);
      }
    }
    assert.equal(machineOf(workshop, 'mill').parts[0].id, 'mill-base');
    assert.equal(machineOf(workshop, 'lathe').parts.find((p) => p.id === 'lathe-chuck').sourceId, 'lathe-chuck');
    assert.equal(machineOf(workshop, 'laser').parts.find((p) => p.id === 'laser-gantry').machineId, 'laser');
  } finally { workshop.dispose(); }
});

test('part homes are independent snapshots and stay stable', () => {
  const workshop = createWorkshop();
  try {
    const before = snapshot(workshop);
    assert.deepEqual(snapshot(workshop), before);
    for (const part of workshop.parts) {
      assert.notEqual(part.homePosition, part.object.position, `${part.id}: aliased position`);
      assert.notEqual(part.homeQuaternion, part.object.quaternion, `${part.id}: aliased quaternion`);
      assert.deepEqual(part.homePosition.toArray(), part.object.position.toArray());
      part.object.position.set(99, 99, 99);
      part.object.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), .5);
      assert.deepEqual(part.homePosition.toArray(), before.find((entry) => entry.id === part.id).homePosition);
      assert.deepEqual(part.homeQuaternion.toArray(), before.find((entry) => entry.id === part.id).homeQuaternion);
    }
  } finally { workshop.dispose(); }
});

test('both layouts stand the machines in one y=0 row with pairwise disjoint XZ bounds', () => {
  // Raw source bounds per machine; the original mills do not sit exactly on y=0.
  const sourceBounds = {};
  for (const [machineId, factory] of FACTORIES) {
    const assembly = factory();
    try {
      assembly.root.updateMatrixWorld(true);
      sourceBounds[machineId] = new Box3().setFromObject(assembly.root);
    } finally { assembly.dispose(); }
  }
  const workshop = createWorkshop();
  try {
    for (const layout of LAYOUTS) {
      workshop.setLayout(layout);
      assert.deepEqual(LAYOUT_OFFSETS[layout], { mill: [0, 0], lathe: [-9, 0], laser: [9, 0] });
      const boxes = [];
      const centers = {};
      for (const machine of workshop.machines) {
        const scale = WORKSHOP_SCALE[machine.id];
        const expectedGround = -sourceBounds[machine.id].min.y * scale;
        assert.ok(Number.isFinite(machine.groundOffset), `${layout}/${machine.id}: groundOffset missing`);
        assert.ok(Math.abs(machine.groundOffset - expectedGround) < EPS,
          `${layout}/${machine.id}: groundOffset ${machine.groundOffset} != ${expectedGround}`);
        assert.ok(machine.homeBounds instanceof Box3 && !machine.homeBounds.isEmpty(), `${layout}/${machine.id}: bounds`);
        assert.ok(Math.abs(machine.homeBounds.min.y) < EPS, `${layout}/${machine.id}: floor contact minY=${machine.homeBounds.min.y}`);
        assert.ok(machine.homeBounds.min.y >= -EPS, `${layout}/${machine.id}: below floor`);
        assert.ok(machine.homeBounds.containsBox(machineBox(machine)), `${layout}/${machine.id}: homeBounds must cover parts`);
        boxes.push(machine);
        const first = machine.parts[0];
        centers[machine.id] = first.homePosition.clone().sub(first.originalHome.position.clone().multiplyScalar(machine.scale));
      }
      for (let a = 0; a < boxes.length; a++) {
        for (let b = a + 1; b < boxes.length; b++) {
          assert.ok(disjointXZ(boxes[a].homeBounds, boxes[b].homeBounds),
            `${layout}: ${boxes[a].id} overlaps ${boxes[b].id} in XZ`);
        }
      }
      // One horizontal row along RIGHT: same eye depth, ordered lathe/mill/laser
      // in the same order as seen from the camera.
      const eyeDepth = (v) => v.dot(EYE) + 0;
      assert.ok(Math.abs(eyeDepth(centers.mill) - eyeDepth(centers.lathe)) < EPS, `${layout}: lathe depth`);
      assert.ok(Math.abs(eyeDepth(centers.mill) - eyeDepth(centers.laser)) < EPS, `${layout}: laser depth`);
      assert.ok(centers.lathe.dot(RIGHT) < centers.mill.dot(RIGHT), `${layout}: lathe left of mill`);
      assert.ok(centers.mill.dot(RIGHT) < centers.laser.dot(RIGHT), `${layout}: laser right of mill`);
      const union = workshop.root.userData.homeBounds;
      assert.ok(union instanceof Box3 && !union.isEmpty(), `${layout}: root.userData.homeBounds`);
      const expectedUnion = new Box3();
      for (const machine of boxes) expectedUnion.union(machine.homeBounds);
      assert.deepEqual(union.clone(), expectedUnion, `${layout}: union of the three bounds`);
    }
  } finally { workshop.dispose(); }
});

test('layout targets follow the horizontal eye/right frame and every part home matches live pose', () => {
  const workshop = createWorkshop();
  try {
    assert.ok(Math.abs(EYE.x - 11 / Math.hypot(11, 14)) < EPS && Math.abs(EYE.z - 14 / Math.hypot(11, 14)) < EPS);
    assert.ok(Math.abs(RIGHT.x - 14 / Math.hypot(11, 14)) < EPS && Math.abs(RIGHT.z + 11 / Math.hypot(11, 14)) < EPS);
    assert.ok(Math.abs(EYE.y) < EPS && Math.abs(RIGHT.y) < EPS);
    assert.ok(Math.abs(EYE.length() - 1) < EPS && Math.abs(RIGHT.length() - 1) < EPS);
    assert.ok(Math.abs(EYE.dot(RIGHT)) < EPS);
    for (const layout of LAYOUTS) {
      workshop.setLayout(layout);
      for (const machine of workshop.machines) {
        const part = machine.parts[0];
        const offset = part.homePosition.clone()
          .sub(part.originalHome.position.clone().multiplyScalar(WORKSHOP_SCALE[machine.id]));
        offset.y -= machine.groundOffset;
        assert.ok(Math.abs(offset.y) < EPS, `${layout}/${machine.id}: ground stays at y=0 offset`);
        assert.ok(offset.distanceTo(ROW[machine.id]) < EPS,
          `${layout}/${machine.id}: offset ${offset.toArray()} != ${ROW[machine.id].toArray()}`);
        for (const entry of machine.parts) {
          assert.ok(entry.object.position.x === entry.homePosition.x && entry.object.position.z === entry.homePosition.z
            && Math.abs(entry.object.position.y - entry.homePosition.y) < EPS, `${layout}/${entry.id}: XZ home`);
          assert.deepEqual(entry.object.position.toArray(), entry.homePosition.toArray(), `${layout}/${entry.id}`);
          assert.deepEqual(entry.object.quaternion.toArray(), entry.homeQuaternion.toArray(), `${layout}/${entry.id}`);
        }
      }
    }
  } finally { workshop.dispose(); }
});

test('switching layouts ignores live animation state and never accumulates scale', () => {
  const workshop = createWorkshop();
  try {
    workshop.setLayout('compact');
    const compact = snapshot(workshop);
    workshop.setLayout('wide');
    // Both names resolve to the same single row; compact is not a second layout.
    assert.deepEqual(snapshot(workshop), compact, 'compact and wide are the same row');
    const baseline = snapshot(workshop);
    for (const part of workshop.parts) {
      part.object.position.set(4, 5, 6);
      part.object.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), .8);
      part.object.scale.multiplyScalar(3);
    }
    for (const layout of ['compact', 'wide', 'compact']) {
      workshop.setLayout(layout);
      for (const part of workshop.parts) {
        assert.equal(part.object.scale.x, 1, `${part.id}: part scale must stay 1`);
        assert.equal(part.object.children[0].scale.x, WORKSHOP_SCALE[part.machineId], `${part.id}: child scale must not accumulate`);
        assert.deepEqual(part.object.position.toArray(), part.homePosition.toArray());
        assert.ok(part.object.quaternion.angleTo(part.homeQuaternion) < EPS, `${part.id}: quaternion not restored`);
      }
    }
    for (const entry of snapshot(workshop)) {
      const original = baseline.find((candidate) => candidate.id === entry.id);
      assert.deepEqual(entry.homePosition, original.homePosition, `${entry.id}: home drifted`);
      assert.deepEqual(entry.homeQuaternion, original.homeQuaternion, `${entry.id}: home rotation drifted`);
      assert.deepEqual(entry.position, original.position, `${entry.id}: position not restored`);
      assert.deepEqual(entry.scale, original.scale, `${entry.id}: scale drifted`);
    }
    assert.throws(() => workshop.setLayout('diagonal'), /layout/);
  } finally { workshop.dispose(); }
});

test('workshop.materials registers every owned paint clone uniquely and no borrowed metal', () => {
  const workshop = createWorkshop();
  try {
    const owned = Object.values(workshop.materials);
    const shared = Object.values(workshop.sharedMaterials);
    assert.deepEqual(Object.keys(workshop.materials).sort(), [
      'laser-body', 'laser-bodyLight', 'laser-motorPaint',
      'lathe-body', 'lathe-bodyLight', 'lathe-motorPaint',
      'mill-basePaint', 'mill-body', 'mill-bodyLight', 'mill-motorPaint',
    ]);
    assert.equal(new Set(owned).size, owned.length, 'workshop.materials must be unique');
    for (const material of owned) assert.ok(!shared.includes(material), `${material.name}: borrowed metal repeated`);
    const meshes = meshesOf(workshop);
    const used = new Set(meshes.map((mesh) => mesh.material));
    for (const material of used) {
      assert.ok(owned.includes(material) || shared.includes(material), `${material.name}: unregistered material`);
    }
    // Each machine paints its own three colors; the mill adds one dark base clone.
    for (const machineId of ['mill', 'lathe', 'laser']) {
      const palette = workshop.palettes[machineId];
      const expected = WORKSHOP_PALETTES[machineId];
      assert.equal(palette.id, machineId);
      for (const key of PAINT_ROLES) {
        const material = workshop.materials[`${machineId}-${key}`];
        assert.equal(palette.materials[key], material);
        assert.equal(`#${material.color.getHexString()}`, expected[key], `${machineId}-${key} color`);
        assert.equal(material.userData.materialRole, 'painted-cast-iron');
        // Reused PBR maps and parameters: same source role as the mill.
        assert.equal(material.map, workshop.sharedMaterials[key].map, `${machineId}-${key}: map borrowed`);
        assert.equal(material.bumpMap, workshop.sharedMaterials[key].bumpMap, `${machineId}-${key}: bump borrowed`);
        assert.equal(material.roughnessMap, workshop.sharedMaterials[key].roughnessMap);
        assert.equal(material.roughness, workshop.sharedMaterials[key].roughness);
        assert.equal(material.metalness, workshop.sharedMaterials[key].metalness);
        assert.equal(material.clearcoat, workshop.sharedMaterials[key].clearcoat);
      }
    }
    for (const machineId of ['mill', 'lathe', 'laser']) {
      for (const key of PAINT_ROLES) {
        const mine = `#${workshop.materials[`${machineId}-${key}`].color.getHexString()}`;
        for (const other of ['mill', 'lathe', 'laser']) {
          if (other === machineId) continue;
          assert.notEqual(mine, `#${workshop.materials[`${other}-${key}`].color.getHexString()}`, `paint ${machineId}/${other} ${key} must differ`);
        }
      }
    }
    // Mill base/column casting is dark green; rails, screws, oil stay original.
    const basePaint = workshop.materials['mill-basePaint'];
    assert.equal(`#${basePaint.color.getHexString()}`, WORKSHOP_PALETTES.mill.motorPaint);
    for (const id of ['mill-base', 'mill-column']) {
      const part = workshop.parts.find((entry) => entry.id === id);
      let cast = 0;
      part.object.traverse((object) => {
        if (!object.isMesh) return;
        assert.ok(owned.includes(object.material) || shared.includes(object.material), `${id}: ${object.material.name}`);
        if (object.material === basePaint) cast++;
        else assert.notEqual(object.material.userData.materialRole, 'painted-cast-iron', `${id}: ${object.material.name} left unpainted`);
      });
      assert.ok(cast > 0, `${id}: basePaint applied`);
    }
    // Bare metals, rubber and oil films stay identical and untouched.
    for (const key of ['steel', 'machined', 'chrome', 'bronze', 'fastener', 'oil', 'oilRun', 'rubber', 'dark', 'accent', 'aluminum', 'beltRubber', 'toolSteel', 'scalePlate']) {
      const material = workshop.sharedMaterials[key];
      assert.equal(meshes.filter((mesh) => mesh.material === material).length > 0, true, `${key}: still in use`);
      assert.ok(!owned.includes(material), `${key}: must not be cloned`);
    }
    assert.equal(meshes.some((mesh) => mesh.material === workshop.sharedMaterials.oil || mesh.material === workshop.sharedMaterials.oilRun), true, 'oil film kept');
  } finally { workshop.dispose(); }
});

test('dispose releases every geometry once, the single material owner once, and keeps no geometry', () => {
  // Independent references to the mill-owned materials and textures: the
  // workshop's own paint clones go to workshop.materials.
  const workshop = createWorkshop();
  const shared = Object.values(workshop.sharedMaterials);
  const textures = [...workshop.textures];
  const geometries = new Set();
  const usedMaterials = new Set();
  const usedTextures = new Set();
  workshop.root.traverse((object) => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    usedMaterials.add(object.material);
    for (const value of Object.values(object.material)) if (value?.isTexture) usedTextures.add(value);
  });
  const owned = Object.values(workshop.materials);
  assert.ok(usedMaterials.size > 0 && owned.length > 0);
  assert.deepEqual([...usedMaterials].filter((material) => !owned.includes(material) && !shared.includes(material)), [],
    'all mesh materials must be owned by workshop.materials or the mill owner');
  assert.equal(new Set(owned).size, owned.length, 'workshop.materials must be unique');
  assert.equal(owned.filter((material) => shared.includes(material)).length, 0, 'no borrowed metal registered');
  assert.equal(textures.length, workshop.textures.size, 'all textures owned by the mill set');
  assert.deepEqual([...usedTextures].filter((texture) => !textures.includes(texture)), [], 'every used texture is mill-owned');
  const geometrySpies = [...geometries].map((geometry) => spy(geometry, 'dispose'));
  const materialSpies = [...owned, ...shared].map((material) => spy(material, 'dispose'));
  const textureSpies = textures.map((texture) => spy(texture, 'dispose'));
  workshop.dispose();
  workshop.dispose();
  for (const counter of geometrySpies) assert.equal(counter.calls, 1, 'geometry disposed exactly once');
  for (const counter of materialSpies) assert.equal(counter.calls, 1, 'material disposed exactly once (paint clones and mill owner)');
  for (const counter of textureSpies) assert.equal(counter.calls, 1, 'owned texture disposed exactly once');
  assert.equal(workshop.root.children.length, 0, 'root emptied');
  assert.equal(workshop.parts.length, 0, 'parts released');
  assert.equal(workshop.machines.length, 0, 'machines released');
  assert.ok(workshop.root.userData.homeBounds.isEmpty(), 'published home bounds emptied');
  assert.throws(() => workshop.setLayout('wide'), /dispose/);
});

test('fresh standalone factories rebuild untouched shapes and original gray paint after a workshop is disposed', () => {
  // Independent baselines captured before any workshop touches the factories.
  const baselines = {};
  for (const [machineId, factory] of FACTORIES) {
    const assembly = factory();
    try {
      assembly.root.updateMatrixWorld(true);
      const paint = {};
      const metals = new Set();
      for (const key of PAINT_ROLES) paint[key] = `#${assembly.materials[key].color.getHexString()}`;
      assembly.root.traverse((object) => {
        if (object.isMesh && object.material.userData.materialRole !== 'painted-cast-iron') metals.add(object.material);
      });
      baselines[machineId] = {
        count: assembly.parts.length,
        bounds: new Box3().setFromObject(assembly.root),
        paint,
        metalCount: metals.size,
        body: assembly.materials.body,
      };
    } finally { assembly.dispose(); }
  }
  for (const machineId of ['mill', 'lathe', 'laser']) {
    assert.ok(!Object.values(WORKSHOP_PALETTES[machineId]).includes(baselines[machineId].paint.body), `${machineId}: factory body gray`);
  }
  assert.equal(baselines.mill.paint.body, '#565c59');
  const workshop = createWorkshop();
  // Bare metals are one shared reference across all three machines.
  // Paint is cloned per machine; every bare metal mesh shares the mill set.
  const metals = new Set();
  workshop.root.traverse((object) => {
    if (object.isMesh && object.material.userData.materialRole !== 'painted-cast-iron') metals.add(object.material);
  });
  for (const material of metals) assert.ok(Object.values(workshop.sharedMaterials).includes(material), `${material.name}: shared metal`);
  const partCounts = workshop.machines.map((machine) => machine.parts.length);
  workshop.dispose();
  assert.deepEqual(partCounts, [34, 31, 26]);
  for (const [machineId, factory] of FACTORIES) {
    const assembly = factory();
    try {
      const baseline = baselines[machineId];
      assert.equal(assembly.parts.length, baseline.count);
      assert.equal(assembly.root.children.length, assembly.parts.length);
      assert.equal(assembly.root.position.length(), 0);
      assert.notEqual(assembly.materials.body.uuid, baseline.body.uuid, `${machineId}: factory creates fresh materials`);
      assert.deepEqual(
        Object.fromEntries(PAINT_ROLES.map((key) => [key, `#${assembly.materials[key].color.getHexString()}`])),
        baseline.paint,
        `${machineId}: factory paint restored to gray`,
      );
      const factoryMetals = new Set();
      for (const part of assembly.parts) {
        assert.equal(part.object.parent, assembly.root);
        assert.equal(part.object.scale.toArray().join(), '1,1,1', `${factory.name}/${part.id}: factory scale untouched`);
        for (const child of part.object.children) {
          if (!child.isMesh) continue;
          child.geometry.computeBoundingSphere();
          assert.ok(Number.isFinite(child.geometry.boundingSphere.radius));
        }
      }
      assembly.root.traverse(object => {
        if (object.isMesh && object.material.userData.materialRole !== 'painted-cast-iron') factoryMetals.add(object.material);
      });
      assert.equal(factoryMetals.size, baseline.metalCount, `${machineId}: same metal set`);
      assembly.root.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(assembly.root);
      for (const key of ['min', 'max']) {
        for (const axis of ['x', 'y', 'z']) {
          assert.ok(Math.abs(bounds[key][axis] - baseline.bounds[key][axis]) < EPS,
            `${factory.name}: ${key}.${axis} ${bounds[key][axis]} != baseline ${baseline.bounds[key][axis]}`);
        }
      }
    } finally { assembly.dispose(); }
  }
});
