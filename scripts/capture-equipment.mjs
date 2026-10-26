import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = 'artifacts/tmp/equipment-refinement';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
const report = { captures: [], errors: [], handoff: [] };
try {
  for (const [width, height] of [[1280, 900], [375, 812]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'no-preference', recordVideo: { dir: `${directory}/video`, size: { width, height } } });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/jinhai-machinery/');
    await page.locator('#assembly').scrollIntoViewIfNeeded();
    await page.locator('#assembly[data-renderer="ready"]').waitFor({ timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    for (const progress of [.8, .94, .98, .999, 1]) {
      await page.evaluate(value => {
        const section = document.querySelector('#assembly'), { lead, length } = window.__inlineAssembly.getState().range;
        scrollTo({ top: scrollY + section.getBoundingClientRect().top - lead + value * length, behavior: 'instant' });
      }, progress);
      await page.waitForFunction(value => { const state = window.__inlineAssembly.getState(); return Math.abs(state.progress - value) < .0003 && Math.abs(state.progress - state.target) < .000001; }, progress);
      const path = `${directory}/${width}-title-${Math.round(progress * 1000)}.png`;
      await page.screenshot({ path }); report.captures.push(path);
      report.handoff.push({ width, progress, box: await page.locator(progress < 1 ? '.assembly-title-letters > span' : '#equipment-title > span').first().boundingBox() });
    }
    // Approach the metrics slowly enough to record the actual impact motion.
    await page.evaluate(() => scrollBy({ top: 330, behavior: 'smooth' })); await page.waitForTimeout(1200);
    await page.locator('.welding').scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
    const overview = `${directory}/${width}-equipment.png`;
    await page.locator('#equipment').screenshot({ path: overview }); report.captures.push(overview);
    await page.evaluate(() => { const summary = document.querySelector('.equipment-details'); scrollTo({ top: summary.getBoundingClientRect().top + scrollY - innerHeight * .65, behavior: 'instant' }); });
    await page.locator('.equipment-details summary').click(); await page.waitForTimeout(1250);
    const expanded = `${directory}/${width}-expanded.png`; await page.screenshot({ path: expanded }); report.captures.push(expanded);
    await page.close(); await page.video().saveAs(`${directory}/${width}-handoff-and-list.webm`);
  }
} finally { await browser.close(); }
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify(report) + '\n');
if (report.errors.length) process.exitCode = 1;
