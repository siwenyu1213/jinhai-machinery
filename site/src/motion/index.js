import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function createMotion() {
  const context = gsap.context(() => {
    gsap.from('.hero-copy > *', { y: 15, opacity: .35, duration: .65, stagger: .07, ease: 'power2.out', clearProps: 'transform,opacity' });
    gsap.utils.toArray('.equipment-metric').forEach((metric) => {
      const name = metric.querySelector('.equipment-name'), value = metric.querySelector('.equipment-value');
      const impact = gsap.timeline({ scrollTrigger: { trigger: metric, start: 'top 87%', once: true } });
      impact.fromTo(name, { y: -6, opacity: .2, color: 'var(--orange)' }, { y: 0, opacity: 1, color: 'var(--ink)', duration: .38, ease: 'power2.out', clearProps: 'transform,opacity,color' })
        .fromTo(value, { y: -28, opacity: 0, scaleY: 1.04 }, { y: 0, opacity: 1, scaleY: 1, duration: .24, ease: 'power3.in' }, .08)
        .to(value, { y: 2, scaleY: .94, scaleX: 1.025, duration: .09, ease: 'power1.out' })
        .to(value, { y: 0, scaleY: 1, scaleX: 1, duration: .2, ease: 'power2.out', clearProps: 'transform,opacity' });
    });
    gsap.fromTo('.welding .equipment-name', { y: -6, opacity: .2, color: 'var(--orange)' }, { scrollTrigger: { trigger: '.welding', start: 'top 87%', once: true }, y: 0, opacity: 1, color: 'var(--ink)', duration: .4, ease: 'power2.out', clearProps: 'transform,opacity,color' });
    gsap.utils.toArray('.section-heading').forEach((heading) => {
      // This heading already has a scroll-driven letter flight. A second
      // entrance transform changes its measured landing point mid-flight.
      if (heading.closest('#equipment')) return;
      gsap.from(heading, { scrollTrigger: { trigger: heading, start: 'top 92%', once: true }, y: 24, opacity: .4, duration: .7, ease: 'power2.out', clearProps: 'transform,opacity' });
    });
  });
  const change = () => {
    gsap.killTweensOf('#service-image');
    gsap.fromTo('#service-image', { opacity: .55, y: 8 }, { opacity: 1, y: 0, duration: .22, ease: 'power2.out', clearProps: 'transform,opacity' });
  };
  const refresh = () => ScrollTrigger.refresh();
  document.addEventListener('servicechange', change);
  document.addEventListener('equipmentlayoutchange', refresh);
  document.addEventListener('assemblylayoutchange', refresh);
  return () => {
    document.removeEventListener('servicechange', change);
    document.removeEventListener('equipmentlayoutchange', refresh);
    document.removeEventListener('assemblylayoutchange', refresh);
    gsap.killTweensOf('#service-image');
    gsap.set('#service-image', { clearProps: 'transform,opacity' });
    context.revert();
  };
}
