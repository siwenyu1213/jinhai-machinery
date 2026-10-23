import { Box3, Group, Vector3 } from 'three';
import { createMill } from './model.js';
import { createLathe } from './lathe-model.js';
import { createLaser } from './laser-model.js';
import { applyPaintPalette, createPaintPalette, WORKSHOP_PALETTES } from './workshop-palette.js';

// Container for the three-machine workshop. The mill keeps ownership of the
// single shared material set; the lathe and laser borrow it and only clone
// their paint roles. Every part group is reparented into one identity root,
// never copied, and the realtime part state starts from a clean home pose
// baked with a fixed per-machine scale.
export const WORKSHOP_SCALE = Object.freeze({ mill: .68, lathe: .9, laser: .95 });
export const EYE = new Vector3(11, 0, 14).normalize();
export const RIGHT = new Vector3(14, 0, -11).normalize();
// Layout offsets in units of the eye / right directions. All three machines
// stand in one horizontal row: the mill in the middle, lathe left, laser
// right, all at ground level. "compact" is kept as a compatible name for the
// same single row; the old two-row arrangement is gone.
const ROW_OFFSETS = Object.freeze({ mill: Object.freeze([0, 0]), lathe: Object.freeze([-9, 0]), laser: Object.freeze([9, 0]) });
// The finished showcase layout: a triangle around the vertical axis through the
// scene centre, on the same XZ eye/right plane. "front" closes in on the camera,
// "left"/"right" sit further back at +-sqrt(3)/2 of the radius.
export const TRIANGLE_RADIUS = 9;
export const TRIANGLE_OFFSETS = Object.freeze({
  front: Object.freeze([0, TRIANGLE_RADIUS]),
  left: Object.freeze([-Math.sqrt(3) / 2 * TRIANGLE_RADIUS, -TRIANGLE_RADIUS / 2]),
  right: Object.freeze([Math.sqrt(3) / 2 * TRIANGLE_RADIUS, -TRIANGLE_RADIUS / 2]),
});
export const TRIANGLE_HOMES = Object.freeze({ mill: 'front', lathe: 'left', laser: 'right' });
export const LAYOUT_OFFSETS = Object.freeze({ wide: ROW_OFFSETS, compact: ROW_OFFSETS, triangle: TRIANGLE_OFFSETS });
const MACHINE_LABELS = { mill: '铣床', lathe: '车床', laser: '激光切割机' };

