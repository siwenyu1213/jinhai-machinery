import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Capture the production preview, including the actual selected machine and
// its name. No camera or model manipulation is used for these acceptance views.
const directory = 'artifacts/tmp/workshop-backgrounds';
const origin = process.env.MILL_DEMO_ORIGIN || 'http://127.0.0.1:4175';
const modes = ['studio', 'airflow', 'blueprint'];
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
const report = { captures: [], errors: [] };
try {
  for (const [width, height] of [[1280, 900], [375, 812]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'no-preference' });
    page.on('pageerror', error => report.errors.push(error.message));
    for (const mode of modes) {
      await page.goto(`${origin}/workshop.html?background=${mode}`);
      await page.locator('#workshop-stage[data-renderer="ready"]').waitFor();
      await page.evaluate(() => window.__workshopDemo.setProgress(.55));
      const swirlPath = `${directory}/${width}-${mode}-vortex.png`;
      await page.screenshot({ path: swirlPath });
      report.captures.push({ width, height, mode, stage: 'vortex', path: swirlPath });
      await page.locator('#complete').click();
      await page.locator('#toggle-showcase').click();
      for (const id of ['mill', 'lathe', 'laser']) {
        await page.locator(`.machine-label[data-machine="${id}"] button`).click();
        await page.waitForFunction(value => window.__workshopDemo.getShowcaseState().frontId === value, id);
        await page.waitForFunction(value => getComputedStyle(document.querySelector(`[data-machine-title="${value}"]`)).opacity === '1', id);
        const path = `${directory}/${width}-${mode}-${id}.png`;
        await page.screenshot({ path });
        report.captures.push({ width, height, mode, machine: id, path,
          state: await page.evaluate(() => window.__workshopDemo.getState()),
          backdrop: await page.evaluate(() => window.__workshopDemo.getBackdropState()),
          stats: await page.evaluate(() => window.__workshopDemo.getRenderStats()),
        });
      }
    }
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify({ directory, captures: report.captures.length, errors: report.errors }) + '\n');
if (report.errors.length) process.exitCode = 1;
