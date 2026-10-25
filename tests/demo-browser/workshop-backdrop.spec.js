import { test, expect } from '@playwright/test';
import { WORKSHOP_PALETTES } from '../../demos/mill-assembly/workshop-palette.js';

// The backdrop is presentation around the existing 91-part scene. Verify its
// public controls, actual painted materials and real showcase clock together,
// rather than advancing a second test-only rotation timeline.
test.describe.configure({ timeout: 45_000 });

const modes = [
  { id: 'studio', label: '工业摄影棚' },
  { id: 'airflow', label: '旋转气流' },
  { id: 'blueprint', label: '工程图纸' },
];
const machines = ['mill', 'lathe', 'laser'];
const titleColors = {
  mill: WORKSHOP_PALETTES.mill.body,
  lathe: WORKSHOP_PALETTES.lathe.body,
  laser: WORKSHOP_PALETTES.laser.bodyLight,
};

async function ready(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/workshop.html');
  await expect(page.locator('#workshop-stage')).toHaveAttribute('data-renderer', 'ready');
  await expect(page.locator('#workshop-backdrop')).toBeVisible();
  return errors;
}

async function completed(page, paused = true) {
  await page.locator('#complete').click();
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getState().completionLocked)).toBe(true);
  if (paused) {
    await page.getByRole('button', { name: '暂停轮换', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__workshopDemo.getShowcaseState().paused)).toBe(true);
  }
}

