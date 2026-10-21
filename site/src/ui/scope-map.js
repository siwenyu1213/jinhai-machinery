export function initScopeMap() {
  const root = document.querySelector('#scope');
  if (!root) return;
  const map = root.querySelector('.scope-map-canvas');
  const regions = [...root.querySelectorAll('[data-scope-region]')];
  const controls = [...root.querySelectorAll('[data-scope-select]')];
  const choices = [...root.querySelectorAll('.scope-place')];
  const links = [...root.querySelectorAll('[data-scope-link]')];
  const geography = root.querySelector('.scope-map-geography');
  const wideMedia = window.matchMedia('(min-width: 761px)');
  // Expand the visible geographic window for a whole-row map. The projection
  // stays uniform and north-up; only machinery callouts spread into the sides.
  const wideView = [-300, 0, 1600, 820];
  root.querySelectorAll('.scope-machine').forEach((machine) => {
    const link = links.find((item) => item.dataset.scopeLink === machine.dataset.scopeSelect);
    const [x, y] = link.dataset.wideEnd.split(',').map(Number);
    machine.style.setProperty('--wide-map-x', `${(x - wideView[0]) / wideView[2] * 100}%`);
    machine.style.setProperty('--wide-map-y', `${(y - wideView[1]) / wideView[3] * 100}%`);
  });
  function updateLayout() {
    const wide = wideMedia.matches;
    root.dataset.mapLayout = wide ? 'wide' : 'compact';
    geography.setAttribute('viewBox', wide ? wideView.join(' ') : '0 0 1000 820');
    links.forEach((link) => {
      const end = wide ? link.dataset.wideEnd : link.dataset.compactEnd;
      link.querySelector('path').setAttribute('d', `M${link.dataset.origin}L${end}`);
    });
  }
  updateLayout();
  wideMedia.addEventListener('change', updateLayout);
  const status = root.querySelector('#scope-status');
  const names = Object.fromEntries(choices.map((button) => [button.dataset.scopeSelect, button.dataset.name]));
  const machines = Object.fromEntries(choices.map((button) => [button.dataset.scopeSelect, button.dataset.machine]));
  const hint = window.matchMedia('(hover: none)').matches ? '点按地图，查看设备' : '移到地图上，看设备升起';
  root.querySelector('#scope-current-machine').textContent = hint;
  let hovered = null;
  let focused = null;
  let selected = null;
  let current = null;

  function render() {
    const active = hovered || focused || selected;
    // Focus/click can retain the hovered visual while still needing a spoken
    // update; announce before deduplicating the visual rendering.
    if (!hovered) status.textContent = active ? `${names[active]}可上门机台维修。${machines[active]}为交互示意，具体机台及故障需沟通确认。` : '';
    if (active === current) return;
    current = active;
    root.dataset.activeRegion = active || '';
    [...regions, ...controls, ...links].forEach((element) => {
      const key = element.dataset.scopeRegion || element.dataset.scopeSelect || element.dataset.scopeLink;
      const isActive = key === active;
      element.classList.toggle('is-active', isActive);
      if (element.matches('[role="button"], button')) element.setAttribute('aria-pressed', String(isActive));
    });
    root.querySelector('#scope-current-name').textContent = active ? names[active] : '五地可上门';
    root.querySelector('#scope-current-machine').textContent = active ? `${machines[active]} · 交互示意` : hint;
  }

  regions.forEach((region) => {
    region.setAttribute('role', 'button');
    region.setAttribute('tabindex', '0');
    region.setAttribute('aria-pressed', 'false');
  });
  root.dataset.mapReady = 'true';
  map.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const target = event.target.closest('[data-scope-region], [data-scope-select]');
    hovered = target?.dataset.scopeRegion || target?.dataset.scopeSelect || null;
    render();
  });
  map.addEventListener('pointerleave', () => { hovered = null; render(); });
  choices.forEach((choice) => {
    choice.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      hovered = choice.dataset.scopeSelect;
      render();
    });
    choice.addEventListener('pointerleave', () => { hovered = null; render(); });
  });
  root.addEventListener('focusin', (event) => {
    const control = event.target.closest('[data-scope-region], [data-scope-select]');
    focused = control?.dataset.scopeRegion || control?.dataset.scopeSelect || null;
    hovered = null;
    render();
  });
  root.addEventListener('focusout', (event) => {
    const next = event.relatedTarget?.closest?.('[data-scope-region], [data-scope-select]');
    focused = next && root.contains(next) ? next.dataset.scopeRegion || next.dataset.scopeSelect : null;
    render();
  });
  root.addEventListener('click', (event) => {
    const control = event.target.closest('[data-scope-region], [data-scope-select]');
    if (!control) return;
    selected = control.dataset.scopeRegion || control.dataset.scopeSelect;
    focused = document.activeElement === control ? selected : null;
    hovered = null;
    render();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hovered = focused = selected = null;
      render();
      return;
    }
    const control = event.target.closest('[data-scope-region], .scope-place');
    if (!control) return;
    const group = control.matches('.scope-place') ? choices : regions;
    const index = group.indexOf(control);
    const offset = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (offset || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? group.length - 1 : (index + offset + group.length) % group.length;
      group[next].focus({ preventScroll: true });
    } else if (control.matches('[data-scope-region]') && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      selected = control.dataset.scopeRegion;
      hovered = null;
      render();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!root.contains(event.target)) {
      hovered = focused = selected = null;
      render();
    }
  }, { passive: true });
}
