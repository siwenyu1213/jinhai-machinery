import { assemblyScrollRange, assemblyTimeline, dampAssemblyScroll, letterPose } from '../motion/assembly-timeline.js';

export function initInlineAssembly() {
  const section = document.querySelector('#assembly'); if (!section) return;
  const composition = section.querySelector('.assembly-composition'), host = section.querySelector('.inline-assembly-canvas');
  const targetTitle = section.querySelector('.assembly-title-target'), lettersHost = section.querySelector('.assembly-title-letters');
  const heading = section.querySelector('#assembly-title');
  const text = targetTitle.textContent, outro = heading.dataset.outro, captions = [...section.querySelectorAll('.machine-preview')];
  const letters = [...text].map((character, index) => {
    const node = document.createElement('span'), before = document.createElement('span'), after = document.createElement('span');
    before.textContent = character; after.textContent = [...outro][index] || '';
    before.className = 'assembly-letter-in'; after.className = 'assembly-letter-out';
    node.append(before, after); lettersHost.append(node); return { node, before, after };
  });
  targetTitle.replaceChildren(...[...text].map(character => { const node = document.createElement('span'); node.textContent = character; return node; }));
  const scope = new AbortController(), media = matchMedia('(prefers-reduced-motion: reduce)');
  let scene, loading = false, disposed = false, visible = false, frame = 0, current = 0, target = 0, lastTime = 0;
  let geometry = [], generation = 0, lastScene = -1;
  const reduced = () => media.matches || document.documentElement.dataset.motion === 'reduced';
  const animated = () => Boolean(scene && !reduced() && section.dataset.renderer === 'ready');
  function measure() {
    const box = composition.getBoundingClientRect(), height = box.height;
    const size = Math.min(height * .132, box.width * .25, 142);
    const endSize = parseFloat(getComputedStyle(targetTitle).fontSize);
    const rows = Math.ceil(letters.length / 2), step = size * 1.12, top = Math.max(112, (height - step * rows) / 2);
    const outroSize = Math.min(height * .112, box.width / 5.5, 104);
    geometry = [...targetTitle.children].map((node, index) => {
      const end = node.getBoundingClientRect();
      const column = index < rows ? 0 : 1, row = index % rows;
      return { start: { x: box.width / 2 + (column ? .65 : -.65) * size, y: top + row * step + size / 2 },
        end: { x: end.left - box.left + end.width / 2, y: end.top - box.top + end.height / 2 }, size, endSize,
        outro: { x: box.width / 2 + (index % 4 - 1.5) * outroSize * 1.06,
          y: height * .47 + (Math.floor(index / 4) - .5) * outroSize * 1.3, size: outroSize } };
    });
    scene?.resize(); lastScene = -1;
  }
  function scrollTarget() {
    const height = section.querySelector('.assembly-sticky').offsetHeight;
    const { lead, length } = assemblyScrollRange(height, section.offsetHeight - height);
    target = animated() ? Math.max(0, Math.min(1, (lead - section.getBoundingClientRect().top) / length)) : 1;
  }
  function paint() {
    const state = assemblyTimeline(current);
    section.dataset.phase = animated() ? state.phase : 'complete';
    section.style.setProperty('--assembly-captions', animated() ? state.captions : 1);
    section.style.setProperty('--assembly-models', animated() ? state.models : 1);
    heading.setAttribute('aria-label', animated() && state.departure > .5 ? outro : text);
    for (const [index, { node, before, after }] of letters.entries()) {
      const entry = geometry[index]; if (!entry) continue;
      const pose = letterPose(current, index, entry.start, entry.end, entry.size, entry.endSize, entry.outro);
      node.style.transform = `translate3d(${pose.x}px,${pose.y}px,0) translate(-50%,-50%) scale(${pose.scale})`;
      node.style.opacity = pose.opacity;
      const unchanged = before.textContent === after.textContent;
      before.style.opacity = unchanged ? 1 : pose.beforeOpacity;
      after.style.opacity = unchanged ? 0 : pose.afterOpacity;
    }
    const flight = animated() ? state.flightScroll : 1;
    if (scene && Math.abs(flight - lastScene) > 1e-7) { scene.render(flight); lastScene = flight; }
    captions.forEach(node => node.setAttribute('aria-hidden', String(animated() && state.captions === 0)));
    host.setAttribute('aria-hidden', String(animated() && state.models === 0));
  }
  function tick(time) {
    frame = 0; if (disposed || document.hidden || !visible) return;
    const elapsed = lastTime ? Math.min(.25, (time - lastTime) / 1000) : 1 / 60; lastTime = time;
    current = animated() ? dampAssemblyScroll(current, target, elapsed) : 1;
    paint(); if (current !== target) frame = requestAnimationFrame(tick);
  }
  function wake() { if (!frame && visible && !document.hidden && !disposed) { lastTime = 0; frame = requestAnimationFrame(tick); } }
  function sync() {
    section.classList.toggle('is-enhanced', animated());
    if (!animated()) current = 1;
    measure(); scrollTarget(); paint(); wake();
  }
  async function boot() {
    if (loading || disposed) return; loading = true; const request = ++generation;
    section.dataset.renderer = 'loading';
    try {
      const { createInlineAssembly } = await import('../three/machine-assembly.js');
      const candidate = await createInlineAssembly(host, {
        onLost() { section.dataset.renderer = 'fallback'; section.classList.remove('is-ready', 'is-enhanced'); sync(); },
        onRestore() { scene?.dispose(); scene = null; boot(); },
      });
      if (disposed || request !== generation) { candidate.dispose(); return; }
      scene?.dispose(); scene = candidate; section.dataset.renderer = 'ready'; section.classList.add('is-ready');
      await document.fonts.ready;
      section.classList.toggle('is-enhanced', !reduced());
      measure(); scrollTarget(); current = target; paint(); wake();
    } catch {
      section.dataset.renderer = 'fallback'; section.classList.remove('is-ready', 'is-enhanced'); sync();
    } finally { loading = false; }
  }
  const prefetch = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { boot(); prefetch.disconnect(); } }, { rootMargin: '1000px' }); prefetch.observe(section);
  const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) { scrollTarget(); wake(); } else { cancelAnimationFrame(frame); frame = 0; } }); intersection.observe(section);
  const resize = new ResizeObserver(() => { measure(); scrollTarget(); wake(); }); resize.observe(composition);
  const motion = new MutationObserver(sync); motion.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  window.addEventListener('scroll', () => { scrollTarget(); wake(); }, { passive: true, signal: scope.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { scrollTarget(); wake(); } }, { signal: scope.signal });
  media.addEventListener('change', sync, { signal: scope.signal });
  document.fonts.ready.then(() => { if (!disposed) { measure(); wake(); } });
  window.__inlineAssembly = {
    getState: () => ({ ...assemblyTimeline(current), target, ready: Boolean(scene), visible, reduced: reduced(), renderer: section.dataset.renderer, scene: scene?.getState() }),
    getModel: () => scene?.getModel(), getCamera: () => scene?.getCamera(), getRenderStats: () => scene?.getRenderStats(),
  };
  window.addEventListener('pagehide', () => { disposed = true; generation++; cancelAnimationFrame(frame); scope.abort(); prefetch.disconnect(); intersection.disconnect(); resize.disconnect(); motion.disconnect(); scene?.dispose(); }, { once: true });
}
