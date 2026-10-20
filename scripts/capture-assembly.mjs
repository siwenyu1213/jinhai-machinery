import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const directory = 'artifacts/tmp/assembly';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
const report = { url: process.env.SITE_URL || 'http://127.0.0.1:4173/jinhai-machinery/', captures: [], errors: [] };
try {
  for (const width of [360, 390, 768, 1440]) {
    const height = width < 761 ? 844 : 1000;
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'no-preference' });
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.goto(report.url);
    await page.locator('html[data-motion="full"]').waitFor();
    const start = await page.evaluate(() => document.querySelector('#assembly').getBoundingClientRect().top + scrollY - document.querySelector('.site-header').getBoundingClientRect().height);
    const distance = Math.round(height * (width <= 760 ? 1.15 : 1.75));
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), start);
    await page.locator('#assembly[data-renderer="webgl"]').waitFor({ timeout: 20000 });
    for (const progress of [0, .25, .55, .85, 1]) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), start + distance * progress);
      await page.waitForFunction((value) => Math.abs(Number(document.querySelector('#assembly').dataset.progress) - value) < .025, progress);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const path = directory + '/scroll-' + Math.round(progress * 100) + '-' + width + '.png';
      await page.locator('.assembly-stage').screenshot({ path });
      report.captures.push({ width, progress, path, drawCalls: await page.locator('.assembly-viewport').getAttribute('data-draw-calls') });
    }
    if (width === 1440 && process.argv.includes('--poster')) {
      await page.evaluate(() => document.querySelector('#motion-toggle').click());
      await page.locator('html[data-motion="reduced"]').waitFor();
      await page.locator('[data-assembly-stop="1"]').click();
      await page.waitForFunction(() => document.querySelector('#assembly').dataset.spread === '1.000');
      await page.evaluate(() => {
        const viewport = document.querySelector('.assembly-viewport');
        document.body.replaceChildren(viewport);
        Object.assign(document.body.style, { background: 'transparent', margin: '0' });
        Object.assign(viewport.style, { width: '1200px', height: '1000px', position: 'relative' });
        viewport.querySelector('img').remove();
      });
      await page.addStyleTag({ content: '.assembly-canvas { opacity: 1 !important; }' });
      await page.waitForFunction(() => document.querySelector('canvas').width >= 1200);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.locator('.assembly-viewport').screenshot({ path: directory + '/poster.png', omitBackground: true });
    }
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(directory + '/capture-report.json', JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify({ captures: report.captures.length, errors: report.errors, directory }) + '\n');
if (report.errors.length) process.exitCode = 1;
