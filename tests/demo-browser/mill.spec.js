import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#mill-stage')).toHaveAttribute('data-renderer', 'ready');
}

test('starts empty and real wheel scrolling advances and reverses the simultaneous flight', async ({ page }) => {
  await ready(page);
  const stage = page.locator('#mill-stage');
  await expect(stage).toHaveAttribute('data-progress', '0.00000');
  await expect(page.locator('#first-hint')).toBeVisible();
  await page.mouse.move(300, 300);
  await page.mouse.wheel(0, 240);
  await expect.poll(() => page.evaluate(() => window.__millDemo.getState().progress)).toBeGreaterThan(.07);
  const forward = await page.evaluate(() => window.__millDemo.getState());
  expect(forward.assembledCount).toBe(0);
  expect(await page.evaluate(() => window.__millDemo.getParts().filter((part) => part.object.visible).length)).toBe(forward.totalParts);
  await page.mouse.wheel(0, -120);
  await expect.poll(() => page.evaluate(() => window.__millDemo.getState().progress)).toBeLessThan(forward.progress - .02);
  const backward = await page.evaluate(() => window.__millDemo.getState());
  expect(backward.assembledCount).toBe(0);
  await page.evaluate(() => window.__millDemo.setProgress(0));
  expect(await page.evaluate(() => window.__millDemo.getParts().filter((part) => part.object.visible).length)).toBe(0);
});

test('a short scroll path advances substantially per wheel step and finishes within twenty steps', async ({ page }) => {
  await ready(page);
  const travel = await page.evaluate(() => ({ distance: document.documentElement.scrollHeight - innerHeight, height: innerHeight }));
  expect(travel.distance).toBeLessThanOrEqual(travel.height * 2.26);
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => page.evaluate(() => window.__millDemo.getState().progress)).toBeGreaterThan(.035);
  for (let step = 1; step < 20; step++) await page.mouse.wheel(0, 120);
  await expect(page.locator('#phase-name')).toHaveText('装配完成');
  const state = await page.evaluate(() => window.__millDemo.getState());
  expect(state.assembledCount).toBe(state.totalParts);
});

test('arrival and overlapping assembly receive extra physical scroll time', async ({ page }) => {
  await ready(page);
  const positions = [];
  for (const progress of [.24, .64, .94]) {
    await page.evaluate((value) => window.__millDemo.setProgress(value), progress);
    positions.push(await page.evaluate(() => scrollY / innerHeight));
  }
  expect(positions[0]).toBeCloseTo(.24 * 1.4 * 2.1, 2);
  expect(positions[1] - positions[0]).toBeCloseTo((.64 - .24) * 1.4 * .7, 2);
  expect(positions[2] - positions[1]).toBeCloseTo((.94 - .64) * 1.4 * 2.5, 2);
});

