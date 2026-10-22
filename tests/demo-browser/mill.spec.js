import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#mill-stage')).toHaveAttribute('data-renderer', 'ready');
}

test('starts empty and real wheel scrolling advances and reverses the simultaneous flight', async ({ page }) => {
  await ready(page);
  const stage = page.locator('#mill-stage');
  await expect(stage).toHaveAttribute('data-progress', '0.00000');
  await expect(page.locator('#first-hint')).toBeVisible();
  await page.mouse.move(300, 300);
  await page.mouse.wheel(0, 1600);
  await expect.poll(() => page.evaluate(() => window.__millDemo.getState().progress)).toBeGreaterThan(.15);
  const forward = await page.evaluate(() => window.__millDemo.getState());
  expect(forward.assembledCount).toBe(0);
  expect(await page.evaluate(() => window.__millDemo.getParts().filter((part) => part.object.visible).length)).toBe(forward.totalParts);
  await page.mouse.wheel(0, -1000);
  await expect.poll(() => page.evaluate(() => window.__millDemo.getState().progress)).toBeLessThan(forward.progress - .05);
  const backward = await page.evaluate(() => window.__millDemo.getState());
  expect(backward.assembledCount).toBe(0);
  await page.evaluate(() => window.__millDemo.setProgress(0));
  expect(await page.evaluate(() => window.__millDemo.getParts().filter((part) => part.object.visible).length)).toBe(0);
});

test('all components stay visible through the vortex and assemble together once', async ({ page }) => {
  await ready(page);
  for (const [progress, label, stage] of [[.25, '中央旋绕', 'vortex'], [.6, '中央旋绕', 'vortex'], [.8, '同步组装', 'assembly']]) {
    await page.evaluate((value) => window.__millDemo.setProgress(value), progress);
    await expect(page.locator('#phase-name')).toHaveText(label);
    const state = await page.evaluate(() => window.__millDemo.getState());
    expect(state.stage).toBe(stage);
    expect(state.assembledCount).toBe(0);
    expect(await page.evaluate(() => window.__millDemo.getParts().filter((part) => part.object.visible).length)).toBe(state.totalParts);
  }
  await page.evaluate(() => window.__millDemo.setProgress(.96));
  await expect(page.locator('#phase-name')).toHaveText('装配完成');
  const final = await page.evaluate(() => ({ state: window.__millDemo.getState(), exact: window.__millDemo.getParts().every((part) => part.object.visible && part.object.position.distanceTo(part.homePosition) < 1e-8 && part.object.quaternion.angleTo(part.homeQuaternion) < 1e-6) }));
  expect(final.state.assembledCount).toBe(final.state.totalParts);
  expect(final.exact).toBe(true);
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

test('the completed end mill is on screen and exposed to camera rays', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  const tool = await page.evaluate(() => window.__millDemo.inspectPart('endmill'));
  expect(tool.visible).toBe(true);
  expect(tool.projectedBounds.minX).toBeGreaterThan(-1);
  expect(tool.projectedBounds.maxX).toBeLessThan(1);
  expect(tool.projectedBounds.minY).toBeGreaterThan(-1);
  expect(tool.projectedBounds.maxY).toBeLessThan(1);
  expect(tool.exposedSamples).toBeGreaterThan(0);
});

test('viewing the inside is reversible and never changes assembly poses or visibility', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__millDemo.setProgress(.6));
  const before = await page.evaluate(() => window.__millDemo.getParts().map((part) => [part.id, part.object.position.toArray(), part.object.quaternion.toArray(), part.object.visible]));
  await page.getByRole('button', { name: '查看内部' }).click();
  await expect(page.getByRole('button', { name: '恢复外壳' })).toHaveAttribute('aria-pressed', 'true');
  const inside = await page.evaluate(() => {
    const covers = window.__millDemo.getParts().filter((part) => part.object.userData.isCover);
    let materialCount = 0;
    let allTranslucent = true;
    for (const cover of covers) cover.object.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materialCount++;
        if (!material.transparent || material.opacity >= .3 || material.depthWrite) allTranslucent = false;
      }
    });
    return { materialCount, allTranslucent, state: window.__millDemo.getState(), poses: window.__millDemo.getParts().map((part) => [part.id, part.object.position.toArray(), part.object.quaternion.toArray(), part.object.visible]) };
  });
  expect(inside.materialCount).toBeGreaterThan(0);
  expect(inside.allTranslucent).toBe(true);
  expect(inside.state.inspection).toBe(true);
  expect(inside.poses).toEqual(before);
  await page.getByRole('button', { name: '恢复外壳' }).click();
  await expect(page.getByRole('button', { name: '查看内部' })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.__millDemo.getState().inspection)).toBe(false);
  expect(await page.evaluate(() => window.__millDemo.getParts().map((part) => [part.id, part.object.position.toArray(), part.object.quaternion.toArray(), part.object.visible]))).toEqual(before);
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
  expect(visible).toBe(0);
  await page.getByRole('button', { name: '查看完成' }).click();
  await expect(page.locator('#phase-name')).toHaveText('装配完成');
  expect(await page.evaluate(() => window.__millDemo.getParts().filter((part) => part.object.visible).length)).toBe(state.totalParts);
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
