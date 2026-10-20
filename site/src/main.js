import { initNavigation } from './ui/navigation.js';
import { initContact } from './ui/contact.js';
import { initGallery } from './ui/gallery.js';
import { initWorkbench } from './ui/workbench.js';
import { initAssembly } from './ui/assembly.js';

initNavigation();
initContact();
initGallery();
initWorkbench();
initAssembly();
document.documentElement.dataset.ready = 'true';

const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const button = document.querySelector('#motion-toggle');
let userReduced = false;
try { userReduced = localStorage.getItem('jinhai-reduced-motion') === 'true'; } catch { /* Storage is optional. */ }
let cleanup;
let generation = 0;
async function updateMotion() {
  const current = ++generation;
  cleanup?.();
  cleanup = undefined;
  const reduced = media.matches || userReduced;
  document.documentElement.dataset.motion = reduced ? 'reduced' : 'loading';
  button.setAttribute('aria-pressed', String(reduced));
  button.textContent = media.matches ? '已跟随系统减少动效' : reduced ? '恢复完整动效' : '减少动效';
  button.disabled = media.matches;
  if (!reduced) {
    try {
      const { createMotion } = await import('./motion/index.js');
      if (current === generation) {
        cleanup = createMotion();
        document.documentElement.dataset.motion = 'full';
      }
    } catch {
      // Core content and controls work without the optional animation chunk.
      document.documentElement.dataset.motion = 'unavailable';
      button.textContent = '基础展示模式';
      button.disabled = true;
    }
  }
}
button.hidden = false;
button.addEventListener('click', () => {
  userReduced = !userReduced;
  try { localStorage.setItem('jinhai-reduced-motion', String(userReduced)); } catch { /* Continue without persistence. */ }
  updateMotion();
});
media.addEventListener('change', updateMotion);
updateMotion();
