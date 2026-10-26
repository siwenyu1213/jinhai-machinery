import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = 'artifacts/tmp/inline-assembly';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
const report = { captures: [], errors: [] };
try {
  for (const [width, height] of [[1280, 900], [375, 812]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'no-preference', recordVideo: { dir: `${directory}/video`, size: { width, height } } });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/jinhai-machinery/');
    await page.locator('#assembly').scrollIntoViewIfNeeded();
    await page.locator('#assembly[data-renderer="ready"]').waitFor({ timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    for (const progress of [0, .12, .22, .35, .48, .62, .78, .89, .95, 1]) {
      await page.evaluate(value => {
        const section = document.querySelector('#assembly');
        window.scrollTo({ top: scrollY + section.getBoundingClientRect().top + value * (section.offsetHeight - section.querySelector('.assembly-sticky').offsetHeight), behavior: 'instant' });
      }, progress);
      await page.waitForFunction(value => Math.abs(window.__inlineAssembly.getState().progress - value) < .001, progress, { timeout: 10000 });
      const path = `${directory}/${width}-${Math.round(progress * 100)}.png`;
      await page.screenshot({ path });
      report.captures.push({ path, width, progress, state: await page.evaluate(() => window.__inlineAssembly.getState()) });
    }
    await page.close();
    await page.video().saveAs(`${directory}/${width}-scroll-assembly.webm`);
  }
} finally { await browser.close(); }
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify({ captures: report.captures.length, errors: report.errors }) + '\n');
if (report.errors.length) process.exitCode = 1;
