import { test, expect } from '@playwright/test';
test.describe.configure({ timeout: 60000 });
async function ready(page, reduced = false) {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.goto('./'); await page.locator('#assembly').scrollIntoViewIfNeeded();
  await expect(page.locator('#assembly')).toHaveAttribute('data-renderer', 'ready', { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready);
}
async function seek(page, value) {
  await page.evaluate(progress => { const section = document.querySelector('#assembly'), { lead, length } = window.__inlineAssembly.getState().range; window.scrollTo({ top: scrollY + section.getBoundingClientRect().top - lead + progress * length, behavior: 'instant' }); }, value);
  await expect.poll(() => page.evaluate(expected => Math.abs(window.__inlineAssembly.getState().progress - expected), value), { timeout: 15000 }).toBeLessThan(.0003);
  await expect.poll(() => page.evaluate(() => { const state = window.__inlineAssembly.getState(); return Math.abs(state.progress - state.target); }), { timeout: 15000 }).toBeLessThan(.000001);
}
test('the section precedes equipment and starts writing while the previous page is still visible', async ({ page }) => {
  await ready(page); await seek(page, .055);
  expect(await page.locator('#assembly').evaluate(node => node.nextElementSibling.id)).toBe('equipment');
  const section = await page.locator('#assembly').boundingBox();
  expect(section.y).toBeGreaterThan(0); expect(section.y).toBeLessThan(page.viewportSize().height);
  const first = page.locator('.assembly-title-letters > span').first();
  const box = await first.boundingBox(), opacity = await first.evaluate(node => +getComputedStyle(node).opacity);
  expect(opacity).toBeGreaterThan(0); expect(opacity).toBeLessThan(1);
  expect(box.y).toBeLessThan(page.viewportSize().height); expect(box.y + box.height).toBeGreaterThan(section.y);
  expect(await page.locator('.assembly-title-letters > span').last().evaluate(node => +getComputedStyle(node).opacity)).toBe(0);
});
test('the oversized vertical text writes first and flies while the actual shared model is moving', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message)); await ready(page);
  await seek(page, .07);
  const opacity = await page.locator('.assembly-title-letters > span').evaluateAll(nodes => nodes.map(node => +getComputedStyle(node).opacity));
  expect(opacity[0]).toBe(1); expect(opacity.at(-1)).toBe(0);
  await seek(page, .16);
  const initial = await page.locator('.assembly-title-letters > span').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; }));
  expect(initial).toHaveLength(5); expect(Math.max(...initial.map(box => box.x)) - Math.min(...initial.map(box => box.x))).toBeLessThan(2); expect(initial[1].y).toBeGreaterThan(initial[0].y);
  expect(initial[0].height).toBeGreaterThan(60);
  await seek(page, .36);
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
  await ready(page); await seek(page, .522);
  expect(await page.evaluate(() => window.__inlineAssembly.getState().scene.assembledCount)).toBe(91);
  await expect(page.locator('.machine-preview').first()).toHaveCSS('opacity', '0');
  await seek(page, .552);
  const early = await page.locator('.machine-preview').first().evaluate(node => ({ y: node.getBoundingClientRect().y, opacity: +getComputedStyle(node).opacity }));
  expect(early.opacity).toBeGreaterThan(0); expect(early.opacity).toBeLessThan(1);
  await seek(page, .5925);
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
test('after the captions finish, the title returns and changes while the models and captions fade', async ({ page }) => {
  await ready(page); await seek(page, .60);
  await expect(page.locator('.machine-preview').first()).toHaveCSS('opacity', '1');
  await expect(page.locator('#assembly-title')).toHaveAttribute('aria-label', '我们有什么');
  const title = page.locator('.assembly-title-letters > span').first(), before = await title.boundingBox();
  await seek(page, .675);
  const middle = await title.boundingBox();
  expect(middle.x + middle.width / 2).toBeGreaterThan(before.x + before.width / 2);
  expect(middle.y + middle.height / 2).toBeGreaterThan(before.y + before.height / 2);
  const opacity = await page.locator('.inline-assembly-canvas,.machine-preview').evaluateAll(nodes => nodes.map(node => +getComputedStyle(node).opacity));
  expect(opacity.every(value => value > 0 && value < 1)).toBe(true);
  const morph = await page.locator('.assembly-title-letters > span').nth(2).locator('.assembly-letter-out').evaluate(node => +getComputedStyle(node).opacity);
  expect(morph).toBeGreaterThan(0); expect(morph).toBeLessThan(1);
  const boxes = await page.locator('.assembly-title-letters > span').evaluateAll(nodes => nodes.map(node => { const b = node.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; }));
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const x = Math.min(boxes[i].right, boxes[j].right) - Math.max(boxes[i].left, boxes[j].left);
    const y = Math.min(boxes[i].bottom, boxes[j].bottom) - Math.max(boxes[i].top, boxes[j].top);
    expect(x <= 1 || y <= 1).toBe(true);
  }
  await seek(page, .75);
  await expect(page.locator('#assembly-title')).toHaveAttribute('aria-label', '我们还有...');
  await expect(page.locator('.inline-assembly-canvas')).toHaveCSS('opacity', '0');
  await expect(page.locator('.machine-preview').first()).toHaveCSS('opacity', '0');
  expect((await page.locator('.assembly-letter-out').allTextContents()).join('')).toBe('我们还有...');
  const held = await title.boundingBox();
  const final = await page.locator('.assembly-title-letters > span').evaluateAll(nodes => nodes.map(node => { const b = node.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }));
  expect(Math.abs((final[0].x + final[4].x) / 2 - page.viewportSize().width / 2)).toBeLessThan(2);
  expect(Math.abs(final[0].y - final[3].y)).toBeLessThan(2);
  await seek(page, .85);
  const drifting = await title.boundingBox();
  expect(drifting.y).toBeGreaterThan(held.y + 1);
  expect(drifting.y - held.y).toBeLessThan(60);
  await expect(page.locator('#assembly')).toHaveAttribute('data-phase', 'title-hold');
  await seek(page, .60);
  await expect(page.locator('#assembly-title')).toHaveAttribute('aria-label', '我们有什么');
  await expect(page.locator('.inline-assembly-canvas')).toHaveCSS('opacity', '1');
  await expect(page.locator('.machine-preview').first()).toHaveCSS('opacity', '1');
});
test('native wheel motion keeps moving after input, reverse travel restores the same model pose', async ({ page }) => {
  await ready(page); await seek(page, .36);
  const before = await page.evaluate(() => window.__inlineAssembly.getModel().parts.map(part => part.object.position.toArray()));
  await page.mouse.move(200, 400); await page.mouse.wheel(0, 240);
  await expect.poll(() => page.evaluate(() => window.__inlineAssembly.getState().target)).toBeGreaterThan(.38);
  const early = await page.evaluate(() => window.__inlineAssembly.getState());
  expect(early.progress).toBeLessThan(early.target);
  await page.waitForTimeout(200); expect(await page.evaluate(() => window.__inlineAssembly.getState().progress)).toBeGreaterThan(early.progress);
  await seek(page, .675); await seek(page, .36);
  await expect.poll(() => page.evaluate(() => Math.abs(window.__inlineAssembly.getState().progress - window.__inlineAssembly.getState().target))).toBeLessThan(.00011);
  // Both snapshots have converged to the same native scroll position.
  const after = await page.evaluate(() => window.__inlineAssembly.getModel().parts.map(part => part.object.position.toArray()));
  expect(Math.max(...after.map((position, i) => Math.hypot(...position.map((v, j) => v - before[i][j]))))).toBeLessThan(.04);
});
test('the interlude and descent answer every scroll step without a frozen opening', async ({ page }) => {
  await ready(page);
  const points = [];
  // Through .92 the letters travel down the viewport. Past that the fixed
  // layer compensates the native document scroll, so the exact landing is
  // asserted by the handoff test below instead of a viewport-relative rule.
  for (const value of [.75, .80, .85, .87, .88, .90, .92]) {
    await seek(page, value);
    const box = await page.locator('.assembly-title-letters > span').first().boundingBox();
    points.push(box.y + box.height / 2);
  }
  // The old build was completely frozen for the first three samples.
  expect(points[1] - points[0]).toBeGreaterThan(3);
  expect(points[2] - points[1]).toBeGreaterThan(3);
  for (let i = 1; i < points.length; i++) {
    expect(points[i]).toBeGreaterThan(points[0]);
    // A few pixels of sticky release is native scroll, not a visible jerk.
    expect(points[i - 1] - points[i]).toBeLessThan(12);
  }
  // Handing the letters over to the fixed layer must not jump on the first step.
  expect(points[4] - points[3]).toBeLessThan(60);
  expect(points.at(-1) - points[0]).toBeGreaterThan(40);
  const state = await page.evaluate(() => window.__inlineAssembly.getState());
  expect(state.transfer).toBeGreaterThan(0);
  expect(state.transfer).toBeLessThan(1);
});
test('wheel input during the descent is followed within a few frames', async ({ page }) => {
  await ready(page); await seek(page, .82);
  const before = await page.evaluate(() => window.__inlineAssembly.getState());
  await page.mouse.move(200, 400); await page.mouse.wheel(0, 160);
  await expect.poll(() => page.evaluate(() => window.__inlineAssembly.getState().target)).toBeGreaterThan(before.target + .001);
  const early = await page.evaluate(() => window.__inlineAssembly.getState());
  await page.waitForTimeout(120);
  const later = await page.evaluate(() => window.__inlineAssembly.getState());
  expect(later.progress).toBeGreaterThan(early.progress);
  await expect.poll(() => page.evaluate(() => {
    const state = window.__inlineAssembly.getState();
    return Math.abs(state.progress - state.target);
  }), { timeout: 3000 }).toBeLessThan(.0005);
});
test('the held interlude flies down into the real equipment heading and reverses without a duplicate', async ({ page }) => {
  await ready(page); await seek(page, .85);
  const title = page.locator('.assembly-title-letters > span').first(), start = await title.boundingBox();
  await expect(page.locator('#assembly-title')).toHaveAttribute('aria-label', '我们还有...');
  await seek(page, .94);
  const moving = await title.boundingBox();
  expect(moving.y + moving.height / 2).toBeGreaterThan(start.y + start.height / 2);
  await expect(page.locator('body > .assembly-title-letters.is-transferring')).toHaveCount(1);
  await expect(page.locator('#equipment-title')).toHaveCSS('opacity', '0');
  const opacity = await page.locator('.assembly-letter-next').first().evaluate(node => +getComputedStyle(node).opacity);
  expect(opacity).toBeGreaterThan(0); expect(opacity).toBeLessThan(1);
  const boxes = await page.locator('.assembly-title-letters > span').evaluateAll(nodes => nodes.map(node => { const b = node.getBoundingClientRect(); return { left: b.left, right: b.right }; }));
  for (let i = 0; i < boxes.length - 1; i++) expect(boxes[i].right - boxes[i + 1].left).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await seek(page, .98);
  const landed = await title.boundingBox();
  await seek(page, .999);
  const held = await title.boundingBox();
  const heldScroll = await page.evaluate(() => scrollY);
  // The changed heading has already landed; more scroll must not drag it.
  expect(Math.abs(landed.x - held.x)).toBeLessThan(.1);
  expect(held.y).toBeLessThan(landed.y);
  await expect(page.locator('#equipment > .section-heading')).toHaveCSS('transform', 'none');
  await seek(page, 1);
  await expect(page.locator('#equipment-title')).toHaveCSS('opacity', '1');
  await expect(page.locator('#equipment-title')).toHaveText('设备与工艺');
  await expect(page.locator('#equipment').getByRole('heading', { name: '设备与工艺', exact: true })).toBeVisible();
  await expect(page.locator('body > .assembly-title-letters')).toHaveCount(0);
  await expect(page.locator('.assembly-title-letters')).toHaveCSS('opacity', '0');
  const destination = await page.locator('#equipment-title > span').first().boundingBox();
  expect(Math.abs(destination.x - held.x)).toBeLessThan(1.5);
  expect(Math.abs(destination.y + await page.evaluate(() => scrollY) - held.y - heldScroll)).toBeLessThan(1.5);
  const headerHeight = await page.locator('.site-header').evaluate(node => node.offsetHeight);
  expect(Math.abs((await page.locator('#equipment-title').boundingBox()).y - headerHeight - 24)).toBeLessThan(2);
  await seek(page, .85);
  await expect(page.locator('.assembly-title-letters')).toHaveCSS('opacity', '1');
  await expect(page.locator('#assembly-title')).toHaveAttribute('aria-label', '我们还有...');
  await seek(page, .94);
  await page.locator('#process').scrollIntoViewIfNeeded();
  await expect(page.locator('#equipment-title')).toHaveCSS('opacity', '1');
  await expect(page.locator('body > .assembly-title-letters')).toHaveCount(0);
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
  await expect(page.getByRole('heading', { name: '我们有什么' })).toBeVisible();
});
