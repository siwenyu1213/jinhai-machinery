import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#mill-stage')).toHaveAttribute('data-renderer', 'ready');
}

test('starts empty and real wheel scrolling assembles and reverses components', async ({ page }) => {
  await ready(page);
  const stage = page.locator('#mill-stage');
  await expect(stage).toHaveAttribute('data-progress', '0.00000');
  await expect(page.locator('#first-hint')).toBeVisible();
  await page.mouse.move(300, 300);
  await page.mouse.wheel(0, 2100);
  await expect.poll(() => page.evaluate(() => window.__millDemo.getState().progress)).toBeGreaterThan(.15);
  const forward = await page.evaluate(() => window.__millDemo.getState());
  expect(forward.assembledCount).toBeGreaterThan(0);
  await page.mouse.wheel(0, -1300);
  await expect.poll(() => page.evaluate(() => window.__millDemo.getState().progress)).toBeLessThan(forward.progress - .05);
  const backward = await page.evaluate(() => window.__millDemo.getState());
  expect(backward.assembledCount).toBeLessThan(forward.assembledCount);
});

test('native range, keyboard, completion and replay stay synchronized', async ({ page }) => {
  await ready(page);
  const slider = page.getByRole('slider', { name: '装配进度' });
  await slider.fill('500');
  await expect(page.locator('#progress-value')).toHaveText('50%');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('501');
  await page.getByRole('button', { name: '查看完成' }).click();
  await expect(page.locator('#phase-name')).toHaveText('装配完成');
  const state = await page.evaluate(() => window.__millDemo.getState());
  expect(state.assembledCount).toBe(state.totalParts);
  expect(state.totalParts).toBeGreaterThanOrEqual(25);
  const pose = await page.evaluate(() => window.__millDemo.getParts().every((part) => part.object.visible && part.object.position.distanceTo(part.homePosition) < 1e-8 && part.object.quaternion.angleTo(part.homeQuaternion) < 1e-6));
  expect(pose).toBe(true);
  await page.getByRole('button', { name: '重播' }).click();
  await expect(slider).toHaveValue('0');
  await expect(page.locator('#assembled-count')).toHaveText('0');
});

test('completed machine fits the stage and controls remain within the viewport', async ({ page }, testInfo) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  const layout = await page.evaluate(() => {
    const camera = window.__millDemo.getCamera();
    const box = window.__millDemo.getBounds();
    const points = [];
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
      const point = box.min.clone().set(x ? box.max.x : box.min.x, y ? box.max.y : box.min.y, z ? box.max.z : box.min.z).project(camera);
      points.push([point.x, point.y]);
    }
    const controls = document.querySelector('.controls').getBoundingClientRect();
    return { points, controls: { left: controls.left, right: controls.right, bottom: controls.bottom }, width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth };
  });
  expect(layout.scrollWidth).toBe(layout.width);
  expect(layout.controls.left).toBeGreaterThanOrEqual(0);
  expect(layout.controls.right).toBeLessThanOrEqual(layout.width);
  expect(layout.controls.bottom).toBeLessThanOrEqual(layout.height);
  for (const [x, y] of layout.points) { expect(Math.abs(x)).toBeLessThan(.95); expect(Math.abs(y)).toBeLessThan(.85); }
  await testInfo.attach('assembled-machine', { body: await page.screenshot(), contentType: 'image/png' });
});

test('scroll scene loads entirely from the local preview origin without runtime errors', async ({ page }) => {
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) external.push(request.url()); });
  await ready(page);
  for (const progress of [.12, .36, .58, .79, 1, .36]) {
    await page.evaluate((value) => window.__millDemo.setProgress(value), progress);
    await expect.poll(() => page.evaluate(() => window.__millDemo.getState().progress)).toBeCloseTo(progress, 2);
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('reduced motion keeps controls usable without near-camera flying pieces', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  expect(await page.evaluate(() => window.__millDemo.getParts().filter((part) => part.object.visible).length)).toBe(0);
  await page.getByRole('slider', { name: '装配进度' }).fill('450');
  const state = await page.evaluate(() => window.__millDemo.getState());
  expect(state.reducedMotion).toBe(true);
  expect(state.activeLabels).toEqual([]);
  const visible = await page.evaluate(() => window.__millDemo.getParts().filter((part) => part.object.visible).length);
  expect(visible).toBe(state.assembledCount);
  expect(visible).toBeGreaterThan(0);
  expect(visible).toBeLessThan(state.totalParts);
  await page.getByRole('button', { name: '查看完成' }).click();
  await expect(page.locator('#phase-name')).toHaveText('装配完成');
});

test('WebGL failure gives a readable component summary', async ({ page }) => {
  await page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/i.test(type) ? null : native.call(this, type, ...args);
    };
  });
  await page.goto('/');
  await expect(page.locator('#mill-stage')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.getByRole('heading', { name: '当前浏览器无法显示三维画面' })).toBeVisible();
  await expect(page.locator('#fallback li')).toHaveCount(6);
});
