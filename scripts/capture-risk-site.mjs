import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = process.env.CAPTURE_DIR || 'artifacts/tmp/risk-redesign';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
const report = { captures: [], errors: [] };
try {
  for (const [width, height] of [[1280, 900], [375, 812]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/jinhai-machinery/');
    await page.locator('.hero[data-renderer="ready"]').waitFor({ timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => { const images = [...document.images]; images.forEach(image => image.loading = 'eager'); await Promise.all(images.map(image => image.decode().catch(() => {}))); });
    for (const id of ['mill', 'lathe', 'laser']) {
      await page.evaluate(value => window.__machineHero.select(value, true), id);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const path = `${directory}/${width}-hero-${id}.png`;
      await page.screenshot({ path }); report.captures.push({ width, height, id, path, state: await page.evaluate(() => window.__machineHero.getState()) });
    }
    await page.evaluate(() => window.__machineHero.select('mill', true));
    for (const id of ['equipment', 'services', 'assembly', 'scope', 'contact']) {
      await page.evaluate(value => { const section = document.getElementById(value); window.scrollTo({ top: scrollY + section.getBoundingClientRect().top - document.querySelector('.site-header').offsetHeight - 24, behavior: 'instant' }); }, id);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const path = `${directory}/${width}-${id}.png`;
      await page.screenshot({ path }); report.captures.push({ width, height, section: id, path });
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const path = `${directory}/${width}-full.png`; await page.screenshot({ path, fullPage: true }); report.captures.push({ width, height, fullPage: true, path });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify({ captures: report.captures.length, errors: report.errors }) + '\n');
if (report.errors.length) process.exitCode = 1;
