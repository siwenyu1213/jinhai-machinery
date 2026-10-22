import { Box3, Euler, Quaternion, Vector3 } from 'three';

export const VORTEX_TIMING = Object.freeze({ arrivalEnd: .24, vortexEnd: .76, assemblyEnd: .94 });
const TAU = Math.PI * 2;
const Y_AXIS = new Vector3(0, 1, 0);
const clamp = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const smoother = (value) => value * value * value * (value * (value * 6 - 15) + 10);
const ASSEMBLY_SCROLL_SCALE = 3;
const EXTRA_ASSEMBLY_SCROLL = (VORTEX_TIMING.assemblyEnd - VORTEX_TIMING.vortexEnd) * (ASSEMBLY_SCROLL_SCALE - 1);
const SCROLL_SPAN = 1 + EXTRA_ASSEMBLY_SCROLL;

// Follow the physical scroll target with frame-rate-independent damping.
// A small final snap lets the render loop sleep once the motion has settled.
export function followScroll(current, target, elapsed) {
  const start = clamp(current);
  const end = clamp(target);
  const seconds = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const next = start + (end - start) * -Math.expm1(-seconds / .24);
  return Math.abs(end - next) < .0001 ? end : next;
}

// Stretch only the physical scroll allotted to the final assembly. Earlier
// flight and rotation keep the same poses at the same scroll distances.
export function progressToScroll(value) {
  const progress = clamp(value);
  const extra = Math.min(Math.max(0, progress - VORTEX_TIMING.vortexEnd),
    VORTEX_TIMING.assemblyEnd - VORTEX_TIMING.vortexEnd) * (ASSEMBLY_SCROLL_SCALE - 1);
  return (progress + extra) / SCROLL_SPAN;
}

export function scrollToProgress(value) {
  const travel = clamp(value) * SCROLL_SPAN;
  const assemblyTravelEnd = VORTEX_TIMING.assemblyEnd + EXTRA_ASSEMBLY_SCROLL;
  if (travel <= VORTEX_TIMING.vortexEnd) return travel;
  if (travel < assemblyTravelEnd) return VORTEX_TIMING.vortexEnd + (travel - VORTEX_TIMING.vortexEnd) / ASSEMBLY_SCROLL_SCALE;
  return clamp(travel - EXTRA_ASSEMBLY_SCROLL);
}

// One revolution with a pronounced slow-fast-slow response to equal scroll
// increments. Its symmetric velocity peaks at the middle and reaches zero at
// both ends, so it joins the arrival and assembly poses without a speed jump.
function windTurn(value) {
  const t = clamp(value);
  return t < .5 ? 8 * t ** 4 : 1 - 8 * (1 - t) ** 4;
}

function hash(value) {
  let number = 2166136261;
  for (const character of String(value)) number = Math.imul(number ^ character.charCodeAt(0), 16777619);
  return (number >>> 0) / 4294967295;
}

