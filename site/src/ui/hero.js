const machines = [
  { id: 'mill', name: '铣床', color: '#d6d2bd', panel: '#32534b' },
  { id: 'lathe', name: '车床', color: '#285f55', panel: '#f2e9d6' },
  { id: 'laser', name: '激光切割机', color: '#cf6b2e', panel: '#25343d' },
];
export function initHero() {
  const hero = document.querySelector('.hero'), host = document.querySelector('#hero-machine-canvas');
  if (!hero || !host) return;
  const poster = document.querySelector('#hero-poster'), name = document.querySelector('#hero-machine-name');
  const buttons = [...document.querySelectorAll('[data-hero-machine]')], pauseButton = document.querySelector('#hero-pause');
  const scope = new AbortController();
  let scene, current = 'mill', ready = false, disposed = false, paused = false, visible = true, timer = null, generation = 0;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
  function clear() { if (timer !== null) clearTimeout(timer); timer = null; }
  function arm() { clear(); if (!ready || disposed || paused || reduced() || !visible || document.hidden) return;
    timer = setTimeout(() => select(machines[(machines.findIndex(machine => machine.id === current) + 1) % 3].id), 5000); }
  function describe(id) {
    const machine = machines.find(entry => entry.id === id); if (!machine) return;
    current = id; hero.dataset.machine = id; name.textContent = machine.name;
    name.style.color = machine.color; name.style.background = machine.panel;
    poster.src = `./images/generated/${id}-hero.webp`; poster.alt = `${machine.name}的通用三维结构示意，非本厂实拍或指定型号复刻`;
    for (const button of buttons) { if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset.heroMachine === id)); }
  }
  function select(id, instant = false) { if (!machines.some(machine => machine.id === id)) return false; clear();
    if (scene && ready) scene.select(id, instant); else describe(id); arm(); return true; }
  function sync() {
    scene?.setReduced(reduced()); scene?.setVisible(visible && !document.hidden); scene?.setPaused(paused);
    pauseButton.hidden = reduced() || !ready; pauseButton.textContent = paused ? '继续轮换' : '暂停轮换'; pauseButton.setAttribute('aria-pressed', String(paused)); arm();
  }
  async function boot() {
    const request = ++generation; ready = false; scene?.dispose(); scene = null; hero.dataset.renderer = 'loading'; poster.hidden = false;
    try {
      const { createMachineHero } = await import('../three/machine-hero.js');
      const candidate = await createMachineHero(host, {
        onChange: id => { if (ready) { describe(id); arm(); } },
        onLost: () => { ready = false; hero.dataset.renderer = 'fallback'; poster.hidden = false; clear(); pauseButton.hidden = true; }, onRestore: boot,
      });
      if (disposed || request !== generation) { candidate.dispose(); return; }
      scene = candidate; ready = true; scene.select(current, true); hero.dataset.renderer = 'ready'; poster.hidden = true; sync();
    } catch { hero.dataset.renderer = 'fallback'; poster.hidden = false; pauseButton.hidden = true; clear(); }
  }
  buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.heroMachine), { signal: scope.signal }));
  const group = document.querySelector('.hero-controls'); group.hidden = false;
  group.addEventListener('keydown', event => { const list = [...group.querySelectorAll('[data-hero-machine]')], index = list.indexOf(event.target);
    const next = { ArrowRight: (index + 1) % 3, ArrowLeft: (index + 2) % 3, Home: 0, End: 2 }[event.key];
    if (index < 0 || next === undefined) return; event.preventDefault(); list[next].focus(); select(list[next].dataset.heroMachine);
  }, { signal: scope.signal });
  pauseButton.addEventListener('click', () => { paused = !paused; sync(); }, { signal: scope.signal });
  const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, { threshold: .03 }); intersection.observe(hero);
  const motion = new MutationObserver(sync); motion.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  document.addEventListener('visibilitychange', sync, { signal: scope.signal });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', sync, { signal: scope.signal });
  describe(current); boot();
  window.__machineHero = { select, getState: () => ({ ...scene?.getState(), current, ready, paused, reducedMotion: reduced(), visible, renderer: hero.dataset.renderer }),
    getModels: () => scene?.getModels(), getCamera: () => scene?.getCamera(), getScene: () => scene?.getScene(), getRenderStats: () => scene?.getRenderStats(), capture: () => scene?.capture() };
  window.addEventListener('pagehide', () => { disposed = true; generation++; clear(); intersection.disconnect(); motion.disconnect(); scope.abort(); scene?.dispose(); }, { once: true });
}
