import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = 'artifacts/tmp/equipment-entrance';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
const report = { captures: [], runs: [], errors: [] };
try {
  for (const [width, height] of [[1280, 900], [375, 812]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'no-preference', recordVideo: { dir: `${directory}/video`, size: { width, height } } });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/jinhai-machinery/#home');
    await page.locator('#assembly').scrollIntoViewIfNeeded();
    await page.locator('#assembly[data-renderer="ready"]').waitFor({ timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      const section = document.querySelector('#assembly'), { lead, length } = window.__inlineAssembly.getState().range;
      scrollTo({ top: scrollY + section.getBoundingClientRect().top - lead + .85 * length, behavior: 'instant' });
    });
    await page.waitForFunction(() => Math.abs(window.__inlineAssembly.getState().progress - .85) < .001);
    async function capture(label) { const path = `${directory}/${width}-${label}.png`; await page.screenshot({ path }); report.captures.push(path); }
    await capture('01-before');
    await page.evaluate(() => {
      window.__entranceFrames = []; const begin = performance.now();
      function sample(now) {
        const state = window.__equipmentIntro.getState(), heading = document.querySelector('#equipment-title');
        window.__entranceFrames.push({ ...state, time: now - begin, scroll: scrollY, title: +getComputedStyle(heading).opacity, titleTop: heading.getBoundingClientRect().top,
          flyingTop: document.querySelector('body > .assembly-title-letters > span')?.getBoundingClientRect().top ?? null,
          values: [...document.querySelectorAll('.equipment-value')].map(node => +getComputedStyle(node).opacity) });
        if (now - begin < 15000 && state.state !== 'complete') requestAnimationFrame(sample);
      } requestAnimationFrame(sample);
    });
    await page.mouse.move(200, 350); await page.mouse.wheel(0, 3200);
    await page.waitForFunction(() => window.__equipmentIntro.getState().state === 'waiting-title');
    await capture('02-waiting-title');
    for (let index = 0; index < 4; index++) { await page.mouse.wheel(0, 1800); await page.waitForTimeout(60); }
    await page.waitForFunction(() => { const nodes = [...document.querySelectorAll('.equipment-value')]; return +getComputedStyle(nodes[0]).opacity > .5 && +getComputedStyle(nodes[4]).opacity === 0; });
    await capture('03-impacts');
    await page.waitForFunction(() => window.__equipmentIntro.getState().landed === 5);
    await capture('04-all-landed');
    await page.waitForFunction(() => window.__equipmentIntro.getState().state === 'complete');
    await page.mouse.wheel(0, 320); await page.waitForTimeout(350);
    await capture('05-released');
    await page.evaluate(() => { const details = document.querySelector('.equipment-details'); scrollTo({ top: details.getBoundingClientRect().top + scrollY - innerHeight * .65, behavior: 'instant' }); });
    await page.locator('.equipment-details summary').click(); await page.waitForTimeout(350);
    await capture('06-list-opening');
    await page.waitForFunction(() => document.querySelector('.equipment-details').dataset.state === 'open'); await page.waitForTimeout(950);
    await capture('07-list-open');
    const frames = await page.evaluate(() => window.__entranceFrames), held = frames.filter(frame => frame.locked);
    const metrics = {
      width, frames: frames.length,
      heldScrollDrift: Math.max(...held.map(frame => frame.scroll)) - Math.min(...held.map(frame => frame.scroll)),
      earlyNumbers: held.some(frame => frame.state === 'waiting-title' && frame.values.some(value => value > 0)),
      numbersBeforeTitle: held.some(frame => frame.values.some(value => value > 0) && frame.title !== 1),
      misplacedTitle: held.some(frame => frame.flyingTop !== null && frame.flyingTop > frame.titleTop + 2),
    };
    if (metrics.heldScrollDrift > 2 || metrics.earlyNumbers || metrics.numbersBeforeTitle || metrics.misplacedTitle) report.errors.push(`Entrance sequence failed at ${width}px`);
    report.runs.push({ ...metrics, timeline: frames });
    await page.close(); await page.video().saveAs(`${directory}/${width}-fast-scroll-and-intro.webm`);
  }
} finally { await browser.close(); }
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify({ captures: report.captures.length, runs: report.runs.map(({ timeline, ...run }) => run), errors: report.errors }) + '\n');
if (report.errors.length) process.exitCode = 1;
