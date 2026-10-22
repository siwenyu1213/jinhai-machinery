import { Box3, Euler, Quaternion, Vector3 } from 'three';

export const VORTEX_TIMING = Object.freeze({ arrivalEnd: .24, vortexEnd: .76, assemblyEnd: .94 });
const TAU = Math.PI * 2;
const Y_AXIS = new Vector3(0, 1, 0);
const clamp = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const smoother = (value) => value * value * value * (value * (value * 6 - 15) + 10);

function hash(value) {
  let number = 2166136261;
  for (const character of String(value)) number = Math.imul(number ^ character.charCodeAt(0), 16777619);
  return (number >>> 0) / 4294967295;
}

/** Every component shares one arrival, one revolution and one assembly window. */
export function getFlightSchedule(parts) {
  return parts.map((part, index) => ({
    id: part.id, phase: part.phase, side: index % 2 === 0 ? -1 : 1,
    start: 0, end: VORTEX_TIMING.assemblyEnd,
  }));
}

/**
 * All parts sweep in from the viewer's two sides, complete a single central
 * revolution, then assemble simultaneously. Geometry centers, rather than
 * arbitrary modeling origins, orbit the Y axis so a tall casting stays readable.
 * Saved home poses are immutable; reversing or jumping the scrollbar is exact.
 */
