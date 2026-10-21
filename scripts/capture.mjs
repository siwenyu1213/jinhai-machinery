import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
const directory = 'artifacts/tmp/screenshots';
await mkdir(directory, { recursive: true });
try {
  for (const width of [360, 375, 390, 768, 1280, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await page.goto(process.env.SITE_URL || 'http://127.0.0.1:4173/jinhai-machinery/');
    await page.locator('html[data-ready="true"]').waitFor();
    await page.locator('img[src]').evaluateAll(async (images) => {
      images.forEach((image) => { image.loading = 'eager'; });
      await Promise.all(images.map((image) => image.decode()));
    });
    await page.screenshot({ path: `${directory}/home-${width}.png`, fullPage: true });
    if ([375, 390, 1280, 1440].includes(width)) await page.screenshot({ path: `${directory}/hero-${width}.png` });
    if ([375, 1280].includes(width)) {
      for (const index of [1, 2, 0]) {
        await page.locator(`[data-hero-slide="${index}"]`).click();
        await page.locator(`#hero-image[data-frame="${index}"]`).waitFor();
        await page.screenshot({ path: `${directory}/hero-${width}-frame-${index}.png` });
      }
    }
    if (width === 1440) {
      await page.locator('[data-step="2"]').click();
      await page.locator('#process').screenshot({ path: `${directory}/process.png` });
      await page.locator('.hero-actions [data-contact]').click();
      await page.locator('#contact-dialog').screenshot({ path: `${directory}/contact.png` });
    }
    await page.close();
  }
  process.stdout.write(`Screenshots saved to ${directory}\n`);
} finally { await browser.close(); }
