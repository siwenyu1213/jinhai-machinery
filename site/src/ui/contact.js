import { checklist } from '../data/catalog.js';
import { connectDialog } from './dialog.js';

export function initContact() {
  const dialog = document.querySelector('#contact-dialog');
  const open = connectDialog(dialog);
  const status = document.querySelector('#copy-status');
  const manual = document.querySelector('#manual-copy');
  const label = document.querySelector('#manual-copy-label');
  document.querySelectorAll('[data-contact]').forEach((button) => button.addEventListener('click', () => {
    status.textContent = '';
    manual.hidden = label.hidden = true;
    open(button);
  }));
  document.querySelector('#copy-checklist').addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(checklist);
      manual.hidden = label.hidden = true;
      status.textContent = '资料清单已复制；没有提交任何信息。';
    } catch {
      manual.value = checklist;
      manual.hidden = label.hidden = false;
      status.textContent = '自动复制不可用，请使用下方文本手动复制。';
      manual.focus();
      manual.select();
    }
  });
}
