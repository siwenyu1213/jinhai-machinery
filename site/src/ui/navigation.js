export function initNavigation() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#main-nav');
  const media = window.matchMedia('(max-width: 760px)');
  nav.dataset.enhanced = '';
  const close = () => { nav.hidden = media.matches; toggle.setAttribute('aria-expanded', 'false'); };
  const responsive = () => { toggle.hidden = !media.matches; close(); };
  responsive();
  media.addEventListener('change', responsive);
  toggle.addEventListener('click', () => {
    nav.hidden = !nav.hidden;
    toggle.setAttribute('aria-expanded', String(!nav.hidden));
  });
  nav.addEventListener('click', (event) => { if (event.target.closest('a')) close(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && media.matches && !nav.hidden) { close(); toggle.focus(); }
  });
}
