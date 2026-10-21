import { test, expect } from '@playwright/test';

test('photographic opening fills the viewport and keeps copy, controls and source separate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const hero = await page.locator('.hero').boundingBox();
  const photo = await page.locator('.hero-photo').boundingBox();
  expect(hero.x).toBe(0);
  expect(hero.y).toBe(0);
  expect(photo.width).toBeCloseTo(hero.width, 0);
  expect(photo.height).toBeCloseTo(hero.height, 0);
  const content = await page.locator('.hero-copy').boundingBox();
  const controls = await page.locator('.hero-controls').boundingBox();
  const credit = await page.locator('.hero-art figcaption').boundingBox();
  expect(content.y + content.height).toBeLessThan(controls.y);
  expect(controls.y + controls.height).toBeLessThan(credit.y);
  await expect(page.locator('.hero-controls button[aria-pressed=true]')).toHaveCount(1);
  await expect(page.locator('#hero-credit')).toHaveAttribute('href', /_VBsh_IKsD8$/);
  await expect(page.locator('#hero-credit')).toHaveAccessibleName(/LISK OBE/);
  await expect(page.locator('#service-credit')).toHaveAccessibleName(/Matt Richmond/);
  await expect(page.locator('.learning-note')).toContainText('不用于商业接单');
});

test('fixed navigation changes surface and does not cover an anchored section', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const header = page.locator('.site-header');
  await expect(header).not.toHaveClass(/is-scrolled/);
  const menu = page.getByRole('button', { name: '菜单' });
  if (await menu.isVisible()) {
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    await expect(page.locator('#main-nav')).toBeHidden();
    await menu.click();
  }
  await page.locator('#main-nav a[href="#equipment"]').click();
  await expect(header).toHaveClass(/is-scrolled/);
  await expect(page.locator('#main-nav a[href="#equipment"]')).toHaveAttribute('aria-current', 'location');
  const title = await page.locator('#equipment-title').boundingBox();
  const bar = await header.boundingBox();
  expect(title.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(header).not.toHaveClass(/is-scrolled/);
});

test('rapid photo choices and keyboard control keep the last image and its attribution', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/images/cutting.webp', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  await page.goto('./');
  const delayed = page.waitForResponse('**/images/cutting.webp');
  await page.locator('[data-hero-slide="1"]').click();
  await page.locator('[data-hero-slide="2"]').click();
  await expect(page.locator('#hero-image')).toHaveAttribute('src', /chuck\.webp$/);
  await delayed;
  await expect(page.locator('#hero-image')).toHaveAttribute('src', /chuck\.webp$/);
  await expect(page.locator('#hero-credit')).toHaveAttribute('href', /-D_-zq54DpI$/);
  await expect(page.locator('#hero-credit')).toHaveAccessibleName(/Miguel/);
  await page.keyboard.press('Home');
  await expect(page.locator('[data-hero-slide="0"]')).toBeFocused();
  await expect(page.locator('#hero-image')).toHaveAttribute('src', /lathe\.webp$/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-hero-slide="1"]')).toBeFocused();
  await expect(page.locator('#hero-image')).toHaveAttribute('src', /cutting\.webp$/);
  await expect(page.locator('#hero-credit')).toHaveAttribute('href', /thdb7o0nLyc$/);
  await expect(page.locator('.hero-controls button[aria-pressed=true]')).toHaveCount(1);
  await expect(page.locator('.hero-photo')).toHaveCSS('transform', 'none');
});

test('a failed photo choice preserves the current image and usable contact action', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/images/cutting.webp', (route) => route.abort());
  await page.goto('./');
  await page.locator('[data-hero-slide="1"]').click();
  await expect(page.locator('#hero-status')).toContainText('暂时无法加载');
  await expect(page.locator('#hero-image')).toHaveAttribute('src', /lathe\.webp$/);
  await expect(page.locator('[data-hero-slide="0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#hero-credit')).toHaveAttribute('href', /_VBsh_IKsD8$/);
  await page.locator('.hero-actions [data-contact]').click();
  await expect(page.locator('#contact-dialog')).toBeVisible();
  expect(errors).toEqual([]);
});

test('concise copy retains business limits, facts and accessible source information', async ({ page }) => {
  await page.goto('./');
  const main = (await page.locator('main').innerText()).replace(/\s/g, '');
  expect(main.length).toBeLessThan(1200);
  await expect(page.locator('#services')).toContainText('中小件为主');
  await expect(page.locator('#services')).toContainText('大件需沟通');
  await expect(page.locator('#equipment')).toContainText('含 1 台数控车床');
  await expect(page.locator('.scope-note')).toContainText('不代表当地驻点或可维修机型');
  await expect(page.locator('#scope')).toContainText('超出以下范围的上门维修需求不接');
  await expect(page.locator('#work')).toContainText('真实案例待补');
  await expect(page.locator('.site-footer .photo-credit')).toHaveAttribute('href', /credits\.json$/);
});
