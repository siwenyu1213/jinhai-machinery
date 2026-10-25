import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = 'artifacts/tmp/risk-redesign';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:4173/jinhai-machinery/');
  await page.locator('.hero[data-renderer="ready"]').waitFor();
  for (const id of ['mill', 'lathe', 'laser']) {
    const data = await page.evaluate(value => {
      const api = window.__machineHero;
      api.select(value, true); api.getCamera().clearViewOffset(); api.getCamera().updateProjectionMatrix();
      return api.capture().split(',')[1];
    }, id);
    await writeFile(`${directory}/${id}-poster.png`, Buffer.from(data, 'base64'));
  }
} finally { await browser.close(); }
