import { test, expect } from '@playwright/test';

// Three-machine workshop preview at /workshop.html. Every geometric claim below
// is read from real part objects, not from mirrored UI text.
async function ready(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/workshop.html');
  await expect(page.locator('#workshop-stage')).toHaveAttribute('data-renderer', 'ready');
  return errors;
}

async function frames(page, count = 6) {
  await page.evaluate((n) => new Promise((resolve) => {
    let left = n;
    function step() { if (--left <= 0) resolve(); else requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }), count);
}

// Camera, bounds, canvas and layout facts for the *current* viewport, read from
// the real objects rather than the mirrored state.
const view = (page) => page.evaluate(() => {
  const api = window.__workshopDemo;
  const camera = api.getCamera();
  const bounds = api.getBounds();
  const center = bounds && !bounds.isEmpty() ? bounds.getCenter(camera.position.clone()) : null;
  const canvas = document.querySelector('#workshop-stage canvas');
  const rect = canvas.getBoundingClientRect();
  const machines = api.getMachines();
  return {
    state: api.getState(),
    empty: !bounds,
    center: center ? center.toArray() : null,
    distance: center ? camera.position.distanceTo(center) : null,
    aspect: camera.aspect,
    width: innerWidth, height: innerHeight,
    canvasCss: [rect.width, rect.height],
    canvasBuffer: [canvas.width, canvas.height],
    devicePixelRatio: window.devicePixelRatio,
    effectiveRatio: Math.min(window.devicePixelRatio, innerWidth < 600 ? 1.25 : 1.5),
    machines: machines.map((machine) => ({ id: machine.id })),
    machineEYE: machines.map((machine) => {
      const c = machine.homeBounds.getCenter(machine.homeBounds.min.clone());
      return { id: machine.id, dot: c.x * -11 / Math.hypot(-11, 14) + c.z * 14 / Math.hypot(-11, 14) };
    }),
  };
});

// The first frame must already be fitted: non-empty bounds, a camera standing
// well off their centre, the aspect and the renderer size matching the viewport.
function expectFitted(fitted) {
  expect(fitted.empty).toBe(false);
  expect(fitted.center).not.toBeNull();
  expect(fitted.distance).toBeGreaterThan(10);
  expect(fitted.aspect).toBeCloseTo(fitted.width / fitted.height, 5);
  expect(fitted.canvasCss[0]).toBeCloseTo(fitted.width, 0);
  expect(fitted.canvasCss[1]).toBeCloseTo(fitted.height, 0);
  // Renderer.setSize(width, height, false) sets the drawing buffer, not CSS.
  expect(fitted.canvasBuffer[0]).toBe(Math.floor(fitted.width * fitted.effectiveRatio));
  expect(fitted.canvasBuffer[1]).toBe(Math.floor(fitted.height * fitted.effectiveRatio));
}

const snapshot = (page) => page.evaluate(() => window.__workshopDemo.getParts().map((part) => ({
  id: part.id, machineId: part.machineId,
  position: part.object.position.toArray(),
  quaternion: part.object.quaternion.toArray(),
  scale: part.object.scale.toArray(),
  visible: part.object.visible,
  homePosition: part.homePosition.toArray(),
  homeQuaternion: part.homeQuaternion.toArray(),
})));

test('loads the three machines with local assets, 91 components and no runtime errors', async ({ page }) => {
  const external = [];
  page.on('request', (request) => { if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(request.url()).hostname)) external.push(request.url()); });
  const errors = await ready(page);
  await expect(page.locator('#workshop-stage')).toHaveAttribute('data-surfaces', 'mapped');
  await expect(page.locator('#workshop-stage')).toHaveAttribute('data-environment', 'hdr');
  await expect(page.getByRole('heading', { name: '三机 · 旋转装配' })).toBeVisible();
  await expect(page.getByText('全部零件汇入同一个旋涡')).toBeVisible();
  await expect(page.locator('#total-count')).toHaveText('91');
  await expect(page.locator('#assembled-count')).toHaveText('0');
  const api = await page.evaluate(() => ({
    path: location.pathname,
    machines: window.__workshopDemo.getMachines().map((machine) => ({ id: machine.id, label: machine.label, parts: machine.parts.length })),
    parts: window.__workshopDemo.getParts().length,
    total: window.__workshopDemo.getState().totalParts,
    environment: window.__workshopDemo.getScene().environment?.isTexture,
  }));
  expect(api.path).toBe('/workshop.html');
  expect(api.parts).toBe(91);
  expect(api.total).toBe(91);
  expect(api.machines.map((machine) => machine.id).sort()).toEqual(['laser', 'lathe', 'mill']);
  expect(api.machines.find((machine) => machine.id === 'mill').label).toBe('铣床');
  expect(api.environment).toBe(true);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  // The first frame is already fitted: the camera is not left at the origin and
  // completeBounds was baked before ready, not after the first resize.
  const fitted = await view(page);
  expectFitted(fitted);
  expect(fitted.state.progress).toBe(0);
});

