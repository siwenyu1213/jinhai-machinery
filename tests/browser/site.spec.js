import { test, expect } from '@playwright/test';

test('production subpath loads with accurate content and no broken local resources', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400 && response.url().includes('/jinhai-machinery/')) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('加工成形');
  await expect(page.locator('.learning-note')).toContainText('不用于商业接单');
  await expect(page.locator('.equipment-highlights')).toContainText('6000');
  await expect(page.locator('.equipment-highlights')).toContainText('165');
  await expect(page.locator('.scope-place')).toHaveText(['晋江', '南安', '石狮', '鲤城', '丰泽']);
  await page.locator('img[src]').evaluateAll((images) => images.forEach((image) => { image.loading = 'eager'; }));
  await expect.poll(() => page.locator('img[src]').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  expect(errors).toEqual([]);
});

test('business and process controls support repeated state changes', async ({ page }) => {
  await page.goto('./#services');
  await page.getByRole('button', { name: '钣金定制' }).click();
  await expect(page.locator('#service-caption')).toHaveText('钣金定制');
  await expect(page.locator('#service-image')).toHaveAttribute('src', /cutting\.webp$/);
  await expect(page.locator('#service-credit')).toHaveAttribute('href', /thdb7o0nLyc$/);
  await page.getByRole('button', { name: '维修服务', exact: false }).click();
  await expect(page.locator('#service-detail')).toContainText('丰泽');
  await page.locator('[data-service="custom"]').click();
  await expect(page.locator('#service-caption')).toContainText('非标零配件');
  await page.getByRole('button', { name: '焊接连接', exact: true }).click();
  await expect(page.locator('#process-description')).toContainText('焊接');
  await page.evaluate(async () => {
    window.scrollBy({ top: 50, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(page.locator('#process-description')).toContainText('焊接');
  await page.getByRole('button', { name: '机床加工', exact: true }).click();
  await expect(page.locator('#process-description')).toContainText('机床加工');
});

test('equipment filtering and photographic gallery work', async ({ page }) => {
  // Filtering has its own reduced-motion path; the full scroll/impact story
  // and the animated disclosure are exercised together in equipment.spec.js.
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('./#equipment');
  await page.locator('.equipment-details summary').click();
  await page.getByRole('group', { name: '设备分类' }).getByRole('button', { name: '车床', exact: true }).click();
  await expect(page.locator('.equipment-table tbody tr:visible')).toHaveCount(4);
  await page.getByRole('button', { name: '全部设备', exact: true }).click();
  await expect(page.locator('.equipment-table tbody tr:visible')).toHaveCount(11);
  await page.locator('[data-gallery="sheet"]').click();
  await expect(page.locator('.gallery-item:visible')).toHaveCount(1);
  const item = page.locator('.gallery-item:visible');
  await item.click();
  await expect(page.locator('#image-dialog')).toBeVisible();
  await expect(page.locator('#dialog-image')).toHaveAttribute('src', /cutting\.webp$/);
  await expect(page.locator('#dialog-credit')).toContainText('Cemrecan Yurtman');
  await expect(page.locator('#dialog-credit')).toHaveAttribute('href', /thdb7o0nLyc$/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#image-dialog')).not.toBeVisible();
  await expect(item).toBeFocused();
});

test('contact has honest empty state, copy success and denied-copy fallback', async ({ page }) => {
  await page.goto('./#contact');
  await page.locator('.contact-section [data-contact]').click();
  await expect(page.locator('#contact-dialog')).toContainText('尚未提供');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.__copied = value; } } }));
  await page.getByRole('button', { name: '复制资料清单' }).click();
  await expect(page.locator('#copy-status')).toContainText('已复制');
  expect(await page.evaluate(() => window.__copied)).toContain('晋江');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
  await page.getByRole('button', { name: '复制资料清单' }).click();
  await expect(page.locator('#manual-copy')).toBeVisible();
  await expect(page.locator('#manual-copy')).toHaveValue(/超出范围不接/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#contact-dialog')).not.toBeVisible();
  await expect(page.locator('.contact-section [data-contact]')).toBeFocused();
});

test('motion preference persists and system reduction is respected', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Reach the footer through an explicit later-section destination. The
  // equipment story now waits for five real scroll steps on a natural visit.
  await page.goto('./#contact');
  await page.locator('#motion-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.reload();
  await expect(page.locator('#motion-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#motion-toggle')).toBeDisabled();
});

test('full motion completes with a readable model opening', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-motion','full');
  await expect(page.locator('.hero')).toHaveAttribute('data-renderer','ready',{timeout:20000});
  await expect(page.locator('#hero-machine-canvas canvas')).toBeVisible();
});

