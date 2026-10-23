import { test, expect } from '@playwright/test';

const PAGE = '/model-review.html';

async function ready(page) {
  await page.goto(PAGE);
  await expect(page.locator('.stage')).toHaveAttribute('data-renderer', 'ready');
  await expect.poll(() => page.evaluate(() => window.__modelReview?.getState().ready)).toBe(true);
}

test('both machines load with real geometry and the lathe is the default', async ({ page }) => {
  await ready(page);
  const report = await page.evaluate(() => {
    const api = window.__modelReview;
    const ids = Object.keys(api.getModels());
    const info = api.getModelInfo();
    return {
      ids,
      state: api.getState(),
      lathe: info.lathe,
      laser: info.laser,
      parts: Object.fromEntries(ids.map((id) => [id, api.getModels()[id].children.length])),
      environment: api.getScene().environment?.isTexture === true,
    };
  });
  expect(report.ids.sort()).toEqual(['laser', 'lathe']);
  expect(report.state.machineId).toBe('lathe');
  expect(report.state.ready).toBe(true);
  expect(report.state.partCount).toBeGreaterThanOrEqual(18);
  expect(report.lathe.parts).toBeGreaterThanOrEqual(18);
  expect(report.laser.parts).toBeGreaterThanOrEqual(18);
  expect(report.lathe.meshes).toBeGreaterThan(20);
  expect(report.laser.meshes).toBeGreaterThan(20);
  expect(report.lathe.visible).toBe(true);
  expect(report.laser.visible).toBe(false);
  expect(report.environment).toBe(true);
  await expect(page.locator('#device-name')).toHaveText('车床');
  await expect(page.locator('#part-count')).toHaveText(String(report.state.partCount));
});

test('semantic device and view buttons switch machines and views', async ({ page }) => {
  await ready(page);
  const lathe = page.getByRole('button', { name: '车床' });
  const laser = page.getByRole('button', { name: '激光切割机' });
  await expect(lathe).toHaveAttribute('aria-pressed', 'true');
  await expect(laser).toHaveAttribute('aria-pressed', 'false');
  await laser.click();
  await expect(laser).toHaveAttribute('aria-pressed', 'true');
  await expect(lathe).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#device-name')).toHaveText('激光切割机');
  let state = await page.evaluate(() => ({ ...window.__modelReview.getState(), info: window.__modelReview.getModelInfo(), press: [...document.querySelectorAll('.view-button')].map((b) => b.getAttribute('aria-pressed')) }));
  expect(state.machineId).toBe('laser');
  expect(state.partCount).toBeGreaterThanOrEqual(18);
  expect(await page.locator('#part-count')).toHaveText(String(state.partCount));
  expect(state.info.laser.visible).toBe(true);
  expect(state.info.lathe.visible).toBe(false);
  // Keyboard activation on the device switch.
  await lathe.focus();
  await page.keyboard.press('Enter');
  await expect(lathe).toHaveAttribute('aria-pressed', 'true');
  // View buttons are pressed-state controls.
  await page.getByRole('button', { name: '正面' }).click();
  await expect(page.getByRole('button', { name: '正面' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '俯视' }).focus();
  await page.keyboard.press(' ');
  await expect(page.getByRole('button', { name: '俯视' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '正面' })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.__modelReview.getState().view)).toBe('top');
});

