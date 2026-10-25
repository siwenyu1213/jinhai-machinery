// Design brief: the machines remain primary, their changing names secondary,
// and these backgrounds tertiary (§2.1/§2.4). Native CSS/SVG uses the existing
// Generated photographic plates carry the design. CSS only adds gentle
// camera drift. No independent JS render loop or third-party runtime request.
export const BACKDROP_MODES = Object.freeze([
  Object.freeze({ id: 'studio', label: '工业摄影棚' }),
  Object.freeze({ id: 'airflow', label: '旋转气流' }),
  Object.freeze({ id: 'blueprint', label: '工程图纸' }),
]);

const MODE_IDS = new Set(BACKDROP_MODES.map(({ id }) => id));
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const smooth = value => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10); };
export const BACKDROP_ASSETS = Object.freeze({
  studio: new URL('./assets/backgrounds/studio-generated-v2.webp', import.meta.url).href,
  airflow: new URL('./assets/backgrounds/airflow-generated-v2.webp', import.meta.url).href,
  blueprint: new URL('./assets/backgrounds/blueprint-generated-v2.webp', import.meta.url).href,
});

// A reversible, bounded mapping: the same scrub position always produces the
// same backdrop, without changing any machine's pose or motion clock.
export function mapBackdropState({ progress = 0, complete = false, showcasePhase = 0 } = {}) {
  const p = clamp(progress / .94);
  const rotation = Number.isFinite(showcasePhase) ? showcasePhase : 0;
  return {
    progress: p,
    turn: smooth(p) * 360 + rotation * 180 / Math.PI * .2,
    radius: 1.3 - .5 * smooth((p - .12) / .5),
    activity: complete ? .12 : .16 + .84 * Math.sin(Math.PI * p),
    floor: complete ? 1 : smooth((p - .58) / .42),
    parallax: (p - .5) * 16,
  };
}

function markup() {
  return BACKDROP_MODES.map(({ id }) => `<div class="backdrop-layer backdrop-${id}" data-backdrop-layer="${id}">
    <div class="backdrop-photo-frame"><img class="backdrop-photo" data-backdrop-image="${id}"
      src="${BACKDROP_ASSETS[id]}" alt="" decoding="async" draggable="false"></div>
  </div>`).join('');
}

export function createWorkshopBackdrop(host, { mode = 'studio', reducedMotion = false } = {}) {
  if (!host?.ownerDocument) throw new TypeError('A backdrop host element is required.');
  if (!MODE_IDS.has(mode)) throw new RangeError(`Unknown backdrop mode: ${mode}`);
  const root = host.ownerDocument.createElement('div');
  root.className = 'workshop-backdrop-content';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = markup();
  const onImageError = event => {
    if (!event.target.matches?.('[data-backdrop-image]')) return;
    event.target.dataset.failed = 'true';
    event.target.hidden = true;
  };
  root.addEventListener('error', onImageError, true);
  host.append(root);
  const state = { mode, reduced: Boolean(reducedMotion), hidden: false, paused: false, complete: false,
    progress: 0, stage: 'arrival', moving: false, frontId: null, showcasePhase: 0, disposed: false };
  let previousStyles = {};

  function apply() {
    if (state.disposed) return;
    root.dataset.mode = state.mode;
    root.dataset.reduced = String(state.reduced);
    root.dataset.still = String(state.reduced || state.hidden || state.paused);
    root.dataset.complete = String(state.complete);
    root.dataset.stage = state.stage;
    const mapped = mapBackdropState(state);
    const values = {
      '--backdrop-turn': `${state.reduced ? 0 : mapped.turn.toFixed(3)}deg`,
      '--backdrop-radius': mapped.radius.toFixed(4),
      '--backdrop-activity': (state.reduced ? .12 : mapped.activity).toFixed(4),
      '--backdrop-floor': mapped.floor.toFixed(4),
      '--backdrop-parallax': `${state.reduced ? 0 : mapped.parallax.toFixed(3)}px`,
    };
    for (const [key, value] of Object.entries(values)) if (previousStyles[key] !== value) root.style.setProperty(key, value);
    previousStyles = values;
    host.dataset.backdrop = state.mode;
  }

  apply();
  return {
    setMode(value) {
      if (!MODE_IDS.has(value)) throw new RangeError(`Unknown backdrop mode: ${value}`);
      if (state.disposed || state.mode === value) return;
      state.mode = value;
      apply();
    },
    update(value = {}) {
      if (state.disposed) return;
      if ('progress' in value) state.progress = Number.isFinite(value.progress) ? Math.max(0, Math.min(.94, value.progress)) : 0;
      for (const key of ['complete', 'moving', 'paused']) if (key in value) state[key] = Boolean(value[key]);
      if ('showcasePhase' in value) state.showcasePhase = Number.isFinite(value.showcasePhase) ? value.showcasePhase : 0;
      if ('stage' in value) state.stage = ['arrival', 'vortex', 'assembly', 'complete'].includes(value.stage) ? value.stage : 'arrival';
      if ('frontId' in value) state.frontId = ['mill', 'lathe', 'laser'].includes(value.frontId) ? value.frontId : null;
      apply();
    },
    setReduced(value) { state.reduced = Boolean(value); apply(); },
    setHidden(value) { state.hidden = Boolean(value); apply(); },
    getState: () => {
      const { progress: normalizedProgress, ...mapped } = mapBackdropState(state);
      return { ...state, ...mapped, normalizedProgress, reducedMotion: state.reduced,
        images: [...root.querySelectorAll('[data-backdrop-image]')].map(image => ({ id: image.dataset.backdropImage,
          loaded: image.complete && image.naturalWidth > 0, failed: image.dataset.failed === 'true' })),
      };
    },
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      root.removeEventListener('error', onImageError, true);
      root.remove();
      if (host.dataset.backdrop === state.mode) delete host.dataset.backdrop;
    },
  };
}
