import { test, expect } from '@playwright/test';
test.describe.configure({ timeout: 45000 });

test('dark sections use near-black green surfaces with readable text',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('./');
  const surfaces=await page.locator('.machine-section,.process-section,.about-section,.site-footer').evaluateAll(elements=>{
    const channels=color=>color.match(/[\d.]+/g).slice(0,3).map(Number);
    const luminance=color=>channels(color).map(value=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
    return elements.map(node=>{const style=getComputedStyle(node),rgb=channels(style.backgroundColor),background=luminance(style.backgroundColor),foreground=luminance(style.color);return {rgb,background,contrast:(foreground+.05)/(background+.05)};});
  });
  expect(surfaces).toHaveLength(4);
  for(const surface of surfaces){expect(surface.rgb[1]).toBeGreaterThan(surface.rgb[0]);expect(surface.rgb[1]).toBeGreaterThan(surface.rgb[2]);expect(surface.background).toBeLessThan(.015);expect(surface.contrast).toBeGreaterThan(7);}
  await expect(page.locator('.hero')).toHaveCSS('background-image',/rgb\(38, 58, 48\).*rgb\(21, 37, 30\).*rgb\(10, 21, 18\)/);
  await expect(page.locator('.contact-section')).toHaveCSS('background-color','rgb(238, 84, 40)');
});
test('immersive model opening uses the reference palette, large type and centered desktop wordmark',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('./');
  await expect(page.locator('.hero')).toHaveAttribute('data-renderer','ready',{timeout:20000});
  const actual=await page.evaluate(()=>{const hero=document.querySelector('.hero').getBoundingClientRect(),brand=document.querySelector('.site-header .brand').getBoundingClientRect(),style=getComputedStyle(document.querySelector('#hero-title'));return {w:innerWidth,hero:[hero.x,hero.y,hero.width,hero.height],brand:(brand.left+brand.right)/2,size:parseFloat(style.fontSize),color:style.color};});
  expect(actual.hero[0]).toBe(0);expect(actual.hero[1]).toBe(0);expect(actual.hero[2]).toBe(actual.w);
  expect(actual.size).toBeGreaterThanOrEqual(actual.w>760?72:48);expect(actual.color).toBe('rgb(242, 233, 214)');
  if(actual.w>1000)expect(Math.abs(actual.brand-actual.w/2)).toBeLessThan(3);
  await expect(page.locator('.hero-controls [data-hero-machine][aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('.learning-note')).toContainText('不用于商业接单');
});
test('navigation anchors clear the fixed header and the phone menu supports Escape',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('./');
  const menu=page.getByRole('button',{name:'菜单'});if(await menu.isVisible()){await menu.click();await page.keyboard.press('Escape');await expect(menu).toBeFocused();await menu.click();}
  await page.locator('#main-nav a[href="#equipment"]').click();await expect(page.locator('.site-header')).toHaveClass(/is-scrolled/);
  const title=await page.locator('#equipment-title').boundingBox(),bar=await page.locator('.site-header').boundingBox();expect(title.y).toBeGreaterThanOrEqual(bar.y+bar.height-1);
});
test('machine preview cards and the complete assembly entry point to actual models',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('./');await expect(page.locator('.hero')).toHaveAttribute('data-renderer','ready',{timeout:20000});
  await expect(page.locator('.machine-preview img')).toHaveCount(3);for(const image of await page.locator('.machine-preview img').all()) { await image.scrollIntoViewIfNeeded(); await expect.poll(()=>image.evaluate(node=>node.complete&&node.naturalWidth>0)).toBe(true); }
  await page.locator('.machine-preview[data-hero-machine="laser"]').click();
  await expect.poll(()=>page.evaluate(()=>window.__machineHero.getState().active)).toBe('laser');await expect(page.locator('#hero-title')).toBeInViewport();
  const response=await page.request.get('./machines.html');expect(response.ok()).toBe(true);
});
test('the old scenic images are absent and all model assets load from the same origin',async({page})=>{
  const bad=[];page.on('request',r=>{if(['image','script'].includes(r.resourceType())&&new URL(r.url()).origin!==new URL(page.url()).origin)bad.push(r.url());});
  await page.goto('./');await expect(page.locator('.hero')).toHaveAttribute('data-renderer','ready',{timeout:20000});
  await expect(page.locator('[data-backdrop-mode],#workshop-backdrop,.hero-photo')).toHaveCount(0);expect(bad).toEqual([]);
});
test('concise copy retains confirmed business limits and photography attribution',async({page})=>{
  await page.goto('./');const main=(await page.locator('main').innerText()).replace(/\s/g,'');expect(main.length).toBeLessThan(1200);
  await expect(page.locator('#services')).toContainText('中小件为主');await expect(page.locator('#services')).toContainText('大件需沟通');
  await expect(page.locator('#equipment')).toContainText('含 1 台数控车床');await expect(page.locator('#scope')).toContainText('超出以下范围的上门维修需求不接');
  await expect(page.locator('#work')).toContainText('真实案例待补');await expect(page.locator('.site-footer .photo-credit')).toHaveAttribute('href',/credits\.json$/);
});
test('equipment values retain aligned readable units in the two-column metric layout',async({page})=>{
  await page.goto('./');
  const units=page.locator('.equipment-highlights > div > strong > span');
  await expect(units).toHaveCount(2);
  const boxes=await units.evaluateAll(elements=>elements.map(node=>({top:node.getBoundingClientRect().top,display:getComputedStyle(node).display,text:node.textContent.trim()})));
  expect(boxes.map(box=>box.text)).toEqual(['W','吨']);
  expect(boxes.every(box=>box.display==='block')).toBe(true);
  expect(Math.abs(boxes[0].top-boxes[1].top)).toBeLessThan(2);
});
