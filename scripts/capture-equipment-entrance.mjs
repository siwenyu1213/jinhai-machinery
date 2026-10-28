import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = 'artifacts/tmp/pinned-reading-welding';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, ignoreDefaultArgs: ['--hide-scrollbars'] });
const report = { captures: [], runs: [], errors: [] };
try {
  for (const [width, height] of [[1280, 900], [375, 812]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'no-preference', recordVideo: { dir: `${directory}/video`, size: { width, height } } });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/jinhai-machinery/#home');
    await page.evaluate(() => document.fonts.ready);
    for (const progress of [.15, .5, 1]) {
      await page.waitForFunction(() => window.__businessIntro);
      await page.evaluate(progress => { const {start, end} = window.__businessIntro.getState(); scrollTo({ top: start + (end - start) * progress, behavior: 'instant' }); }, progress);
      await page.waitForTimeout(500); const path = `${directory}/${width}-business-${progress}.png`;
      await page.screenshot({path}); report.captures.push(path);
    }
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
    const baseline = await page.evaluate(() => ({ bodyWidth: document.body.clientWidth, headerWidth: document.querySelector('.site-header').getBoundingClientRect().width }));
    await page.evaluate(() => {
      window.__entranceFrames = []; const begin = performance.now();
      function sample(now) {
        const state = window.__equipmentIntro.getState(), heading = document.querySelector('#equipment-title');
        window.__entranceFrames.push({ ...state, time: now - begin, scroll: scrollY, bodyWidth: document.body.clientWidth, headerWidth: document.querySelector('.site-header').getBoundingClientRect().width, title: +getComputedStyle(heading).opacity, titleTop: heading.getBoundingClientRect().top,
          flyingTop: document.querySelector('body > .assembly-title-letters > span')?.getBoundingClientRect().top ?? null,
          values: [...document.querySelectorAll('.equipment-value')].map(node => +getComputedStyle(node).opacity) });
        if (now - begin < 25000 && state.state !== 'complete') requestAnimationFrame(sample);
      } requestAnimationFrame(sample);
    });
    await page.mouse.move(200, 350); await page.mouse.wheel(0, 3200);
    await page.waitForFunction(() => window.__equipmentIntro.getState().state === 'waiting-title');
    await capture('02-waiting-title');
    for (let index = 0; index < 4; index++) { await page.mouse.wheel(0, 1800); await page.waitForTimeout(60); }
    await page.waitForFunction(() => window.__equipmentIntro.getState().landed === 1);
    await capture('03-first-landed');
    await page.waitForTimeout(500);
    if (await page.evaluate(() => window.__equipmentIntro.getState().triggered) !== 1) report.errors.push('Numbers played without a new scroll');
    for (let index = 1; index < 5; index++) {
      await page.mouse.wheel(0, 120); await page.waitForTimeout(180);
      await capture(`impact-${index + 1}`);
      await page.waitForFunction(count => window.__equipmentIntro.getState().landed === count, index + 1);
      if (index < 4) { await page.waitForTimeout(200); if (await page.evaluate(() => window.__equipmentIntro.getState().triggered) !== index + 1) report.errors.push('A scroll step revealed extra values'); }
    }
    await capture('04-welding-reveal');
    await page.waitForFunction(() => window.__equipmentIntro.getState().state === 'welding-color');
    await capture('05-welding-red');
    let steps = 0;
    while (await page.evaluate(() => window.__equipmentIntro.getState().weldingTarget < 1)) {
      await page.mouse.wheel(0, 120); await page.waitForTimeout(220);
      if (++steps === 1) await capture('06-welding-color');
    }
    await page.waitForFunction(() => window.__equipmentIntro.getState().state === 'complete');
    await capture('07-welding-ink');
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
      layoutDrift: Math.max(...held.map(frame => Math.max(Math.abs(frame.bodyWidth - baseline.bodyWidth), Math.abs(frame.headerWidth - baseline.headerWidth)))),
    };
    if (metrics.heldScrollDrift > 2 || metrics.layoutDrift > 1 || metrics.earlyNumbers || metrics.numbersBeforeTitle || metrics.misplacedTitle) report.errors.push(`Entrance sequence failed at ${width}px`);
    report.runs.push({ ...metrics, timeline: frames });
    await page.close(); await page.video().saveAs(`${directory}/${width}-fast-scroll-and-intro.webm`);
  }
} finally { await browser.close(); }
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify({ captures: report.captures.length, runs: report.runs.map(({ timeline, ...run }) => run), errors: report.errors }) + '\n');
if (report.errors.length) process.exitCode = 1;
