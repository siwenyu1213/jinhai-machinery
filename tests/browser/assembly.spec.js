import { test, expect } from '@playwright/test';

async function openAssembly(page) {
  await page.goto('./');
  await page.evaluate(() => {
    const section = document.querySelector('#assembly');
    const header = document.querySelector('.site-header').getBoundingClientRect().height;
    window.scrollTo({ top: window.scrollY + section.getBoundingClientRect().top - header, behavior: 'instant' });
  });
  await expect(page.locator('#assembly')).toHaveAttribute('data-renderer', 'webgl');
  await expect.poll(() => page.locator('.assembly-viewport').getAttribute('data-frames')).not.toBeNull();
}

test('a direct assembly fragment opens the model after motion initialization', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Exercise the load/refresh ordering with a late hero image as well.
  await page.route('**/images/lathe.webp', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  await page.goto('./#assembly');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  await expect(page.locator('#assembly-title')).toBeInViewport();
  await expect(page.locator('#assembly')).toHaveAttribute('data-renderer', 'webgl');
  await page.getByRole('button', { name: '拆解', exact: true }).click();
  await expect(page.locator('#assembly')).toHaveAttribute('data-progress', '0.550');
});

test('metal assembly renders real geometry on demand and supports keyboard scrubbing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAssembly(page);
  const canvas = page.locator('.assembly-canvas');
  await expect(canvas).toBeVisible();
  const calls = Number(await page.locator('.assembly-viewport').getAttribute('data-draw-calls'));
  expect(calls).toBeGreaterThan(20);
  expect(calls).toBeLessThan(90);
  await page.getByRole('button', { name: '拆解', exact: true }).click();
  await expect(page.locator('#assembly')).toHaveAttribute('data-spread', '1.000');
  await expect(page.locator('#assembly-state')).toHaveText('展开，看到里面');
  const range = page.getByRole('slider', { name: '卡盘拆装进度' });
  await range.focus();
  await page.keyboard.press('End');
  await expect(page.locator('#assembly')).toHaveAttribute('data-progress', '1.000');
  await expect(page.locator('#assembly')).toHaveAttribute('data-spread', '0.000');
  await expect(range).toHaveAttribute('aria-valuetext', /100%.*回到/);
  await page.keyboard.press('Home');
  await expect(page.locator('#assembly')).toHaveAttribute('data-progress', '0.000');
  // No permanent requestAnimationFrame loop: two settled animation frames
  // later the renderer must not have drawn another unchanged scene.
  const settled = await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const host = document.querySelector('.assembly-viewport');
    const frames = host.dataset.frames;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return frames === host.dataset.frames;
  });
  expect(settled).toBe(true);
  expect(errors).toEqual([]);
});

test('native scroll continuously explodes, reassembles and reverses the chuck', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openAssembly(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  const dimensions = await page.evaluate(() => ({
    start: document.querySelector('#assembly').getBoundingClientRect().top + scrollY - document.querySelector('.site-header').getBoundingClientRect().height,
    distance: Math.round(innerHeight * (innerWidth <= 760 ? 1.15 : 1.75)),
  }));
  for (const progress of [0, .25, .55, .85, 1, .55, 0]) {
    await page.evaluate(({ top }) => window.scrollTo({ top, behavior: 'instant' }), { top: dimensions.start + dimensions.distance * progress });
    await expect.poll(async () => Math.abs(Number(await page.locator('#assembly').getAttribute('data-progress')) - progress)).toBeLessThan(.025);
    if (progress === .55) await expect(page.locator('#assembly')).toHaveAttribute('data-spread', '1.000');
    if (progress === 0 || progress === 1) await expect(page.locator('#assembly')).toHaveAttribute('data-spread', '0.000');
    const box = await page.locator('.assembly-stage').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(70);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
    const controls = await page.locator('.assembly-controls').boundingBox();
    expect(controls.y + controls.height).toBeLessThanOrEqual(box.y + box.height - 12);
  }
});

