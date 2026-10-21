import { test, expect } from '@playwright/test';

const regions = [
  ['jinjiang', '晋江', '车床'], ['nanan', '南安', '钻床'],
  ['shishi', '石狮', '铣床'], ['licheng', '鲤城', '激光切割机'], ['fengze', '丰泽', '折弯机'],
];

async function openMap(page) {
  await page.goto('./#scope');
  await expect(page.locator('#scope')).toHaveAttribute('data-map-ready', 'true');
  await page.locator('.scope-map-canvas').scrollIntoViewIfNeeded();
  // An actual user input ends the site's deferred initial fragment alignment,
  // just as scrolling down from the home page does, before testing the map.
  await page.locator('.scope-map-canvas').click({ position: { x: 2, y: 2 } });
}

// Find an actual exposed polygon point. A region's bounding-box center can be
// water, another district, or covered by a machine; it is not a real hover test.
async function hoverGeography(page, key) {
  const point = await page.locator(`[data-scope-region="${key}"]`).evaluate((region) => {
    const face = region.querySelector('.scope-region-hit');
    const boundary = document.querySelector(face.getAttribute('href'));
    const box = boundary.getBBox();
    const matrix = face.getScreenCTM();
    for (let yi = 1; yi < 20; yi++) {
      for (let xi = 1; xi < 20; xi++) {
        const local = new DOMPoint(box.x + box.width * xi / 20, box.y + box.height * yi / 20);
        if (!boundary.isPointInFill(local)) continue;
        const screen = local.matrixTransform(matrix);
        if (document.elementFromPoint(screen.x, screen.y)?.closest('[data-scope-region]') === region) return { x: screen.x, y: screen.y };
      }
    }
    throw new Error(`No exposed polygon point for ${region.dataset.scopeRegion}`);
  });
  await page.mouse.move(point.x, point.y);
}

test('the five actual service districts are colored and all surrounding districts stay gray', async ({ page }) => {
  const external = [];
  page.on('request', (request) => { if (/geo\.datav|api.*amap/.test(request.url())) external.push(request.url()); });
  await openMap(page);
  await expect(page.locator('[data-scope-region]')).toHaveCount(5);
  await expect(page.locator('.scope-context')).toHaveCount(7);
  await expect(page.locator('.scope-place')).toHaveText(regions.map(([, name]) => name));
  const fills = await page.locator('.scope-region-face').evaluateAll((faces) => faces.map((face) => getComputedStyle(face).fill));
  expect(new Set(fills).size).toBe(5);
  const context = await page.locator('.scope-context').evaluateAll((areas) => areas.map((area) => getComputedStyle(area).fill));
  expect(new Set(context).size).toBe(1);
  expect(fills).not.toContain(context[0]);
  await expect(page.locator('.scope-machine')).toHaveCount(5);
  for (const [key] of regions) await expect(page.locator(`.scope-machine[data-scope-select="${key}"] svg`)).toHaveCSS('filter', 'grayscale(1)');
  await expect(page.locator('#scope')).toContainText('超出以下范围的上门维修需求不接');
  await expect(page.locator('.scope-note')).toContainText('不代表当地驻点或可维修机型');
  await expect(page.locator('.scope-map figcaption')).toContainText('2021 年数据');
  const contextLabels = await page.locator('[data-context-adcode]').evaluateAll((labels) => labels.map((label) => {
    const path = document.querySelector(`#scope-boundary-${label.dataset.contextAdcode}`);
    return path.isPointInFill(new DOMPoint(Number(label.getAttribute('x')), Number(label.getAttribute('y'))));
  }));
  expect(contextLabels).toEqual([true, true, true, true]);
  expect(external).toEqual([]);
});

test('hovering each geographic polygon lifts only its machine and highlights the correct region', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openMap(page);
  const contextBefore = await page.locator('.scope-context').first().evaluate((area) => getComputedStyle(area).fill);
  for (const [key, name, machine] of [...regions, regions[0], regions[4]]) {
    await hoverGeography(page, key);
    await expect(page.locator('#scope')).toHaveAttribute('data-active-region', key);
    await expect(page.locator('.scope-region.is-active')).toHaveCount(1);
    await expect(page.locator('.scope-machine.is-active')).toHaveCount(1);
    await expect(page.locator('#scope-current-name')).toHaveText(name);
    await expect(page.locator('#scope-current-machine')).toContainText(machine);
    const icon = page.locator(`.scope-machine[data-scope-select="${key}"] svg`);
    await expect.poll(() => icon.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m42)).toBeLessThan(-20);
    await expect.poll(() => icon.evaluate((element) => getComputedStyle(element).filter)).toContain('grayscale(0)');
    for (const [other] of regions.filter(([value]) => value !== key)) {
      await expect(page.locator(`.scope-machine[data-scope-select="${other}"]`)).not.toHaveClass(/is-active/);
      await expect(page.locator(`.scope-machine[data-scope-select="${other}"] svg`)).toHaveCSS('filter', 'grayscale(1)');
    }
  }
  expect(await page.locator('.scope-context').first().evaluate((area) => getComputedStyle(area).fill)).toBe(contextBefore);
  await page.locator('.scope-map-topline').hover();
  await expect(page.locator('#scope')).toHaveAttribute('data-active-region', '');
  await expect(page.locator('.scope-machine.is-active')).toHaveCount(0);
  await expect(page.locator('.scope-region.is-active')).toHaveCount(0);
});