// Three machine homes laid along the diagonal RIGHT axis of the fixed eye
// (11, 4.5, 14): the same angle as the original mill preview.
const rowCheck = (page) => page.evaluate(() => {
  const eye = [11, 4.5, 14];
  const up = [0, 1, 0];
  const right = [up[1] * eye[2] - up[2] * eye[1], up[2] * eye[0] - up[0] * eye[2], up[0] * eye[1] - up[1] * eye[0]];
  const rn = Math.hypot(...right);
  const r = right.map((value) => value / rn);
  return window.__workshopDemo.getMachines().map((machine) => {
    const c = machine.homeBounds.getCenter(machine.homeBounds.min.clone());
    return { id: machine.id, right: c.x * r[0] + c.y * r[1] + c.z * r[2] };
  });
});
function expectOneRow(row) {
  expect(row).toHaveLength(3);
  const sorted = [...row].sort((a, b) => a.right - b.right);
  expect(sorted.map((entry) => entry.id)).toEqual(['lathe', 'mill', 'laser']);
  for (let index = 1; index < sorted.length; index++) expect(sorted[index].right).toBeGreaterThan(sorted[index - 1].right + 1);
}

test('the initial phone view keeps the one-row wide layout and fits the camera', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await ready(page);
  const fitted = await view(page);
  expect(fitted.state.layout).toBe('wide');
  expect(await page.locator('#workshop-stage').getAttribute('data-layout')).toBe('wide');
  expectFitted(fitted);
  expectOneRow(await rowCheck(page));
  const homes = await page.evaluate(() => window.__workshopDemo.getParts().map((part) => part.homePosition.toArray()));
  expect(homes).toHaveLength(91);
  expect(homes.every((position) => position.every(Number.isFinite))).toBe(true);
});

test('resizing inside one breakpoint refits aspect and canvas while keeping progress', async ({ page }) => {
  await ready(page);
  for (const [from, to] of [[{ width: 1280, height: 900 }, { width: 1024, height: 768 }], [{ width: 375, height: 812 }, { width: 420, height: 900 }]]) {
    await page.setViewportSize(from);
    await frames(page, 2);
    await page.evaluate(() => window.__workshopDemo.setProgress(.5));
    const before = await view(page);
    expect(before.state.layout).toBe('wide');
    expectFitted(before);
    await page.setViewportSize(to);
    await frames(page, 4);
    const after = await view(page);
    // No breakpoint change: the layout must stay, only the camera refits.
    expect(after.state.layout).toBe(before.state.layout);
    expectFitted(after);
    expect(after.aspect).not.toBe(before.aspect);
    expect(after.state.progress).toBeCloseTo(.5, 5);
    expect(after.state.settling).toBe(false);
    expect(await page.locator('#workshop-stage').getAttribute('data-progress')).toBe(after.state.progress.toFixed(5));
  }
});

