import { test, expect } from '@playwright/test';
test.describe.configure({ timeout: process.env.CI ? 90000 : 45000 });
async function ready(page, reduced = true) {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.goto('./');
  await expect(page.locator('.hero')).toHaveAttribute('data-renderer', 'ready', {timeout:20000});
}
async function selected(page, id) {
  await expect.poll(() => page.evaluate(() => window.__machineHero.getState().active)).toBe(id);
  await expect(page.locator('.hero')).toHaveAttribute('data-machine', id);
}
async function waitForPaint(page) {
  // The renderer can be one animation frame behind the selected or paused
  // state. Let invalidations and resize callbacks paint before measuring.
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }));
}
test('the website renders the actual three machines and all 91 model parts', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);
  const actual=await page.evaluate(()=>({state:window.__machineHero.getState(),models:window.__machineHero.getModels().map(m=>({id:m.id,count:m.parts.length,visible:m.group.visible}))}));
  expect(actual.state.totalParts).toBe(91);expect(actual.models.map(m=>m.count)).toEqual([34,31,26]);
  expect(actual.models.filter(m=>m.visible)).toHaveLength(1);await expect(page.locator('#hero-machine-canvas canvas')).toBeVisible();expect(errors).toEqual([]);
});
test('keyboard and rapid manual choices select the real model and matching title', async ({page})=>{
  await ready(page);const buttons=page.locator('.hero-controls [data-hero-machine]');
  await buttons.nth(0).focus();await page.keyboard.press('ArrowRight');await selected(page,'lathe');
  await page.keyboard.press('End');await selected(page,'laser');
  await buttons.nth(0).click();await buttons.nth(2).click();await buttons.nth(1).click();await selected(page,'lathe');
  await expect(page.locator('#hero-machine-name')).toHaveText('车床');
  await expect(page.locator('#hero-machine-name')).toHaveCSS('color','rgb(40, 95, 85)');
});
test('real five-second autoplay advances a model and pause freezes all scene drawing', async ({page})=>{
  await ready(page,false);await selected(page,'mill');
  await expect.poll(()=>page.evaluate(()=>window.__machineHero.getState().active),{timeout:10000}).toBe('lathe');
  await page.locator('#hero-pause').click();await expect.poll(()=>page.evaluate(()=>window.__machineHero.getState().moving)).toBe(false);
  await expect(page.locator('#hero-pause')).toHaveAttribute('aria-pressed','true');
  await waitForPaint(page);
  const before=await page.evaluate(()=>window.__machineHero.getRenderStats().frames);
  await page.waitForTimeout(400);await waitForPaint(page);
  expect(await page.evaluate(()=>window.__machineHero.getRenderStats().frames)).toBe(before);
  await page.locator('.hero-controls [data-hero-machine="laser"]').click();await selected(page,'laser');
});
test('reduced motion keeps manual controls but no autonomous model loop', async ({page})=>{
  await ready(page);await page.locator('.hero-controls [data-hero-machine="laser"]').click();await selected(page,'laser');
  await page.waitForTimeout(150);const before=await page.evaluate(()=>window.__machineHero.getRenderStats().frames);
  await page.waitForTimeout(350);expect(await page.evaluate(()=>window.__machineHero.getRenderStats().frames)).toBe(before);
  expect(await page.evaluate(()=>window.__machineHero.getState().reducedMotion)).toBe(true);
});
test('leaving the opening stops its animation and repeated switches keep GPU resources stable', async ({page})=>{
  await ready(page);
  const renderSelection = async id => {
    const before = await page.evaluate(id => {
      const hero = window.__machineHero;
      const frames = hero.getRenderStats().frames;
      hero.select(id, true);
      return frames;
    }, id);
    await expect.poll(() => page.evaluate(() => window.__machineHero.getRenderStats().frames)).toBeGreaterThan(before);
  };
  for (const id of ['mill','lathe','laser']) await renderSelection(id);
  const before=await page.evaluate(()=>window.__machineHero.getRenderStats());
  for (let i=0;i<12;i++) await renderSelection(['mill','lathe','laser'][i%3]);
  const after=await page.evaluate(()=>window.__machineHero.getRenderStats());
  expect(after.geometries).toBeLessThanOrEqual(before.geometries);expect(after.textures).toBeLessThanOrEqual(before.textures);
  await page.locator('#equipment').scrollIntoViewIfNeeded();await expect.poll(()=>page.evaluate(()=>window.__machineHero.getState().visible)).toBe(false);
  await page.waitForTimeout(150);const frames=await page.evaluate(()=>window.__machineHero.getRenderStats().frames);
  await page.waitForTimeout(350);expect(await page.evaluate(()=>window.__machineHero.getRenderStats().frames)).toBe(frames);
});
test('a blocked model chunk preserves local model posters and functioning selections', async ({page})=>{
  await page.route('**/machine-hero-*.js',route=>route.abort());await page.goto('./');
  await expect(page.locator('.hero')).toHaveAttribute('data-renderer','fallback');
  await expect(page.locator('#hero-poster')).toBeVisible();
  await page.locator('.hero-controls [data-hero-machine="laser"]').click();
  await expect(page.locator('#hero-poster')).toHaveAttribute('src',/laser-hero/);await expect(page.locator('#hero-machine-name')).toHaveText('激光切割机');
});
test('WebGL failure retains a usable poster and real business content', async ({page})=>{
  await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:get.call(this,type,...args);};});
  await page.goto('./');await expect(page.locator('.hero')).toHaveAttribute('data-renderer','fallback');
  await expect(page.locator('#hero-poster')).toBeVisible();await expect(page.locator('#services')).toContainText('大件需沟通');
});
test('context loss displays the poster and context restoration rebuilds the same selected model', async ({page})=>{
  await ready(page);
  await page.locator('.hero-controls [data-hero-machine="lathe"]').click();await selected(page,'lathe');
  await page.evaluate(()=>{const c=document.querySelector('#hero-machine-canvas canvas');window.testLostContext=c.getContext('webgl2').getExtension('WEBGL_lose_context');window.testLostContext.loseContext();});
  await expect(page.locator('.hero')).toHaveAttribute('data-renderer','fallback');await expect(page.locator('#hero-poster')).toBeVisible();
  await page.evaluate(()=>window.testLostContext.restoreContext());await expect(page.locator('.hero')).toHaveAttribute('data-renderer','ready',{timeout:20000});await selected(page,'lathe');
});
test('the full assembly page is shipped with the site and contains no removed background controls', async ({page})=>{
  await page.goto('./machines.html');await expect(page.locator('#workshop-stage')).toHaveAttribute('data-renderer','ready',{timeout:20000});
  await expect(page.locator('#total-count')).toHaveText('91');await expect(page.locator('[data-backdrop-mode], #workshop-backdrop')).toHaveCount(0);
  await page.locator('#complete').click();await expect(page.locator('#machine-labels')).toBeVisible();
  await page.locator('.machine-home-link').click();await expect(page.locator('#hero-title')).toBeVisible();
});