test('keyboard operation reaches all districts, wraps, activates and clears without moving the page', async ({ page }) => {
  await openMap(page);
  await page.locator('.scope-places').scrollIntoViewIfNeeded();
  await page.locator('.scope-place').first().evaluate((element) => element.focus({ preventScroll: true }));
  await expect(page.locator('#scope-current-name')).toHaveText('晋江');
  const before = await page.evaluate(() => scrollY);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.scope-place').nth(1)).toBeFocused();
  await expect(page.locator('#scope-status')).toContainText('南安可上门');
  await page.keyboard.press('End');
  await expect(page.locator('.scope-place').last()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.scope-place').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.scope-place').first()).toHaveAttribute('aria-pressed', 'true');
  expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.scope-machine.is-active')).toHaveCount(0);
  await page.locator('[data-scope-region="licheng"]').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#scope')).toHaveAttribute('data-active-region', 'licheng');
  await expect(page.locator('[data-scope-region="licheng"]')).toHaveAttribute('aria-pressed', 'true');
});

test('tap or click changes the selected district, including the machine label, and outside input clears it', async ({ page }, testInfo) => {
  await openMap(page);
  for (const [key, name] of [regions[3], regions[4], regions[1], regions[0]]) {
    const choice = page.locator(`.scope-place[data-scope-select="${key}"]`);
    if (testInfo.project.name === 'mobile') await choice.tap();
    else await choice.click();
    await expect(page.locator('#scope')).toHaveAttribute('data-active-region', key);
    await expect(page.locator('#scope-status')).toContainText(`${name}可上门`);
    await expect(page.locator('.scope-machine.is-active')).toHaveCount(1);
  }
  const machine = page.locator('.scope-machine[data-scope-select="shishi"]');
  if (testInfo.project.name === 'mobile') await machine.tap();
  else await machine.click();
  await expect(page.locator('#scope')).toHaveAttribute('data-active-region', 'shishi');
  await page.locator('#scope-title').click();
  await page.locator('.scope-map-topline').hover();
  await expect(page.locator('#scope')).toHaveAttribute('data-active-region', 'shishi');
  await page.locator('.about-section h2').click();
  await expect(page.locator('#scope')).toHaveAttribute('data-active-region', '');
});

test('reduced motion retains immediate selection and color while removing lift', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMap(page);
  await page.locator('.scope-place[data-scope-select="fengze"]').click();
  await expect(page.locator('#scope')).toHaveAttribute('data-active-region', 'fengze');
  await expect(page.locator('.scope-machine.is-active svg')).toHaveCSS('transform', 'none');
  await expect(page.locator('.scope-region.is-active .scope-region-face')).toHaveCSS('transform', 'none');
  await expect(page.locator('#scope-current-machine')).toContainText('折弯机');
  await expect(page.locator('.scope-machine.is-active svg')).toHaveCSS('opacity', '1');
});