test('mechanical photography replaces drawn models and remains local with attributable sources', async ({ page }) => {
  const externalImages = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'image' && new URL(request.url()).origin !== new URL(page.url()).origin) externalImages.push(request.url());
  });
  await page.goto('./');
  await expect(page.locator('.hero-art svg, .service-stage svg, .process-visual svg')).toHaveCount(0);
  await expect(page.locator('img[src$=".svg"], .gallery-item[href$=".svg"]')).toHaveCount(0);
  await expect(page.locator('.hero-art figcaption')).toContainText('通用结构演示');
  await expect(page.locator('#hero-poster')).toHaveAttribute('fetchpriority', 'high');
  await expect(page.locator('#hero-poster')).toHaveAttribute('src', /(?:mill|lathe|laser)-hero\.webp$/);
  const response = await page.request.get('./images/credits.json');
  expect(response.ok()).toBe(true);
  const credits = await response.json();
  expect(credits).toHaveLength(5);
  for (const credit of credits) {
    expect(credit.source).toMatch(/^https:\/\/unsplash\.com\/photos\//);
    expect(credit.license).toBe('Unsplash License');
    const photo = await page.request.get(`./images/${credit.file}`);
    expect(photo.ok()).toBe(true);
    expect(photo.headers()['content-type']).toContain('image/webp');
  }
  expect(externalImages).toEqual([]);
});

