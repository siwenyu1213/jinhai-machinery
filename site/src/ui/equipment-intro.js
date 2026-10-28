// A short, finite entrance: hold the real document at the equipment heading,
// finish its incoming title, then consume one deliberate scroll step per value.
// No wheel deltas are queued and no scrollbar width/layout is changed.
export function createEquipmentIntro({ section, reduced, titleReady, onHold }) {
  const heading = section.querySelector('h2'), values = [...section.querySelectorAll('.equipment-value')];
  const names = [...section.querySelectorAll('.equipment-name')], scope = new AbortController();
  let state = 'pending', locked = false, anchor = 0, previous = scrollY, armed = true;
  let frame = 0, generation = 0, animations = [], readyAt = 0, finishedAt = 0, touchY = 0, navigationTimer = 0;
  const landed = new Set();
  let input = 0, triggered = 0, active = false, firstRequested = false, lastTime = 0, weldingProgress = 0, weldingTarget = 0;
  const welding = section.querySelector('.welding'), weldingOriginal = welding.innerHTML;
  const walker = document.createTreeWalker(welding, NodeFilter.SHOW_TEXT), texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  texts.forEach(text => text.replaceWith(...[...text.textContent].map(character => {
    const node = document.createElement('span'); node.className = 'welding-char'; node.textContent = character; return node;
  })));
  const weldingChars = [...welding.querySelectorAll('.welding-char')];
  const color = name => getComputedStyle(section).getPropertyValue(name).match(/[\da-f]{2}/gi).map(v => parseInt(v, 16));
  const red = color('--orange'), ink = color('--ink');
  function paintWelding(progress) {
    weldingChars.forEach((node, index) => {
      const t = Math.max(0, Math.min(1, (progress - index / weldingChars.length * .65) / .35));
      const ease = t * t * (3 - 2 * t);
      node.style.color = `rgb(${red.map((c, i) => Math.round(c + (ink[i] - c) * ease)).join(',')})`;
    });
  }
  const dust = values.map(value => {
    const cloud = document.createElement('i'); cloud.className = 'equipment-dust'; cloud.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 7; i++) cloud.append(document.createElement('i'));
    value.append(cloud); return cloud;
  });
  const naturalAnchor = () => Math.max(0, scrollY + heading.getBoundingClientRect().top - document.querySelector('.site-header').offsetHeight - 24);
  const setState = value => { state = value; section.dataset.intro = value; };
  const clampScroll = () => { if (Math.abs(scrollY - anchor) > .5) scrollTo({ top: anchor, behavior: 'instant' }); };
  function clearAnimations() { generation++; animations.forEach(animation => animation.cancel()); animations = []; }
  function finish() {
    locked = false; cancelAnimationFrame(frame); frame = 0;
    delete document.documentElement.dataset.equipmentHold;
    document.documentElement.style.removeProperty('--equipment-scrollbar');
    active = false; paintWelding(1);
    setState('complete'); clearAnimations(); previous = scrollY;
  }
  function reset() {
    locked = false; cancelAnimationFrame(frame); frame = 0; clearAnimations();
    delete document.documentElement.dataset.equipmentHold;
    document.documentElement.style.removeProperty('--equipment-scrollbar');
    firstRequested = false; weldingProgress = weldingTarget = 0; paintWelding(0);
    landed.clear(); readyAt = finishedAt = input = triggered = 0; active = false; armed = false; previous = scrollY; setState('pending');
  }
  function playNumber() {
    if (active || triggered >= values.length) return;
    const request = generation, index = triggered++, value = values[index]; active = true; input = 0; setState('numbers');
      const animation = value.animate([
        { transform: 'translateY(-28px)', opacity: 0, offset: 0, easing: 'cubic-bezier(.5,0,1,1)' },
        { transform: 'translateY(0)', opacity: 1, offset: .2, easing: 'steps(1,end)' },
        { transform: 'translateY(0)', opacity: 1, offset: .3 },
        { transform: 'translate(1.8px,-1.2px) rotate(.4deg)', opacity: 1, offset: .38 },
        { transform: 'translate(-1.8px,1px) rotate(-.4deg)', opacity: 1, offset: .46 },
        { transform: 'translateY(0)', opacity: 1, offset: .54 },
        { transform: 'translate(1px,-.6px) rotate(.2deg)', opacity: 1, offset: .62 },
        { transform: 'translate(-1px,.5px) rotate(-.2deg)', opacity: 1, offset: .7 },
        { transform: 'translateY(0)', opacity: 1, offset: .8 },
        { transform: 'translateY(0)', opacity: 1, offset: 1 },
      ], { duration: 680, fill: 'both' });
      animations.push(animation);
      [...dust[index].children].forEach((puff, i) => {
        const x = (i - 3) * 11;
        animations.push(puff.animate([
          { opacity: 0, transform: 'translate(0,0) scale(.35)' },
          { opacity: .28, transform: `translate(${x * .35}px,-3px) scale(.8)`, offset: .16 },
          { opacity: 0, transform: `translate(${x}px,${-14 - (i % 3) * 5}px) scale(1.6)` },
        ], { duration: 620, delay: 136 + i * 8, fill: 'both', easing: 'ease-out' }));
      });
      animation.finished.then(() => {
        if (request !== generation) return;
        landed.add(index); active = false; input = 0;
        if (landed.size === values.length) revealWelding();
        else setState('awaiting-input');
      }).catch(() => {});
    names.filter((_, i) => i === index).forEach(name => {
      animations.push(name.animate([
        { transform: 'translateY(-6px)', color: getComputedStyle(section).getPropertyValue('--orange').trim(), opacity: .4 },
        { transform: 'translateY(0)', color: getComputedStyle(section).color, opacity: 1 },
      ], { duration: 420 }));
    });
  }
  function revealWelding() {
    const request = generation; setState('welding-reveal'); paintWelding(0);
    const reveals = weldingChars.map((node, index) => node.animate([
      { opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'translateX(0)' },
    ], { duration: 320, delay: index * 14, fill: 'both', easing: 'ease-out' }));
    animations.push(...reveals);
    Promise.all(reveals.map(animation => animation.finished)).then(() => {
      if (request === generation) setState('welding-color');
    }).catch(() => {});
  }
  function tick(time) {
    frame = 0; if (!locked) return;
    clampScroll();
    if (state === 'waiting-title' && titleReady()) {
      input = 0; setState('awaiting-input');
      if (firstRequested) { firstRequested = false; playNumber(); }
    }
    if (state === 'welding-color') {
      const elapsed = Math.min(.05, (time - (lastTime || time - 16)) / 1000);
      weldingProgress += (weldingTarget - weldingProgress) * -Math.expm1(-elapsed / .14);
      if (1 - weldingProgress < .001 && weldingTarget === 1) weldingProgress = 1;
      paintWelding(weldingProgress);
      if (weldingProgress === 1) { finish(); return; }
    }
    lastTime = time;
    frame = requestAnimationFrame(tick);
  }
  function enter(requestFirst = false) {
    if (state !== 'pending' || reduced()) return;
    anchor = naturalAnchor(); locked = true; readyAt = finishedAt = input = triggered = 0; active = false; landed.clear();
    firstRequested = requestFirst; weldingProgress = weldingTarget = 0; lastTime = 0;
    document.documentElement.style.setProperty('--equipment-scrollbar', `${innerWidth - document.documentElement.clientWidth}px`);
    document.documentElement.dataset.equipmentHold = 'true';
    setState('waiting-title'); clampScroll(); previous = anchor; onHold();
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function wheelPixels(event) { return event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1); }
  function downInput(event, delta) {
    if (reduced() || state === 'complete') return;
    if (locked && delta < 0) {
      event.preventDefault(); const top = Math.max(0, anchor + delta); reset();
      scrollTo({ top, behavior: 'instant' }); return;
    }
    if (locked) {
      event.preventDefault();
      if (state === 'waiting-title' && delta > 0) firstRequested = true;
      if (state === 'awaiting-input' && delta > 0) { input += delta; if (input >= 32) playNumber(); }
      if (state === 'welding-color' && delta > 0) {
        weldingTarget = Math.min(1, weldingTarget + Math.min(delta, 80) / 240);
        if (weldingTarget > .999) weldingTarget = 1;
      }
      return;
    }
    const end = naturalAnchor();
    if (armed && delta > 0 && scrollY < end && scrollY + delta >= end) { event.preventDefault(); enter(true); }
  }
  window.addEventListener('wheel', event => { if (!event.ctrlKey) downInput(event, wheelPixels(event)); }, { passive: false, capture: true, signal: scope.signal });
  window.addEventListener('touchstart', event => { touchY = event.touches[0]?.clientY || 0; }, { passive: true, signal: scope.signal });
  window.addEventListener('touchmove', event => {
    const next = event.touches[0]?.clientY ?? touchY; downInput(event, touchY - next); touchY = next;
  }, { passive: false, capture: true, signal: scope.signal });
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented) return;
    if (event.target.closest('input,textarea,select,[contenteditable=true]')) return;
    if (locked && ['Escape', 'Tab'].includes(event.key)) { finish(); return; }
    if (event.target.closest('button,summary,a,[role=button],[role=radio],[role=checkbox]')) return;
    const amount = { ArrowDown: 40, PageDown: innerHeight * .85, End: Number.MAX_SAFE_INTEGER, ' ': innerHeight * .85, ArrowUp: -40, PageUp: -innerHeight * .85, Home: -Number.MAX_SAFE_INTEGER }[event.key];
    if (amount !== undefined) downInput(event, event.shiftKey && event.key === ' ' ? -amount : amount);
  }, { signal: scope.signal });
  window.addEventListener('scroll', () => {
    if (reduced()) return;
    const now = scrollY, end = naturalAnchor();
    if (locked) {
      if (now < anchor - 2) reset(); else clampScroll();
    } else if (state === 'pending') {
      if (now < end - 8) armed = true;
      if (armed && previous < end - .5 && now >= end - .5) enter();
    }
    previous = scrollY;
  }, { passive: true, signal: scope.signal });
  // Explicit navigation and keyboard focus remain available during the hold.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link?.hash || link.origin !== location.origin || link.pathname !== location.pathname) return;
    if (link.hash !== '#equipment') {
      let destination;
      try { destination = document.getElementById(decodeURIComponent(link.hash.slice(1))); } catch { return; }
      if (locked || (destination && destination.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_PRECEDING)) finish();
    }
  }, { capture: true, signal: scope.signal });
  function navigate() {
    clearTimeout(navigationTimer);
    if (!location.hash || ['#home', '#assembly'].includes(location.hash)) return;
    if (location.hash !== '#equipment') { finish(); return; }
    if (document.documentElement.dataset.anchorRestoring === 'true') return;
    // Let the site's initial fragment restoration finish before docking the
    // equipment title. A direct visit still gets the same numeric entrance.
    navigationTimer = setTimeout(() => { if (location.hash === '#equipment' && state === 'pending' && !reduced()) enter(); }, 450);
  }
  window.addEventListener('hashchange', navigate, { signal: scope.signal });
  document.addEventListener('initialanchorrestored', navigate, { signal: scope.signal });
  function refresh() { if (locked) { anchor = naturalAnchor(); clampScroll(); } }
  window.addEventListener('resize', refresh, { signal: scope.signal });
  document.addEventListener('assemblylayoutchange', refresh, { signal: scope.signal });
  document.addEventListener('visibilitychange', () => animations.forEach(animation => {
    if (document.hidden && animation.playState === 'running') animation.pause();
    else if (!document.hidden && animation.playState === 'paused') animation.play();
  }), { signal: scope.signal });
  const motion = new MutationObserver(() => { if (reduced()) finish(); });
  motion.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  if (reduced() || !Element.prototype.animate) finish(); else setState('pending');
  // An explicit later-section visit bypasses the story before the browser's
  // initial fragment scroll, including while optional assets are failing.
  if (location.hash && !['#home', '#assembly', '#equipment'].includes(location.hash)) finish();
  if (document.readyState === 'complete') navigate();
  else window.addEventListener('load', navigate, { once: true, signal: scope.signal });
  return {
    get locked() { return locked; },
    update(progress) { if (reduced()) { if (state !== 'complete') finish(); } else if (['', '#home', '#assembly'].includes(location.hash) && state === 'complete' && progress < .85 && scrollY < naturalAnchor() - innerHeight * .5) reset(); },
    getState: () => ({ state, locked, anchor: locked ? anchor : naturalAnchor(), landed: landed.size, triggered, active, weldingProgress, weldingTarget }),
    dispose() { clearTimeout(navigationTimer); finish(); scope.abort(); motion.disconnect(); dust.forEach(node => node.remove()); welding.innerHTML = weldingOriginal; delete section.dataset.intro; },
  };
}
