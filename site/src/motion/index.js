import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function createMotion() {
  const paragraph = document.querySelector('.risk-intro p');
  const original = paragraph.innerHTML;
  // §2.1 / §3.6: one centered reading block, progressively inked in reading
  // order. Keep the approved type and ink/orange palette; no layout motion.
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT), textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach(text => text.replaceWith(...[...text.textContent].map(character => {
    const node = document.createElement('span'); node.className = 'intro-char'; node.textContent = character; return node;
  })));
  const chars = [...paragraph.querySelectorAll('.intro-char')];
  const colors = chars.map(node => getComputedStyle(node).color);
  const context = gsap.context(() => {
    gsap.fromTo(chars, { color: getComputedStyle(paragraph).getPropertyValue('--line').trim() }, {
      color: index => colors[index], duration: 1, stagger: .09, ease: 'none',
      scrollTrigger: { trigger: '.risk-intro', start: 'top 65%', end: 'bottom 65%', scrub: .25 },
    });
    gsap.from('.hero-copy > *', { y: 15, opacity: .35, duration: .65, stagger: .07, ease: 'power2.out', clearProps: 'transform,opacity' });
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
    paragraph.innerHTML = original;
  };
}
