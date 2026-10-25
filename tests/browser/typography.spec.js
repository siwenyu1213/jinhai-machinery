import {test,expect} from '@playwright/test';
test.describe.configure({timeout:45000});
async function fontsReady(page){await page.evaluate(()=>document.fonts.ready);}
async function actualFonts(page,selector){const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});await cdp.detach();return fonts;}

test('the approved display, body and numeric glyphs render from small local subsets',async({page})=>{
  const bad=[];page.on('request',r=>{if(r.resourceType()==='font'&&new URL(r.url()).origin!==new URL(page.url()).origin)bad.push(r.url());});
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('./');await fontsReady(page);
  for(const [selector,family] of [['#hero-title','Jinhai Display'],['.service-choice .choice-heading','Jinhai Text'],['.equipment-highlights > div > strong','Jinhai Narrow']]){
    expect((await actualFonts(page,selector)).some(font=>font.isCustomFont&&font.familyName===family&&font.glyphCount>0)).toBe(true);
  }
  await expect(page.locator('#hero-title')).toHaveCSS('font-weight','400');
  await expect(page.locator('.equipment-highlights > div > strong').first()).toHaveCSS('-webkit-text-stroke-width','0px');
  const manifest=await (await page.request.get('./fonts/sources.json')).json();expect(manifest.fonts.reduce((sum,font)=>sum+font.bytes,0)).toBeLessThan(600000);expect(bad).toEqual([]);
});
test('loaded fonts preserve heading, metric and navigation bounds across breakpoints',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('./');await fontsReady(page);
  for(const width of [360,375,768,1024,1280,1440]){
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const selector of ['#hero-title','.equipment-highlights > div > strong','.site-header .brand']){
      for(const element of await page.locator(selector).all()){const box=await element.boundingBox();expect(box.x).toBeGreaterThanOrEqual(-1);expect(box.x+box.width).toBeLessThanOrEqual(width+1);}
    }
    for(const metric of await page.locator('.equipment-highlights > div > strong').all()){const bounds=await metric.evaluate(node=>({text:node.textContent,width:node.clientWidth,scroll:node.scrollWidth}));expect(bounds.scroll,JSON.stringify({width,bounds})).toBeLessThanOrEqual(bounds.width+1);}
  }
});
test('font request failures retain readable fallback content and working model selection',async({page})=>{
  await page.route('**/*.woff2',route=>route.abort());await page.emulateMedia({reducedMotion:'reduce'});await page.goto('./');await fontsReady(page);
  await expect(page.locator('#hero-title')).toBeVisible();await expect(page.getByRole('heading',{name:'主营业务',exact:true})).toBeVisible();
  await page.locator('.hero-controls [data-hero-machine="laser"]').click();await expect(page.locator('#hero-machine-name')).toHaveText('激光切割机');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await actualFonts(page,'#hero-title')).every(font=>!font.isCustomFont)).toBe(true);
});
test('the website assembly page uses the same fonts for live titles and readable controls',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('./machines.html');await fontsReady(page);
  await expect(page.locator('#workshop-stage')).toHaveAttribute('data-renderer','ready',{timeout:20000});await page.getByRole('button',{name:'查看完成',exact:true}).click();
  await expect(page.locator('#machine-title')).toBeVisible();await fontsReady(page);
  expect((await actualFonts(page,'.workshop-heading h1')).some(font=>font.isCustomFont&&font.familyName==='Jinhai Display')).toBe(true);
  expect((await actualFonts(page,'#machine-title .is-visible')).some(font=>font.isCustomFont&&font.familyName==='Jinhai Display')).toBe(true);
  expect(await page.locator('.controls').evaluate(node=>node.getBoundingClientRect().bottom<=innerHeight+1)).toBe(true);
  await expect(page.locator('.machine-home-link')).toHaveAttribute('href','./');
});
