import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three';

// Part-local geometry bounds from child transforms only; the root pose and
// world matrix never participate, so results are independent of the home.
function localPartBounds(root) {
  const box = new Box3();
  let found = false;
  const visit = (parent, parentRelative) => {
    for (const child of parent.children) {
      child.updateMatrix();
      const relative = new Matrix4().multiplyMatrices(parentRelative, child.matrix);
      if (child.isMesh && child.geometry) {
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        box.union(child.geometry.boundingBox.clone().applyMatrix4(relative));
        found = true;
      }
      visit(child, relative);
    }
  };
  visit(root, new Matrix4());
  if (!found) box.set(new Vector3(), new Vector3());
  return box;
}

export const VORTEX_TIMING = Object.freeze({ arrivalEnd: .24, funnelSettled: .42, assemblyStart: .64, assemblyEnd: .94 });
const TAU = Math.PI * 2;
const Y_AXIS = new Vector3(0, 1, 0);
const clamp = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const smoother = (value) => value * value * value * (value * (value * 6 - 15) + 10);
const positive = (value, name) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`Assembly ${name} must be a positive number.`);
  return number;
};
const ARRIVAL_SCROLL_SCALE = 2.1;
const VORTEX_SCROLL_SCALE = .7;
const ASSEMBLY_SCROLL_SCALE = 2.5;
const EXTRA_ARRIVAL_SCROLL = VORTEX_TIMING.arrivalEnd * (ARRIVAL_SCROLL_SCALE - 1);
const EXTRA_VORTEX_SCROLL = (VORTEX_TIMING.assemblyStart - VORTEX_TIMING.arrivalEnd) * (VORTEX_SCROLL_SCALE - 1);
const EXTRA_ASSEMBLY_SCROLL = (VORTEX_TIMING.assemblyEnd - VORTEX_TIMING.assemblyStart) * (ASSEMBLY_SCROLL_SCALE - 1);
// Stop physical travel at the assembled pose; there is no post-assembly tail.
const SCROLL_SPAN = VORTEX_TIMING.assemblyEnd + EXTRA_ARRIVAL_SCROLL + EXTRA_VORTEX_SCROLL + EXTRA_ASSEMBLY_SCROLL;

// Follow the physical scroll target with frame-rate-independent damping.
// A small final snap lets the render loop sleep once the motion has settled.
export function followScroll(current, target, elapsed) {
  const start = clamp(current);
  const end = clamp(target);
  const seconds = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const next = start + (end - start) * -Math.expm1(-seconds / .45);
  return Math.abs(end - next) < .0001 ? end : next;
}

// Give arrival and the overlapping assembly more physical scroll time.
export function progressToScroll(value) {
  const progress = Math.min(clamp(value), VORTEX_TIMING.assemblyEnd);
  const extra = Math.min(Math.max(0, progress - VORTEX_TIMING.assemblyStart),
    VORTEX_TIMING.assemblyEnd - VORTEX_TIMING.assemblyStart) * (ASSEMBLY_SCROLL_SCALE - 1);
  const arrivalExtra = Math.min(progress, VORTEX_TIMING.arrivalEnd) * (ARRIVAL_SCROLL_SCALE - 1);
  const vortexExtra = Math.min(Math.max(0, progress - VORTEX_TIMING.arrivalEnd),
    VORTEX_TIMING.assemblyStart - VORTEX_TIMING.arrivalEnd) * (VORTEX_SCROLL_SCALE - 1);
  return (progress + arrivalExtra + vortexExtra + extra) / SCROLL_SPAN;
}

export function scrollToProgress(value) {
  const travel = clamp(value) * SCROLL_SPAN;
  const arrivalTravelEnd = VORTEX_TIMING.arrivalEnd + EXTRA_ARRIVAL_SCROLL;
  const assemblyTravelStart = VORTEX_TIMING.assemblyStart + EXTRA_ARRIVAL_SCROLL + EXTRA_VORTEX_SCROLL;
  const assemblyTravelEnd = VORTEX_TIMING.assemblyEnd + EXTRA_ARRIVAL_SCROLL + EXTRA_VORTEX_SCROLL + EXTRA_ASSEMBLY_SCROLL;
  if (Math.abs(travel - assemblyTravelEnd) < 1e-12) return VORTEX_TIMING.assemblyEnd;
  if (travel <= arrivalTravelEnd) return travel / ARRIVAL_SCROLL_SCALE;
  if (travel <= assemblyTravelStart) return VORTEX_TIMING.arrivalEnd + (travel - arrivalTravelEnd) / VORTEX_SCROLL_SCALE;
  if (travel < assemblyTravelEnd) return VORTEX_TIMING.assemblyStart + (travel - assemblyTravelStart) / ASSEMBLY_SCROLL_SCALE;
  return VORTEX_TIMING.assemblyEnd;
}

