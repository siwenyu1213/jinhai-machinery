import { test, expect } from '@playwright/test';

test('business copy is vertically centered and scroll inks characters in reading order', async ({ page }) => {
  // This test covers GSAP and text layout. The independent 3D suites exercise WebGL.
  await page.route(/\/assets\/machine-(hero|assembly)-[^/]+\.js$/, route => route.abort());
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  await page.evaluate(() => document.fonts.ready);
  const paragraph = page.locator('.risk-intro p');
  const text = '非标零配件与设备定制、钣金定制、维修服务。面向食品、印刷与包装行业。';
  await expect(paragraph).toHaveText(text);
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    // ScrollTrigger clears its fixed pin dimensions on the next refresh.
    // Centering alone also passes for the previous viewport's stale width.
    await expect.poll(() => paragraph.evaluate((node, width) => {
      const copy = node.getBoundingClientRect();
      return copy.x > 0 && copy.right < width;
    }, width)).toBe(true);
    await expect.poll(() => paragraph.evaluate(node => {
      const copy = node.getBoundingClientRect(), section = node.closest('section').getBoundingClientRect();
      return Math.abs(copy.y + copy.height / 2 - section.y - section.height / 2);
    })).toBeLessThan(1);
    const section = await page.locator('.risk-intro').boundingBox(), copy = await paragraph.boundingBox();
    expect(Math.abs((copy.y + copy.height / 2) - (section.y + section.height / 2))).toBeLessThan(1);
    expect(copy.x).toBeGreaterThan(0); expect(copy.x + copy.width).toBeLessThan(width);
  }
  async function seek(fraction) {
    await page.evaluate(fraction => {
      const {start, end} = window.__businessIntro.getState();
      scrollTo({ top: start + (end - start) * fraction, behavior: 'instant' });
    }, fraction);
    await expect.poll(() => page.evaluate(fraction => {
      const { start, end, active } = window.__businessIntro.getState();
      return Math.abs(scrollY - (start + (end - start) * fraction)) <= 1 &&
        (fraction === 0 || fraction === 1 || active);
    }, fraction)).toBe(true);
    await page.waitForTimeout(500);
    return paragraph.locator('.intro-char').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
  }
  const before = await seek(0);
  await seek(.2); const early = await paragraph.boundingBox();
  const middle = await seek(.5), late = await paragraph.boundingBox();
  expect(Math.abs(early.y - late.y)).toBeLessThan(1);
  await seek(.8); expect(Math.abs((await paragraph.boundingBox()).y - late.y)).toBeLessThan(1);
  const after = await seek(1);
  expect(new Set(before).size).toBe(1);
  expect(middle[0]).toBe(after[0]); expect(middle.at(-1)).toBe(before.at(-1));
  expect(after[0]).not.toBe(before[0]); expect(after.at(-1)).not.toBe(after[0]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(paragraph.locator('.intro-char')).toHaveCount(0); await expect(paragraph).toHaveText(text);
  await expect(paragraph).toHaveCSS('color', 'rgb(23, 35, 35)');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(paragraph.locator('.intro-char')).toHaveCount([...text].length);
});