test('wheel release continues moving toward its target, supports reversal, and direct controls cancel the follow', async ({ page }) => {
  await ready(page);
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, 360);
  await expect.poll(() => page.evaluate(() => window.__millDemo.getState().targetProgress)).toBeGreaterThan(.12);
  const samples = await page.evaluate(async () => {
    const entries = [];
    const start = performance.now();
    await new Promise((resolve) => {
      function sample(now) {
        if (entries.length === 0 || (entries.length === 1 && now - start >= 150)) {
          const state = window.__millDemo.getState();
          entries.push({ ...state, scrollY, position: window.__millDemo.getParts()[0].object.position.toArray() });
        }
        if (entries.length === 2) resolve(); else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    return entries;
  });
  expect(samples[0].settling).toBe(true);
  expect(samples[1].scrollY).toBe(samples[0].scrollY);
  expect(samples[1].targetProgress).toBe(samples[0].targetProgress);
  expect(samples[1].progress).toBeGreaterThan(samples[0].progress);
  expect(samples[1].progress).toBeLessThan(samples[1].targetProgress);
  expect(samples[1].position).not.toEqual(samples[0].position);
  await expect.poll(() => page.evaluate(() => window.__millDemo.getState().settling)).toBe(false);
  const forward = await page.evaluate(() => window.__millDemo.getState().progress);
  await page.mouse.wheel(0, -120);
  await expect.poll(() => page.evaluate(() => window.__millDemo.getState().progress)).toBeLessThan(forward - .03);
  await page.getByRole('button', { name: '重播' }).click();
  await page.evaluate(() => new Promise((resolve) => {
    let count = 0;
    function check() { if (++count === 6) resolve(); else requestAnimationFrame(check); }
    requestAnimationFrame(check);
  }));
  const replayed = await page.evaluate(() => window.__millDemo.getState());
  expect(replayed.progress).toBe(0);
  expect(replayed.settling).toBe(false);
});

test('all components stay visible through the vortex and assemble together once', async ({ page }) => {
  await ready(page);
  for (const [progress, label, stage] of [[.25, '中央旋绕', 'vortex'], [.6, '中央旋绕', 'vortex'], [.8, '旋转组装', 'assembly']]) {
    await page.evaluate((value) => window.__millDemo.setProgress(value), progress);
    await expect(page.locator('#phase-name')).toHaveText(label);
    const state = await page.evaluate(() => window.__millDemo.getState());
    expect(state.stage).toBe(stage);
    expect(state.assembledCount).toBe(0);
    expect(await page.evaluate(() => window.__millDemo.getParts().filter((part) => part.object.visible).length)).toBe(state.totalParts);
  }
  await page.evaluate(() => window.__millDemo.setProgress(.96));
  await expect(page.locator('#phase-name')).toHaveText('装配完成');
  const final = await page.evaluate(() => ({ state: window.__millDemo.getState(), exact: window.__millDemo.getParts().every((part) => part.object.visible && part.object.position.distanceTo(part.homePosition) < 1e-8 && part.object.quaternion.angleTo(part.homeQuaternion) < 1e-6) }));
  expect(final.state.assembledCount).toBe(final.state.totalParts);
  expect(final.exact).toBe(true);
});

test('components keep visibly rotating while simultaneously converging to their assembled sizes', async ({ page }) => {
  await ready(page);
  const samples = [];
  for (const progress of [.72, .78, .84]) {
    await page.evaluate((value) => window.__millDemo.setProgress(value), progress);
    samples.push(await page.evaluate(() => {
      const base = window.__millDemo.getParts().find((part) => part.id === 'base').object;
      return { state: window.__millDemo.getState(), quaternion: base.quaternion.toArray(), scale: base.scale.x };
    }));
  }
  for (let index = 1; index < samples.length; index++) {
    const before = samples[index - 1], after = samples[index];
    expect(after.state.stage).toBe('assembly');
    expect(after.state.rotationProgress).toBeGreaterThan(before.state.rotationProgress);
    expect(after.state.rotationProgress).toBeLessThan(1);
    expect(after.state.assemblyProgress).toBeGreaterThan(before.state.assemblyProgress);
    expect(after.scale).toBeGreaterThan(before.scale);
    const dot = Math.abs(before.quaternion.reduce((sum, value, component) => sum + value * after.quaternion[component], 0));
    expect(2 * Math.acos(Math.min(1, dot))).toBeGreaterThan(.15);
  }
});

test('arrival already rotates and the broad tornado shrinks continuously into the normal funnel', async ({ page }, testInfo) => {
  await ready(page);
  const samples = [];
  for (const progress of [.18, .22, .30, .42]) {
    await page.evaluate((value) => window.__millDemo.setProgress(value), progress);
    samples.push(await page.evaluate(() => {
      const parts = window.__millDemo.getParts();
      const Box3 = window.__millDemo.getBounds().constructor;
      const centers = parts.map((part) => new Box3().setFromObject(part.object).getCenter(part.object.position.clone()));
      const base = parts.find((part) => part.id === 'base').object;
      return { state: window.__millDemo.getState(), quaternion: base.quaternion.toArray(),
        radius: centers.reduce((sum, point) => sum + Math.hypot(point.x, point.z), 0) / centers.length };
    }));
    if (progress === .18 || progress === .42) await testInfo.attach(`rotating-funnel-${Math.round(progress * 100)}`, { body: await page.screenshot(), contentType: 'image/png' });
  }
  expect(samples[0].state.stage).toBe('arrival');
  expect(samples[0].state.rotationProgress).toBeGreaterThan(.05);
  expect(samples[0].radius).toBeGreaterThan(samples.at(-1).radius * 1.6);
  for (let index = 1; index < samples.length; index++) {
    const before = samples[index - 1], after = samples[index];
    expect(after.radius).toBeLessThan(before.radius);
    expect(after.state.rotationProgress).toBeGreaterThan(before.state.rotationProgress);
    const dot = Math.abs(before.quaternion.reduce((sum, value, component) => sum + value * after.quaternion[component], 0));
    expect(2 * Math.acos(Math.min(1, dot))).toBeGreaterThan(.1);
  }
});

test('the vortex fills both sides at several heights and stays readable within the viewport', async ({ page }, testInfo) => {
  await ready(page);
  for (const progress of [.42, .46, .52, .58, .63]) {
    await page.evaluate((value) => window.__millDemo.setProgress(value), progress);
    const distribution = await page.evaluate(() => {
      const camera = window.__millDemo.getCamera();
      const Box3 = window.__millDemo.getBounds().constructor;
      let meshMinX = Infinity;
      let meshMaxX = -Infinity;
      const entries = window.__millDemo.getParts().map((part) => {
        const box = new Box3().setFromObject(part.object);
        const center = box.getCenter(part.object.position.clone());
        const projected = center.clone().project(camera);
        const axis = center.clone().set(0, center.y, 0).project(camera);
        const vertex = center.clone();
        part.object.traverse((object) => {
          if (!object.isMesh) return;
          const positions = object.geometry.getAttribute('position');
          for (let index = 0; index < positions.count; index++) {
            vertex.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld).project(camera);
            meshMinX = Math.min(meshMinX, vertex.x);
            meshMaxX = Math.max(meshMaxX, vertex.x);
          }
        });
        return { id: part.id, height: center.y, x: projected.x, y: projected.y, side: projected.x - axis.x, visible: part.object.visible };
      }).sort((a, b) => a.height - b.height);
      const bands = Array.from({ length: 3 }, (_, band) => {
        const group = entries.slice(Math.floor(entries.length * band / 3), Math.floor(entries.length * (band + 1) / 3));
        return { left: group.filter((part) => part.side < -.025).length, right: group.filter((part) => part.side > .025).length };
      });
      return { entries, bands, meshMinX, meshMaxX, inside: entries.filter((part) => Math.abs(part.x) < 1 && Math.abs(part.y) < .95).length };
    });
    expect(distribution.entries.every((entry) => entry.visible)).toBe(true);
    for (const band of distribution.bands) {
      expect(band.left).toBeGreaterThanOrEqual(2);
      expect(band.right).toBeGreaterThanOrEqual(2);
    }
    expect(distribution.inside).toBeGreaterThanOrEqual(Math.floor(distribution.entries.length * .9));
    expect(distribution.meshMinX).toBeGreaterThan(-.98);
    expect(distribution.meshMaxX).toBeLessThan(.98);
    await testInfo.attach(`vortex-${Math.round(progress * 100)}`, { body: await page.screenshot(), contentType: 'image/png' });
  }
});

test('the narrow-screen camera pulls back smoothly for the vortex and returns for the complete machine', async ({ page }) => {
  await ready(page);
  const baseline = await page.evaluate(() => {
    const camera = window.__millDemo.getCamera();
    return { position: camera.position.toArray(), distance: camera.position.distanceTo(window.__millDemo.getBounds().getCenter(camera.position.clone())), width: innerWidth };
  });
  await page.evaluate(() => window.__millDemo.setProgress(.5));
  const vortexDistance = await page.evaluate(() => {
    const camera = window.__millDemo.getCamera();
    return camera.position.distanceTo(window.__millDemo.getBounds().getCenter(camera.position.clone()));
  });
  expect(vortexDistance / baseline.distance).toBeCloseTo(baseline.width < 600 ? 1.2 : 1, 5);
  const thresholdPositions = [];
  for (const progress of [.239, .241]) {
    await page.evaluate((value) => window.__millDemo.setProgress(value), progress);
    thresholdPositions.push(await page.evaluate(() => window.__millDemo.getCamera().position.toArray()));
  }
  const thresholdStep = Math.hypot(...thresholdPositions[0].map((value, index) => value - thresholdPositions[1][index]));
  expect(thresholdStep).toBeLessThan(.01);
  await page.evaluate(() => window.__millDemo.setProgress(1));
  const completed = await page.evaluate(() => window.__millDemo.getCamera().position.toArray());
  completed.forEach((value, index) => expect(value).toBeCloseTo(baseline.position[index], 8));
});

test('native range, keyboard, completion and replay stay synchronized', async ({ page }) => {
  await ready(page);
  const slider = page.getByRole('slider', { name: '装配进度' });
  await slider.fill('500');
  await expect(page.locator('#progress-value')).toHaveText('50%');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('501');
  await page.getByRole('button', { name: '查看完成' }).click();
  await expect(page.locator('#phase-name')).toHaveText('装配完成');
  const state = await page.evaluate(() => window.__millDemo.getState());
  expect(state.assembledCount).toBe(state.totalParts);
  expect(state.totalParts).toBeGreaterThanOrEqual(25);
  const pose = await page.evaluate(() => window.__millDemo.getParts().every((part) => part.object.visible && part.object.position.distanceTo(part.homePosition) < 1e-8 && part.object.quaternion.angleTo(part.homeQuaternion) < 1e-6));
  expect(pose).toBe(true);
  await page.getByRole('button', { name: '重播' }).click();
  await expect(slider).toHaveValue('0');
  await expect(page.locator('#assembled-count')).toHaveText('0');
});

test('completed machine fits the stage and controls remain within the viewport', async ({ page }, testInfo) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  const layout = await page.evaluate(() => {
    const camera = window.__millDemo.getCamera();
    const box = window.__millDemo.getBounds();
    const points = [];
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
      const point = box.min.clone().set(x ? box.max.x : box.min.x, y ? box.max.y : box.min.y, z ? box.max.z : box.min.z).project(camera);
      points.push([point.x, point.y]);
    }
    const controls = document.querySelector('.controls').getBoundingClientRect();
    return { points, controls: { left: controls.left, right: controls.right, bottom: controls.bottom }, width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth };
  });
  expect(layout.scrollWidth).toBe(layout.width);
  expect(layout.controls.left).toBeGreaterThanOrEqual(0);
  expect(layout.controls.right).toBeLessThanOrEqual(layout.width);
  expect(layout.controls.bottom).toBeLessThanOrEqual(layout.height);
  for (const [x, y] of layout.points) { expect(Math.abs(x)).toBeLessThan(.95); expect(Math.abs(y)).toBeLessThan(.85); }
  await testInfo.attach('assembled-machine', { body: await page.screenshot(), contentType: 'image/png' });
});