test('manual state selection survives refresh and active scrolling can take over again', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openAssembly(page);
  await page.getByRole('button', { name: '拆解', exact: true }).click();
  await expect(page.locator('#assembly')).toHaveAttribute('data-progress', '0.550');
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect(page.locator('#assembly')).toHaveAttribute('data-progress', '0.550');
  await page.getByRole('button', { name: '组合', exact: true }).click();
  await expect(page.locator('#assembly')).toHaveAttribute('data-progress', '1.000');
  await page.getByRole('button', { name: '整体', exact: true }).click();
  await expect(page.locator('#assembly')).toHaveAttribute('data-progress', '0.000');
  await page.evaluate(() => window.scrollBy({ top: 220, behavior: 'instant' }));
  await expect.poll(async () => Number(await page.locator('#assembly').getAttribute('data-progress'))).toBeGreaterThan(.04);
});

test('reduced motion removes pinning and keeps the same renderer with immediate controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openAssembly(page);
  await page.locator('html').evaluate(() => document.querySelector('#motion-toggle').click());
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('.pin-spacer:has(.assembly-stage)')).toHaveCount(0);
  await page.getByRole('button', { name: '拆解', exact: true }).click();
  await expect(page.locator('#assembly')).toHaveAttribute('data-progress', '0.550');
  await expect(page.locator('.assembly-canvas')).toHaveCount(1);
  await page.locator('html').evaluate(() => document.querySelector('#motion-toggle').click());
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  await expect(page.locator('.assembly-canvas')).toHaveCount(1);
  await expect(page.locator('.pin-spacer:has(.assembly-stage)')).toHaveCount(1);
});

test('3D chunk failure shows the local model poster without a dead pinned region', async ({ page }) => {
  await page.route('**/assets/chuck-scene-*.js', (route) => route.abort());
  await page.goto('./');
  await page.locator('#assembly').scrollIntoViewIfNeeded();
  await expect(page.locator('#assembly')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('.assembly-poster')).toHaveCSS('opacity', '1');
  await expect.poll(() => page.locator('.assembly-poster').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.assembly-controls')).toBeHidden();
  await expect(page.locator('.pin-spacer:has(.assembly-stage)')).toHaveCount(0);
  await expect(page.locator('#assembly-state')).toHaveText('展开，看到里面');
  await page.locator('.hero-actions [data-contact]').click();
  await expect(page.locator('#contact-dialog')).toBeVisible();
});

test('WebGL unavailability preserves the static assembly and contact path', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (name, ...args) {
      if (String(name).includes('webgl')) return null;
      return original.call(this, name, ...args);
    };
  });
  await page.goto('./');
  await page.locator('#assembly').scrollIntoViewIfNeeded();
  await expect(page.locator('#assembly')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('.assembly-controls')).toBeHidden();
  await expect(page.locator('.pin-spacer:has(.assembly-stage)')).toHaveCount(0);
  await expect(page.locator('#assembly-title')).toBeVisible();
});

test('context loss reveals the poster and restoration rebuilds the reflective scene', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAssembly(page);
  await page.evaluate(() => {
    const gl = document.querySelector('.assembly-canvas').getContext('webgl2');
    window.__contextLoss = gl.getExtension('WEBGL_lose_context');
    window.__contextLoss.loseContext();
  });
  await expect(page.locator('#assembly')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('.assembly-controls')).toBeHidden();
  await expect(page.locator('.assembly-poster')).toHaveCSS('opacity', '1');
  await page.evaluate(() => window.__contextLoss.restoreContext());
  await expect(page.locator('#assembly')).toHaveAttribute('data-renderer', 'webgl');
  await page.getByRole('button', { name: '拆解', exact: true }).click();
  await expect(page.locator('#assembly')).toHaveAttribute('data-spread', '1.000');
  await expect(page.locator('.assembly-canvas')).toHaveCount(1);
});

test('new model assets stay local and the poster remains useful without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL);
  const poster = page.locator('.assembly-poster');
  await poster.scrollIntoViewIfNeeded();
  await expect(poster).toBeVisible();
  await expect(poster).toHaveAttribute('src', /images\/generated\/chuck-assembly\.webp$/);
  await expect.poll(() => poster.evaluate((image) => image.complete && image.naturalWidth >= 1200)).toBe(true);
  await expect(page.locator('#assembly')).toContainText('非本厂产品或客户案例');
  await expect(page.locator('.assembly-controls')).toBeHidden();
  const metadata = await (await page.request.get('./images/generated/chuck-assembly.json')).json();
  expect(metadata.kind).toBe('procedural-render');
  await context.close();
});
