import { services, steps } from '../data/catalog.js';

let manualStep = false;

export function showStep(index, announce = false) {
  if (announce) manualStep = true;
  else if (manualStep) return;
  const stage = document.querySelector('.process-visual');
  stage.dataset.step = String(index);
  document.querySelectorAll('[data-step]').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.step) === index)));
  const description = document.querySelector('#process-description');
  description.setAttribute('aria-live', announce ? 'polite' : 'off');
  description.textContent = steps[index];
  stage.style.setProperty('--step', index);
}

export function initWorkbench() {
  const resumeScroll = () => { manualStep = false; };
  window.addEventListener('wheel', resumeScroll, { passive: true });
  window.addEventListener('touchmove', resumeScroll, { passive: true });
  window.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)
      && !event.target.closest('button, input, textarea, select, dialog')) resumeScroll();
  });
  document.querySelectorAll('[data-service]').forEach((button) => button.addEventListener('click', () => {
    const service = services[button.dataset.service];
    document.querySelectorAll('[data-service]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    const image = document.querySelector('#service-image');
    image.src = service.image;
    image.alt = `${service.title}概念示意`;
    document.querySelector('#service-caption').textContent = service.title;
    document.querySelector('#service-detail').textContent = service.description;
    document.dispatchEvent(new CustomEvent('servicechange'));
  }));
  document.querySelectorAll('[data-equipment]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-equipment]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    document.querySelectorAll('[data-kind]').forEach((row) => { row.hidden = button.dataset.equipment !== 'all' && row.dataset.kind !== button.dataset.equipment; });
  }));
  document.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => showStep(Number(button.dataset.step), true)));
  showStep(0);
}