test('front, top and reset produce distinct camera poses with the machine in frame', async ({ page }) => {
  await ready(page);
  const positions = {};
  const directions = {};
  for (const view of ['iso', 'front', 'top']) {
    await page.evaluate((value) => window.__modelReview.setView(value), view);
    const pose = await page.evaluate(() => {
      const api = window.__modelReview;
      const camera = api.getCamera();
      return { pos: camera.position.toArray(), direction: camera.getWorldDirection(camera.position.clone()).toArray(), projected: api.getProjected() };
    });
    expect(Object.values(pose.pos).every(Number.isFinite)).toBe(true);
    expect(Math.abs(pose.projected.minX)).toBeLessThan(.98);
    expect(Math.abs(pose.projected.maxX)).toBeLessThan(.98);
    expect(Math.abs(pose.projected.minY)).toBeLessThan(.98);
    expect(Math.abs(pose.projected.maxY)).toBeLessThan(.98);
    positions[view] = pose.pos;
    directions[view] = pose.direction;
  }
  // Framing distance varies with aspect ratio; assert viewing directions.
  expect(Math.abs(directions.front[0])).toBeLessThan(.001);
  expect(directions.front[2]).toBeLessThan(-.9);
  expect(directions.top[1]).toBeLessThan(-.99);
  expect(directions.iso[0]).toBeGreaterThan(.2);
  expect(directions.iso[2]).toBeLessThan(-.3);
  // Reset after an orbit restores the iso pose.
  await page.getByRole('button', { name: '复位视角' }).click();
  const canvas = page.locator('#scene canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  const orbited = await page.evaluate(() => window.__modelReview.getCamera().position.toArray());
  expect(orbited.some((value, index) => Math.abs(value - positions.iso[index]) > .2)).toBe(true);
  await page.getByRole('button', { name: '复位视角' }).click();
  await expect(page.getByRole('button', { name: '复位视角' })).toHaveAttribute('aria-pressed', 'true');
  const reset = await page.evaluate(() => ({ pos: window.__modelReview.getCamera().position.toArray(), view: window.__modelReview.getState().view }));
  expect(reset.view).toBe('iso');
  reset.pos.forEach((value, index) => expect(value).toBeCloseTo(positions.iso[index], 4));
  // Wheel zoom still changes distance without any animation running.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(100);
  const zoomed = await page.evaluate(() => window.__modelReview.getCamera().position.toArray());
  expect(zoomed).not.toEqual(reset.pos);
});

test('the machine fills the viewport, stands on the floor, and no camera drifts by itself', async ({ page }) => {
  await ready(page);
  for (const machine of ['lathe', 'laser']) {
    await page.evaluate((id) => window.__modelReview.setMachine(id), machine);
    const result = await page.evaluate(() => {
      const projected = window.__modelReview.getProjected();
      return { projected, state: window.__modelReview.getState(), info: window.__modelReview.getModelInfo() };
    });
    expect(result.state.machineId).toBe(machine);
    expect(result.projected.minX).toBeGreaterThan(-.98);
    expect(result.projected.maxX).toBeLessThan(.98);
    expect(result.projected.minY).toBeGreaterThan(-.98);
    expect(result.projected.maxY).toBeLessThan(.98);
    // Main stage share: machine covers most of the viewport area.
    const widthShare = result.projected.maxX - result.projected.minX;
    expect(widthShare).toBeGreaterThan(.55);
    expect(Math.abs(result.projected.worldMinY)).toBeLessThan(.01);
    expect(result.projected.floorY).toBeLessThanOrEqual(result.projected.worldMinY);
  }
  await page.waitForTimeout(600);
  const before = await page.evaluate(() => window.__modelReview.getCamera().position.toArray());
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => window.__modelReview.getCamera().position.toArray());
  expect(after).toEqual(before);
});

test('desktop and mobile keep the layout inside the viewport with controls clear of the model', async ({ page }, testInfo) => {
  await ready(page);
  const layout = await page.evaluate(() => window.__modelReview.getLayout());
  expect(layout.viewport.scrollWidth).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.viewport.scrollHeight).toBeLessThanOrEqual(layout.viewport.height + 1);
  expect(layout.header.top).toBeGreaterThanOrEqual(0);
  expect(layout.header.right).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.controls.left).toBeGreaterThanOrEqual(0);
  expect(layout.controls.right).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.controls.bottom).toBeLessThanOrEqual(layout.viewport.height);
  expect(layout.stage.height).toBeGreaterThan(layout.viewport.height * .5);
  // Controls must sit outside (never on top of) the model viewport.
  expect(layout.stage.bottom).toBeLessThanOrEqual(layout.controls.top + 1);
  expect(layout.header.bottom).toBeLessThanOrEqual(layout.stage.top + 1);
  const targets = await page.evaluate(() => [...document.querySelectorAll('.device-button, .view-button')].map((button) => {
    const r = button.getBoundingClientRect();
    return { width: r.width, height: r.height };
  }));
  expect(targets.length).toBe(5);
  for (const target of targets) {
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.width).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('.disclaimer')).toHaveText('通用结构示意');
  await testInfo.attach(`layout-${testInfo.project.name}`, { body: await page.screenshot(), contentType: 'image/png' });
});

