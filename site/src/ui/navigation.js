export function initNavigation() {
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#main-nav');
  const media = window.matchMedia('(max-width: 1000px)');
  nav.dataset.enhanced = '';
  const close = () => {
    nav.hidden = media.matches;
    toggle.setAttribute('aria-expanded', 'false');
    header.classList.remove('menu-open');
  };
  const responsive = () => { toggle.hidden = !media.matches; close(); };
  responsive();
  media.addEventListener('change', responsive);
  toggle.addEventListener('click', () => {
    nav.hidden = !nav.hidden;
    toggle.setAttribute('aria-expanded', String(!nav.hidden));
    header.classList.toggle('menu-open', !nav.hidden);
  });
  nav.addEventListener('click', (event) => { if (event.target.closest('a')) close(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && media.matches && !nav.hidden) { close(); toggle.focus(); }
  });
  document.addEventListener('pointerdown', (event) => {
    if (media.matches && !nav.hidden && !header.contains(event.target)) close();
  });

  const links = [...nav.querySelectorAll('a')];
  const targets = links.map((link) => document.querySelector(link.hash));
  let scheduled = false;
  const update = () => {
    scheduled = false;
    header.classList.toggle('is-scrolled', window.scrollY > 24);
    const offset = header.offsetHeight + 100;
    let current = -1;
    targets.forEach((section, index) => {
      if (section && section.getBoundingClientRect().top <= offset) current = index;
    });
    links.forEach((link, index) => {
      if (index === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  const schedule = () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(update); }
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
}
