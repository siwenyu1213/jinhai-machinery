import { test, expect } from '@playwright/test';
test('the neutral workshop keeps names synchronized with the actual front machine', async ({ page }) => {
  await page.goto('/workshop.html');
  await expect(page.locator('#workshop-stage')).toHaveAttribute('data-renderer', 'ready');
  await expect(page.locator('#workshop-backdrop,[data-backdrop-mode]')).toHaveCount(0);
  await page.locator('#complete').click(); await page.locator('#toggle-showcase').click();
  for (const id of ['mill', 'lathe', 'laser']) {
    await page.locator(`.machine-label[data-machine="${id}"] button`).click();
    await expect.poll(() => page.evaluate(() => window.__workshopDemo.getShowcaseState().frontId)).toBe(id);
    await expect(page.locator('#machine-title')).toHaveAttribute('data-machine', id);
    await expect(page.locator(`[data-machine-title="${id}"]`)).toHaveCSS('opacity', '1');
  }
});
