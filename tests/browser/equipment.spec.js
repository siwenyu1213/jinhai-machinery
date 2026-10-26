import { test, expect } from '@playwright/test';
test.describe.configure({ timeout: 45000 });

async function load(page, reduced = false) {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-motion', reduced ? 'reduced' : 'full');
  await page.evaluate(() => document.fonts.ready);
}
async function place(page, selector, fraction) {
  await page.evaluate(({ selector, fraction }) => { const top = document.querySelector(selector).getBoundingClientRect().top + scrollY; scrollTo({ top: top - innerHeight * fraction, behavior: 'instant' }); }, { selector, fraction });
}

test('all five names precede joined values and units, and welding precedes the disclosure', async ({ page }) => {
  await load(page, true);
  await expect(page.locator('.equipment-value')).toHaveText(['6000W', '165吨', '6台', '3台', '4台']);
  await expect(page.locator('#equipment .equipment-name')).toHaveText(['大族激光切割机', '板料折弯机', '车床', '铣床', '钻床', '焊接工艺']);
  for (const width of [360, 375, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const facts = await page.locator('.equipment-metric').evaluateAll(nodes => nodes.map(node => {
      const name = node.querySelector('h3'), value = node.querySelector('strong'), unit = value.querySelector('span');
      const range = document.createRange(); range.selectNodeContents(value.firstChild);
      const digits = range.getBoundingClientRect(), u = unit.getBoundingClientRect(), style = getComputedStyle(name);
      return { ordered: Boolean(name.compareDocumentPosition(value) & Node.DOCUMENT_POSITION_FOLLOWING), size: +parseFloat(style.fontSize), weight: +style.fontWeight, fits: value.scrollWidth <= value.clientWidth + 1, unitAfter: u.left >= digits.right - 1, inline: u.top < digits.bottom && u.bottom > digits.top };
    }));
    for (const fact of facts) { expect(fact.ordered).toBe(true); expect(fact.size).toBeGreaterThanOrEqual(18); expect(fact.weight).toBe(600); expect(fact.fits).toBe(true); expect(fact.unitAfter).toBe(true); expect(fact.inline).toBe(true); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(await page.locator('.welding').evaluate(node => node.nextElementSibling.matches('.equipment-details'))).toBe(true);
});

test('numbers and units fall together over a short distance and settle with a small impact', async ({ page }) => {
  await load(page);
  // Follow the intended journey: finish loading the preceding assembly before
  // sampling the next section. A cold renderer can stall the first RAF and
  // GSAP deliberately pauses its clock across that stall.
  await page.locator('#assembly').scrollIntoViewIfNeeded();
  await expect(page.locator('#assembly')).toHaveAttribute('data-renderer', 'ready', { timeout: 25000 });
  // Growing the lazy assembly must not consume the equipment entrance above
  // the fold using stale ScrollTrigger coordinates.
  await expect(page.locator('.equipment-value').first()).toHaveCSS('opacity', '0');
  await place(page, '.equipment-highlights', .98);
  const frames = await page.evaluate(async () => {
    const metric = document.querySelector('.equipment-metric'), value = metric.querySelector('strong'), name = metric.querySelector('h3');
    const top = metric.getBoundingClientRect().top + scrollY;
    const samples = [], begin = performance.now();
    scrollTo({ top: top - innerHeight * .8, behavior: 'instant' });
    await new Promise(resolve => { function tick(now) {
      const style = getComputedStyle(value), m = new DOMMatrix(style.transform);
      samples.push({ time: now - begin, y: m.m42, opacity: +style.opacity, nameOpacity: +getComputedStyle(name).opacity, scale: m.m22 });
      const settled = now - begin > 850 && style.transform === 'none' && +style.opacity === 1;
      if (!settled && now - begin < 3000) requestAnimationFrame(tick); else resolve();
    } requestAnimationFrame(tick); });
    return samples;
  });
  expect(Math.min(...frames.map(f => f.y))).toBeGreaterThanOrEqual(-28.1);
  expect(Math.min(...frames.map(f => f.y))).toBeLessThan(-15);
  expect(Math.max(...frames.map(f => f.y))).toBeLessThanOrEqual(2.1);
  expect(frames.some(f => f.scale < .99 && f.y > 0), JSON.stringify(frames)).toBe(true);
  expect(frames.some(f => f.nameOpacity > .2 && f.nameOpacity < 1)).toBe(true);
  expect(frames.at(-1).y).toBe(0); expect(frames.at(-1).opacity).toBe(1);
});

test('the list extends quickly while the document follows more slowly, with native keyboard and filters', async ({ page }) => {
  await load(page); await place(page, '.equipment-details', .65);
  await page.evaluate(() => {
    window.__listSamples = []; const details = document.querySelector('.equipment-details'), start = performance.now();
    function sample(now) { window.__listSamples.push({ time: now - start, height: details.getBoundingClientRect().height, scroll: scrollY, state: details.dataset.state }); if (now - start < 1500) requestAnimationFrame(sample); }
    requestAnimationFrame(sample);
  });
  await page.locator('.equipment-details summary').click();
  await expect(page.locator('.equipment-details')).toHaveAttribute('data-state', 'opening');
  await expect(page.locator('.equipment-details')).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(1150);
  const frames = await page.evaluate(() => window.__listSamples), first = frames[0], last = frames.at(-1);
  expect(last.height).toBeGreaterThan(first.height + 300);
  expect(frames.some(f => f.height > first.height + 20 && f.height < last.height - 20)).toBe(true);
  const opened = frames.find(f => f.state === 'open');
  expect(opened.scroll).toBeLessThan(last.scroll - 30);
  expect(last.scroll).toBeGreaterThan(first.scroll + 50);
  await page.getByRole('group', { name: '设备分类' }).getByRole('button', { name: '车床', exact: true }).click();
  await expect(page.locator('.equipment-table tbody tr:visible')).toHaveCount(4);
  await page.locator('.equipment-details summary').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.equipment-details')).toHaveAttribute('data-state', 'closed');
  await expect(page.locator('.equipment-details summary')).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expect(page.locator('.equipment-details')).toHaveAttribute('data-state', 'open');
});

test('user input stops the page follow, rapid toggles recover, and reduced motion stays immediate', async ({ page }) => {
  await load(page); await place(page, '.equipment-details', .65);
  const summary = page.locator('.equipment-details summary');
  await summary.click(); await page.waitForTimeout(250);
  await page.mouse.wheel(0, -50); await page.waitForTimeout(180);
  const stopped = await page.evaluate(() => scrollY); await page.waitForTimeout(500);
  expect(Math.abs(await page.evaluate(() => scrollY) - stopped)).toBeLessThan(2);
  await summary.click(); await page.waitForTimeout(60); await summary.click();
  await expect(page.locator('.equipment-details')).toHaveAttribute('data-state', 'open');
  expect(await page.locator('.equipment-details').evaluate(node => node.style.height)).toBe('');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await summary.click(); await expect(page.locator('.equipment-details')).toHaveAttribute('data-state', 'closed');
  await summary.click(); await expect(page.locator('.equipment-details')).toHaveAttribute('data-state', 'open');
  expect(await page.locator('.equipment-details').evaluate(node => node.getAnimations().length)).toBe(0);
});
