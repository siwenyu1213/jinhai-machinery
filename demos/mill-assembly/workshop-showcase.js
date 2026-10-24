import { Box3, Quaternion, Vector3 } from 'three';
import { EYE, RIGHT, TRIANGLE_HOMES, TRIANGLE_RADIUS, TRIANGLE_DEPTH } from './workshop-model.js';

// A clock-driven controller: no timers, rendering, geometry or home mutations.
// The orbit translates rigid machines; each viewing quaternion stays separate.
export const SHOWCASE_TIMING = Object.freeze({ interval: 5000, duration: 1400, returnDelay: 3000, returnDuration: 700 });
export const SHOWCASE_RADIUS = TRIANGLE_RADIUS;
const STEP = Math.PI * 2 / 3;
const TAU = Math.PI * 2;
export const SLOT_ANGLES = Object.freeze({ front: 0, left: STEP * 2, right: STEP });
const wrap = (angle) => ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
const smoother = (value) => { const t = Math.min(1, Math.max(0, value)); return t ** 3 * (t * (t * 6 - 15) + 10); };
const IDENTITY = new Quaternion();
export function orbitOffset(theta, spread = 1) {
  return new Vector3().addScaledVector(RIGHT, Math.sin(theta) * SHOWCASE_RADIUS * spread).addScaledVector(EYE, Math.cos(theta) * TRIANGLE_DEPTH);
}

export function createShowcase({ machines, now = () => performance.now(), spread = 1 } = {}) {
  if (!machines?.length) throw new Error('showcase: machines required');
  const entries = new Map(machines.map((source) => {
    const pivot = source.homeBounds.getCenter(new Vector3());
    const angle = SLOT_ANGLES[TRIANGLE_HOMES[source.id]];
    return [source.id, { id: source.id, angle, pivot, origin: orbitOffset(angle),
      center: pivot.clone(), user: new Quaternion(), lift: 0, viewScale: 1, returnAt: null, returning: null,
      parts: source.parts.map((part) => ({ object: part.object,
        home: part.homePosition.clone(), local: part.homePosition.clone().sub(pivot), quaternion: part.homeQuaternion.clone() })),
    }];
  }));
  let active = false, paused = false, reduced = false, hidden = false, disposed = false;
  let phase = 0, transition = null, nextMoveAt = null, draggingId = null;
  const canAuto = () => active && !paused && !reduced && !hidden && !draggingId && !disposed;
  const resetClock = (time) => { nextMoveAt = canAuto() ? time + SHOWCASE_TIMING.interval : null; };
  const inspecting = () => [...entries.values()].some(entry => entry.returnAt !== null || entry.returning);
  const returning = () => [...entries.values()].some(entry => entry.returning);
  const touch = (time) => {
    for (const entry of entries.values()) {
      entry.returning = null;
      entry.returnAt = !entry.user.equals(IDENTITY) && !draggingId ? time + SHOWCASE_TIMING.returnDelay : null;
    }
  };

  function boundsOf(id, target = new Box3()) {
    target.makeEmpty();
    const entry = entries.get(id);
    if (entry) for (const part of entry.parts) target.union(new Box3().setFromObject(part.object));
    return target;
  }

  function applyMachine(entry, measureGround = false) {
    if (measureGround) entry.lift = 0;
    const shift = orbitOffset(entry.angle + phase, spread).sub(entry.origin);
    entry.center.copy(entry.pivot).add(shift);
    entry.center.y += entry.lift;
    for (const part of entry.parts) {
      if (phase === 0 && spread === 1 && entry.user.equals(IDENTITY) && entry.lift === 0 && entry.viewScale === 1) part.object.position.copy(part.home);
      else part.object.position.copy(part.local).multiplyScalar(entry.viewScale).applyQuaternion(entry.user).add(entry.center);
      part.object.quaternion.copy(entry.user).multiply(part.quaternion);
      part.object.scale.setScalar(entry.viewScale);
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
    for (const entry of entries.values()) {
      if (entry.returnAt !== null && time >= entry.returnAt) {
        entry.returning = { start: entry.returnAt, from: entry.user.clone() };
        entry.returnAt = null;
      }
      if (!entry.returning) continue;
      const t = (time - entry.returning.start) / SHOWCASE_TIMING.returnDuration;
      entry.user.slerpQuaternions(entry.returning.from, IDENTITY, smoother(t));
      if (t >= 1 || reduced) { entry.user.identity(); entry.returning = null; entry.viewScale = 1; }
      applyMachine(entry, true);
      changed = true;
    }
    if (transition) {
      const t = Math.max(0, (time - transition.start) / SHOWCASE_TIMING.duration);
      phase = transition.from + (transition.to - transition.from) * smoother(t);
      if (t >= 1) { phase = transition.to; transition = null; }
      changed = true;
    }
    if (!transition && !inspecting() && canAuto() && nextMoveAt !== null && time >= nextMoveAt) {
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
    needsFrame: () => Boolean(active && (transition || returning()) && !hidden && !draggingId && !disposed),
    nextWakeAt: () => {
      if (!active || hidden || draggingId || disposed) return null;
      const due = [...entries.values()].map(entry => entry.returnAt).filter(time => time !== null);
      if (canAuto() && !transition && !inspecting() && nextMoveAt !== null) due.push(nextMoveAt);
      return due.length ? Math.min(...due) : null;
    },
    setSpread(value) {
      if (disposed || !Number.isFinite(value) || value <= 0 || spread === value) return;
      spread = value;
      if (active) apply();
    },
    setViewScale(id, value) {
      const entry = entries.get(id);
      if (!entry || disposed || !active || !Number.isFinite(value) || value <= 0 || value > 1 || Math.abs(value - entry.viewScale) < 1e-6) return;
      entry.viewScale = value;
      applyMachine(entry, true);
    },
    select(id, time = now()) {
      const entry = entries.get(id);
      if (disposed || !active || hidden || draggingId || !entry) return false;
      update(time);
      touch(time);
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
      touch(time);
      nextMoveAt = null;
      return true;
    },
    rotate(id, quaternion, time = now()) {
      const entry = entries.get(id);
      if (disposed || !active || !entry || !quaternion?.toArray().every(Number.isFinite)) return false;
      entry.user.copy(quaternion).normalize();
      touch(time);
      applyMachine(entry, true);
      return true;
    },
    endDrag(time = now()) {
      if (!draggingId || disposed) return;
      draggingId = null;
      touch(time);
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
      if (!hidden && active) { touch(time); align(time); }
    },
    reset() {
      if (disposed) return;
      active = false; paused = false; draggingId = null; transition = null; nextMoveAt = null; phase = 0;
      for (const entry of entries.values()) { entry.user.identity(); entry.lift = 0; entry.viewScale = 1; entry.returnAt = null; entry.returning = null; }
      apply();
    },
    state() {
      let frontId = null;
      for (const entry of entries.values()) if (!transition && Math.abs(wrap(entry.angle + phase)) < 1e-6) frontId = entry.id;
      return { active, moving: Boolean(transition), paused, reduced, hidden, draggingId, phase, frontId, nextMoveAt, spread,
        machines: [...entries.values()].map((entry) => ({ id: entry.id, center: entry.center.toArray(),
          rotation: entry.user.toArray(), angle: entry.angle + phase, lift: entry.lift, viewScale: entry.viewScale,
          returnAt: entry.returnAt, returning: Boolean(entry.returning) })),
      };
    },
    dispose() { disposed = true; active = false; transition = null; nextMoveAt = null; draggingId = null; entries.clear(); },
  };
  return api;
}
