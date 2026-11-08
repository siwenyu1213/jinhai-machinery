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

async function assemblyReady(page) {
  await load(page); await page.locator('#assembly').scrollIntoViewIfNeeded();
  await expect(page.locator('#assembly')).toHaveAttribute('data-renderer', 'ready', { timeout: 25000 });
  await page.evaluate(() => {
    const section = document.querySelector('#assembly'), { lead, length } = window.__inlineAssembly.getState().range;
    scrollTo({ top: scrollY + section.getBoundingClientRect().top - lead + .85 * length, behavior: 'instant' });
  });
  await expect.poll(() => page.evaluate(() => Math.abs(window.__inlineAssembly.getState().progress - .85)), { timeout: 12000 }).toBeLessThan(.001);
}
async function introComplete(page) {
  await page.evaluate(() => scrollTo({ top: window.__equipmentIntro.getState().anchor + 800, behavior: 'instant' }));
  await finishSteps(page);
}
async function finishSteps(page, start = 0) {
  await page.mouse.move(200, 350);
  for (let index = start; index < 5; index++) {
    await expect(page.locator('#equipment')).toHaveAttribute('data-intro', 'awaiting-input', { timeout: 15000 });
    await page.mouse.wheel(0, 120);
    await expect.poll(() => page.evaluate(() => window.__equipmentIntro.getState().landed)).toBe(index + 1);
  }
  await finishWelding(page);
}
async function finishWelding(page) {
  await expect(page.locator('#equipment')).toHaveAttribute('data-intro', 'welding-color');
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 120);
  await expect(page.locator('#equipment')).toHaveAttribute('data-intro', 'complete');
}

test('scroll steps reveal one impact at a time, with a hard stop, two shakes and dust', async ({ page }) => {
  await assemblyReady(page);
  await expect(page.locator('.equipment-value').first()).toHaveCSS('opacity', '0');
  await page.evaluate(() => {
    window.__introFrames = []; let count = 0;
    function sample() {
      const intro = window.__equipmentIntro.getState(), heading = document.querySelector('#equipment-title');
      window.__introFrames.push({ ...intro, scroll: scrollY, title: +getComputedStyle(heading).opacity, progress: window.__inlineAssembly.getState().progress,
        titleTop: heading.getBoundingClientRect().top,
        flyingTop: document.querySelector('body > .assembly-title-letters > span')?.getBoundingClientRect().top ?? null,
        values: [...document.querySelectorAll('.equipment-value')].map(node => { const style = getComputedStyle(node), m = new DOMMatrix(style.transform); return { opacity: +style.opacity, y: m.m42, scale: m.m22 }; }) });
      if (++count < 2000 && intro.state !== 'complete') requestAnimationFrame(sample);
    } requestAnimationFrame(sample);
  });
  // Send the burst in the same event turn as the real first wheel input.
  // Separate protocol calls can arrive after an impact has finished and
  // correctly count as a fresh request instead of input during the title.
  await page.evaluate(() => window.addEventListener('wheel', () => {
    window.__introBurstBlocked = Array.from({ length: 5 }, () => {
      const event = new WheelEvent('wheel', { deltaY: 1800, cancelable: true });
      window.dispatchEvent(event); return event.defaultPrevented;
    });
  }, { once: true }));
  await page.mouse.move(200, 350); await page.mouse.wheel(0, 3200);
  await expect(page.locator('#equipment')).toHaveAttribute('data-intro', 'waiting-title');
  const anchor = await page.evaluate(() => window.__equipmentIntro.getState().anchor);
  expect(await page.evaluate(() => window.__introBurstBlocked)).toEqual([true, true, true, true, true]);
  expect(Math.abs(await page.evaluate(() => scrollY) - anchor)).toBeLessThan(2);
  await expect.poll(() => page.evaluate(() => window.__equipmentIntro.getState().landed)).toBe(1);
  await expect(page.locator('#equipment')).toHaveAttribute('data-intro', 'awaiting-input');
  expect(await page.evaluate(() => window.__equipmentIntro.getState().triggered)).toBe(1);
  await expect(page.locator('#equipment-title')).toHaveCSS('opacity', '1');
  await expect(page.locator('body > .assembly-title-letters')).toHaveCount(0);
  const title = await page.locator('#equipment-title').boundingBox(), header = await page.locator('.site-header').boundingBox();
  expect(title.y).toBeGreaterThanOrEqual(header.height + 22); expect(title.y).toBeLessThan(header.height + 26);
  await expect(page.locator('.welding')).toHaveCSS('visibility', 'hidden');
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__equipmentIntro.getState().landed)).toBe(1);
  await page.mouse.wheel(0, 120); await page.waitForTimeout(170);
  const dust = await page.locator('.equipment-dust i').evaluateAll(nodes => nodes.map(node => +getComputedStyle(node).opacity));
  expect(dust.some(opacity => opacity > .05)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__equipmentIntro.getState().landed)).toBe(2);
  await finishSteps(page, 2);
  const frames = await page.evaluate(() => window.__introFrames);
  expect(frames.some(frame => frame.state === 'waiting-title')).toBe(true);
  expect(frames.some(frame => frame.values[0].opacity > .8 && frame.values[4].opacity === 0)).toBe(true);
  for (const frame of frames.filter(frame => frame.locked)) {
    expect(Math.abs(frame.scroll - anchor)).toBeLessThan(2);
    if (frame.state === 'waiting-title') expect(frame.values.every(value => value.opacity === 0)).toBe(true);
    if (frame.flyingTop !== null) expect(frame.flyingTop).toBeLessThanOrEqual(frame.titleTop + 2);
    if (frame.values.some(value => value.opacity > 0)) { expect(frame.title).toBe(1); expect(frame.progress).toBe(1); }
  }
  const impacts = frames.flatMap(frame => frame.values);
  expect(Math.min(...impacts.map(value => value.y))).toBeGreaterThanOrEqual(-28.1);
  expect(Math.max(...impacts.map(value => value.y))).toBeLessThanOrEqual(2.1);
  expect(impacts.some(value => value.y < -.2 && value.y > -2)).toBe(true);
  expect(impacts.some(value => value.y > .2)).toBe(true);
  expect(await page.evaluate(() => window.__equipmentIntro.getState().landed)).toBe(5);
  for (const value of await page.locator('.equipment-value').all()) { await expect(value).toHaveCSS('opacity', '1'); await expect(value).toHaveCSS('transform', 'none'); }
  const names = await page.locator('.equipment-name').all();
  for (const name of names) await expect(name).toHaveCSS('font-weight', '600');
  await page.mouse.wheel(0, 320);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(anchor + 100);
});