export function createWorkshop(options = {}) {
  const root = new Group();
  root.name = 'workshop';
  const parts = [];
  const factories = [['mill', createMill], ['lathe', createLathe], ['laser', createLaser]];
  const sources = [];
  const machines = [];
  const ids = new Set();
  const sourceIds = new Set();
  let millAssembly = null;
  // Union of the three machine home bounds; exposed for the page camera. It is
  // refreshed by place(), so it becomes empty once the workshop is disposed.
  root.userData.homeBounds = new Box3();
  let disposed = false;
  let layout = 'wide';

  for (const [machineId, factory] of factories) {
    const assembly = factory(millAssembly
      ? { materials: millAssembly.materials, surfaceMaps: options.surfaceMaps ?? {} }
      : options);
    if (!millAssembly) millAssembly = assembly;
    sources.push({ machineId, assembly });
    const scale = WORKSHOP_SCALE[machineId];
    // Bake the per-machine scale into the direct children once, at creation.
    // The part groups themselves stay at scale 1, so animations that reset
    // object.scale cannot undo (or compound) the workshop scale.
    // Ground offset from the source machine's raw bounds, per machine. Measured
    // before any scaling so raw geometry is untransformed.
    const sourceBounds = new Box3().setFromObject(assembly.root);
    const groundOffset = -sourceBounds.min.y * scale;
    for (const source of assembly.parts) {
      source.object.position.multiplyScalar(scale);
      for (const child of source.object.children) {
        child.position.multiplyScalar(scale);
        child.scale.multiplyScalar(scale);
      }
    }
    const machineParts = [];
    for (const source of assembly.parts) {
      if (sourceIds.has(source.id)) throw new Error(`workshop: duplicate source part id ${source.id}`);
      sourceIds.add(source.id);
      const id = machineId === 'mill' ? `mill-${source.id}` : source.id;
      if (ids.has(id)) throw new Error(`workshop: duplicate part id ${id}`);
      ids.add(id);
      const originalHome = {
        position: source.homePosition.clone(),
        quaternion: source.homeQuaternion.clone(),
      };
      const object = source.object;
      object.name = id;
      object.position.copy(originalHome.position).multiplyScalar(scale);
      object.quaternion.copy(originalHome.quaternion);
      object.scale.set(1, 1, 1);
      object.updateMatrixWorld(true);
      object.userData.partId = id;
      object.userData.sourceId = source.id;
      object.userData.machineId = machineId;
      root.add(object);
      const entry = {
        id, label: source.label, phase: source.phase, object,
        homePosition: object.position.clone(),
        homeQuaternion: object.quaternion.clone(),
        sourceId: source.id,
        machineId,
        originalHome,
        scale,
      };
      parts.push(entry);
      machineParts.push(entry);
    }
    machines.push({
      id: machineId, label: MACHINE_LABELS[machineId], parts: machineParts,
      scale, groundOffset, homeBounds: new Box3(),
    });
  }

  // A single material owner: the mill. Lathe and laser only borrow its metals,
  // oils and rubber; each clones its own paint roles from it.
  const materials = millAssembly.materials;
  const textures = millAssembly.textures;
  // Exact material objects the workshop itself owns (paint clones only).
  const ownedMaterials = new Set();
  const palettes = {};
  const registerOwned = (palette) => {
    for (const key of palette.keys) ownedMaterials.add(palette.materials[key]);
  };

  const millPalette = createPaintPalette('mill', materials);
  for (const part of machines[0].parts) applyPaintPalette(part.object, millPalette);
  palettes.mill = millPalette;
  registerOwned(millPalette);

  // Base and column are painted cast iron; their shared bare steel/machined
  // rails, screws and the oil film stay untouched. One extra dark-green paint
  // clone serves both parts and is appended to the mill's palette.
  const castRole = materials.body?.userData?.materialRole;
  const castingMeshes = [];
  for (const part of machines[0].parts) {
    if (part.id !== 'mill-base' && part.id !== 'mill-column') continue;
    part.object.traverse((object) => {
      if (object.isMesh && object.material.userData?.materialRole === castRole) castingMeshes.push(object);
    });
  }
  const basePaint = millPalette.materials.body.clone();
  basePaint.name = 'mill-basePaint';
  basePaint.color.set(WORKSHOP_PALETTES.mill.motorPaint);
  for (const object of castingMeshes) object.material = basePaint;
  millPalette.materials.basePaint = basePaint;
  millPalette.keys = Object.freeze([...millPalette.keys, 'basePaint']);
  palettes.mill = millPalette;
  registerOwned(millPalette);

  for (const { machineId, assembly } of sources) {
    if (machineId === 'mill') continue;
    const palette = createPaintPalette(machineId, materials);
    const machine = machines.find(machine => machine.id === machineId);
    for (const part of machine.parts) applyPaintPalette(part.object, palette);
    palettes[machineId] = palette;
    registerOwned(palette);
  }

  // Borrowed source factory roots are now empty; drop them so nothing aliases
  // them. The mill root must outlive dispose so its owner can release it.
  for (const { assembly } of sources) {
    if (assembly.root === root) continue;
    assembly.root.clear();
    if (assembly.root.parent) assembly.root.parent.remove(assembly.root);
  }

  // Registry of every unique owned (paint clone) material, keyed by machine
  // and role. Shared metals, oils, rubber and textures are not repeated here.
  const registry = {};
  for (const machineId of ['mill', 'lathe', 'laser']) {
    const { materials: owned } = palettes[machineId];
    for (const key of palettes[machineId].keys) registry[`${machineId}-${key}`] = owned[key];
  }
  const materialsRegistry = Object.freeze(registry);

  const measureMachine = (machine, target = new Box3()) => {
    target.makeEmpty();
    for (const part of machine.parts) target.union(new Box3().setFromObject(part.object));
    return target;
  };

  function place() {
    const offsets = LAYOUT_OFFSETS[layout];
    const triangle = layout === 'triangle';
    for (const machine of machines) {
      // Triangle homes are addressed by slot (front/left/right); every other
      // layout keeps the historical per-machine row offset.
      const [alongRight, alongEye] = triangle ? offsets[TRIANGLE_HOMES[machine.id]] : offsets[machine.id];
      const offset = new Vector3()
        .addScaledVector(RIGHT, alongRight)
        .addScaledVector(EYE, alongEye);
      offset.y += machine.groundOffset;
      const applyOffset = (delta) => {
        for (const part of machine.parts) {
          part.homePosition.add(delta);
          part.object.position.add(delta);
        }
      };
      for (const part of machine.parts) {
        part.homePosition.copy(part.originalHome.position).multiplyScalar(part.scale).add(offset);
        part.homeQuaternion.copy(part.originalHome.quaternion);
        part.object.position.copy(part.homePosition);
        part.object.quaternion.copy(part.homeQuaternion);
        // Clear any animation disturbance of the group scale.
        part.object.scale.set(1, 1, 1);
      }
      if (triangle) {
        // Slot offsets apply to the bbox centre: measure, then shift every home
        // and the live pose horizontally so the centre lands on the slot. Y is
        // untouched, so the machines keep standing on the ground.
        root.updateMatrixWorld(true);
        const center = measureMachine(machine).getCenter(new Vector3());
        const slot = new Vector3().addScaledVector(RIGHT, offsets[TRIANGLE_HOMES[machine.id]][0])
          .addScaledVector(EYE, offsets[TRIANGLE_HOMES[machine.id]][1]);
        const shift = new Vector3(slot.x - center.x, 0, slot.z - center.z);
        if (shift.lengthSq() > 1e-12) applyOffset(shift);
      }
    }
    root.updateMatrixWorld(true);
    const union = root.userData.homeBounds;
    union.makeEmpty();
    for (const machine of machines) {
      machine.homeBounds.makeEmpty();
      for (const part of machine.parts) machine.homeBounds.union(new Box3().setFromObject(part.object));
      if (!machine.homeBounds.isEmpty()) union.union(machine.homeBounds);
    }
  }

  function setLayout(next) {
    if (!Object.hasOwn(LAYOUT_OFFSETS, next)) throw new Error(`workshop: unknown layout ${next}`);
    if (disposed) throw new Error('workshop: cannot set a layout after dispose');
    layout = next;
    place();
    return machines;
  }

  setLayout(layout);

  function dispose() {
    if (disposed) return;
    disposed = true;
    // Lathe and laser release their own geometry only; the borrowed metals
    // stay alive. The workshop drops its paint clones once, then the mill
    // releases its geometry, the original materials and all textures.
    for (const { machineId, assembly } of sources) {
      if (machineId !== 'mill') assembly.dispose();
    }
    ownedMaterials.forEach((material) => material.dispose());
    ownedMaterials.clear();
    for (const palette of Object.values(palettes)) palette.materials = {};
    root.clear();
    millAssembly.dispose();
    for (const part of parts) {
      part.homePosition.set(0, 0, 0);
      part.homeQuaternion.identity();
    }
    parts.length = 0;
    for (const machine of machines) {
      machine.parts.length = 0;
      machine.homeBounds.makeEmpty();
    }
    machines.length = 0;
    root.userData.homeBounds.makeEmpty();
  }

  return {
    root, parts, machines, materials: materialsRegistry, textures, palettes,
    // Borrowed materials owned and released by the mill (not disposed by us).
    sharedMaterials: materials,
    get layout() { return layout; },
    setLayout, dispose,
  };
}