test('one timeline: every part is visible and finite, and only the end lands every pose on its home', async ({ page }) => {
  await ready(page);
  for (const progress of [.20, .42, .63, .74, .86]) {
    await page.evaluate((value) => window.__workshopDemo.setProgress(value), progress);
    const parts = await snapshot(page);
    expect(parts).toHaveLength(91);
    expect(parts.every((part) => part.visible)).toBe(true);
    expect(parts.every((part) => [...part.position, ...part.quaternion, ...part.scale].every(Number.isFinite))).toBe(true);
    const state = await page.evaluate(() => window.__workshopDemo.getState());
    expect(state.assembledCount).toBe(0);
    expect(state.totalParts).toBe(91);
  }
  await page.evaluate(() => window.__workshopDemo.setProgress(.94));
  const done = await snapshot(page);
  const machines = await page.evaluate(() => window.__workshopDemo.getMachines().map((machine) => ({ id: machine.id, min: machine.homeBounds.min.toArray(), max: machine.homeBounds.max.toArray() })));
  for (const part of done) {
    expect(part.visible).toBe(true);
    expect(part.position).toEqual(part.homePosition);
    expect(part.quaternion).toEqual(part.homeQuaternion);
    expect(part.scale).toEqual([1, 1, 1]);
  }
  for (let a = 0; a < machines.length; a++) for (let b = a + 1; b < machines.length; b++) {
    const overlap = machines[a].min.every((value, axis) => Math.min(machines[a].max[axis], machines[b].max[axis]) - Math.max(machines[a].min[axis], machines[b].min[axis]) > 1e-6);
    expect(overlap).toBe(false);
  }
  await page.evaluate(() => window.__workshopDemo.setProgress(0));
  expect((await snapshot(page)).every((part) => !part.visible)).toBe(true);
});

test('one shared vortex: every machine has parts on both sides of the centre and labels only appear when complete', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#machine-labels')).toBeHidden();
  for (const progress of [.42, .55, .63]) {
    await page.evaluate((value) => window.__workshopDemo.setProgress(value), progress);
    const sides = await page.evaluate(() => {
      const camera = window.__workshopDemo.getCamera();
      const Box3 = window.__workshopDemo.getBounds().constructor;
      const out = {};
      for (const part of window.__workshopDemo.getParts()) {
        const center = new Box3().setFromObject(part.object).getCenter(part.object.position.clone());
        const axis = center.clone().set(0, center.y, 0).project(camera);
        const projected = center.project(camera);
        (out[part.machineId] ??= []).push(Math.sign(projected.x - axis.x));
      }
      return out;
    });
    for (const machine of ['mill', 'lathe', 'laser']) {
      expect(sides[machine].filter((side) => side < 0).length).toBeGreaterThanOrEqual(3);
      expect(sides[machine].filter((side) => side > 0).length).toBeGreaterThanOrEqual(3);
    }
    await expect(page.locator('#machine-labels')).toBeHidden();
  }
  await page.evaluate(() => window.__workshopDemo.setProgress(.94));
  const labels = page.locator('#machine-labels .machine-label');
  await expect(labels).toHaveCount(3);
  await expect(labels).toHaveText(['铣床', '车床', '激光切割机']);
  for (let index = 0; index < 3; index++) await expect(labels.nth(index)).toBeVisible();
});

