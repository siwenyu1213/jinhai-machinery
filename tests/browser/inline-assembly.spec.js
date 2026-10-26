import { test, expect } from '@playwright/test';
test.describe.configure({ timeout: 60000 });
async function ready(page, reduced = false) {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.goto('./'); await page.locator('#assembly').scrollIntoViewIfNeeded();
  await expect(page.locator('#assembly')).toHaveAttribute('data-renderer', 'ready', { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready);
}
async function seek(page, value) {
  await page.evaluate(progress => { const section = document.querySelector('#assembly'); window.scrollTo({ top: scrollY + section.getBoundingClientRect().top + progress * (section.offsetHeight - section.querySelector('.assembly-sticky').offsetHeight), behavior: 'instant' }); }, value);
  await expect.poll(() => page.evaluate(expected => Math.abs(window.__inlineAssembly.getState().progress - expected), value), { timeout: 15000 }).toBeLessThan(.0003);
}
test('the oversized vertical text writes first and flies while the actual shared model is moving', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message)); await ready(page);
  await seek(page, .1);
  const opacity = await page.locator('.assembly-title-letters > span').evaluateAll(nodes => nodes.map(node => +getComputedStyle(node).opacity));
  expect(opacity[0]).toBe(1); expect(opacity.at(-1)).toBe(0);
  await seek(page, .22);
  const initial = await page.locator('.assembly-title-letters > span').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; }));
  expect(Math.abs(initial[0].x - initial[1].x)).toBeLessThan(2); expect(initial[1].y).toBeGreaterThan(initial[0].y);
  expect(initial[0].height).toBeGreaterThan(60);
  await seek(page, .48);
  const state = await page.evaluate(() => window.__inlineAssembly.getState());
  expect(state.scene.totalParts).toBe(91); expect(state.scene.assembledCount).toBe(0); expect(state.scene.rotationProgress).toBeGreaterThan(0);
  await expect(page.locator('.machine-preview').first()).toHaveCSS('opacity', '0');
  expect(await page.locator('.inline-assembly-canvas').evaluate(node => +getComputedStyle(node).opacity)).toBe(1);
  const moving = await page.locator('.assembly-title-letters > span').first().boundingBox();
  expect(moving.x + moving.width / 2).toBeLessThan(initial[0].x + initial[0].width / 2);
  expect(moving.y + moving.height / 2).toBeLessThan(initial[0].y + initial[0].height / 2);
  expect(errors).toEqual([]);
  const viewport = await page.locator('.inline-assembly-canvas').boundingBox();
  const sticky = await page.locator('.assembly-sticky').boundingBox();
  expect(Math.abs(viewport.y - sticky.y)).toBeLessThan(1); expect(viewport.height).toBe(sticky.height);
});
test('completion makes one readable row, then raises captions, and sleeps without a showcase loop', async ({ page }) => {
  await ready(page); await seek(page, .895);
  expect(await page.evaluate(() => window.__inlineAssembly.getState().scene.assembledCount)).toBe(91);
  await expect(page.locator('.machine-preview').first()).toHaveCSS('opacity', '0');
  await seek(page, .95);
  const early = await page.locator('.machine-preview').first().evaluate(node => ({ y: node.getBoundingClientRect().y, opacity: +getComputedStyle(node).opacity }));
  expect(early.opacity).toBeGreaterThan(0); expect(early.opacity).toBeLessThan(1);
  await seek(page, 1);
  const late = await page.locator('.machine-preview').first().boundingBox(); expect(late.y).toBeLessThan(early.y);
  await expect(page.locator('.machine-preview').first()).toHaveCSS('opacity', '1');
  const projected = await page.evaluate(() => {
    const model = window.__inlineAssembly.getModel(), camera = window.__inlineAssembly.getCamera();
    return model.machines.map(machine => { const point = machine.homeBounds.min.clone().add(machine.homeBounds.max).multiplyScalar(.5).project(camera); return { id: machine.id, x: point.x, y: point.y, z: point.z }; });
  });
  expect(projected.map(item => item.id)).toEqual(['mill', 'lathe', 'laser']);
  expect(projected[0].x).toBeLessThan(projected[1].x); expect(projected[1].x).toBeLessThan(projected[2].x);
  expect(projected.every(item => Math.abs(item.x) < 1 && Math.abs(item.y) < 1 && item.z < 1)).toBe(true);
  await expect(page.locator('#assembly a')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const frames = await page.evaluate(() => window.__inlineAssembly.getRenderStats().frames);
  await page.waitForTimeout(350); expect(await page.evaluate(() => window.__inlineAssembly.getRenderStats().frames)).toBe(frames);
});
test('native wheel motion keeps moving after input, reverse travel restores the same model pose', async ({ page }) => {
  await ready(page); await seek(page, .48);
  const before = await page.evaluate(() => window.__inlineAssembly.getModel().parts.map(part => part.object.position.toArray()));
  await page.mouse.move(200, 400); await page.mouse.wheel(0, 240);
  await expect.poll(() => page.evaluate(() => window.__inlineAssembly.getState().target)).toBeGreaterThan(.5);
  const early = await page.evaluate(() => window.__inlineAssembly.getState());
  expect(early.progress).toBeLessThan(early.target);
  await page.waitForTimeout(200); expect(await page.evaluate(() => window.__inlineAssembly.getState().progress)).toBeGreaterThan(early.progress);
  await seek(page, .9); await seek(page, .48);
  await expect.poll(() => page.evaluate(() => Math.abs(window.__inlineAssembly.getState().progress - window.__inlineAssembly.getState().target))).toBeLessThan(.00011);
  // Both snapshots have converged to the same native scroll position.
  const after = await page.evaluate(() => window.__inlineAssembly.getModel().parts.map(part => part.object.position.toArray()));
  expect(Math.max(...after.map((position, i) => Math.hypot(...position.map((v, j) => v - before[i][j]))))).toBeLessThan(.04);
});
test('reduced motion and missing WebGL keep complete readable content without pinned travel', async ({ page }) => {
  await ready(page, true);
  await expect(page.locator('#assembly')).not.toHaveClass(/is-enhanced/);
  expect(await page.evaluate(() => window.__inlineAssembly.getState().scene.assembledCount)).toBe(91);
  await expect(page.locator('.machine-preview').first()).toHaveCSS('opacity', '1');
  await page.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/i.test(type) ? null : get.call(this, type, ...args); }; });
  await page.reload(); await page.locator('#assembly').scrollIntoViewIfNeeded();
  await expect(page.locator('#assembly')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('#assembly')).not.toHaveClass(/is-enhanced/);
  for (const image of await page.locator('.machine-preview img').all()) await expect(image).toBeVisible();
  await expect(page.getByRole('heading', { name: '从结构，看懂机台。' })).toBeVisible();
});