test('process photography and source follow the last selected step under reduced motion', async ({ page }) => {
  await page.route(/\/assets\/machine-(hero|assembly)-[^/]+\.js$/, route => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#process');
  await expect(page.locator('html')).toHaveAttribute('data-anchor-restoring', 'false');
  // This test checks manual selections. Autoplay has separate timer coverage;
  // pause it so slow CI image decoding cannot advance a checked selection.
  await page.locator('#process-playback').click();
  await expect(page.locator('#process-playback')).toHaveText('继续播放');
  for (const index of [2, 0, 1, 2]) {
    await page.locator(`[data-step="${index}"]`).click();
    await expect(page.locator(`[data-step="${index}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.process-photo-frame img:visible')).toHaveCount(1);
    await expect(page.locator('.process-photo-frame img:visible')).toHaveAttribute('data-process-photo', String(index));
    await expect.poll(() => page.locator('.process-photo-frame img:visible').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(page.locator('#process-current')).toHaveText(String(index + 1).padStart(2, '0'));
  }
  await expect(page.locator('#process-credit')).toHaveAttribute('href', /dmgYI2uuOoY$/);
  await expect(page.locator('#process-credit')).toHaveAccessibleName(/Rodrigo Rodrigues/);
  await expect(page.locator('.process-visual')).not.toHaveAttribute('aria-pressed');
});

test('photo loading failure preserves business content and contact controls', async ({ page }) => {
  await page.route('**/images/*.webp', (route) => route.abort());
  await page.goto('./#services');
  await expect(page.locator('#hero-poster')).toHaveAttribute('alt', /通用三维/);
  await page.locator('[data-service="repair"]').click();
  await expect(page.locator('#service-detail')).toContainText('丰泽');
  await page.locator('[data-step="2"]').click();
  await expect(page.locator('#process-description')).toContainText('焊接');
  await page.locator('.contact-section [data-contact]').click();
  await expect(page.locator('#contact-dialog')).toBeVisible();
});

test('layout remains inside viewport at narrow and medium widths', async ({ page }) => {
  await page.goto('./');
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const titleLines = await page.locator('#hero-title').evaluate((title) => title.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(title).lineHeight));
    expect(titleLines, `Hero title must remain two lines at ${width}px`).toBeLessThan(2.1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '菜单' }).click();
  await expect(page.locator('#main-nav')).toBeVisible();
  await page.locator('#main-nav a[href="#equipment"]').click();
  await expect(page.locator('#main-nav')).not.toBeVisible();
});

test('core information remains readable without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL);
  await expect(page.locator('#services')).toContainText('大件需沟通');
  await expect(page.locator('#equipment')).toContainText('6000');
  await expect(page.locator('#scope')).toContainText('超出以下范围');
  await expect(page.locator('html')).not.toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.noscript-note')).toBeVisible();
  await expect(page.locator('.noscript-note')).toContainText('真实联系方式尚未提供');
  await context.close();
});

test('animation chunk failure leaves functional UI available', async ({ page }) => {
  // Block the optional GSAP entry directly. Fetching and parsing every JS
  // response races context teardown when the lazy 3D chunk starts loading.
  await page.route('**/assets/motion-*.js', (route) => route.abort());
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#motion-toggle')).toHaveText('基础展示模式');
  await page.locator('[data-service="sheet"]').click();
  await expect(page.locator('#service-caption')).toHaveText('钣金定制');
  await expect(page.locator('.hero')).toHaveAttribute('data-renderer','ready',{timeout:20000});
  await page.evaluate(()=>window.__machineHero.select('laser',true));
  await expect(page.locator('#hero-machine-name')).toHaveText('激光切割机');
});


async function freezeProcessClock(page) {
  const time = new Date('2026-11-08T00:00:00Z');
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

test('process autoplay advances every three seconds, wraps and resets after manual selection', async ({ page }) => {
  await freezeProcessClock(page);
  await page.locator('[data-step="0"]').evaluate((button) => button.click());
  // No interval elapses more than once in each advance. fastForward keeps
  // the exact 2999/3000ms boundaries without drawing 180 CPU WebGL frames.
  await page.clock.fastForward(2999);
  await expect(page.locator('#process-current')).toHaveText('01');
  await page.clock.fastForward(1);
  await expect(page.locator('#process-current')).toHaveText('02');
  await expect(page.locator('[data-step="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-process-photo]:not([hidden])')).toHaveAttribute('data-process-photo', '1');
  await expect(page.locator('#process-credit')).toHaveAttribute('href', /thdb7o0nLyc$/);
  await expect(page.locator('#process-description')).toHaveAttribute('aria-live', 'off');
  await page.clock.fastForward(3000);
  await expect(page.locator('#process-current')).toHaveText('03');
  await page.clock.fastForward(3000);
  await expect(page.locator('#process-current')).toHaveText('01');
  await page.clock.fastForward(2000);
  await page.locator('[data-step="2"]').evaluate((button) => button.click());
  await page.clock.fastForward(2999);
  await expect(page.locator('#process-current')).toHaveText('03');
  await page.clock.fastForward(1);
  await expect(page.locator('#process-current')).toHaveText('01');
});

test('process scrolling never selects images and playback can pause and resume', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await freezeProcessClock(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  await page.locator('[data-step="1"]').evaluate((button) => button.click());
  // Trigger the former wheel/touch/key reset paths and traverse the old ScrollTrigger range.
  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 300 }));
    window.dispatchEvent(new Event('touchmove'));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    document.querySelector('#process').scrollIntoView({ behavior: 'instant', block: 'end' });
  });
  await page.clock.fastForward(100);
  await expect(page.locator('#process-current')).toHaveText('02');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.clock.fastForward(100);
  await expect(page.locator('#process-current')).toHaveText('02');
  await page.locator('#process-playback').evaluate((button) => button.click());
  await expect(page.locator('#process-playback')).toHaveText('继续播放');
  await page.clock.fastForward(9000);
  await expect(page.locator('#process-current')).toHaveText('02');
  await page.locator('#process-playback').evaluate((button) => button.click());
  await page.clock.fastForward(2999);
  await expect(page.locator('#process-current')).toHaveText('02');
  await page.clock.fastForward(1);
  await expect(page.locator('#process-current')).toHaveText('03');
});

test('process photos advance on the real clock and stay paused with the full page loaded', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./#process');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-anchor-restoring', 'false');
  await page.locator('[data-step="0"]').click();
  await expect(page.locator('#process-current')).toHaveText('02', { timeout: 7000 });
  await page.locator('#process-playback').click();
  const paused = await page.locator('#process-current').textContent();
  await page.waitForTimeout(3200);
  await expect(page.locator('#process-current')).toHaveText(paused);
  expect(errors).toEqual([]);
});