test('the completed end mill is on screen and exposed to camera rays', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  const tool = await page.evaluate(() => window.__millDemo.inspectPart('endmill'));
  expect(tool.visible).toBe(true);
  expect(tool.projectedBounds.minX).toBeGreaterThan(-1);
  expect(tool.projectedBounds.maxX).toBeLessThan(1);
  expect(tool.projectedBounds.minY).toBeGreaterThan(-1);
  expect(tool.projectedBounds.maxY).toBeLessThan(1);
  expect(tool.exposedSamples).toBeGreaterThan(0);
});

test('viewing the inside is reversible and never changes assembly poses or visibility', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__millDemo.setProgress(.6));
  const before = await page.evaluate(() => window.__millDemo.getParts().map((part) => [part.id, part.object.position.toArray(), part.object.quaternion.toArray(), part.object.visible]));
  await page.getByRole('button', { name: '查看内部' }).click();
  await expect(page.getByRole('button', { name: '恢复外壳' })).toHaveAttribute('aria-pressed', 'true');
  const inside = await page.evaluate(() => {
    const covers = window.__millDemo.getParts().filter((part) => part.object.userData.isCover);
    let materialCount = 0;
    let allTranslucent = true;
    for (const cover of covers) cover.object.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materialCount++;
        if (!material.transparent || material.opacity >= .3 || material.depthWrite) allTranslucent = false;
      }
    });
    return { materialCount, allTranslucent, state: window.__millDemo.getState(), poses: window.__millDemo.getParts().map((part) => [part.id, part.object.position.toArray(), part.object.quaternion.toArray(), part.object.visible]) };
  });
  expect(inside.materialCount).toBeGreaterThan(0);
  expect(inside.allTranslucent).toBe(true);
  expect(inside.state.inspection).toBe(true);
  expect(inside.poses).toEqual(before);
  await page.getByRole('button', { name: '恢复外壳' }).click();
  await expect(page.getByRole('button', { name: '查看内部' })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.__millDemo.getState().inspection)).toBe(false);
  expect(await page.evaluate(() => window.__millDemo.getParts().map((part) => [part.id, part.object.position.toArray(), part.object.quaternion.toArray(), part.object.visible]))).toEqual(before);
});

