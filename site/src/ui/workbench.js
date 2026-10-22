import { services, steps } from '../data/catalog.js';

let currentStep = 0;

export function showStep(index, announce = false) {
  currentStep = index;
  const stage = document.querySelector('.process-visual');
  stage.dataset.processStep = String(index);
  document.querySelectorAll('[data-step]').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.step) === index)));
  const description = document.querySelector('#process-description');
  description.setAttribute('aria-live', announce ? 'polite' : 'off');
  description.textContent = steps[index].description;
  document.querySelectorAll('[data-process-photo]').forEach((photo) => { photo.hidden = Number(photo.dataset.processPhoto) !== index; });
  document.querySelector('#process-current').textContent = String(index + 1).padStart(2, '0');
  document.querySelector('#process-photo-label').textContent = steps[index].label;
  const credit = document.querySelector('#process-credit');
  credit.textContent = '摄影来源 ↗';
  credit.setAttribute('aria-label', `摄影来源：${steps[index].credit}`);
  credit.href = steps[index].source;
  stage.style.setProperty('--progress', (index + 1) / steps.length);
}

export function initWorkbench() {
  let playbackTimer;
  let paused = false;
  const playback = document.querySelector('#process-playback');
  const restartPlayback = () => {
    window.clearInterval(playbackTimer);
    if (!paused && !document.hidden) {
      playbackTimer = window.setInterval(() => showStep((currentStep + 1) % steps.length), 3000);
    }
  };
  playback.addEventListener('click', () => {
    paused = !paused;
    playback.textContent = paused ? '继续播放' : '3 秒轮播 · 暂停';
    restartPlayback();
  });
  document.addEventListener('visibilitychange', restartPlayback);
  document.querySelectorAll('[data-service]').forEach((button) => button.addEventListener('click', () => {
    const service = services[button.dataset.service];
    document.querySelectorAll('[data-service]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    const image = document.querySelector('#service-image');
    image.src = service.image;
    image.alt = service.alt;
    const credit = document.querySelector('#service-credit');
    credit.textContent = '图库参考，非本厂实拍 ↗';
    credit.setAttribute('aria-label', `摄影来源：${service.credit}，非本厂实拍`);
    credit.href = service.source;
    document.querySelector('#service-caption').textContent = service.title;
    document.querySelector('#service-detail').textContent = service.description;
    document.dispatchEvent(new CustomEvent('servicechange'));
  }));
  document.querySelectorAll('[data-equipment]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-equipment]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    document.querySelectorAll('[data-kind]').forEach((row) => { row.hidden = button.dataset.equipment !== 'all' && row.dataset.kind !== button.dataset.equipment; });
  }));
  document.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => {
    showStep(Number(button.dataset.step), true);
    restartPlayback();
  }));
  showStep(0);
  restartPlayback();
}