test('during .70 to .77 positions and quaternions both change; reversing reproduces the same pose and homes never move', async ({ page }) => {
  await ready(page);
  const homes = await page.evaluate(() => window.__workshopDemo.getParts().map((part) => [part.homePosition.toArray(), part.homeQuaternion.toArray()]));
  await page.evaluate(() => window.__workshopDemo.setProgress(.70));
  const before = await snapshot(page);
  await page.evaluate(() => window.__workshopDemo.setProgress(.77));
  const after = await snapshot(page);
  const turned = after.filter((part, index) => Math.abs(before[index].position.reduce((sum, value, axis) => sum + (value - part.position[axis]) ** 2, 0)) > 1e-8
    && part.quaternion.reduce((sum, value, component) => sum + value * before[index].quaternion[component], 0) < Math.cos(1e-4));
  expect(turned.length).toBeGreaterThan(60);
  const state = await page.evaluate(() => window.__workshopDemo.getState());
  expect(state.stage).toBe('assembly');
  expect(state.rotationProgress).toBeLessThan(1);
  await page.evaluate(() => window.__workshopDemo.setProgress(.86));
  await page.evaluate(() => window.__workshopDemo.setProgress(.70));
  const again = await snapshot(page);
  for (let index = 0; index < again.length; index++) {
    again[index].position.forEach((value, axis) => expect(value).toBeCloseTo(before[index].position[axis], 10));
    const dot = Math.min(1, Math.abs(again[index].quaternion.reduce((sum, value, component) => sum + value * before[index].quaternion[component], 0)));
    expect(2 * Math.acos(dot)).toBeLessThan(1e-6);
    expect(again[index].scale).toEqual(before[index].scale);
  }
  const nowHomes = await page.evaluate(() => window.__workshopDemo.getParts().map((part) => [part.homePosition.toArray(), part.homeQuaternion.toArray()]));
  expect(nowHomes).toEqual(homes);
});

test('wheel inertia settles, direct controls cancel it, and replay restores the empty start', async ({ page }) => {
  await ready(page);
  await page.mouse.move(300, 300);
  await page.mouse.wheel(0, 240);
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getState().targetProgress)).toBeGreaterThan(.05);
  const samples = await page.evaluate(async () => {
    const first = window.__workshopDemo.getState();
    await new Promise((resolve) => setTimeout(resolve, 160));
    return [first, window.__workshopDemo.getState()];
  });
  expect(samples[0].settling).toBe(true);
  expect(samples[1].targetProgress).toBe(samples[0].targetProgress);
  expect(samples[1].progress).toBeGreaterThan(samples[0].progress);
  expect(samples[1].progress).toBeLessThan(samples[1].targetProgress);
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getState().settling), { timeout: 10_000 }).toBe(false);
  const settled = await page.evaluate(() => window.__workshopDemo.getState());
  expect(settled.progress).toBeCloseTo(settled.targetProgress, 6);
  const slider = page.getByRole('slider', { name: '装配进度' });
  await page.mouse.wheel(0, 200);
  await slider.fill('500');
  const direct = await page.evaluate(() => window.__workshopDemo.getState());
  expect(direct.settling).toBe(false);
  expect(direct.progress).toBeCloseTo(.5 * .94, 4);
  await page.mouse.wheel(0, 200);
  await page.getByRole('button', { name: '查看完成' }).click();
  await expect(page.locator('#phase-name')).toHaveText('装配完成');
  await page.getByRole('button', { name: '重播' }).click();
  await expect(page.locator('#assembled-count')).toHaveText('0');
  const replayed = await page.evaluate(() => window.__workshopDemo.getState());
  expect(replayed.progress).toBe(0);
  expect(replayed.settling).toBe(false);
});