export function createAssemblyFlight(parts) {
  if (new Set(parts.map((part) => part.id)).size !== parts.length) throw new Error('Assembly part IDs must be unique.');
  const schedule = getFlightSchedule(parts);
  const entries = parts.map((part, index) => {
    part.object.updateWorldMatrix(true, true);
    const worldBox = new Box3().setFromObject(part.object);
    const localBox = worldBox.clone().applyMatrix4(part.object.matrixWorld.clone().invert());
    const center = localBox.getCenter(new Vector3());
    const radius = Math.max(.12, localBox.getSize(new Vector3()).length() / 2);
    const seed = hash(part.id);
    const scale = Math.max(.66, .91 - radius * .075);
    const angle = index * Math.PI * (3 - Math.sqrt(5)) + .3;
    // Large castings use the outside of the vortex; small rings and tools stay
    // nearer the axis. A helix-like distribution separates the height layers.
    const orbitRadius = 1.05 + Math.min(1, radius / 2.6) * 1.75 + seed * .28;
    const heightSeed = (index * .61803398875 + .17) % 1;
    const orbitY = Math.max(radius * scale + .2, Math.min(8.45 - radius * scale, 1.65 + heightSeed * 5.9));
    const rotation = part.homeQuaternion.clone();
    const tilt = new Quaternion().setFromEuler(new Euler((seed - .5) * .72, angle * .33, (heightSeed - .5) * .7));
    const orbitRotation = rotation.clone().premultiply(tilt);
    const home = part.homePosition.clone();
    const homeCenter = center.clone().applyQuaternion(rotation).add(home);
    const orbitCenter = new Vector3(Math.cos(angle) * orbitRadius, orbitY, Math.sin(angle) * orbitRadius);
    const corners = [];
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
      corners.push(new Vector3(x ? localBox.max.x : localBox.min.x, y ? localBox.max.y : localBox.min.y, z ? localBox.max.z : localBox.min.z).sub(center));
    }
    return { part, timing: schedule[index], home, homeCenter, rotation, center, corners, radius, seed, scale, angle, orbitRadius, orbitY, orbitCenter, orbitRotation };
  });
  const cameraPosition = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  const forward = new Vector3();
  const relative = new Vector3();
  const start = new Vector3();
  const controlA = new Vector3();
  const controlB = new Vector3();
  const position = new Vector3();
  const offset = new Vector3();
  const corner = new Vector3();
  const turn = new Quaternion();
  const spin = new Quaternion();
  const startRotation = new Quaternion();
  const rotation = new Quaternion();
  const euler = new Euler();
  let state = { progress: 0, assembledCount: 0, activeLabels: [], phase: 0, stage: 'arrival', totalParts: parts.length };

  function apply(value, camera) {
    const progress = clamp(value);
    const stage = progress < VORTEX_TIMING.arrivalEnd ? 'arrival' : progress < VORTEX_TIMING.vortexEnd ? 'vortex' : progress < VORTEX_TIMING.assemblyEnd ? 'assembly' : 'complete';
    const phase = { arrival: 0, vortex: 2, assembly: 4, complete: 5 }[stage];
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(cameraPosition);
    right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    forward.setFromMatrixColumn(camera.matrixWorld, 2).normalize().negate();
    const halfFov = Math.tan((camera.fov || 40) * Math.PI / 360) / (camera.zoom || 1);
    const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 1;

    for (const entry of entries) {
      const { part, timing, radius, home, homeCenter, seed, scale, orbitCenter, orbitRotation } = entry;
      const object = part.object;
      object.visible = progress > 0;
      if (stage === 'complete' || progress === 0) {
        object.position.copy(home);
        object.quaternion.copy(entry.rotation);
        object.scale.setScalar(1);
        continue;
      }

      let size;
      if (stage === 'arrival') {
        const t = smoother(progress / VORTEX_TIMING.arrivalEnd);
        relative.copy(orbitCenter).sub(cameraPosition);
        const targetDepth = Math.max(camera.near * 12, relative.dot(forward));
        const nearDepth = Math.max(camera.near * 10, Math.min(targetDepth * .54, Math.max(targetDepth * .19, radius * 1.7)));
        const halfHeight = halfFov * nearDepth;
        const lateral = timing.side * (halfHeight * aspect + radius * 1.45 + .25);
        const vertical = halfHeight * ((seed - .5) * 1.6 + (timing.side < 0 ? -.18 : .18));
        start.copy(cameraPosition).addScaledVector(forward, nearDepth)
          .addScaledVector(right, lateral).addScaledVector(up, vertical);
        start.y = Math.max(start.y, radius + .2);
        controlA.copy(start).lerp(orbitCenter, .38).addScaledVector(right, timing.side * .65);
        controlB.copy(orbitCenter).addScaledVector(right, timing.side * .55).addScaledVector(forward, -.45);
        const inverse = 1 - t;
        position.copy(start).multiplyScalar(inverse * inverse * inverse)
          .addScaledVector(controlA, 3 * inverse * inverse * t)
          .addScaledVector(controlB, 3 * inverse * t * t)
          .addScaledVector(orbitCenter, t * t * t);
        euler.set(timing.side * (1.1 + seed), (seed - .5) * 3.3, timing.side * (1.2 + seed));
        spin.setFromEuler(euler);
        startRotation.copy(orbitRotation).premultiply(spin);
        rotation.copy(startRotation).slerp(orbitRotation, t);
        size = 1 + (scale - 1) * t;
      } else if (stage === 'vortex') {
        const t = smoother((progress - VORTEX_TIMING.arrivalEnd) / (VORTEX_TIMING.vortexEnd - VORTEX_TIMING.arrivalEnd));
        const angle = entry.angle + TAU * t;
        position.set(Math.cos(angle) * entry.orbitRadius, entry.orbitY, Math.sin(angle) * entry.orbitRadius);
        turn.setFromAxisAngle(Y_AXIS, TAU * t);
        rotation.copy(orbitRotation).premultiply(turn);
        size = scale;
      } else {
        const t = smoother((progress - VORTEX_TIMING.vortexEnd) / (VORTEX_TIMING.assemblyEnd - VORTEX_TIMING.vortexEnd));
        position.copy(orbitCenter).lerp(homeCenter, t);
        rotation.copy(orbitRotation).slerp(entry.rotation, t);
        size = scale + (1 - scale) * t;
      }

      // Keep rotated castings above the floor, accounting for offset origins.
      let lowest = Infinity;
      for (const localCorner of entry.corners) lowest = Math.min(lowest, corner.copy(localCorner).multiplyScalar(size).applyQuaternion(rotation).y);
      position.y = Math.max(position.y, -lowest + .015);
      object.quaternion.copy(rotation);
      object.scale.setScalar(size);
      offset.copy(entry.center).multiplyScalar(size).applyQuaternion(rotation);
      object.position.copy(position).sub(offset);
    }

    const completed = stage === 'complete';
    state = { progress, assembledCount: completed ? parts.length : 0,
      activeLabels: progress > 0 && !completed ? parts.map((part) => part.label) : [],
      phase, stage, totalParts: parts.length };
    return getState();
  }

  function getState() { return { ...state, activeLabels: [...state.activeLabels] }; }
  return { apply, getState };
}
