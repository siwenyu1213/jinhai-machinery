import { createAssemblyFlight } from './motion.js';

/**
 * The workshop is one shared vortex, not three independent machines. Parts are
 * interleaved by machineId round-robin (the caller's array is never mutated) and
 * handed to a single assembly flight, so the three machines fly in from the same
 * edges, turn in one center and only resolve into their layout homes at the end.
 */
export function createWorkshopFlight(parts) {
  // Round-robin by machine in first-seen order, so each machine contributes one
  // piece per turn regardless of how many pieces each machine owns.
  const total = parts.length;
  const machines = [];
  for (const part of parts) if (!machines.includes(part.machineId)) machines.push(part.machineId);
  const buckets = new Map(machines.map((id) => [id, []]));
  for (const part of parts) buckets.get(part.machineId).push(part);
  const interleaved = [];
  for (let turn = 0; interleaved.length < total; turn++) {
    for (const id of machines) {
      const bucket = buckets.get(id);
      if (turn < bucket.length) interleaved.push(bucket[turn]);
    }
  }
  return createAssemblyFlight(interleaved, { vortexRadius: 1.65, vortexHeight: 1.18, pieceScale: .72, localSpaceBounds: true });
}