test('welding waits for five impacts, reveals left to right in red, and scrolls smoothly to ink without page drift', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto('./#equipment');
  await page.mouse.move(200, 350);
  const welding = page.locator('.welding');
  await expect(welding).toHaveCSS('visibility', 'hidden');
  for (let i = 0; i < 5; i++) {
    await expect(page.locator('#equipment')).toHaveAttribute('data-intro', 'awaiting-input', { timeout: 15000 });
    await page.mouse.wheel(0, 120);
    await expect.poll(() => page.evaluate(() => window.__equipmentIntro.getState().landed)).toBe(i + 1);
    if (i < 4) await expect(welding).toHaveCSS('visibility', 'hidden');
  }
  await expect(page.locator('#equipment')).toHaveAttribute('data-intro', 'welding-color');
  const chars = welding.locator('.welding-char');
  await expect(chars.first()).toHaveCSS('margin-left', '0px');
  await expect(chars.first()).toHaveCSS('color', 'rgb(173, 55, 25)');
  const anchor = await page.evaluate(() => scrollY), title = await page.locator('#equipment-title').boundingBox();
  await page.waitForTimeout(400); await expect(chars.last()).toHaveCSS('color', 'rgb(173, 55, 25)');
  await page.mouse.wheel(0, 120); await page.waitForTimeout(250);
  expect(await chars.first().evaluate(node => getComputedStyle(node).color)).not.toBe('rgb(173, 55, 25)');
  await expect(chars.last()).toHaveCSS('color', 'rgb(173, 55, 25)');
  expect(Math.abs(await page.evaluate(() => scrollY) - anchor)).toBeLessThan(1);
  expect(Math.abs((await page.locator('#equipment-title').boundingBox()).y - title.y)).toBeLessThan(1);
  await finishWelding(page); await expect(chars.last()).toHaveCSS('color', 'rgb(23, 35, 35)');
  await expect(page.locator('html')).not.toHaveAttribute('data-equipment-hold');
});