test('map, visible place names and controls fit mobile, tablet and desktop widths', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMap(page);
  for (const width of [360, 375, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('.scope-map-canvas').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const bounds = await page.locator('.scope-machine-label, .scope-place').evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { text: element.textContent, x: box.left, right: box.right, font: Number.parseFloat(getComputedStyle(element).fontSize) };
    }));
    for (const box of bounds) {
      expect(box.x, `${box.text} at ${width}`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${box.text} at ${width}`).toBeLessThanOrEqual(width);
      expect(box.font).toBeGreaterThanOrEqual(12);
    }
  }
});

test('map occupies one complete row with a compact explanation panel inside its bottom', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMap(page);
  for (const width of [375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    await expect(page.locator('#scope')).toHaveAttribute('data-map-layout', width > 760 ? 'wide' : 'compact');
    const layout = await page.locator('#scope').evaluate((section) => {
      const rect = (selector) => section.querySelector(selector).getBoundingClientRect();
      const wrap = rect('.scope-layout');
      const figure = rect('.scope-map');
      const canvas = rect('.scope-map-canvas');
      const caption = rect('.scope-map-caption');
      const copy = rect('.scope-copy');
      const styles = getComputedStyle(section);
      return {
        wrapWidth: wrap.width, mapWidth: figure.width, canvasWidth: canvas.width,
        figureBottom: figure.bottom, canvasBottom: canvas.bottom, captionTop: caption.top,
        copyTop: copy.top, captionBottom: caption.bottom, figureTop: figure.top,
        sectionTop: section.getBoundingClientRect().top,
        topPadding: Number.parseFloat(styles.paddingTop), bottomPadding: Number.parseFloat(styles.paddingBottom),
        figureHeight: figure.height,
        titleInCaption: Boolean(section.querySelector('.scope-map-caption #scope-title')),
        controlsInCaption: Boolean(section.querySelector('.scope-map-caption .scope-places')),
      };
    });
    expect(Math.abs(layout.mapWidth - layout.wrapWidth)).toBeLessThan(2);
    expect(Math.abs(layout.canvasWidth - layout.wrapWidth)).toBeLessThan(2);
    expect(layout.captionTop).toBeGreaterThanOrEqual(layout.canvasBottom - 1);
    expect(layout.copyTop).toBeGreaterThan(layout.canvasBottom);
    expect(layout.captionBottom).toBeLessThanOrEqual(layout.figureBottom + 1);
    expect(layout.figureTop - layout.sectionTop).toBeLessThanOrEqual(17);
    expect(layout.topPadding).toBeLessThanOrEqual(16);
    expect(layout.bottomPadding).toBeLessThanOrEqual(16);
    expect(layout.titleInCaption && layout.controlsInCaption).toBe(true);
    if (width === 375) expect(layout.figureHeight).toBeLessThan(820);
  }
});

test('east west remains vertical at an enlarged uniform scale with attached callouts after resizing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMap(page);
  for (const width of [1280, 375, 768, 1440, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await expect(page.locator('.scope-map-geography')).toHaveAttribute('viewBox', width > 760 ? '-80 240 1240 640' : '40 200 930 760');
    // The SVG viewport and the CSS aspect ratio settle on separate rendering
    // frames after a browser resize. Measure the painted layout, not that frame.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const orientation = await page.locator('.scope-map-canvas').evaluate((canvas) => {
      const svg = canvas.querySelector('.scope-map-geography');
      const transform = svg.getScreenCTM();
      const east = canvas.querySelector('.scope-east').getBoundingClientRect();
      const west = canvas.querySelector('.scope-west').getBoundingClientRect();
      const callouts = [...canvas.querySelectorAll('[data-scope-link]')].map((link) => {
        const point = link.querySelector('path').getPointAtLength(link.querySelector('path').getTotalLength());
        const position = point.matrixTransform(transform);
        const button = canvas.querySelector(`.scope-machine[data-scope-select="${link.dataset.scopeLink}"]`);
        const styles = getComputedStyle(button);
        const bounds = canvas.getBoundingClientRect();
        return { dx: position.x - bounds.left - Number.parseFloat(styles.left), dy: position.y - bounds.top - Number.parseFloat(styles.top) };
      });
      const sourcePoint = (key) => {
        const marker = canvas.querySelector(`[data-scope-link="${key}"] circle`);
        return new DOMPoint(Number(marker.getAttribute('cx')), Number(marker.getAttribute('cy'))).matrixTransform(transform);
      };
      return { a: transform.a, b: transform.b, c: transform.c, d: transform.d, eastY: east.top, westY: west.top, eastX: east.left + east.width / 2, westX: west.left + west.width / 2, geographicEast: sourcePoint('shishi').y, geographicWest: sourcePoint('nanan').y, canvasWidth: canvas.getBoundingClientRect().width, callouts };
    });
    expect(orientation.b).toBe(0);
    expect(orientation.c).toBe(0);
    expect(orientation.a).toBeGreaterThan(0);
    expect(Math.abs(orientation.a - orientation.d)).toBeLessThan(.001);
    expect(orientation.eastY).toBeLessThan(orientation.westY);
    expect(Math.abs(orientation.eastX - orientation.westX)).toBeLessThan(2);
    expect(orientation.geographicEast).toBeLessThan(orientation.geographicWest);
    const enlargement = orientation.a / (orientation.canvasWidth / (width > 760 ? 1600 : 1000));
    expect(enlargement).toBeGreaterThan(width > 760 ? 1.28 : 1.07);
    for (const item of orientation.callouts) {
      expect(Math.abs(item.dx)).toBeLessThan(2);
      expect(Math.abs(item.dy)).toBeLessThan(2);
    }
  }
});

test('geography and all five place names remain visible without scripts', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}#scope`);
  await expect(page.locator('.scope-map-geography')).toBeVisible();
  await expect(page.locator('[data-scope-region]')).toHaveCount(5);
  await expect(page.locator('.scope-place')).toHaveText(regions.map(([, name]) => name));
  await expect(page.locator('#scope')).toContainText('超出以下范围的上门维修需求不接');
  const symbols = await page.request.get('./maps/machines.svg');
  expect(symbols.ok()).toBe(true);
  for (const id of ['lathe', 'drill', 'mill', 'laser', 'press']) expect(await symbols.text()).toContain(`id="${id}"`);
  await context.close();
});