// Stagger travel along the existing curve, never move its control points.
// The bounded, monotonic time warp shares the same start and arrival instant.
export function staggerArrival(value, id) {
  const progress = clamp(value);
  return progress + (hash(id + '-arrival') - .5) * .32 * Math.sin(Math.PI * progress) ** 2;
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
export function createAssemblyFlight(parts, { stagger = true } = {}) {
  if (new Set(parts.map((part) => part.id)).size !== parts.length) throw new Error('Assembly part IDs must be unique.');
  const schedule = getFlightSchedule(parts);
  const entries = parts.map((part, index) => {
    part.object.updateWorldMatrix(true, true);
    const worldBox = new Box3().setFromObject(part.object);
    const localBox = worldBox.clone().applyMatrix4(part.object.matrixWorld.clone().invert());
    const center = localBox.getCenter(new Vector3());
    const dimensions = localBox.getSize(new Vector3());
    const radius = Math.max(.12, dimensions.length() / 2);
    const seed = hash(part.id);
    const scale = Math.max(.54, .88 - radius * .09);
    const rotation = part.homeQuaternion.clone();
    const home = part.homePosition.clone();
    const homeCenter = center.clone().applyQuaternion(rotation).add(home);
    const corners = [];
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
      corners.push(new Vector3(x ? localBox.max.x : localBox.min.x, y ? localBox.max.y : localBox.min.y, z ? localBox.max.z : localBox.min.z).sub(center));
    }
    return { part, timing: schedule[index], home, homeCenter, rotation, center, corners, radius, dimensions, seed, scale };
  });

  // Independent rings break the old angle/height correlation. In particular,
  // golden-angle azimuths paired with inverse-golden-ratio heights form a single
  // helix: a side view can collapse the entire distribution to a diagonal line.
  const layers = Math.min(6, Math.max(1, Math.floor(parts.length / 4)));
  const slots = [];
  for (let layer = 0; layer < layers; layer++) {
    const count = Math.floor(parts.length / layers) + (layer < parts.length % layers ? 1 : 0);
    const height = layers > 1 ? layer / (layers - 1) : .5;
    const azimuth = hash('ring-' + layer) * TAU;
    for (let item = 0; item < count; item++) {
      const jitter = hash(`height-${layer}-${item}`) - .5;
      slots.push({
        layer,
        angle: azimuth + item * TAU / count + (hash(`angle-${layer}-${item}`) - .5) * .10,
        orbitY: 1.30 + height * 5.55 + jitter * .22,
        orbitRadius: (.93 + height * 2.68) * (.96 + hash(`radius-${layer}-${item}`) * .08),
      });
    }
  }
  // Give broad castings room near the upper rim, keep tall columns in the
  // middle, and fill the remaining slots without coupling size to azimuth.
  for (const entry of [...entries].sort((a, b) => b.radius - a.radius)) {
    const halfHeight = (entry.dimensions.y / 2 + Math.max(entry.dimensions.x, entry.dimensions.z) * .18) * entry.scale;
    let choices = slots.filter((slot) => slot.orbitY > halfHeight + .15 && slot.orbitY < 8.65 - halfHeight);
    if (!choices.length) choices = slots;
    const targetHeight = entry.radius > 1.5
      ? entry.dimensions.y > Math.max(entry.dimensions.x, entry.dimensions.z) ? 4.2 : 6.3
      : 1.3 + hash(entry.part.id + '-layer') * 5.55;
    choices.sort((a, b) => Math.abs(a.orbitY - targetHeight) - Math.abs(b.orbitY - targetHeight)
      || hash(entry.part.id + a.angle) - hash(entry.part.id + b.angle));
    const slot = choices[0];
    slots.splice(slots.indexOf(slot), 1);
    Object.assign(entry, slot);
    entry.orbitCenter = new Vector3(Math.cos(slot.angle) * slot.orbitRadius, slot.orbitY, Math.sin(slot.angle) * slot.orbitRadius);
    entry.orbitRotation = entry.rotation.clone().premultiply(new Quaternion().setFromEuler(new Euler(
      (entry.seed - .5) * .20, -slot.angle + .35 + (entry.seed - .5) * .6, (entry.seed - .5) * .18,
    )));
  }
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
        const arrival = progress / VORTEX_TIMING.arrivalEnd;
        const t = smoother(stagger ? staggerArrival(arrival, part.id) : arrival);
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
        const u = (progress - VORTEX_TIMING.arrivalEnd) / (VORTEX_TIMING.vortexEnd - VORTEX_TIMING.arrivalEnd);
        const t = windTurn(u);
        const envelope = Math.sin(Math.PI * u) ** 2;
        const phaseOffset = seed * TAU;
        const angularDrift = .085 * Math.sin(TAU * u + phaseOffset) * envelope * envelope;
        const angle = entry.angle + TAU * t + angularDrift;
        const lift = (.20 + .16 * Math.sin(TAU * u + phaseOffset)) * envelope;
        const breathing = 1 + .035 * Math.sin(TAU * u * 1.3 + phaseOffset) * envelope;
        const orbitRadius = entry.orbitRadius * breathing + lift * .12;
        position.set(Math.cos(angle) * orbitRadius, entry.orbitY + lift, Math.sin(angle) * orbitRadius);
        turn.setFromAxisAngle(Y_AXIS, -(TAU * t + angularDrift));
        rotation.copy(orbitRotation).premultiply(turn);
        // Independent small banks and tumbles read as entrained objects rather
        // than a rigid carousel. Heavy castings respond less than small rings.
        const response = Math.max(.35, 1 - radius * .15);
        euler.set(
          .24 * response * Math.sin(TAU * u * 1.2 + phaseOffset) * envelope,
          .14 * response * Math.sin(TAU * u * .8 + phaseOffset * 1.7) * envelope,
          .20 * response * Math.cos(TAU * u + phaseOffset) * envelope,
        );
        spin.setFromEuler(euler);
        rotation.premultiply(spin);
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
