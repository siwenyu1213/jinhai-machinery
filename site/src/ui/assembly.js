import { assemblyPose, assemblyStops } from '../data/assembly.js';

export function initAssembly() {
  const section = document.querySelector('[data-assembly]');
  if (!section) return;
  const viewport = section.querySelector('.assembly-viewport');
  const controls = section.querySelector('.assembly-controls');
  const range = section.querySelector('#assembly-progress');
  const buttons = [...section.querySelectorAll('[data-assembly-stop]')];
  let scene;
  let loading;
  let value = 0;
  let manualAt;
  let animation = 0;
  let disposed = false;
  let reduced = document.documentElement.dataset.motion === 'reduced';

  function apply(progress) {
    const pose = assemblyPose(progress);
    value = pose.progress;
    section.dataset.progress = value.toFixed(3);
    section.dataset.spread = pose.spread.toFixed(3);
    section.dataset.phase = String(pose.phase);
    range.value = String(Math.round(value * 100));
    range.setAttribute('aria-valuetext', Math.round(value * 100) + '%，' + assemblyStops[pose.phase].title);
    section.querySelector('.assembly-progress-fill').style.transform = 'scaleX(' + value + ')';
    section.querySelector('#assembly-state').textContent = assemblyStops[pose.phase].title;
    section.querySelector('#assembly-description').textContent = assemblyStops[pose.phase].description;
    section.querySelector('#assembly-percent').textContent = String(Math.round(value * 100)).padStart(2, '0');
    buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === pose.phase)));
    scene?.setProgress(value);
  }
  function stopAnimation() {
    cancelAnimationFrame(animation);
    animation = 0;
  }
  async function load() {
    if (loading) return loading;
    section.dataset.renderer = 'loading';
    loading = import('../three/chuck-scene.js').then(({ createChuckScene }) => {
      if (disposed) return;
      scene = createChuckScene(viewport);
      scene.setProgress(value);
      section.dataset.renderer = 'webgl';
      controls.hidden = false;
      section.querySelector('.assembly-hint').textContent = reduced ? '拖动进度或点击按钮，查看结构' : '向下滚动，拆开再组合';
    }).catch(() => {
      section.dataset.renderer = 'fallback';
      section.querySelector('.assembly-hint').textContent = '静态结构展示';
      controls.hidden = true;
    });
    return loading;
  }
  const preload = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) { preload.disconnect(); load(); }
  }, { rootMargin: '700px' });
  preload.observe(section);

  function select(target, animate = true) {
    manualAt = window.scrollY;
    stopAnimation();
    if (reduced || !animate) return apply(target);
    const start = value, started = performance.now();
    const tick = (now) => {
      const fraction = Math.min(1, (now - started) / 650);
      const eased = fraction * fraction * (3 - 2 * fraction);
      apply(start + (target - start) * eased);
      if (fraction < 1) animation = requestAnimationFrame(tick);
      else animation = 0;
    };
    animation = requestAnimationFrame(tick);
  }
  buttons.forEach((button, index) => button.addEventListener('click', () => select(assemblyStops[index].at)));
  range.addEventListener('input', () => select(Number(range.value) / 100, false));
  const scroll = (event) => {
    if (reduced) return;
    if (manualAt !== undefined && Math.abs(window.scrollY - manualAt) < 5) return;
    manualAt = undefined;
    stopAnimation();
    apply(event.detail.progress);
  };
  section.addEventListener('assemblyscroll', scroll);
  const preference = new MutationObserver(() => {
    reduced = document.documentElement.dataset.motion === 'reduced';
    if (reduced) { stopAnimation(); apply(0); }
    if (scene) section.querySelector('.assembly-hint').textContent = reduced ? '拖动进度或点击按钮，查看结构' : '向下滚动，拆开再组合';
  });
  preference.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  const rendererState = new MutationObserver(() => {
    const available = section.dataset.renderer === 'webgl';
    controls.hidden = !available;
    if (section.dataset.renderer === 'fallback') {
      section.querySelector('.assembly-hint').textContent = '静态结构展示';
      section.querySelector('#assembly-state').textContent = '展开，看到里面';
      section.querySelector('#assembly-description').textContent = assemblyStops[1].description;
    }
    if (available) {
      apply(value);
      section.querySelector('.assembly-hint').textContent = reduced ? '拖动进度或点击按钮，查看结构' : '向下滚动，拆开再组合';
    }
  });
  rendererState.observe(section, { attributes: true, attributeFilter: ['data-renderer'] });
  apply(0);

  // The single renderer remains stable across reduced-motion toggles. It draws
  // only on state/size changes, and stops drawing when outside the viewport.
  const cleanup = () => {
    disposed = true;
    stopAnimation();
    preload.disconnect();
    preference.disconnect();
    rendererState.disconnect();
    section.removeEventListener('assemblyscroll', scroll);
    scene?.dispose();
  };
  window.addEventListener('pagehide', (event) => { if (!event.persisted) cleanup(); }, { once: true });
}

export function attachAssemblyScroll(ScrollTrigger) {
  const section = document.querySelector('[data-assembly]');
  if (!section) return () => {};
  let trigger;
  const create = () => {
    if (trigger || section.dataset.renderer === 'fallback') return;
    trigger = ScrollTrigger.create({
    trigger: section,
    start: () => 'top ' + (window.matchMedia('(max-width: 760px)').matches ? '76px' : '88px'),
    end: () => '+=' + Math.round(window.innerHeight * (window.matchMedia('(max-width: 760px)').matches ? 1.15 : 1.75)),
    pin: section.querySelector('.assembly-stage'),
    pinSpacing: true,
    invalidateOnRefresh: true,
    anticipatePin: 1,
    onUpdate: (self) => section.dispatchEvent(new CustomEvent('assemblyscroll', { detail: { progress: self.progress } })),
  });
  };
  const availability = new MutationObserver(() => {
    if (section.dataset.renderer === 'fallback') {
      trigger?.kill(true);
      trigger = undefined;
      ScrollTrigger.refresh();
    } else if (section.dataset.renderer === 'webgl') {
      create();
      // Controls become available after lazy initialization. Re-measure the
      // pin's natural size after that layout change, especially on phones.
      requestAnimationFrame(() => ScrollTrigger.refresh());
    }
  });
  availability.observe(section, { attributes: true, attributeFilter: ['data-renderer'] });
  create();
  return () => { availability.disconnect(); trigger?.kill(true); };
}