test('scroll scene loads entirely from the local preview origin without runtime errors', async ({ page }) => {
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) external.push(request.url()); });
  await ready(page);
  for (const progress of [.12, .36, .58, .79, 1, .36]) {
    await page.evaluate((value) => window.__millDemo.setProgress(value), progress);
    await expect.poll(() => page.evaluate(() => window.__millDemo.getState().progress)).toBeCloseTo(progress, 2);
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('reduced motion keeps controls usable without near-camera flying pieces', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  expect(await page.evaluate(() => window.__millDemo.getParts().filter((part) => part.object.visible).length)).toBe(0);
  await page.getByRole('slider', { name: '装配进度' }).fill('450');
  const state = await page.evaluate(() => window.__millDemo.getState());
  expect(state.reducedMotion).toBe(true);
  expect(state.activeLabels).toEqual([]);
  const visible = await page.evaluate(() => window.__millDemo.getParts().filter((part) => part.object.visible).length);
  expect(visible).toBe(state.assembledCount);
  expect(visible).toBe(0);
  await page.getByRole('button', { name: '查看完成' }).click();
  await expect(page.locator('#phase-name')).toHaveText('装配完成');
  expect(await page.evaluate(() => window.__millDemo.getParts().filter((part) => part.object.visible).length)).toBe(state.totalParts);
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, -240);
  await expect.poll(() => page.evaluate(() => window.__millDemo.getState().progress)).toBeLessThan(.94);
  expect(await page.evaluate(() => window.__millDemo.getState().settling)).toBe(false);
});

test('WebGL failure gives a readable component summary', async ({ page }) => {
  await page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/i.test(type) ? null : native.call(this, type, ...args);
    };
  });
  await page.goto('/');
  await expect(page.locator('#mill-stage')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.getByRole('heading', { name: '当前浏览器无法显示三维画面' })).toBeVisible();
  await expect(page.locator('#fallback li')).toHaveCount(6);
});