async function expectMode(page, mode) {
  await expect(page.locator('#workshop-stage')).toHaveAttribute('data-backdrop', mode);
  await expect(page.locator(`[data-backdrop-mode="${mode}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-backdrop-mode][aria-pressed="true"]')).toHaveCount(1);
}

async function expectTitle(page, id) {
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getShowcaseState().frontId)).toBe(id);
  await expect(page.locator('#machine-title')).toHaveAttribute('data-machine', id);
  await expect(page.locator(`#machine-title [data-machine-title="${id}"]`)).toHaveClass(/\bis-visible\b/);
  await expect(page.locator('#machine-title [data-machine-title].is-visible')).toHaveCount(1);
  await expect(page.locator(`#machine-title [data-machine-title="${id}"]`)).toHaveCSS('opacity', '1');
}

const poses = page => page.evaluate(() => ({
  progress: window.__workshopDemo.getState().progress,
  parts: window.__workshopDemo.getParts().map(part => ({
    id: part.id, position: part.object.position.toArray(),
    quaternion: part.object.quaternion.toArray(), scale: part.object.scale.toArray(),
    visible: part.object.visible,
  })),
}));

test('all three backdrops are keyboard-selectable and fit the desktop or phone viewport', async ({ page }, testInfo) => {
  const errors = await ready(page);
  await expect(page.locator('[data-backdrop-mode]')).toHaveCount(3);
  await expect(page.locator('#machine-title [data-machine-title]')).toHaveCount(3);
  for (let index = 0; index < modes.length; index++) {
    const mode = modes[index];
    const button = page.getByRole('button', { name: mode.label, exact: true });
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press(index % 2 ? 'Space' : 'Enter');
    await expectMode(page, mode.id);
    const bounds = await button.boundingBox();
    const viewport = page.viewportSize();
    expect(bounds).not.toBeNull();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach(`backdrop-${mode.id}-${viewport.width}`, { body: await page.screenshot(), contentType: 'image/png' });
  }
  expect(await page.evaluate(() => typeof window.__workshopDemo.setBackdrop)).toBe('function');
  expect(await page.evaluate(() => typeof window.__workshopDemo.getBackdropState)).toBe('function');
  expect(errors).toEqual([]);
});

test('changing the backdrop preserves the actual assembly poses and completed selection', async ({ page }) => {
  const errors = await ready(page);
  await page.evaluate(() => window.__workshopDemo.setProgress(.63));
  const during = await poses(page);
  expect(during.parts).toHaveLength(91);
  for (const mode of modes) {
    await page.locator(`[data-backdrop-mode="${mode.id}"]`).click();
    await expectMode(page, mode.id);
    expect(await poses(page)).toEqual(during);
  }
  await completed(page);
  await page.locator('.machine-label[data-machine="lathe"] button').click();
  await expectTitle(page, 'lathe');
  const finished = await poses(page);
  for (const mode of modes) {
    await page.evaluate(id => window.__workshopDemo.setBackdrop(id), mode.id);
    await expectMode(page, mode.id);
    expect(await poses(page)).toEqual(finished);
    await expectTitle(page, 'lathe');
    expect(await page.evaluate(() => window.__workshopDemo.getShowcaseState().paused)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('the displayed title follows manual selections and uses paint colors present on each real machine', async ({ page }) => {
  const errors = await ready(page);
  await completed(page);
  for (const id of machines) {
    await page.locator(`.machine-label[data-machine="${id}"] button`).click();
    await expectTitle(page, id);
    const observed = await page.evaluate(machineId => {
      const machine = window.__workshopDemo.getMachines().find(entry => entry.id === machineId);
      const paintColors = new Set();
      for (const part of machine.parts) part.object.traverse(object => {
        if (!object.isMesh) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material?.userData.materialRole === 'painted-cast-iron') paintColors.add(`#${material.color.getHexString()}`);
        }
      });
      const title = document.querySelector(`#machine-title [data-machine-title="${machineId}"]`);
      const computed = getComputedStyle(title);
      const sample = document.createElement('span');
      sample.style.color = title.style.color || computed.color;
      document.body.append(sample);
      const color = getComputedStyle(sample).color;
      sample.remove();
      const luminance = channels => channels.slice(0, 3).map(channel => {
        const value = channel / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const foreground = computed.color.match(/[\d.]+/g).map(Number);
      const background = computed.backgroundColor.match(/[\d.]+/g).map(Number);
      const light = luminance(foreground), dark = luminance(background);
      const rect = element => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      };
      return { text: title.textContent.trim(), color, paintColors: [...paintColors], label: machine.label,
        contrast: (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05),
        backingOpacity: background[3] ?? 1, fontSize: Number.parseFloat(computed.fontSize),
        titleRect: rect(title), labels: [...document.querySelectorAll('.machine-label button')].map(rect),
        viewport: { width: innerWidth, height: innerHeight },
      };
    }, id);
    const expected = titleColors[id];
    const rgb = expected.slice(1).match(/.{2}/g).map(hex => Number.parseInt(hex, 16));
    expect(observed.text).toBe(observed.label);
    expect(observed.color).toBe(`rgb(${rgb.join(', ')})`);
    expect(observed.paintColors).toContain(expected);
    expect(observed.fontSize).toBeGreaterThanOrEqual(24);
    expect(observed.backingOpacity).toBe(1);
    expect(observed.contrast, `${id} large title contrast against its actual backing`).toBeGreaterThanOrEqual(3);
    expect(observed.titleRect.left).toBeGreaterThanOrEqual(0);
    expect(observed.titleRect.right).toBeLessThanOrEqual(observed.viewport.width + 1);
    expect(observed.titleRect.top).toBeGreaterThanOrEqual(0);
    expect(observed.titleRect.bottom).toBeLessThanOrEqual(observed.viewport.height + 1);
    for (const button of observed.labels) {
      const title = observed.titleRect;
      const overlap = title.left < button.right && button.left < title.right && title.top < button.bottom && button.top < title.bottom;
      expect(overlap, `${id} title must not cover a machine selection button`).toBe(false);
    }
    expect(await page.evaluate(() => window.__workshopDemo.getShowcaseState().paused)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('the real automatic rotation changes the machine title when the next machine arrives', async ({ page }) => {
  const errors = await ready(page);
  await completed(page, false);
  await expectTitle(page, 'mill');
  const initialPhase = await page.evaluate(() => window.__workshopDemo.getShowcaseState().phase);
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getShowcaseState().moving), { timeout: 12_000 }).toBe(true);
  // A real orbit, not a title timer, must complete before the new name settles.
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getShowcaseState().frontId), { timeout: 6000 }).toBe('laser');
  await expectTitle(page, 'laser');
  expect(await page.evaluate(() => window.__workshopDemo.getShowcaseState().phase)).not.toBe(initialPhase);
  await page.getByRole('button', { name: '暂停轮换', exact: true }).click();
  const phase = await page.evaluate(() => window.__workshopDemo.getShowcaseState().phase);
  await page.waitForTimeout(400);
  await expectTitle(page, 'laser');
  expect(await page.evaluate(() => window.__workshopDemo.getShowcaseState().phase)).toBe(phase);
  expect(errors).toEqual([]);
});

test('reduced motion keeps backgrounds static and still names manually selected machines', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await ready(page);
  await completed(page, false);
  await expectTitle(page, 'mill');
  for (const mode of modes) {
    await page.locator(`[data-backdrop-mode="${mode.id}"]`).click();
    await expectMode(page, mode.id);
    const moving = await page.locator('#workshop-backdrop').evaluate(element => element.getAnimations({ subtree: true })
      .filter(animation => animation.playState === 'running' && animation.effect?.getTiming().iterations === Infinity).length);
    expect(moving, `${mode.id} has no running continuous background animation`).toBe(0);
  }
  for (const id of ['lathe', 'laser']) {
    await page.locator(`.machine-label[data-machine="${id}"] button`).click();
    await expectTitle(page, id);
  }
  const before = await page.evaluate(() => window.__workshopDemo.getShowcaseState());
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__workshopDemo.getShowcaseState());
  expect(after.phase).toBe(before.phase);
  expect(after.nextMoveAt).toBeNull();
  expect(after.reduced).toBe(true);
  expect(errors).toEqual([]);
});

test('repeated background switching keeps GPU resources flat and paused WebGL drawing idle', async ({ page }) => {
  const errors = await ready(page);
  await completed(page);
  for (const mode of modes) {
    await page.locator(`[data-backdrop-mode="${mode.id}"]`).click();
    await expectMode(page, mode.id);
    await expect.poll(() => page.locator('#workshop-backdrop').evaluate(element => element.getAnimations({ subtree: true })
      .filter(animation => animation.playState === 'running').length), {
      message: `${mode.id} autonomous background animations pause with the showcase`,
    }).toBe(0);
  }
  const warmed = await page.evaluate(() => window.__workshopDemo.getRenderStats());
  for (let turn = 0; turn < 24; turn++) {
    const mode = modes[turn % modes.length].id;
    await page.evaluate(id => window.__workshopDemo.setBackdrop(id), mode);
  }
  await expectMode(page, modes[23 % modes.length].id);
  const settled = await page.evaluate(() => window.__workshopDemo.getRenderStats());
  expect(settled.geometries).toBeLessThanOrEqual(warmed.geometries);
  expect(settled.textures).toBeLessThanOrEqual(warmed.textures);
  expect(settled.programs).toBeLessThanOrEqual(warmed.programs);
  // DOM motion may continue, but it must not rerender all 91 model parts.
  await page.waitForTimeout(250);
  const frames = await page.evaluate(() => window.__workshopDemo.getRenderStats().frames);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__workshopDemo.getRenderStats().frames)).toBe(frames);
  expect(errors).toEqual([]);
});

test('background controls remain usable when WebGL cannot initialize', async ({ page }) => {
  await page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/i.test(type) ? null : native.call(this, type, ...args);
    };
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/workshop.html');
  await expect(page.locator('#workshop-stage')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.getByRole('heading', { name: '当前浏览器无法显示三维画面' })).toBeVisible();
  await expect(page.locator('#fallback li')).toHaveCount(3);
  for (const mode of modes) {
    await page.getByRole('button', { name: mode.label, exact: true }).click();
    await expectMode(page, mode.id);
  }
  await expect(page.locator('#machine-title [data-machine-title].is-visible')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('every selected background displays its own decoded local generated image', async ({ page }) => {
  const errors = await ready(page);
  const sources = [];
  for (const mode of modes) {
    await page.locator(`[data-backdrop-mode="${mode.id}"]`).click();
    const image = page.locator(`[data-backdrop-image="${mode.id}"]`);
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
    const asset = await image.evaluate(node => ({ src: node.currentSrc, width: node.naturalWidth, height: node.naturalHeight,
      viewport: [innerWidth, innerHeight], rect: [node.getBoundingClientRect().width, node.getBoundingClientRect().height] }));
    expect(new URL(asset.src).origin).toBe(new URL(page.url()).origin);
    expect(asset.src).toContain(`${mode.id}-generated-v2`);
    expect(asset.width).toBeGreaterThanOrEqual(1600);
    expect(asset.height).toBeGreaterThanOrEqual(900);
    expect(asset.rect[0]).toBeGreaterThanOrEqual(asset.viewport[0]);
    expect(asset.rect[1]).toBeGreaterThanOrEqual(asset.viewport[1]);
    sources.push(asset.src);
  }
  expect(new Set(sources).size).toBe(3);
  expect(errors).toEqual([]);
});

test('unavailable background images preserve machine controls and a readable fallback', async ({ page }) => {
  await page.route('**/*-generated-v2-*.webp', route => route.abort());
  const errors = await ready(page);
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getBackdropState().images.every(image => image.failed))).toBe(true);
  await completed(page);
  await expectTitle(page, 'mill');
  for (const mode of modes) {
    await page.locator(`[data-backdrop-mode="${mode.id}"]`).click();
    await expectMode(page, mode.id);
    await expect(page.locator('#workshop-backdrop')).toBeVisible();
  }
  expect(errors).toEqual([]);
});