test('completed machines sit between header and controls, labels do not overlap, and no horizontal overflow', async ({ page }, testInfo) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  await frames(page);
  const layout = await page.evaluate(() => {
    const camera = window.__workshopDemo.getCamera();
    const points = [];
    const Box = window.__workshopDemo.getBounds().constructor;
    for (const part of window.__workshopDemo.getParts()) {
      const box = new Box().setFromObject(part.object);
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
        points.push(new box.min.constructor(x ? box.max.x : box.min.x, y ? box.max.y : box.min.y, z ? box.max.z : box.min.z).project(camera).toArray());
      }
    }
    const rect = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    return {
      points, controls: rect('.controls'), heading: rect('.heading'),
      labels: [...document.querySelectorAll('.machine-label')].map((node) => { const r = node.getBoundingClientRect(); return { machine: node.dataset.machine, ...rect(`[data-machine="${node.dataset.machine}"]`) }; }),
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      progress: window.__workshopDemo.getState().displayProgress,
    };
  });
  expect(layout.progress).toBe(1);
  expect(layout.scrollWidth).toBe(layout.width);
  expect(layout.controls.left).toBeGreaterThanOrEqual(0);
  expect(layout.controls.right).toBeLessThanOrEqual(layout.width);
  expect(layout.labels).toHaveLength(3);
  for (const label of layout.labels) {
    expect(label.top).toBeGreaterThanOrEqual(layout.heading.bottom);
    expect(label.bottom).toBeLessThanOrEqual(layout.controls.top);
    expect(label.left).toBeGreaterThanOrEqual(0);
    expect(label.right).toBeLessThanOrEqual(layout.width);
  }
  for (let a = 0; a < layout.labels.length; a++) for (let b = a + 1; b < layout.labels.length; b++) {
    const A = layout.labels[a], B = layout.labels[b];
    const overlap = A.left < B.right && B.left < A.right && A.top < B.bottom && B.top < A.bottom;
    expect(overlap).toBe(false);
  }
  // Machine bottom edge stays above the controls on screen.
  const bottomScreenY = Math.max(...layout.points.map(([, y]) => (1 - y) / 2 * layout.height));
  expect(bottomScreenY).toBeLessThanOrEqual(layout.controls.top + .5);
  expect(Math.min(...layout.points.map(([x]) => x))).toBeGreaterThan(-.99);
  expect(Math.max(...layout.points.map(([x]) => x))).toBeLessThan(.99);
  const occupiedWidth = (Math.max(...layout.points.map(([x]) => x)) - Math.min(...layout.points.map(([x]) => x))) / 2;
  expect(occupiedWidth).toBeGreaterThan(.65);
  expect(Math.min(...layout.points.map(([, y]) => y))).toBeGreaterThan(-.99);
  await testInfo.attach('workshop-complete', { body: await page.screenshot(), contentType: 'image/png' });
});

