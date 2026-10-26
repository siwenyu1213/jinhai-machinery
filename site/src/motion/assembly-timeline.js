// One reversible clock: letters introduce the flight, assembly ends before
// captions appear. The original model's physical scroll mapping stays intact.
export const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export const smooth = value => { const t = clamp(value); return t ** 3 * (10 - 15 * t + 6 * t * t); };
// Same .45-second damping as the standalone assembly, kept free of Three.js so
// the homepage controller does not eagerly import the rendering engine.
export function dampAssemblyScroll(current, target, elapsed) {
  const end = clamp(target), start = clamp(current);
  const next = start + (end - start) * -Math.expm1(-Math.max(0, elapsed) / .45);
  return Math.abs(end - next) < .0001 ? end : next;
}
export function assemblyTimeline(value) {
  const t = clamp(value);
  return {
    progress: t,
    flightScroll: clamp((t - .27) / .62),
    captions: smooth((t - .90) / .09),
    phase: t < .23 ? 'writing' : t < .67 ? 'title-flight' : t < .89 ? 'assembling' : t < .99 ? 'captions' : 'complete',
  };
}
export function letterPose(value, index, start, end, startSize, endSize) {
  const reveal = smooth((value - .015 - index * .018) / .055);
  // The leading glyphs accelerate first; the following glyphs catch up at the
  // end. The changing phase gap opens and closes the space between characters.
  const travel = smooth((value - .23 - index * .009) / .36);
  const angle = travel * Math.PI / 2;
  return {
    x: end.x + (start.x - end.x) * Math.cos(angle),
    y: start.y + (end.y - start.y) * Math.sin(angle),
    // Shrink before the paths converge; a trailing large glyph must not cover
    // the previous glyph while their staggered flight clocks catch up.
    scale: (startSize + (endSize - startSize) * smooth((value - .23) / .22)) / endSize,
    opacity: reveal,
    travel,
  };
}
