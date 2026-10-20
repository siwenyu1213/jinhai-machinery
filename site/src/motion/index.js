import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { showStep } from '../ui/workbench.js';
import { steps } from '../data/catalog.js';
import { attachAssemblyScroll } from '../ui/assembly.js';

gsap.registerPlugin(ScrollTrigger);

export function createMotion() {
  const context = gsap.context(() => {
    gsap.from('.hero-photo', { scale: 1.07, duration: 1.4, ease: 'power2.out', clearProps: 'transform' });
    gsap.from('.hero-detail', { x: 20, opacity: .4, duration: .8, delay: .2, ease: 'power2.out', clearProps: 'transform,opacity' });
    gsap.from('.hero-copy > *', { y: 15, opacity: .35, duration: .65, stagger: .07, ease: 'power2.out', clearProps: 'transform,opacity' });
    gsap.from('.equipment-highlights > div', { scrollTrigger: { trigger: '.equipment-highlights', start: 'top 90%', once: true }, y: 20, opacity: .4, duration: .6, stagger: .09, clearProps: 'transform,opacity' });
    const releaseAssembly = attachAssemblyScroll(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add('(min-width: 900px)', () => {
      ScrollTrigger.create({ trigger: '#process', start: 'top 45%', end: 'bottom 30%', onUpdate: (self) => showStep(Math.min(steps.length - 1, Math.floor(self.progress * steps.length))) });
    });
    return () => { releaseAssembly(); media.revert(); };
  });
  const change = () => {
    gsap.killTweensOf('#service-image');
    gsap.fromTo('#service-image', { opacity: .55, y: 8 }, { opacity: 1, y: 0, duration: .22, ease: 'power2.out', clearProps: 'transform,opacity' });
  };
  const refresh = () => ScrollTrigger.refresh();
  document.addEventListener('servicechange', change);
  document.querySelector('.equipment-details').addEventListener('toggle', refresh);
  return () => {
    document.removeEventListener('servicechange', change);
    document.querySelector('.equipment-details').removeEventListener('toggle', refresh);
    gsap.killTweensOf('#service-image');
    gsap.set('#service-image', { clearProps: 'transform,opacity' });
    context.revert();
  };
}
