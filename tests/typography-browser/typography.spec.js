import {test,expect} from '@playwright/test';
test('the local font files load and render the intended Chinese and numeric glyphs',async({page})=>{
  const external=[],bad=[];page.on('request',r=>{if(new URL(r.url()).origin!=='http://127.0.0.1:4177')external.push(r.url());});page.on('pageerror',e=>bad.push(e.message));
  await page.goto('./');await expect(page.locator('html')).toHaveAttribute('data-fonts-ready','true');
  expect(await page.evaluate(()=>[...document.fonts].every(f=>f.status==='loaded'))).toBe(true);
  const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root}=await cdp.send('DOM.getDocument');
  for(const [selector,family] of [['#headline span:first-child','Smiley'],['.business-list h3','Plex'],['.metric strong','Plex']]){
    const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});expect(fonts.some(f=>f.isCustomFont&&f.familyName.includes(family)&&f.glyphCount>0)).toBe(true);
  }await cdp.detach();expect(external).toEqual([]);expect(bad).toEqual([]);
});
test('one proposal can be compared repeatedly with the current system type using buttons and keyboard',async({page})=>{
  await page.goto('./');await expect(page.locator('html')).toHaveAttribute('data-fonts-ready','true');
  const proposed=await page.locator('#headline').screenshot();
  await page.getByRole('button',{name:'当前字体',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-type','current');await expect(page.locator('#mode-note')).toContainText('系统黑体');
  const current=await page.locator('#headline').screenshot();expect(proposed.equals(current)).toBe(false);
  await page.keyboard.press('ArrowLeft');await expect(page.locator('html')).toHaveAttribute('data-type','proposed');await expect(page.getByRole('button',{name:'推荐搭配',exact:true})).toBeFocused();
  await page.keyboard.press('End');await expect(page.locator('html')).toHaveAttribute('data-type','current');await page.keyboard.press('Home');await expect(page.locator('html')).toHaveAttribute('data-type','proposed');
  await expect(page.locator('[data-mode][aria-pressed="true"]')).toHaveCount(1);
});
test('custom titles are rendered as literal text and generate no requests',async({page})=>{
  await page.goto('./');await expect(page.locator('html')).toHaveAttribute('data-fonts-ready','true');let requests=0;page.on('request',()=>requests++);
  await page.getByLabel('标题内容').fill('<img src=x>');await expect(page.locator('#custom-specimen')).toHaveText('<img src=x>');await expect(page.locator('#custom-specimen img')).toHaveCount(0);expect(requests).toBe(0);
  await page.getByLabel('标题内容').fill('');await expect(page.locator('#custom-specimen')).toHaveText('从结构，看懂机台。');
});
test('preview fits narrow screens and retains readable role sizes and accessible local licenses',async({page})=>{
  await page.goto('./');await expect(page.locator('html')).toHaveAttribute('data-fonts-ready','true');
  for(const name of ['推荐搭配','当前字体']){await page.getByRole('button',{name,exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);for(const metric of await page.locator('.metric strong').all()){expect(await metric.evaluate(node=>node.getBoundingClientRect().right<=node.closest('article').getBoundingClientRect().right+1)).toBe(true);}}
  expect(await page.locator('.reading-sample > p:not(.role-label)').evaluate(node=>parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
  for(const selector of ['#smiley-license','#plex-license']){const response=await page.request.get(await page.locator(selector).getAttribute('href'));expect(response.ok()).toBe(true);expect(await response.text()).toContain('SIL OPEN FONT LICENSE');}
  await expect(page.locator('.footnote')).toContainText('正式网站与原动效尚未修改');
});
test('a missing display font is identified as fallback instead of being presented as the proposal',async({page})=>{
  await page.route('**/*SmileySans*.woff2',r=>r.abort());await page.goto('./');await expect(page.locator('html')).toHaveAttribute('data-fonts-ready','fallback');await expect(page.locator('#mode-note')).toContainText('未能加载');await expect(page.locator('#headline')).toBeVisible();
});
