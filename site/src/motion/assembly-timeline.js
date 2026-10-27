// One reversible clock spans the page entrance, assembly and onward transition.
// The original model's physical scroll mapping stays intact.
export const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export const smooth = value => { const t = clamp(value); return t ** 3 * (10 - 15 * t + 6 * t * t); };
// Same .45-second damping as the standalone assembly, kept free of Three.js so
// the homepage controller does not eagerly import the rendering engine.
export function dampAssemblyScroll(current, target, elapsed, damping = .45) {
  const end = clamp(target), start = clamp(current);
  const next = start + (end - start) * -Math.expm1(-Math.max(0, elapsed) / damping);
  return Math.abs(end - next) < .0001 ? end : next;
}
// Start while the next page is entering, rather than waiting for sticky pinning.
export function assemblyScrollRange(stickyHeight, pinnedTravel) {
  const lead = stickyHeight * .85, tail = stickyHeight * .45;
  return { lead, tail, length: Math.max(1, pinnedTravel) + lead + tail };
}
export function assemblyTimeline(value) {
  const t = clamp(value);
  const content = clamp(t / .75), transfer = smooth((t - .87) / .13);
  const departure = smooth((content - .81) / .165);
  return {
    progress: t,
    content,
    transfer,
    flightScroll: clamp((content - .25) / .44),
    models: 1 - departure,
    captions: smooth((content - .70) / .07) * (1 - departure),
    departure,
    phase: t >= 1 ? 'complete' : t >= .87 ? 'equipment-flight' : t >= .75 ? 'title-hold' : content < .22 ? 'writing' : content < .57 ? 'title-flight' : content < .70 ? 'assembling' : content < .77 ? 'captions' : content < .81 ? 'reading' : 'title-return',
  };
}
// The destination is the real equipment heading at the final native scroll
// position. A fixed text layer bridges the sticky release without a jump.
export function equipmentLetterPose(transfer, index, start, end, baseSize) {
  const t = clamp(transfer), morph = smooth((t - .12 - index * .012) / .68);
  // Land before the native document takes over. The fully changed heading
  // holds at one measured viewport position instead of drifting with each
  // wheel input during the last part of the handoff.
  const travel = smooth(t / .82);
  return {
    x: start.x + (end.x - start.x) * travel,
    y: start.y + (end.y - start.y) * travel,
    scale: (start.size + (end.size - start.size) * travel) / baseSize,
    beforeOpacity: 1 - smooth(morph / .55),
    afterOpacity: smooth((morph - .45) / .55),
  };
}
export function letterPose(value, index, start, end, startSize, endSize, outro) {
  const reveal = smooth((value - .035 - index * .016) / .055);
  // The leading glyphs accelerate first; the following glyphs catch up at the
  // end. The changing phase gap opens and closes the space between characters.
  const travel = smooth((value - .22 - index * .008) / .29);
  const angle = travel * Math.PI / 2;
  // Return as one typographic group; per-letter position delays make the
  // leading glyph overtake its neighbour as the heading grows.
  const returnTravel = outro ? smooth((value - .81) / .16) : 0;
  const returnAngle = returnTravel * Math.PI / 2;
  // Open the two destination rows before enlarging. Growing on the vertical
  // leg would pile eight full-size letters into the old one-line heading.
  const returnSpread = 1 - Math.cos(returnAngle);
  const morph = outro ? smooth((value - .835 - index * .003) / .095) : 0;
  const size = startSize + (endSize - startSize) * smooth((value - .22) / .19);
  return {
    x: end.x + (start.x - end.x) * Math.cos(angle) + (outro ? (outro.x - end.x) * returnSpread : 0),
    y: start.y + (end.y - start.y) * Math.sin(angle) + (outro ? (outro.y - end.y) * Math.sin(returnAngle) : 0),
    // Shrink before the paths converge; a trailing large glyph must not cover
    // the previous glyph while their staggered flight clocks catch up.
    scale: (size + (outro ? (outro.size - endSize) * returnSpread : 0)) / endSize,
    opacity: reveal,
    travel,
    returnTravel,
    morph,
    beforeOpacity: 1 - smooth(morph / .55),
    afterOpacity: smooth((morph - .45) / .55),
  };
}