// A continuous acceleration curve avoids concentrating most of the turn into
// a few wheel steps. Rotation and contraction share one physical scroll clock.
function windTurn(value) {
  const t = clamp(value);
  if (t === 0 || t === 1) return t;
  const steady = t * t * (3 - 2 * t);
  const focused = t ** 4 * (35 - 84 * t + 70 * t * t - 20 * t ** 3);
  return clamp(.25 * steady + .75 * focused);
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
 * revolution while assembling simultaneously. Geometry centers, rather than
 * arbitrary modeling origins, orbit the Y axis so a tall casting stays readable.
 * Saved home poses are immutable; reversing or jumping the scrollbar is exact.
 */
export function createAssemblyFlight(parts, { stagger = true, vortexRadius = 1, vortexHeight = 1, pieceScale = 1, localSpaceBounds = false } = {}) {
  // Shape knobs default to 1 and leave every legacy formula untouched. The
  // ground plane (1.3) stays fixed; only the vertical span around it scales.
  const radiusFactor = positive(vortexRadius, 'vortexRadius');
  const heightFactor = positive(vortexHeight, 'vortexHeight');
  const sizeFactor = positive(pieceScale, 'pieceScale');
  const ground = 1.3;
  if (new Set(parts.map((part) => part.id)).size !== parts.length) throw new Error('Assembly part IDs must be unique.');
  const schedule = getFlightSchedule(parts);
  const entries = parts.map((part, index) => {
    // The legacy path measures world AABBs and inverts the root matrix, which is
    // sensitive to far-translation float noise. localSpaceBounds derives the box
    // from child transforms only, so future home poses cannot perturb it.
    part.object.updateWorldMatrix(true, true);
    const localBox = localSpaceBounds ? localPartBounds(part.object) : new Box3().setFromObject(part.object).applyMatrix4(part.object.matrixWorld.clone().invert());
    const center = localBox.getCenter(new Vector3());
    const dimensions = localBox.getSize(new Vector3());
    const radius = Math.max(.12, dimensions.length() / 2);
    const seed = hash(part.id);
    const scale = Math.max(.54, .88 - radius * .09) * sizeFactor;
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
        orbitY: ground + (height * 5.55 + jitter * .22) * heightFactor,
        orbitRadius: (.93 + height * 2.68) * (.96 + hash(`radius-${layer}-${item}`) * .08) * radiusFactor,
      });
    }
  }
  // Give broad castings room near the upper rim, keep tall columns in the
  // middle, and fill the remaining slots without coupling size to azimuth.
  for (const entry of [...entries].sort((a, b) => b.radius - a.radius)) {
    const halfHeight = (entry.dimensions.y / 2 + Math.max(entry.dimensions.x, entry.dimensions.z) * .18) * entry.scale;
    // Height bounds and targets follow the same ground-based scaling as the
    // slots, so a scaled funnel still selects the intended layer.
    const ceil = ground + (8.65 - ground) * heightFactor;
    let choices = slots.filter((slot) => slot.orbitY > halfHeight + .15 && slot.orbitY < ceil - halfHeight);
    if (!choices.length) choices = slots;
    const targetHeight = entry.radius > 1.5
      ? ground + ((entry.dimensions.y > Math.max(entry.dimensions.x, entry.dimensions.z) ? 4.2 : 6.3) - ground) * heightFactor
      : ground + hash(entry.part.id + '-layer') * 5.55 * heightFactor;
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
  const orbitPosition = new Vector3();
  const orbitOrientation = new Quaternion();
  const offset = new Vector3();
  const corner = new Vector3();
  const turn = new Quaternion();
  const spin = new Quaternion();
  const startRotation = new Quaternion();
  const rotation = new Quaternion();
  const euler = new Euler();
  let state = { progress: 0, rotationProgress: 0, funnelScale: 2.1, assemblyProgress: 0, assembledCount: 0, activeLabels: [], phase: 0, stage: 'arrival', totalParts: parts.length };

  function apply(value, camera) {
    const progress = clamp(value);
    const stage = progress < VORTEX_TIMING.arrivalEnd ? 'arrival' : progress < VORTEX_TIMING.assemblyStart ? 'vortex' : progress < VORTEX_TIMING.assemblyEnd ? 'assembly' : 'complete';
    const phase = { arrival: 0, vortex: 2, assembly: 4, complete: 5 }[stage];
    // One clock begins with the flight, so neither entering the funnel nor
    // reaching its normal radius resets angular velocity to zero.
    const rotationClock = clamp(progressToScroll(progress) / progressToScroll(VORTEX_TIMING.assemblyEnd));
    const rotationProgress = windTurn(rotationClock);
    const formation = smoother(clamp((progress - .035) / .145));
    const shrinkClock = clamp((progressToScroll(progress) - progressToScroll(.10))
      / (progressToScroll(VORTEX_TIMING.funnelSettled) - progressToScroll(.10)));
    const funnelScale = 1 + 1.1 * (1 - smoother(shrinkClock));
    const assemblyProgress = smoother(clamp((progress - VORTEX_TIMING.assemblyStart)
      / (VORTEX_TIMING.assemblyEnd - VORTEX_TIMING.assemblyStart)));
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

      const u = rotationClock;
      const envelope = Math.sin(Math.PI * u) ** 2;
      const phaseOffset = seed * TAU;
      // Stable multi-frequency offsets give each piece its own gust response.
      // They fade during assembly and remain deterministic on reverse scroll.
      const angularDrift = (.16 * Math.sin(TAU * u * 1.4 + phaseOffset)
        + .05 * Math.sin(TAU * u * 3.3 + phaseOffset * 1.7)) * envelope * envelope * (1 - assemblyProgress);
      const lift = (.16 + .28 * Math.sin(TAU * u * 1.7 + phaseOffset)
        + .10 * Math.cos(TAU * u * 3.1 + phaseOffset * 2)) * envelope;
      const breathing = 1 + .075 * Math.sin(TAU * u * 2.3 + phaseOffset) * envelope;
      const orbitRadius = (entry.orbitRadius * breathing + lift * .12) * funnelScale;
      const orbitY = ground + (entry.orbitY - ground) * (1 + .06 * (funnelScale - 1)) + lift;
      orbitPosition.set(Math.cos(entry.angle) * orbitRadius, orbitY, Math.sin(entry.angle) * orbitRadius);
      orbitPosition.lerp(homeCenter, assemblyProgress);
      turn.setFromAxisAngle(Y_AXIS, -(TAU * rotationProgress + angularDrift));
      const response = Math.max(.35, 1 - radius * .15) * (1 - assemblyProgress);
      euler.set(
        response * (.52 * Math.sin(TAU * u * 2.1 + phaseOffset)
          + .16 * Math.sin(TAU * u * 4.3 + phaseOffset * 1.5)) * envelope,
        .32 * response * Math.sin(TAU * u * 1.3 + phaseOffset * 1.7) * envelope,
        .46 * response * Math.cos(TAU * u * 1.7 + phaseOffset) * envelope,
      );
      spin.setFromEuler(euler);
      orbitOrientation.copy(orbitRotation).slerp(entry.rotation, assemblyProgress);

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
        // Bend the incoming streams into the already-moving broad funnel.
        // Formation is complete before the arrival stage ends, while its
        // radius continues shrinking across that boundary with no stop.
        if (formation === 1) position.copy(orbitPosition);
        else position.lerp(orbitPosition, formation);
        orbitOrientation.premultiply(spin);
        euler.set(timing.side * (1.1 + seed), (seed - .5) * 3.3, timing.side * (1.2 + seed));
        spin.setFromEuler(euler);
        startRotation.copy(orbitRotation).premultiply(spin);
        const orientationBlend = 1 - (1 - t) * (1 - formation);
        rotation.copy(startRotation).slerp(orbitOrientation, orientationBlend);
        size = 1 + (scale - 1) * orientationBlend;
      } else {
        position.copy(orbitPosition);
        rotation.copy(orbitOrientation).premultiply(spin);
        size = scale + (1 - scale) * assemblyProgress;
      }
      position.applyQuaternion(turn);
      rotation.premultiply(turn);

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
    state = { progress, rotationProgress, funnelScale, assemblyProgress, assembledCount: completed ? parts.length : 0,
      activeLabels: progress > 0 && !completed ? parts.map((part) => part.label) : [],
      phase, stage, totalParts: parts.length };
    return getState();
  }

  function getState() { return { ...state, activeLabels: [...state.activeLabels] }; }
  return { apply, getState };
}
