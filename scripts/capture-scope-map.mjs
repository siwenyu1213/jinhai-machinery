import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const directory = 'artifacts/tmp/scope-map';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
const errors = [];
try {
  for (const width of [360, 375, 768, 1280, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width <= 760 ? 1500 : 1100 }, reducedMotion: 'no-preference' });
    page.on('pageerror', (error) => errors.push({ width, error: error.message }));
    await page.goto(process.env.SITE_URL || 'http://127.0.0.1:4173/jinhai-machinery/#scope');
    await expect(page.locator('#scope')).toHaveAttribute('data-map-ready', 'true');
    await page.locator('#scope').scrollIntoViewIfNeeded();
    await page.locator('.scope-map-topline').hover();
    await expect(page.locator('#scope')).toHaveAttribute('data-active-region', '');
    await page.locator('#scope').screenshot({ path: `${directory}/scope-${width}-idle.png` });
    for (const key of width === 1280 ? ['jinjiang', 'nanan', 'shishi', 'licheng', 'fengze'] : ['jinjiang']) {
      await page.locator(`.scope-machine[data-scope-select="${key}"]`).hover();
      await expect(page.locator('#scope')).toHaveAttribute('data-active-region', key);
      await expect.poll(() => page.locator('.scope-machine.is-active svg').evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m42)).toBe(-24);
      await page.locator('#scope').screenshot({ path: `${directory}/scope-${width}-${key}.png` });
    }
    await page.screenshot({ path: `${directory}/page-${width}.png`, fullPage: true });
    await page.close();
  }
  await writeFile(`${directory}/report.json`, JSON.stringify({ errors }, null, 2) + '\n');
  if (errors.length) throw new Error(JSON.stringify(errors));
  process.stdout.write(`Service map screenshots saved to ${directory}\n`);
} finally { await browser.close(); }
