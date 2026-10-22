import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const directory = 'artifacts/tmp/mill-demo-captures';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
const report = { captures: [], errors: [] };
try {
  for (const [width, height] of [[1280, 900], [375, 812]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'no-preference' });
    page.on('pageerror', (error) => report.errors.push(error.message));
    await page.goto('http://127.0.0.1:4175');
    await page.locator('#mill-stage[data-renderer="ready"]').waitFor();
    for (const progress of [0, 0.12, 0.24, 0.50, 0.76, 0.87, 1]) {
      await page.evaluate((value) => window.__millDemo.setProgress(value), progress);
      await page.waitForFunction((value) => Math.abs(window.__millDemo.getState().progress - value) < 0.003, progress);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const path = `${directory}/${width}-${Math.round(progress * 100)}.png`;
      await page.screenshot({ path });
      report.captures.push({ width, height, progress, path, state: await page.evaluate(() => window.__millDemo.getState()) });
    }
    await page.getByRole('button', { name: '查看内部' }).click();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const internalPath = `${directory}/${width}-internal.png`;
    await page.screenshot({ path: internalPath });
    report.captures.push({ width, height, progress: 1, inspection: true, path: internalPath });
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify({ directory, captures: report.captures.length, errors: report.errors }) + '\n');
if (report.errors.length) process.exitCode = 1;