test('crossing every breakpoint keeps the same row, all 91 homes and progress', async ({ page }) => {
  await ready(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.__workshopDemo.setProgress(.5));
  const capture = () => page.evaluate(() => ({
    progress: window.__workshopDemo.getState().progress, layout: window.__workshopDemo.getState().layout,
    count: window.__workshopDemo.getParts().length, scale: window.__workshopDemo.getParts().map((part) => part.object.scale.x),
    home: window.__workshopDemo.getParts().map((part) => [part.homePosition.toArray(), part.homeQuaternion.toArray()]),
    scrollWidth: document.documentElement.scrollWidth, width: innerWidth,
  }));
  const wide = await capture();
  expect(wide.layout).toBe('wide');
  expect(wide.count).toBe(91);
  expectOneRow(await rowCheck(page));
  for (const size of [{ width: 375, height: 812 }, { width: 599, height: 900 }, { width: 601, height: 900 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(size);
    await frames(page, 4);
    const now = await capture();
    expect(now.layout).toBe('wide');
    expect(now.progress).toBeCloseTo(wide.progress, 8);
    expect(now.count).toBe(91);
    expect(now.scale).toEqual(wide.scale);
    expect(now.home).toEqual(wide.home);
    expect(now.scrollWidth).toBe(now.width);
  }
  await page.evaluate(() => window.__workshopDemo.setProgress(.94));
  expect(await page.evaluate(() => window.__workshopDemo.getParts().every((part) => part.object.scale.x === 1))).toBe(true);
});

test('the camera keeps the fixed mill angle at every progress and viewport', async ({ page }, testInfo) => {
  await ready(page);
  const fixed = [-11, -4.5, -14];
  const norm = Math.hypot(...fixed);
  // Negative zero differs from 0 under Object.is; map both to plain 0.
  const expected = fixed.map((value) => value / norm + 0);
  const direction = () => page.evaluate(() => window.__workshopDemo.getCamera().getWorldDirection(window.__workshopDemo.getCamera().position.clone()).toArray());
  const expectFixed = async (label) => {
    const seen = await direction();
    for (let axis = 0; axis < 3; axis++) expect(Math.abs(seen[axis] - expected[axis]), `${label} axis ${axis}`).toBeLessThan(1e-6);
  };
  for (const size of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(size);
    await frames(page, 3);
    for (const progress of [.12, .42, .75, .94]) {
      await page.evaluate((value) => window.__workshopDemo.setProgress(value), progress);
      await frames(page, 2);
      await expectFixed(`${size.width}x${size.height} p=${progress}`);
    }
    // Resizing inside and across the row keeps the same angle.
    for (const next of [{ width: size.width === 1280 ? 1024 : 420, height: 768 }, size]) {
      await page.setViewportSize(next);
      await frames(page, 3);
      await expectFixed(`resize ${next.width}x${next.height} p=.94`);
    }
  }
  await testInfo.attach('workshop-angle', { body: JSON.stringify(await direction()), contentType: 'application/json' });
});

test('the finished row shows painted industrial palettes and keeps the metal parts', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  await frames(page);
  const paint = await page.evaluate(() => {
    const out = {};
    for (const part of window.__workshopDemo.getParts()) {
      const painted = new Set();
      let metal = false;
      part.object.traverse((object) => {
        if (!object.isMesh) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!material?.color) continue;
          if (material.userData.materialRole === 'painted-cast-iron') painted.add(material.color.getHexString());
          if ((material.metalness ?? 0) >= .8) metal = true;
        }
      });
      (out[part.machineId] ??= { painted: new Set(), metal: false });
      painted.forEach((hex) => out[part.machineId].painted.add(hex));
      out[part.machineId].metal ||= metal;
    }
    return Object.fromEntries(Object.entries(out).map(([id, value]) => [id, { painted: [...value.painted], metal: value.metal }]));
  });
  expect(Object.keys(paint).sort()).toEqual(['laser', 'lathe', 'mill']);
  for (const machine of Object.values(paint)) {
    expect(machine.painted.length).toBeGreaterThan(0);
    expect(machine.metal).toBe(true);
  }
  // Each machine is a distinct industrial paint; exact hexes belong to the model tests.
  const palettes = [paint.mill, paint.lathe, paint.laser].map((machine) => machine.painted.slice().sort().join(','));
  expect(new Set(palettes).size).toBe(3);
});

test('reduced motion skips the flight and shows the three machines only when complete', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  expect(await page.evaluate(() => window.__workshopDemo.getParts().filter((part) => part.object.visible).length)).toBe(0);
  await page.evaluate(() => window.__workshopDemo.setProgress(.5));
  expect(await page.evaluate(() => window.__workshopDemo.getState().reducedMotion)).toBe(true);
  expect(await page.evaluate(() => window.__workshopDemo.getParts().filter((part) => part.object.visible).length)).toBe(0);
  await page.getByRole('button', { name: '查看完成' }).click();
  await expect(page.locator('#phase-name')).toHaveText('装配完成');
  expect(await page.evaluate(() => window.__workshopDemo.getParts().filter((part) => part.object.visible).length)).toBe(91);
  expect(await page.evaluate(() => window.__workshopDemo.getParts().every((part) => part.object.position.distanceTo(part.homePosition) < 1e-8))).toBe(true);
  await expect(page.locator('#machine-labels')).toBeVisible();
  await expect(page.locator('.machine-label')).toHaveCount(3);
});

test('WebGL failure falls back to the three-machine structure text', async ({ page }) => {
  await page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/i.test(type) ? null : native.call(this, type, ...args); };
  });
  await page.goto('/workshop.html');
  await expect(page.locator('#workshop-stage')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.getByRole('heading', { name: '当前浏览器无法显示三维画面' })).toBeVisible();
  await expect(page.locator('#fallback li')).toHaveCount(3);
  await expect(page.locator('#fallback')).toContainText('铣床');
  await expect(page.locator('#fallback')).toContainText('车床');
  await expect(page.locator('#fallback')).toContainText('激光切割机');
});

