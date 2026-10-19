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
  await expect(page.locator('.scope-places > span')).toHaveText(['晋江', '南安', '石狮', '鲤城', '丰泽']);
  await page.locator('img[src]').evaluateAll((images) => images.forEach((image) => { image.loading = 'eager'; }));
  await expect.poll(() => page.locator('img[src]').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  expect(errors).toEqual([]);
});

test('business and process controls support repeated state changes', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '钣金定制' }).click();
  await expect(page.locator('#service-caption')).toHaveText('钣金定制');
  await expect(page.locator('#service-image')).toHaveAttribute('src', /sheet.svg$/);
  await page.getByRole('button', { name: '维修服务', exact: false }).click();
  await expect(page.locator('#service-detail')).toContainText('丰泽');
  await page.locator('[data-service="custom"]').click();
  await expect(page.locator('#service-caption')).toContainText('非标零配件');
  await page.getByRole('button', { name: '焊接', exact: true }).click();
  await expect(page.locator('#process-description')).toContainText('焊接');
  await page.evaluate(async () => {
    window.scrollBy({ top: 50, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(page.locator('#process-description')).toContainText('焊接');
  await page.getByRole('button', { name: '轮廓', exact: true }).click();
  await expect(page.locator('#process-description')).toContainText('轮廓');
});

test('equipment filtering and concept gallery work', async ({ page }) => {
  await page.goto('./');
  await page.locator('.equipment-details summary').click();
  await page.getByRole('button', { name: '车床', exact: true }).click();
  await expect(page.locator('.equipment-table tbody tr:visible')).toHaveCount(4);
  await page.getByRole('button', { name: '全部设备', exact: true }).click();
  await expect(page.locator('.equipment-table tbody tr:visible')).toHaveCount(11);
  await page.locator('[data-gallery="sheet"]').click();
  await expect(page.locator('.gallery-item:visible')).toHaveCount(1);
  const item = page.locator('.gallery-item:visible');
  await item.click();
  await expect(page.locator('#image-dialog')).toBeVisible();
  await expect(page.locator('#dialog-image')).toHaveAttribute('src', /sheet.svg$/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#image-dialog')).not.toBeVisible();
  await expect(item).toBeFocused();
});

test('contact has honest empty state, copy success and denied-copy fallback', async ({ page }) => {
  await page.goto('./');
  await page.locator('.hero-actions [data-contact]').click();
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
  await expect(page.locator('.hero-actions [data-contact]')).toBeFocused();
});

test('motion preference persists and system reduction is respected', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('./');
  await page.locator('#motion-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.reload();
  await expect(page.locator('#motion-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#motion-toggle')).toBeDisabled();
});

test('full motion initializes and the cutting path actually progresses', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  const path = page.locator('.cut-path');
  const initial = await path.evaluate((element) => Number.parseFloat(getComputedStyle(element).strokeDashoffset));
  expect(initial).toBeGreaterThan(0);
  await expect.poll(() => path.evaluate((element) => Number.parseFloat(getComputedStyle(element).strokeDashoffset))).toBeLessThan(initial);
});

test('layout remains inside viewport at narrow and medium widths', async ({ page }) => {
  await page.goto('./');
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
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
  // Simulate all optional GSAP-containing chunks failing, identified from built imports.
  await page.route('**/assets/*.js', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    if (source.includes('ScrollTrigger') && !source.includes('jinhai-reduced-motion')) return route.abort();
    return route.fulfill({ response, body: source });
  });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#motion-toggle')).toHaveText('基础展示模式');
  await page.locator('[data-service="sheet"]').click();
  await expect(page.locator('#service-caption')).toHaveText('钣金定制');
});
