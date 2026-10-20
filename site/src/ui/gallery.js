import { connectDialog } from './dialog.js';

export function initGallery() {
  const open = connectDialog(document.querySelector('#image-dialog'));
  const image = document.querySelector('#dialog-image');
  document.querySelectorAll('[data-gallery]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-gallery]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    document.querySelectorAll('.gallery-item').forEach((item) => { item.hidden = button.dataset.gallery !== 'all' && button.dataset.gallery !== item.dataset.category; });
  }));
  document.querySelectorAll('.gallery-item').forEach((item) => item.addEventListener('click', (event) => {
    event.preventDefault();
    document.querySelector('#image-dialog-title').textContent = item.dataset.title;
    image.src = item.href;
    image.alt = item.querySelector('img').alt;
    const credit = document.querySelector('#dialog-credit');
    credit.textContent = `${item.dataset.credit} ↗`;
    credit.href = item.dataset.source;
    open(item);
  }));
}