test('missing HDR and JPG assets still become ready with a procedural environment', async ({ page }) => {
  await page.route(/\.(?:hdr|jpg)(?:\?|$)/, (route) => route.abort());
  await ready(page);
  await expect(page.locator('#workshop-stage')).toHaveAttribute('data-surfaces', 'fallback');
  await expect(page.locator('#workshop-stage')).toHaveAttribute('data-environment', 'fallback');
  await page.getByRole('button', { name: '查看完成' }).click();
  expect(await page.evaluate(() => window.__workshopDemo.getState().assembledCount)).toBe(91);
  expect(await page.evaluate(() => window.__workshopDemo.getScene().environment?.isTexture)).toBe(true);
});

test('viewing the inside only makes the mill shell translucent and never moves or hides a part', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__workshopDemo.setProgress(.6));
  const before = await snapshot(page);
  await page.getByRole('button', { name: '查看内部' }).click();
  await expect(page.getByRole('button', { name: '恢复外壳' })).toHaveAttribute('aria-pressed', 'true');
  const inside = await page.evaluate(() => {
    const covers = window.__workshopDemo.getParts().filter((part) => part.object.userData.isCover);
    let allTranslucent = true;
    let count = 0;
    for (const cover of covers) cover.object.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) { count++; if (!material.transparent || material.opacity >= .3) allTranslucent = false; }
    });
    return {
      count, allTranslucent, machines: [...new Set(covers.map((part) => part.machineId))], state: window.__workshopDemo.getState().inspection,
      parts: window.__workshopDemo.getParts().map((part) => ({ id: part.id, position: part.object.position.toArray(), quaternion: part.object.quaternion.toArray(), scale: part.object.scale.toArray(), visible: part.object.visible })),
    };
  });
  expect(inside.count).toBeGreaterThan(0);
  expect(inside.allTranslucent).toBe(true);
  expect(inside.machines).toEqual(['mill']);
  expect(inside.state).toBe(true);
  expect(inside.parts).toEqual(before.map(({ id, position, quaternion, scale, visible }) => ({ id, position, quaternion, scale, visible })));
  await page.getByRole('button', { name: '恢复外壳' }).click();
  await expect(page.getByRole('button', { name: '查看内部' })).toHaveAttribute('aria-pressed', 'false');
});

test('repeated scrubbing and resizing keeps GPU memory flat and the settled camera still', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__workshopDemo.setProgress(.94));
  await frames(page, 30);
  const warmed = await page.evaluate(() => window.__workshopDemo.getRenderStats());
  await page.evaluate(() => {
    const api = window.__workshopDemo;
    for (let index = 0; index < 24; index++) {
      api.setProgress((index % 12) / 12 * .94);
      if (index % 6 === 0) api.setInspection(!api.getState().inspection);
    }
    api.setProgress(.74);
  });
  for (const width of [1180, 620, 375, 640, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await frames(page, 2);
    await page.evaluate(() => window.__workshopDemo.setProgress(.74));
  }
  await page.evaluate(() => window.__workshopDemo.setProgress(.94));
  await frames(page, 10);
  const settled = await page.evaluate(() => window.__workshopDemo.getRenderStats());
  expect(settled.geometries).toBeLessThanOrEqual(warmed.geometries);
  expect(settled.textures).toBeLessThanOrEqual(warmed.textures);
  expect(settled.geometries).toBeGreaterThan(0);
  const first = await page.evaluate(() => window.__workshopDemo.getCamera().position.toArray());
  await page.waitForTimeout(400);
  const second = await page.evaluate(() => window.__workshopDemo.getCamera().position.toArray());
  first.forEach((value, axis) => expect(second[axis]).toBe(value));
  expect(await page.evaluate(() => window.__workshopDemo.getState().settling)).toBe(false);
});
