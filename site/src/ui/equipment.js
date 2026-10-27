// Keep native <details> semantics and the no-script fallback. Only the
// disclosure's height and the optional, slower page follow are enhanced.
export function initEquipment() {
  const details = document.querySelector('.equipment-details'); if (!details) return;
  const summary = details.querySelector('summary'), panel = details.querySelector('.equipment-details-panel');
  const media = matchMedia('(prefers-reduced-motion: reduce)'), scope = new AbortController();
  let expanded = details.open, animation, scrollFrame = 0;
  const reduced = () => media.matches || document.documentElement.dataset.motion === 'reduced';
  const refresh = () => document.dispatchEvent(new CustomEvent('equipmentlayoutchange'));
  const stopScroll = () => { cancelAnimationFrame(scrollFrame); scrollFrame = 0; };
  function finish() {
    animation = undefined;
    details.open = expanded;
    details.style.removeProperty('height'); details.style.removeProperty('overflow');
    details.dataset.state = expanded ? 'open' : 'closed';
    summary.setAttribute('aria-expanded', String(expanded));
    refresh();
  }
  function followList() {
    stopScroll();
    const start = scrollY, header = document.querySelector('.site-header').offsetHeight;
    const end = Math.max(start, start + details.getBoundingClientRect().top - header - 24);
    if (end - start < 2) return;
    const begins = performance.now() + 220;
    function move(time) {
      const t = Math.max(0, Math.min(1, (time - begins) / 1400));
      const ease = t * t * t * (10 - 15 * t + 6 * t * t);
      window.scrollTo({ top: start + (end - start) * ease, behavior: 'instant' });
      scrollFrame = t < 1 ? requestAnimationFrame(move) : 0;
    }
    scrollFrame = requestAnimationFrame(move);
  }
  summary.addEventListener('click', event => {
    event.preventDefault(); stopScroll();
    const from = details.getBoundingClientRect().height;
    animation?.cancel(); animation = undefined;
    expanded = !expanded;
    summary.setAttribute('aria-expanded', String(expanded));
    if (reduced()) { finish(); return; }
    // Opening reveals the content for measurement; closing keeps it readable
    // until the animated height has reached the native summary height.
    details.open = true;
    details.style.removeProperty('height');
    const style = getComputedStyle(details);
    const collapsed = summary.getBoundingClientRect().height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const to = expanded ? details.getBoundingClientRect().height : collapsed;
    details.style.height = `${to}px`; details.style.overflow = 'clip';
    details.dataset.state = expanded ? 'opening' : 'closing';
    animation = details.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: expanded ? 820 : 420, easing: 'cubic-bezier(.25,.1,.25,1)' });
    animation.onfinish = finish;
    if (expanded) followList();
  }, { signal: scope.signal });
  const interrupt = event => {
    if (event.type !== 'keydown' || ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) stopScroll();
  };
  for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.addEventListener(name, interrupt, { passive: true, signal: scope.signal });
  const syncMotion = () => { if (reduced()) { stopScroll(); animation?.cancel(); finish(); } };
  media.addEventListener('change', syncMotion, { signal: scope.signal });
  const motion = new MutationObserver(syncMotion); motion.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  // Filter changes and responsive table wrapping can change the natural height.
  const resize = new ResizeObserver(() => { if (details.open && !animation) refresh(); }); resize.observe(panel);
  details.addEventListener('toggle', () => {
    if (!animation && details.open !== expanded) { expanded = details.open; finish(); }
  }, { signal: scope.signal });
  finish();
  window.addEventListener('pagehide', () => { stopScroll(); animation?.cancel(); scope.abort(); resize.disconnect(); motion.disconnect(); }, { once: true });
}
