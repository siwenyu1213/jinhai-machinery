import { Box3, Quaternion, Vector3 } from 'three';
import { EYE, RIGHT, TRIANGLE_HOMES, TRIANGLE_RADIUS } from './workshop-model.js';

// A clock-driven controller: no timers, rendering, geometry or home mutations.
// The orbit translates rigid machines; each viewing quaternion stays separate.
export const SHOWCASE_TIMING = Object.freeze({ interval: 5000, duration: 1400 });
export const SHOWCASE_RADIUS = TRIANGLE_RADIUS;
const STEP = Math.PI * 2 / 3;
const TAU = Math.PI * 2;
export const SLOT_ANGLES = Object.freeze({ front: 0, left: STEP * 2, right: STEP });
const wrap = (angle) => ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
const smoother = (value) => { const t = Math.min(1, Math.max(0, value)); return t ** 3 * (t * (t * 6 - 15) + 10); };
const IDENTITY = new Quaternion();
export function orbitOffset(theta, radius = SHOWCASE_RADIUS) {
  return new Vector3().addScaledVector(RIGHT, Math.sin(theta) * radius).addScaledVector(EYE, Math.cos(theta) * radius);
}

export function createShowcase({ machines, now = () => performance.now() } = {}) {
  if (!machines?.length) throw new Error('showcase: machines required');
  const entries = new Map(machines.map((source) => {
    const pivot = source.homeBounds.getCenter(new Vector3());
    const angle = SLOT_ANGLES[TRIANGLE_HOMES[source.id]];
    return [source.id, { id: source.id, angle, pivot, origin: orbitOffset(angle),
      center: pivot.clone(), user: new Quaternion(), lift: 0,
      parts: source.parts.map((part) => ({ object: part.object,
        home: part.homePosition.clone(), local: part.homePosition.clone().sub(pivot), quaternion: part.homeQuaternion.clone() })),
    }];
  }));
  let active = false, paused = false, reduced = false, hidden = false, disposed = false;
  let phase = 0, transition = null, nextMoveAt = null, draggingId = null;
  const canAuto = () => active && !paused && !reduced && !hidden && !draggingId && !disposed;
  const resetClock = (time) => { nextMoveAt = canAuto() ? time + SHOWCASE_TIMING.interval : null; };

  function boundsOf(id, target = new Box3()) {
    target.makeEmpty();
    const entry = entries.get(id);
    if (entry) for (const part of entry.parts) target.union(new Box3().setFromObject(part.object));
    return target;
  }

  function applyMachine(entry, measureGround = false) {
    if (measureGround) entry.lift = 0;
    const shift = orbitOffset(entry.angle + phase).sub(entry.origin);
    entry.center.copy(entry.pivot).add(shift);
    entry.center.y += entry.lift;
    for (const part of entry.parts) {
      if (phase === 0 && entry.user.equals(IDENTITY) && entry.lift === 0) part.object.position.copy(part.home);
      else part.object.position.copy(part.local).applyQuaternion(entry.user).add(entry.center);
      part.object.quaternion.copy(entry.user).multiply(part.quaternion);
      part.object.scale.set(1, 1, 1);
      part.object.updateMatrixWorld(true);
    }
    if (measureGround) {
      const box = boundsOf(entry.id);
      const correction = -box.min.y;
      entry.lift += correction;
      entry.center.y += correction;
      for (const part of entry.parts) { part.object.position.y += correction; part.object.updateMatrixWorld(true); }
    }
  }
  function apply() { if (!disposed) for (const entry of entries.values()) applyMachine(entry); }
  function begin(target, time, automatic = false) {
    if (Math.abs(target - phase) < 1e-9) { transition = null; resetClock(time); return; }
    transition = { from: phase, to: target, start: time, automatic };
    resetClock(time);
  }
  function align(time) {
    const target = Math.round(phase / STEP) * STEP;
    if (reduced) { phase = target; transition = null; resetClock(time); apply(); }
    else begin(target, time);
  }
  function update(time = now()) {
    if (disposed || !active || hidden || draggingId) return false;
    let changed = false;
    if (transition) {
      const t = Math.max(0, (time - transition.start) / SHOWCASE_TIMING.duration);
      phase = transition.from + (transition.to - transition.from) * smoother(t);
      if (t >= 1) { phase = transition.to; transition = null; }
      changed = true;
    }
    if (!transition && canAuto() && nextMoveAt !== null && time >= nextMoveAt) {
      begin(phase - STEP, time, true);
      changed = true;
    }
    if (changed) apply();
    return changed;
  }

  const api = {
    start(time = now()) { if (disposed || active) return; active = true; resetClock(time); apply(); },
    update, apply, boundsOf,
    rotationOf: (id) => entries.get(id)?.user.clone() ?? null,
    needsFrame: () => Boolean(active && transition && !hidden && !draggingId && !disposed),
    nextWakeAt: () => canAuto() && !transition ? nextMoveAt : null,
    select(id, time = now()) {
      const entry = entries.get(id);
      if (disposed || !active || hidden || draggingId || !entry) return false;
      update(time);
      const target = phase + wrap(-entry.angle - phase);
      if (reduced) { phase = target; transition = null; resetClock(time); apply(); }
      else begin(target, time);
      return true;
    },
    beginDrag(id, time = now()) {
      if (disposed || !active || hidden || !entries.has(id)) return false;
      update(time);
      transition = null;
      draggingId = id;
      nextMoveAt = null;
      return true;
    },
    rotate(id, quaternion) {
      const entry = entries.get(id);
      if (disposed || !active || !entry || !quaternion?.toArray().every(Number.isFinite)) return false;
      entry.user.copy(quaternion).normalize();
      applyMachine(entry, true);
      return true;
    },
    endDrag(time = now()) {
      if (!draggingId || disposed) return;
      draggingId = null;
      align(time);
    },
    setPaused(value, time = now()) {
      if (disposed) return;
      update(time);
      paused = Boolean(value);
      if (paused && transition?.automatic) transition = null;
      resetClock(time);
      if (!paused && active && !hidden && !draggingId && !transition) align(time);
    },
    setReduced(value, time = now()) {
      if (disposed) return;
      update(time);
      reduced = Boolean(value);
      if (reduced && transition) { phase = transition.to; transition = null; apply(); }
      resetClock(time);
    },
    setHidden(value, time = now()) {
      if (disposed || hidden === Boolean(value)) return;
      update(time);
      hidden = Boolean(value);
      transition = null;
      draggingId = null;
      resetClock(time);
      if (!hidden && active) align(time);
    },
    reset() {
      if (disposed) return;
      active = false; paused = false; draggingId = null; transition = null; nextMoveAt = null; phase = 0;
      for (const entry of entries.values()) { entry.user.identity(); entry.lift = 0; }
      apply();
    },
    state() {
      let frontId = null;
      for (const entry of entries.values()) if (!transition && Math.abs(wrap(entry.angle + phase)) < 1e-6) frontId = entry.id;
      return { active, moving: Boolean(transition), paused, reduced, hidden, draggingId, phase, frontId, nextMoveAt,
        machines: [...entries.values()].map((entry) => ({ id: entry.id, center: entry.center.toArray(),
          rotation: entry.user.toArray(), angle: entry.angle + phase, lift: entry.lift })),
      };
    },
    dispose() { disposed = true; active = false; transition = null; nextMoveAt = null; draggingId = null; entries.clear(); },
  };
  return api;
}
