import { Box3, Euler, Quaternion, Vector3 } from 'three';

const clamp = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const smoother = (value) => value * value * value * (value * (value * 6 - 15) + 10);

function hash(value) {
  let number = 2166136261;
  for (const character of String(value)) number = Math.imul(number ^ character.charCodeAt(0), 16777619);
  return (number >>> 0) / 4294967295;
}

/** A compact overlap keeps individual arrivals readable while building continuously. */
export function getFlightSchedule(parts) {
  const ordered = parts.map((part, index) => ({ part, index }))
    .sort((a, b) => a.part.phase - b.part.phase || a.index - b.index);
  const count = ordered.length;
  const duration = count > 1 ? Math.min(.22, Math.max(.055, 2.7 / count)) : .94;
  const step = count > 1 ? (.965 - duration) / (count - 1) : 0;
  return ordered.map(({ part }, index) => ({
    id: part.id,
    phase: part.phase,
    side: index % 2 === 0 ? -1 : 1,
    start: .015 + step * index,
    end: .015 + step * index + duration,
  }));
}

/**
 * Scroll-driven assembly in camera space. Parts travel from just outside the
 * camera's near left/right field of view toward their real world-space homes.
 * Perspective, rather than an artificial scale tween, supplies the size change.
 * Every pose is derived from immutable home transforms, so scrubbing is reversible.
 */
export function createAssemblyFlight(parts) {
  const byId = new Map(parts.map((part) => [part.id, part]));
  if (byId.size !== parts.length) throw new Error('Assembly part IDs must be unique.');
  const schedule = getFlightSchedule(parts);
  const entries = schedule.map((timing) => {
    const part = byId.get(timing.id);
    part.object.updateWorldMatrix(true, true);
    const size = new Box3().setFromObject(part.object).getSize(new Vector3());
    return {
      part,
      timing,
      radius: Math.max(.16, size.length() / 2),
      home: part.homePosition.clone(),
      rotation: part.homeQuaternion.clone(),
      seed: hash(part.id),
    };
  });
  const cameraPosition = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  const forward = new Vector3();
  const relative = new Vector3();
  const start = new Vector3();
  const controlA = new Vector3();
  const controlB = new Vector3();
  const point = new Vector3();
  const spin = new Quaternion();
  const euler = new Euler();
  let state = { progress: 0, assembledCount: 0, activeLabels: [], phase: 0, totalParts: parts.length };

  function apply(value, camera) {
    const progress = clamp(value);
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(cameraPosition);
    right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    forward.setFromMatrixColumn(camera.matrixWorld, 2).normalize().negate();
    const halfFov = Math.tan((camera.fov || 40) * Math.PI / 360) / (camera.zoom || 1);
    const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 1;
    let assembledCount = 0;
    const activeLabels = [];
    let phase = 0;

    for (const entry of entries) {
      const { part, timing, radius, home, rotation, seed } = entry;
      const object = part.object;
      object.scale.set(1, 1, 1);
      if (progress >= timing.end || progress === 1) {
        object.visible = true;
        object.position.copy(home);
        object.quaternion.copy(rotation);
        assembledCount++;
        phase = Math.max(phase, part.phase);
        continue;
      }
      if (progress <= timing.start) {
        object.visible = false;
        object.position.copy(home);
        object.quaternion.copy(rotation);
        continue;
      }

      object.visible = true;
      const t = clamp((progress - timing.start) / (timing.end - timing.start));
      // Fast entry followed by a deliberate, quiet alignment at the destination.
      const travel = 1 - Math.pow(1 - t, 2.4);
      relative.copy(home).sub(cameraPosition);
      const homeDepth = Math.max(camera.near * 12, relative.dot(forward));
      const nearDepth = Math.max(camera.near * 10, Math.min(homeDepth * .52, Math.max(homeDepth * .19, radius * 1.65)));
      const halfHeight = halfFov * nearDepth;
      const halfWidth = halfHeight * aspect;
      const side = timing.side;
      // Sphere radius padding keeps even a long table fully outside the frame
      // before it enters. Starts remain in front of the camera's near plane.
      const lateral = side * (halfWidth + radius * 1.45 + .25);
      const vertical = halfHeight * ((seed - .5) * 1.15 + (side < 0 ? -.22 : .22));
      start.copy(cameraPosition).addScaledVector(forward, nearDepth)
        .addScaledVector(right, lateral).addScaledVector(up, vertical);
      controlA.copy(start).lerp(home, .34).addScaledVector(right, side * radius * .2)
        .addScaledVector(up, halfHeight * (seed - .5) * .45);
      // Final tangent follows a short oblique insertion toward the assembly.
      controlB.copy(home).addScaledVector(right, side * Math.min(.8, radius * .3))
        .addScaledVector(forward, -.65).addScaledVector(up, .18);
      const inverse = 1 - travel;
      point.copy(start).multiplyScalar(inverse * inverse * inverse)
        .addScaledVector(controlA, 3 * inverse * inverse * travel)
        .addScaledVector(controlB, 3 * inverse * travel * travel)
        .addScaledVector(home, travel * travel * travel);
      object.position.copy(point);
      const turn = 1 - smoother(t);
      euler.set(
        side * (1.05 + seed * 1.45) * turn,
        (seed < .5 ? -1 : 1) * (1.8 + seed * 1.7) * turn,
        side * (1.15 + seed * 1.5) * turn,
        'XYZ',
      );
      spin.setFromEuler(euler);
      object.quaternion.copy(rotation).premultiply(spin);
      activeLabels.push(part.label);
      phase = Math.max(phase, part.phase);
    }

    state = { progress, assembledCount, activeLabels, phase, totalParts: parts.length };
    return getState();
  }

  function getState() {
    return { ...state, activeLabels: [...state.activeLabels] };
  }

  return { apply, getState };
}
