import { assemblyScrollRange, assemblyTimeline, dampAssemblyScroll, equipmentLetterPose, letterPose } from '../motion/assembly-timeline.js';
import { createEquipmentIntro } from './equipment-intro.js';

export function initInlineAssembly() {
  const section = document.querySelector('#assembly'); if (!section) return;
  const composition = section.querySelector('.assembly-composition'), host = section.querySelector('.inline-assembly-canvas');
  const targetTitle = section.querySelector('.assembly-title-target'), lettersHost = section.querySelector('.assembly-title-letters');
  const heading = section.querySelector('#assembly-title');
  const equipment = document.querySelector('#equipment'), equipmentTitle = equipment.querySelector('h2');
  const equipmentText = equipmentTitle.textContent;
  const text = targetTitle.textContent, outro = heading.dataset.outro, captions = [...section.querySelectorAll('.machine-preview')];
  // Keep three literal dots in one typographic slot, so the original five
  // characters still map one-to-one to the five-character equipment heading.
  const outroLetters = outro.endsWith('...') ? [...outro.slice(0, -3), '...'] : [...outro];
  const letters = [...text].map((character, index) => {
    const node = document.createElement('span'), before = document.createElement('span'), after = document.createElement('span'), next = document.createElement('span');
    before.textContent = character; after.textContent = outroLetters[index] || '';
    next.textContent = [...equipmentText][index] || '';
    before.className = 'assembly-letter-in'; after.className = 'assembly-letter-out'; next.className = 'assembly-letter-next';
    node.append(before, after, next); lettersHost.append(node); return { node, before, after, next };
  });
  targetTitle.replaceChildren(...[...text].map(character => { const node = document.createElement('span'); node.textContent = character; return node; }));
  equipmentTitle.replaceChildren(...[...equipmentText].map(character => { const node = document.createElement('span'); node.textContent = character; node.className = 'assembly-equipment-char'; return node; }));
  const scope = new AbortController(), media = matchMedia('(prefers-reduced-motion: reduce)');
  let scene, loading = false, disposed = false, visible = false, frame = 0, current = 0, target = 0, lastTime = 0;
  let geometry = [], generation = 0, lastScene = -1;
  const reduced = () => media.matches || ['reduced', 'unavailable'].includes(document.documentElement.dataset.motion);
  const animated = () => Boolean(scene && !reduced() && section.dataset.renderer === 'ready');
  const intro = createEquipmentIntro({ section: equipment, reduced,
    titleReady: () => !animated() || current === 1,
    onHold: () => { scrollTarget(); wake(); },
  });
  function setEnhanced() {
    const enabled = animated(), changed = section.classList.contains('is-enhanced') !== enabled;
    section.classList.toggle('is-enhanced', enabled);
    // The lazy 3D section grows from one viewport to several. Downstream
    // entrance triggers must measure that new document layout immediately.
    if (changed) document.dispatchEvent(new CustomEvent('assemblylayoutchange'));
  }
  function scrollRange() {
    const height = section.querySelector('.assembly-sticky').offsetHeight;
    const range = assemblyScrollRange(height, section.offsetHeight - height);
    const padding = equipmentTitle.getBoundingClientRect().top - equipment.getBoundingClientRect().top;
    // End the title flight at the numeric entrance itself; no extra half-screen
    // of native travel between the old handoff and the equipment hold.
    range.tail = height + padding - document.querySelector('.site-header').offsetHeight - 24;
    range.length = Math.max(1, section.offsetHeight - height) + range.lead + range.tail;
    return range;
  }
  function measure() {
    const box = composition.getBoundingClientRect(), height = box.height;
    const size = Math.min(height * .125, box.width * .28, 132);
    const endSize = parseFloat(getComputedStyle(targetTitle).fontSize);
    const step = size * 1.12, top = Math.max(112, (height - step * letters.length) / 2);
    const outroSize = Math.min(height * .112, box.width / 5.5, 104);
    const destinationSize = parseFloat(getComputedStyle(equipmentTitle).fontSize);
    const bottom = section.getBoundingClientRect().bottom, tail = height * .45;
    lettersHost.style.fontSize = `${endSize}px`;
    geometry = [...targetTitle.children].map((node, index) => {
      const end = node.getBoundingClientRect(), destination = equipmentTitle.children[index].getBoundingClientRect();
      return { start: { x: box.width / 2, y: top + index * step + size / 2 },
        end: { x: end.left - box.left + end.width / 2, y: end.top - box.top + end.height / 2 }, size, endSize,
        outro: { x: box.width / 2 + (index - (outroLetters.length - 1) / 2) * outroSize * 1.06,
          y: height * .47, size: outroSize },
        dock: { x: destination.left + destination.width / 2,
          y: height - tail + destination.top - bottom + destination.height / 2, size: destinationSize } };
    });
    scene?.resize(); lastScene = -1;
  }
  function scrollTarget() {
    const { lead, length } = scrollRange();
    const distance = lead - section.getBoundingClientRect().top;
    // Native scroll positions are rounded to device pixels. Still release the
    // real heading when the calculated handoff ends between two pixels.
    target = animated() ? distance >= length - 1 ? 1 : Math.max(0, distance / length) : 1;
  }
  function paint() {
    const state = assemblyTimeline(current);
    intro.update(current);
    section.dataset.phase = animated() ? state.phase : 'complete';
    section.style.setProperty('--assembly-captions', animated() ? state.captions : 1);
    section.style.setProperty('--assembly-models', animated() ? state.models : 1);
    heading.setAttribute('aria-label', !animated() ? text : state.transfer > .5 ? equipmentText : state.departure > .5 ? outro : text);
    const transferring = animated() && state.transfer > 0 && state.transfer < 1;
    if (transferring && lettersHost.parentElement !== document.body) document.body.append(lettersHost);
    if (!transferring && lettersHost.parentElement !== heading) heading.append(lettersHost);
    lettersHost.classList.toggle('is-transferring', transferring);
    lettersHost.style.opacity = animated() && state.transfer === 1 ? 0 : 1;
    equipmentTitle.classList.toggle('assembly-handoff-hidden', animated() && state.transfer < 1);
    const box = composition.getBoundingClientRect(), boundary = equipment.getBoundingClientRect().top;
    const overlayLeft = transferring ? lettersHost.getBoundingClientRect().left : 0;
    // The central interlude stays a hold, but answers every wheel step with a
    // visible drift instead of a completely frozen 700px stretch. The window
    // itself is left alone: widening the descent breaks the equipment hold's
    // fast-scroll guard, which needs the full document-overrun compensation.
    const holdDrift = (animated() ? state.hold : 0) * Math.min(box.height * .07, 70);
    // Before the clock finishes, fast wheel input can already move the real
    // document past its handoff endpoint. Carry the letters by exactly that
    // document displacement, so they can never trail below the equipment.
    const tail = box.height * .45, overrun = Math.max(0, box.height - tail - boundary);
    for (const [index, { node, before, after, next }] of letters.entries()) {
      const entry = geometry[index]; if (!entry) continue;
      const outro = { ...entry.outro, y: entry.outro.y + holdDrift };
      const pose = transferring
        ? equipmentLetterPose(state.transfer, index, { ...outro, x: outro.x + box.left, y: outro.y - overrun }, { ...entry.dock, y: entry.dock.y - overrun }, entry.endSize)
        : letterPose(state.content, index, entry.start, entry.end, entry.size, entry.endSize, outro);
      node.style.transform = `translate3d(${pose.x - overlayLeft}px,${pose.y}px,0) translate(-50%,-50%) scale(${pose.scale})`;
      node.style.opacity = transferring ? 1 : pose.opacity * (after.textContent ? 1 : 1 - pose.morph);
      const unchanged = before.textContent === after.textContent;
      before.style.opacity = transferring ? 0 : unchanged ? 1 : pose.beforeOpacity;
      after.style.opacity = transferring ? pose.beforeOpacity : unchanged ? 0 : pose.afterOpacity;
      next.style.opacity = transferring ? pose.afterOpacity : 0;
      const cut = (boundary - pose.y) / pose.scale + entry.endSize * .65;
      node.style.setProperty('--assembly-cut', `${Math.max(-1, Math.min(entry.endSize * 1.3 + 1, cut))}px`);
    }
    const flight = animated() ? state.flightScroll : 1;
    if (scene && Math.abs(flight - lastScene) > 1e-7) { scene.render(flight); lastScene = flight; }
    captions.forEach(node => node.setAttribute('aria-hidden', String(animated() && state.captions === 0)));
    host.setAttribute('aria-hidden', String(animated() && state.models === 0));
  }
  function tick(time) {
    frame = 0; if (disposed || document.hidden || (!visible && !intro.locked)) return;
    const elapsed = lastTime ? Math.min(.25, (time - lastTime) / 1000) : 1 / 60; lastTime = time;
    // Direct manipulation near the handoff should not trail the wheel by the
    // slower .45s assembly inertia. Keep that inertia for the 3D build-up.
    const urgent = current >= .75 || target >= .75;
    const damping = urgent ? .09 : intro.locked ? .18 : .45;
    current = animated() ? dampAssemblyScroll(current, target, elapsed, damping) : 1;
    paint(); if (current !== target) frame = requestAnimationFrame(tick);
  }
  function wake() { if (!frame && (visible || intro.locked) && !document.hidden && !disposed) { lastTime = 0; frame = requestAnimationFrame(tick); } }
  function sync() {
    setEnhanced();
    if (!animated()) current = 1;
    measure(); scrollTarget(); paint(); wake();
  }
  async function boot() {
    if (loading || disposed) return; loading = true; const request = ++generation;
    section.dataset.renderer = 'loading';
    try {
      const { createInlineAssembly } = await import('../three/machine-assembly.js');
      const candidate = await createInlineAssembly(host, {
        onLost() { section.dataset.renderer = 'fallback'; section.classList.remove('is-ready'); sync(); },
        onRestore() { scene?.dispose(); scene = null; boot(); },
      });
      await document.fonts.ready;
      if (disposed || request !== generation) { candidate.dispose(); return; }
      scene?.dispose(); scene = candidate; section.dataset.renderer = 'ready'; section.classList.add('is-ready');
      setEnhanced();
      measure(); scrollTarget(); current = target; paint(); wake();
    } catch {
      section.dataset.renderer = 'fallback'; section.classList.remove('is-ready'); sync();
    } finally { loading = false; }
  }
  const prefetch = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { boot(); prefetch.disconnect(); } }, { rootMargin: '1000px' }); prefetch.observe(section);
  const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; scrollTarget(); if (visible || intro.locked) wake(); else { cancelAnimationFrame(frame); frame = 0; current = target; paint(); } }); intersection.observe(section);
  const resize = new ResizeObserver(() => { measure(); scrollTarget(); wake(); }); resize.observe(composition);
  const motion = new MutationObserver(sync); motion.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  window.addEventListener('scroll', () => { scrollTarget(); if (!visible && !intro.locked && current !== target) { current = target; paint(); } else wake(); }, { passive: true, signal: scope.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { scrollTarget(); wake(); } }, { signal: scope.signal });
  media.addEventListener('change', sync, { signal: scope.signal });
  document.fonts.ready.then(() => { if (!disposed) { measure(); wake(); } });
  window.__inlineAssembly = {
    getState: () => ({ ...assemblyTimeline(current), target, range: scrollRange(), ready: Boolean(scene), visible, reduced: reduced(), renderer: section.dataset.renderer, scene: scene?.getState() }),
    getModel: () => scene?.getModel(), getCamera: () => scene?.getCamera(), getRenderStats: () => scene?.getRenderStats(),
  };
  window.__equipmentIntro = { getState: intro.getState };
  window.addEventListener('pagehide', () => { disposed = true; generation++; cancelAnimationFrame(frame); scope.abort(); prefetch.disconnect(); intersection.disconnect(); resize.disconnect(); motion.disconnect(); intro.dispose(); if (lettersHost.parentElement === document.body) lettersHost.remove(); scene?.dispose(); }, { once: true });
}
