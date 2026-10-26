import { Box3, Vector3 } from 'three';
export const ASSEMBLY_EYE = new Vector3(11, 5.2, 16).normalize();
export const ASSEMBLY_RIGHT = new Vector3().crossVectors(new Vector3(0, 1, 0), ASSEMBLY_EYE).normalize();
export const ASSEMBLY_UP = new Vector3().crossVectors(ASSEMBLY_EYE, ASSEMBLY_RIGHT).normalize();
export function boxCorners(box) {
  return Array.from({ length: 8 }, (_, i) => new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
}
// Bake the website-only row into homes before constructing the original flight.
// Shared source models and the standalone triangle controller remain reusable.
export function arrangeAssemblyRow(model) {
  for (const [index, machine] of model.machines.entries()) {
    const box = machine.homeBounds, center = box.getCenter(new Vector3());
    const projected = new Box3();
    for (const point of boxCorners(box)) projected.expandByPoint(new Vector3(point.dot(ASSEMBLY_RIGHT), point.dot(ASSEMBLY_UP), point.dot(ASSEMBLY_EYE)));
    const size = projected.getSize(new Vector3());
    const scale = Math.min(8 / size.x, 6.4 / size.y);
    const anchor = new Vector3(center.x, box.min.y, center.z);
    const offset = ASSEMBLY_RIGHT.clone().multiplyScalar((index - 1) * 10);
    for (const part of machine.parts) {
      part.homePosition.sub(anchor).multiplyScalar(scale).add(offset);
      for (const child of part.object.children) { child.position.multiplyScalar(scale); child.scale.multiplyScalar(scale); }
      part.object.position.copy(part.homePosition);
      part.object.quaternion.copy(part.homeQuaternion);
    }
    model.root.updateMatrixWorld(true);
    machine.homeBounds.makeEmpty();
    for (const part of machine.parts) machine.homeBounds.union(new Box3().setFromObject(part.object));
  }
  model.root.userData.homeBounds.makeEmpty();
  for (const machine of model.machines) model.root.userData.homeBounds.union(machine.homeBounds);
  return model;
}
