// The source site inspired the photographic composition, not its copy or assets.
const photographs = [
  {
    file: 'lathe.webp', width: 1600, height: 1067,
    alt: '车床刀架、导轨与手轮的机械结构，图库参考摄影，非本厂实拍',
    label: '机床 / 刀架与导轨', author: 'LISK OBE',
    source: 'https://unsplash.com/photos/close-up-of-an-old-metal-lathe-in-a-workshop-_VBsh_IKsD8',
  },
  {
    file: 'cutting.webp', width: 1200, height: 1800,
    alt: '激光切割头、板材与切割火花，图库参考摄影，非本厂设备',
    label: '钣金 / 激光切割', author: 'Cemrecan Yurtman',
    source: 'https://unsplash.com/photos/a-machine-cutting-a-piece-of-metal-with-sparks-thdb7o0nLyc',
  },
  {
    file: 'chuck.webp', width: 1600, height: 2406,
    alt: '钻夹头的金属滚花、齿圈与切削纹理，图库参考摄影，非本厂实拍',
    label: '金属 / 钻夹头细节', author: 'Miguel Ángel Padriñán Alba',
    source: 'https://unsplash.com/photos/a-close-up-shot-of-a-drill-chuck--D_-zq54DpI',
  },
];

export function initHero() {
  const group = document.querySelector('.hero-controls');
  const image = document.querySelector('#hero-image');
  const buttons = [...group.querySelectorAll('button')];
  const status = document.querySelector('#hero-status');
  let generation = 0;
  let current = 0;

  async function select(index) {
    const request = ++generation;
    status.textContent = '';
    if (index === current) return;
    const photo = photographs[index];
    const preload = new Image();
    preload.src = `./images/${photo.file}`;
    try {
      await preload.decode();
    } catch {
      if (request === generation) status.textContent = '这张图片暂时无法加载，仍可查看业务内容和当前摄影。';
      return;
    }
    // Slow responses cannot overwrite a newer choice or its attribution.
    if (request !== generation) return;
    image.src = preload.src;
    image.width = photo.width;
    image.height = photo.height;
    image.alt = photo.alt;
    image.dataset.frame = String(index);
    document.querySelector('#hero-photo-label').textContent = photo.label;
    const credit = document.querySelector('#hero-credit');
    credit.href = photo.source;
    credit.textContent = '图库参考，非本厂实拍 ↗';
    credit.setAttribute('aria-label', `摄影来源：${photo.author} / Unsplash，非本厂实拍`);
    buttons.forEach((button, position) => button.setAttribute('aria-pressed', String(position === index)));
    current = index;
    status.textContent = `已切换：${photo.label}。图库参考，非本厂实拍。`;
  }

  buttons.forEach((button, index) => button.addEventListener('click', () => select(index)));
  group.addEventListener('keydown', (event) => {
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    const next = { ArrowRight: (index + 1) % buttons.length, ArrowLeft: (index + buttons.length - 1) % buttons.length, Home: 0, End: buttons.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    buttons[next].focus();
    select(next);
  });
  // Manual changes only: readable without JS, without autoplay or a timer.
  group.hidden = false;
}