test('all runtime assets are same-origin and the page reports no errors', async ({ page }) => {
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(request.url()).hostname)) external.push(request.url()); });
  await ready(page);
  await page.evaluate(() => { window.__modelReview.setMachine('laser'); window.__modelReview.setView('top'); window.__modelReview.setView('iso'); });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await expect(page.locator('.review')).toHaveAttribute('data-surfaces', 'mapped');
  await expect(page.locator('.review')).toHaveAttribute('data-environment', 'hdr');
});

test('switching devices 12 times never grows GPU geometry or texture counts', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const api = window.__modelReview;
    const wait = () => new Promise(requestAnimationFrame);
    // Three.js uploads each geometry on its first visible frame. Warm both
    // machines before measuring repeated switches for resource growth.
    api.setMachine('laser');
    await wait();
    api.setMachine('lathe');
    await wait();
    const before = api.getRenderStats();
    const ids = Object.keys(api.getModels());
    for (let round = 0; round < 12; round++) {
      api.setMachine(ids[round % 2]);
      await wait();
      api.setView(['front', 'top', 'iso'][round % 3]);
      await wait();
    }
    const after = api.getRenderStats();
    return { before, after, state: api.getState(), info: api.getModelInfo() };
  });
  expect(result.after.geometries).toBe(result.before.geometries);
  expect(result.after.textures).toBe(result.before.textures);
  expect(result.after.programs).toBe(result.before.programs);
  expect(result.state.partCount).toBeGreaterThanOrEqual(18);
  expect(result.info.lathe.parts).toBeGreaterThanOrEqual(18);
  expect(result.info.laser.parts).toBeGreaterThanOrEqual(18);
});

test('WebGL failure shows a readable note and a component overview', async ({ page }) => {
  await page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/i.test(type) ? null : native.call(this, type, ...args);
    };
  });
  await page.goto(PAGE);
  await expect(page.locator('.stage')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.getByRole('heading', { name: '当前浏览器无法显示三维画面' })).toBeVisible();
  const count = await page.locator('#fallback-parts li').count();
  expect(count).toBeGreaterThanOrEqual(18);
  await expect(page.locator('#part-count')).not.toHaveText('—');
});

test('failed surface images and HDR fall back to procedural materials with a room environment', async ({ page }) => {
  await page.route(/\.(?:hdr|jpg)(?:\?|$)/, (route) => route.abort());
  await ready(page);
  await expect(page.locator('.review')).toHaveAttribute('data-surfaces', 'fallback');
  await expect(page.locator('.review')).toHaveAttribute('data-environment', 'fallback');
  const result = await page.evaluate(() => ({
    environment: window.__modelReview.getScene().environment?.isTexture === true,
    state: window.__modelReview.getState(),
    info: window.__modelReview.getModelInfo(),
  }));
  expect(result.environment).toBe(true);
  expect(result.state.ready).toBe(true);
  expect(result.state.environment).toBe('fallback');
  expect(result.info.lathe.parts).toBeGreaterThanOrEqual(18);
  const visiblePixels = await page.evaluate(() => {
    const canvas = document.querySelector('#scene canvas');
    return canvas.width > 0 && canvas.height > 0;
  });
  expect(visiblePixels).toBe(true);
});

test('no code paths, framework terms or marketing copy are shown in the interface', async ({ page }) => {
  await ready(page);
  const text = await page.locator('.review').innerText();
  expect(text).toContain('设备模型 · 初步审阅');
  expect(text).toContain('拖动旋转 · 滚轮缩放');
  expect(text).toContain('通用结构示意');
  for (const forbidden of ['.js', 'src/', 'WebGL', 'Three', '审批', '通过', '领先', '高端', '品牌']) expect(text).not.toContain(forbidden);
});
