import { initNavigation } from './ui/navigation.js';
import { initContact } from './ui/contact.js';
import { initGallery } from './ui/gallery.js';
import { initWorkbench } from './ui/workbench.js';
import { initAssembly } from './ui/assembly.js';
import { initScopeMap } from './ui/scope-map.js';
import { initHero } from './ui/hero.js';

initNavigation();
initHero();
initContact();
initGallery();
initWorkbench();
initAssembly();
initScopeMap();
document.documentElement.dataset.ready = 'true';

const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const button = document.querySelector('#motion-toggle');
let userReduced = false;
try { userReduced = localStorage.getItem('jinhai-reduced-motion') === 'true'; } catch { /* Storage is optional. */ }
let cleanup;
let generation = 0;
const initialAnchor = window.location.hash;
let initialAnchorPending = Boolean(initialAnchor);
const anchorEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
const cancelInitialAnchor = () => {
  initialAnchorPending = false;
  anchorEvents.forEach((name) => window.removeEventListener(name, cancelInitialAnchor, true));
};
if (initialAnchorPending) anchorEvents.forEach((name) => window.addEventListener(name, cancelInitialAnchor, { capture: true, passive: true }));
function restoreInitialAnchor() {
  if (!initialAnchorPending) return;
  let target;
  try { target = document.getElementById(decodeURIComponent(initialAnchor.slice(1))); } catch { return; }
  if (!target) return;
  const align = () => {
    if (initialAnchorPending && window.location.hash === initialAnchor && !document.querySelector('dialog[open]')) {
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  };
  const afterLoad = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    // Browsers can be halfway through a native smooth fragment jump when
    // ScrollTrigger takes its measurements. Align after load, then once more
    // after its deferred refresh; any real user input cancels this restoration.
    align();
    setTimeout(() => { align(); cancelInitialAnchor(); }, 300);
  }));
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });
}
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
  restoreInitialAnchor();
}
button.hidden = false;
button.addEventListener('click', () => {
  userReduced = !userReduced;
  try { localStorage.setItem('jinhai-reduced-motion', String(userReduced)); } catch { /* Continue without persistence. */ }
  updateMotion();
});
media.addEventListener('change', updateMotion);
updateMotion();