test('direct equipment navigation docks before impacts while a later-section link skips the hold', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto('./#equipment');
  await finishSteps(page);
  const title = await page.locator('#equipment-title').boundingBox(), header = await page.locator('.site-header').boundingBox();
  expect(Math.abs(title.y - header.height - 24)).toBeLessThan(2);
  await expect(page.locator('.equipment-value').last()).toHaveCSS('opacity', '1');
  await page.goto('./#process');
  await expect(page.locator('#process-title')).toBeInViewport({ timeout: 15000 });
  expect(await page.evaluate(() => window.__equipmentIntro.getState().locked)).toBe(false);
  await expect(page.locator('#equipment')).toHaveAttribute('data-intro', 'complete');
});

test('upward input cancels the hold, reduced motion releases it, and an explicit link remains usable', async ({ page }) => {
  await assemblyReady(page); await page.mouse.wheel(0, 3200);
  await expect(page.locator('#equipment')).toHaveAttribute('data-intro', 'waiting-title');
  const anchor = await page.evaluate(() => window.__equipmentIntro.getState().anchor);
  await page.mouse.wheel(0, -180); await expect(page.locator('#equipment')).toHaveAttribute('data-intro', 'pending');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(anchor - 20);
  await page.mouse.wheel(0, 800); await expect(page.locator('#equipment')).toHaveAttribute('data-intro', 'waiting-title');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#equipment')).toHaveAttribute('data-intro', 'complete');
  expect(await page.evaluate(() => window.__equipmentIntro.getState().locked)).toBe(false);
  await expect(page.locator('.equipment-value').last()).toHaveCSS('opacity', '1');
  await page.locator('.footer-links a[href="#services"]').click();
  await expect(page.locator('#services-title')).toBeInViewport();
});

test('the list extends over a visible smooth interval, with a slower document follow and native filters', async ({ page }) => {
  await assemblyReady(page); await introComplete(page); await place(page, '.equipment-details', .65);
  await page.evaluate(() => {
    window.__listSamples = []; const details = document.querySelector('.equipment-details'), start = performance.now();
    function sample(now) { window.__listSamples.push({ time: now - start, height: details.getBoundingClientRect().height, scroll: scrollY, state: details.dataset.state }); if (now - start < 2100) requestAnimationFrame(sample); }
    requestAnimationFrame(sample);
  });
  await page.locator('.equipment-details summary').click();
  await expect(page.locator('.equipment-details')).toHaveAttribute('data-state', 'opening');
  await expect(page.locator('.equipment-details')).toHaveAttribute('data-state', 'open'); await page.waitForTimeout(1300);
  const frames = await page.evaluate(() => window.__listSamples), first = frames[0], last = frames.at(-1);
  expect(last.height).toBeGreaterThan(first.height + 300);
  expect(frames.filter(frame => frame.height > first.height + 20 && frame.height < last.height - 20).length).toBeGreaterThan(8);
  const opened = frames.find(frame => frame.state === 'open');
  expect(opened.time - frames.find(frame => frame.state === 'opening').time).toBeGreaterThan(650);
  expect(opened.scroll).toBeLessThan(last.scroll - 20); expect(last.scroll).toBeGreaterThan(first.scroll + 50);
  await page.getByRole('group', { name: '设备分类' }).getByRole('button', { name: '车床', exact: true }).click();
  await expect(page.locator('.equipment-table tbody tr:visible')).toHaveCount(4);
  await page.locator('.equipment-details summary').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.equipment-details')).toHaveAttribute('data-state', 'closed');
  await page.keyboard.press('Space'); await expect(page.locator('.equipment-details')).toHaveAttribute('data-state', 'open');
});

test('user input stops the slower list follow and rapid toggles recover without a fixed height', async ({ page }) => {
  await assemblyReady(page); await introComplete(page); await place(page, '.equipment-details', .65);
  const summary = page.locator('.equipment-details summary'); await summary.click(); await page.waitForTimeout(400);
  await page.mouse.wheel(0, -50); await page.waitForTimeout(180);
  const stopped = await page.evaluate(() => scrollY); await page.waitForTimeout(650);
  expect(Math.abs(await page.evaluate(() => scrollY) - stopped)).toBeLessThan(2);
  await summary.click(); await page.waitForTimeout(60); await summary.click();
  await expect(page.locator('.equipment-details')).toHaveAttribute('data-state', 'open');
  expect(await page.locator('.equipment-details').evaluate(node => node.style.height)).toBe('');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await summary.click(); await expect(page.locator('.equipment-details')).toHaveAttribute('data-state', 'closed');
  await summary.click(); await expect(page.locator('.equipment-details')).toHaveAttribute('data-state', 'open');
  expect(await page.locator('.equipment-details').evaluate(node => node.getAnimations().length)).toBe(0);
});
