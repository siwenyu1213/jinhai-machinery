import { test, expect } from '@playwright/test';

// Three-machine workshop preview at /workshop.html. Every geometric claim below
// is read from real part objects, not from mirrored UI text.
const TIMEOUT = 45_000;
test.describe.configure({ timeout: TIMEOUT });

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

async function waitLocked(page) {
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getState().completionLocked)).toBe(true);
  await frames(page, 2);
}

async function replay(page) {
  await page.getByRole('button', { name: '重播' }).click();
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getState().completionLocked)).toBe(false);
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

const fixedDirection = [-11, -4.5, -14].map((value) => value / Math.hypot(11, 4.5, 14) + 0);
const cameraDirection = (page) => page.evaluate(() => window.__workshopDemo.getCamera().getWorldDirection(window.__workshopDemo.getCamera().position.clone()).toArray());
async function expectFixedCamera(page, label = '') {
  const seen = await cameraDirection(page);
  for (let axis = 0; axis < 3; axis++) expect(Math.abs(seen[axis] - fixedDirection[axis]), `${label} axis ${axis}`).toBeLessThan(1e-6);
}

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
  // Labels are selectable only once the showcase is finished.
  await expect(page.locator('#toggle-showcase')).toBeHidden();
  await expect(page.locator('#workshop-scene canvas')).toHaveCSS('pointer-events', 'none');
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
  await expectFixedCamera(page, 'first frame');
});

// Finished homes form the triangle around the fixed eye (11, 4.5, 14): the mill
// in front (closest along EYE), lathe back-left and laser back-right along RIGHT.
const triangleCheck = (page) => page.evaluate(() => {
  const eye = [11, 4.5, 14];
  const up = [0, 1, 0];
  const right = [up[1] * eye[2] - up[2] * eye[1], up[2] * eye[0] - up[0] * eye[2], up[0] * eye[1] - up[1] * eye[0]];
  const rn = Math.hypot(...right);
  const r = right.map((value) => value / rn);
  const en = Math.hypot(...eye);
  const e = eye.map((value) => value / en);
  return window.__workshopDemo.getMachines().map((machine) => {
    const c = machine.homeBounds.getCenter(machine.homeBounds.min.clone());
    return { id: machine.id, right: c.x * r[0] + c.z * r[2], eye: c.x * e[0] + c.z * e[2] };
  });
});
function expectTriangle(triangle) {
  expect(triangle).toHaveLength(3);
  const byId = Object.fromEntries(triangle.map((entry) => [entry.id, entry]));
  expect(byId.mill.eye).toBeGreaterThan(byId.lathe.eye + 3);
  expect(byId.mill.eye).toBeGreaterThan(byId.laser.eye + 3);
  expect(byId.lathe.right).toBeLessThan(-3);
  expect(byId.laser.right).toBeGreaterThan(3);
  expect(Math.abs(byId.lathe.eye - byId.laser.eye)).toBeLessThan(.01);
}

test('the initial phone view lands directly on the triangle homes and fits the camera', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await ready(page);
  const fitted = await view(page);
  expect(fitted.state.layout).toBe('triangle');
  expect(await page.locator('#workshop-stage').getAttribute('data-layout')).toBe('triangle');
  expectFitted(fitted);
  expectTriangle(await triangleCheck(page));
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
    expect(before.state.layout).toBe('triangle');
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

test('one timeline: every part is visible and finite, and only the end lands every pose on its presentation slot', async ({ page }) => {
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
  await waitLocked(page);
  await page.locator('#toggle-showcase').click();
  const done = await snapshot(page);
  const offsets = await page.evaluate(() => {
    const api = window.__workshopDemo, slots = api.getShowcaseState().machines;
    return Object.fromEntries(api.getMachines().map(machine => {
      const home = machine.homeBounds.getCenter(machine.homeBounds.min.clone()).toArray();
      return [machine.id, slots.find(slot => slot.id === machine.id).center.map((value, axis) => value - home[axis])];
    }));
  });
  const machines = await page.evaluate(() => window.__workshopDemo.getMachines().map((machine) => ({ id: machine.id, min: machine.homeBounds.min.toArray(), max: machine.homeBounds.max.toArray() })));
  // Desktop presentation spreads the rear homes sideways as one rigid machine.
  for (const part of done) {
    expect(part.visible).toBe(true);
    part.position.forEach((value, axis) => expect(value).toBeCloseTo(part.homePosition[axis] + offsets[part.machineId][axis], 8));
    expect(part.quaternion).toEqual(part.homeQuaternion);
    expect(part.scale).toEqual([1, 1, 1]);
  }
  for (let a = 0; a < machines.length; a++) for (let b = a + 1; b < machines.length; b++) {
    const overlap = machines[a].min.every((value, axis) => Math.min(machines[a].max[axis], machines[b].max[axis]) - Math.max(machines[a].min[axis], machines[b].min[axis]) > 1e-6);
    expect(overlap).toBe(false);
  }
  // Locked: the API cannot take the finished machines apart...
  await page.evaluate(() => window.__workshopDemo.setProgress(0));
  await frames(page, 2);
  expect((await snapshot(page)).every((part) => part.visible)).toBe(true);
  expect(await page.evaluate(() => window.__workshopDemo.getState().displayProgress)).toBe(1);
  // ...only an explicit replay returns to the empty start.
  await replay(page);
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
  await waitLocked(page);
  const labels = page.locator('#machine-labels .machine-label');
  await expect(labels).toHaveCount(3);
  await expect(labels).toHaveText(['铣床', '车床', '激光切割机']);
  for (let index = 0; index < 3; index++) await expect(labels.nth(index)).toBeVisible();
  await expect(page.getByRole('button', { name: '将铣床移到前方' })).toBeVisible();
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
  await replay(page);
  await expect(page.locator('#assembled-count')).toHaveText('0');
  const replayed = await page.evaluate(() => window.__workshopDemo.getState());
  expect(replayed.progress).toBe(0);
  expect(replayed.settling).toBe(false);
  // The original timeline is reversible after replay.
  await page.evaluate(() => window.__workshopDemo.setProgress(.77));
  await page.evaluate(() => window.__workshopDemo.setProgress(.70));
  expect(await page.evaluate(() => window.__workshopDemo.getState().stage)).toBe('assembly');
});

// Projected part corners and the fixed frame rectangles for geometry checks.
const geometry = (page) => page.evaluate(() => {
  const camera = window.__workshopDemo.getCamera();
  const Box = window.__workshopDemo.getBounds().constructor;
  const points = [];
  for (const part of window.__workshopDemo.getParts()) {
    const box = new Box().setFromObject(part.object);
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
      points.push(new box.min.constructor(x ? box.max.x : box.min.x, y ? box.max.y : box.min.y, z ? box.max.z : box.min.z).project(camera).toArray());
    }
  }
  const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  return {
    points, controls: rect(document.querySelector('.controls')), heading: rect(document.querySelector('.heading')),
    labels: [...document.querySelectorAll('.machine-label')].map((node) => ({ machine: node.dataset.machine, ...rect(node) })),
    width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
    progress: window.__workshopDemo.getState().displayProgress,
  };
});

function expectFramed(layout, label) {
  expect(layout.points.length, label).toBe(91 * 8);
  expect(Math.min(...layout.points.map(([x]) => x)), `${label} min x`).toBeGreaterThan(-.99);
  expect(Math.max(...layout.points.map(([x]) => x)), `${label} max x`).toBeLessThan(.99);
  expect(Math.min(...layout.points.map(([, y]) => y)), `${label} min y`).toBeGreaterThan(-.99);
  expect(Math.max(...layout.points.map(([, y]) => y)), `${label} max y`).toBeLessThan(.99);
  const bottomScreenY = Math.max(...layout.points.map(([, y]) => (1 - y) / 2 * layout.height));
  expect(bottomScreenY, `${label} bottom`).toBeLessThanOrEqual(layout.controls.top + .5);
  expect(layout.scrollWidth).toBe(layout.width);
  for (const entry of layout.labels) {
    expect(entry.top, `${label} label top`).toBeGreaterThanOrEqual(layout.heading.bottom);
    expect(entry.bottom, `${label} label bottom`).toBeLessThanOrEqual(layout.controls.top);
    expect(entry.left).toBeGreaterThanOrEqual(0);
    expect(entry.right).toBeLessThanOrEqual(layout.width);
  }
  for (let a = 0; a < layout.labels.length; a++) for (let b = a + 1; b < layout.labels.length; b++) {
    const A = layout.labels[a], B = layout.labels[b];
    const overlap = A.left < B.right && B.left < A.right && A.top < B.bottom && B.top < A.bottom;
    expect(overlap, `${label} labels ${A.machine}/${B.machine}`).toBe(false);
  }
}

// Real canvas point on the visible body mesh (largest bbox) of a machine.
const bodyPoint = (page, id) => page.evaluate((machineId) => {
  const api = window.__workshopDemo;
  const camera = api.getCamera();
  const Box = api.getBounds().constructor;
  const Vector = camera.position.constructor;
  const rect = document.querySelector('#workshop-scene canvas').getBoundingClientRect();
  const machine = api.getMachines().find((entry) => entry.id === machineId);
  const meshes = [];
  for (const part of machine.parts) part.object.traverse((object) => {
    if (!object.isMesh || !object.visible) return;
    object.updateWorldMatrix(true, false);
    meshes.push({ object, box: new Box().setFromObject(object) });
  });
  meshes.sort((a, b) => b.box.getSize(new Vector()).lengthSq() - a.box.getSize(new Vector()).lengthSq());
  for (const candidate of meshes.slice(0, 12)) {
    const center = candidate.box.getCenter(new Vector()).project(camera);
    const x = rect.left + (center.x + 1) / 2 * rect.width;
    const y = rect.top + (1 - center.y) / 2 * rect.height;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
    if (api.pickMachineAt(x, y) === machineId) return { x, y, center: candidate.box.getCenter(new Vector()).toArray() };
  }
  return null;
}, id);

test('completed machines sit inside the fixed frame between header and controls, labels do not overlap, and no horizontal overflow', async ({ page }, testInfo) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  await waitLocked(page);
  // The ready-to-watch showcase is idle; pause it so the frame is comparable.
  await page.getByRole('button', { name: '暂停轮换', exact: true }).click();
  await frames(page, 4);
  const layout = await geometry(page);
  expect(layout.progress).toBe(1);
  expect(layout.controls.left).toBeGreaterThanOrEqual(0);
  expect(layout.controls.right).toBeLessThanOrEqual(layout.width);
  expectFramed(layout, 'complete');
  await testInfo.attach('workshop-complete', { body: await page.screenshot(), contentType: 'image/png' });
});

test('each front machine fills more of the frame while the rear machines stay visibly further away', async ({ page }) => {
  await ready(page);
  await page.locator('#complete').click();
  await waitLocked(page);
  await page.locator('#toggle-showcase').click();
  const views = {};
  for (const id of ['mill', 'laser', 'lathe']) {
    await page.locator(`.machine-label[data-machine="${id}"] button`).click();
    await expect.poll(() => page.evaluate(() => window.__workshopDemo.getShowcaseState().frontId)).toBe(id);
    const shot = await page.evaluate(() => {
      const api = window.__workshopDemo, camera = api.getCamera();
      const Box = api.getBounds().constructor, Vector = camera.position.constructor;
      return { width: innerWidth, height: innerHeight, machines: Object.fromEntries(api.getMachines().map(machine => {
        const box = new Box(), points = [];
        for (const part of machine.parts) {
          const b = new Box().setFromObject(part.object); box.union(b);
          for (let c = 0; c < 8; c++) points.push(new Vector(c & 1 ? b.max.x : b.min.x, c & 2 ? b.max.y : b.min.y, c & 4 ? b.max.z : b.min.z).project(camera));
        }
        return [machine.id, { distance: box.getCenter(new Vector()).distanceTo(camera.position),
          width: (Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x))) / 2,
          height: (Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y))) / 2 }];
      })) };
    });
    views[id] = shot.machines;
    const front = shot.machines[id], phone = shot.width < 600;
    if (id === 'mill') expect(front.height, `${id} foreground height`).toBeGreaterThan(phone ? .17 : .57);
    else expect(front.width, `${id} foreground width`).toBeGreaterThan(id === 'lathe' ? (phone ? .43 : .40) : (phone ? .51 : .44));
    for (const [otherId, rear] of Object.entries(shot.machines)) {
      if (otherId !== id) expect(front.distance, `${id} closer than ${otherId}`).toBeLessThan(rear.distance * .65);
    }
    expectFramed(await geometry(page), `large front ${id}`);
    await expectFixedCamera(page, `large front ${id}`);
  }
  for (const id of ['mill', 'laser', 'lathe']) {
    for (const otherFront of ['mill', 'laser', 'lathe'].filter(other => other !== id)) {
      expect(views[id][id].width, `${id} grows when moved from back to front`).toBeGreaterThan(views[otherFront][id].width * 1.5);
    }
  }
});

test('every part Box3 corner stays inside the frame from p=.24 through the finished triangle', async ({ page }) => {
  await ready(page);
  for (const progress of [.24, .42, .63, .74, .86]) {
    await page.evaluate((value) => window.__workshopDemo.setProgress(value), progress);
    await frames(page, 2);
    const extents = (await geometry(page)).points;
    expect(extents.length).toBe(91 * 8);
    // Projected part corners, not visible flags, define the on-screen bounds.
    for (const [x, y] of extents) {
      expect(x, `p=${progress} x`).toBeGreaterThanOrEqual(-.99);
      expect(x, `p=${progress} x`).toBeLessThanOrEqual(.99);
      expect(y, `p=${progress} y`).toBeGreaterThanOrEqual(-.99);
      expect(y, `p=${progress} y`).toBeLessThanOrEqual(.99);
    }
  }
  await page.evaluate(() => window.__workshopDemo.setProgress(.94));
  await waitLocked(page);
  await page.getByRole('button', { name: '暂停轮换' }).click();
  await frames(page, 2);
  const layout = await geometry(page);
  for (const [x, y] of layout.points) {
    expect(x).toBeGreaterThanOrEqual(-.99);
    expect(x).toBeLessThanOrEqual(.99);
    expect(y).toBeGreaterThanOrEqual(-.99);
    expect(y).toBeLessThanOrEqual(.99);
  }
});

test('crossing every breakpoint keeps the same triangle, all 91 homes and progress', async ({ page }) => {
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
  expect(wide.layout).toBe('triangle');
  expect(wide.count).toBe(91);
  expectTriangle(await triangleCheck(page));
  for (const size of [{ width: 375, height: 812 }, { width: 599, height: 900 }, { width: 601, height: 900 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(size);
    await frames(page, 4);
    const now = await capture();
    expect(now.layout).toBe('triangle');
    expect(now.progress).toBeCloseTo(wide.progress, 8);
    expect(now.count).toBe(91);
    expect(now.scale).toEqual(wide.scale);
    expect(now.home).toEqual(wide.home);
    expect(now.scrollWidth).toBe(now.width);
  }
  await page.evaluate(() => window.__workshopDemo.setProgress(.94));
  await waitLocked(page);
  expect(await page.evaluate(() => window.__workshopDemo.getParts().every((part) => part.object.scale.x === 1))).toBe(true);
});

test('the camera keeps the fixed mill angle at every progress and viewport', async ({ page }, testInfo) => {
  await ready(page);
  const expectFixed = async (label) => {
    const seen = await cameraDirection(page);
    for (let axis = 0; axis < 3; axis++) expect(Math.abs(seen[axis] - fixedDirection[axis]), `${label} axis ${axis}`).toBeLessThan(1e-6);
  };
  for (const size of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(size);
    await frames(page, 3);
    for (const progress of [.12, .42, .75, .94]) {
      await page.evaluate((value) => window.__workshopDemo.setProgress(value), progress);
      await frames(page, 2);
      await expectFixed(`${size.width}x${size.height} p=${progress}`);
    }
    // Resizing inside and across the triangle keeps the same angle.
    for (const next of [{ width: size.width === 1280 ? 1024 : 420, height: 768 }, size]) {
      await page.setViewportSize(next);
      await frames(page, 3);
      await expectFixed(`resize ${next.width}x${next.height} p=.94`);
    }
    // The next round replays before scrubbing again.
    await replay(page);
    await frames(page, 2);
    await expectFixed(`replay ${size.width}x${size.height}`);
  }
  await testInfo.attach('workshop-angle', { body: JSON.stringify(await cameraDirection(page)), contentType: 'application/json' });
});

test('the finished triangle shows painted industrial palettes and keeps the metal parts', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  await waitLocked(page);
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

test('reduced motion skips the flight, shows the three machines only when complete and never auto-rotates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  expect(await page.evaluate(() => window.__workshopDemo.getParts().filter((part) => part.object.visible).length)).toBe(0);
  await page.evaluate(() => window.__workshopDemo.setProgress(.5));
  expect(await page.evaluate(() => window.__workshopDemo.getState().reducedMotion)).toBe(true);
  expect(await page.evaluate(() => window.__workshopDemo.getParts().filter((part) => part.object.visible).length)).toBe(0);
  await page.getByRole('button', { name: '查看完成' }).click();
  await expect(page.locator('#phase-name')).toHaveText('装配完成');
  await waitLocked(page);
  expect(await page.evaluate(() => window.__workshopDemo.getParts().filter((part) => part.object.visible).length)).toBe(91);
  expect(await page.evaluate(() => {
    const api = window.__workshopDemo, state = api.getShowcaseState();
    const Vector = api.getCamera().position.constructor, right = new Vector(14, 0, -11).normalize();
    return api.getMachines().every(machine => {
      const center = machine.homeBounds.getCenter(new Vector());
      const offset = right.clone().multiplyScalar(center.dot(right) * (state.spread - 1));
      return machine.parts.every(part => part.object.position.distanceTo(part.homePosition.clone().add(offset)) < 1e-8
        && part.object.quaternion.equals(part.homeQuaternion));
    }) && state.reduced && state.nextMoveAt === null;
  })).toBe(true);
  await expect(page.locator('#machine-labels')).toBeVisible();
  await expect(page.locator('.machine-label')).toHaveCount(3);
  await expect(page.locator('#toggle-showcase')).toBeHidden();
  expect(await page.evaluate(() => window.__workshopDemo.getState().completionLocked)).toBe(true);
});

test('WebGL failure falls back to the three-machine structure text', async ({ page }) => {
  await page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/i.test(type) ? null : native.call(this, type, ...args); };
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/workshop.html');
  await expect(page.locator('#workshop-stage')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.getByRole('heading', { name: '当前浏览器无法显示三维画面' })).toBeVisible();
  await expect(page.locator('#fallback li')).toHaveCount(3);
  await expect(page.locator('#fallback')).toContainText('铣床');
  await expect(page.locator('#fallback')).toContainText('车床');
  await expect(page.locator('#fallback')).toContainText('激光切割机');
  expect(errors).toEqual([]);
});

test('missing HDR and JPG assets still become ready with a procedural environment', async ({ page }) => {
  await page.route(/\.(?:hdr|jpg)(?:\?|$)/, (route) => route.abort());
  await ready(page);
  await expect(page.locator('#workshop-stage')).toHaveAttribute('data-surfaces', 'fallback');
  await expect(page.locator('#workshop-stage')).toHaveAttribute('data-environment', 'fallback');
  await page.getByRole('button', { name: '查看完成' }).click();
  await waitLocked(page);
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
  await waitLocked(page);
  await frames(page, 30);
  const warmed = await page.evaluate(() => window.__workshopDemo.getRenderStats());
  for (let round = 0; round < 4; round++) {
    // Each round replays first, because the finished state is locked.
    await replay(page);
    await page.evaluate((index) => {
      const api = window.__workshopDemo;
      for (let step = 0; step < 6; step++) api.setProgress((step % 6) / 6 * .94);
      if (index % 2 === 0) api.setInspection(!api.getState().inspection);
      api.setProgress(.74);
    }, round);
    for (const width of [1180, 620, 375, 640, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await frames(page, 2);
      await page.evaluate(() => window.__workshopDemo.setProgress(.74));
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.__workshopDemo.setProgress(.94));
  await waitLocked(page);
  await frames(page, 10);
  const settled = await page.evaluate(() => window.__workshopDemo.getRenderStats());
  expect(settled.geometries).toBeLessThanOrEqual(warmed.geometries);
  expect(settled.textures).toBeLessThanOrEqual(warmed.textures);
  expect(settled.geometries).toBeGreaterThan(0);
  await page.getByRole('button', { name: '暂停轮换' }).click();
  await frames(page, 3);
  const first = await page.evaluate(() => window.__workshopDemo.getCamera().position.toArray());
  await page.waitForTimeout(400);
  const second = await page.evaluate(() => window.__workshopDemo.getCamera().position.toArray());
  first.forEach((value, axis) => expect(second[axis]).toBe(value));
  expect(await page.evaluate(() => window.__workshopDemo.getState().settling)).toBe(false);
});

// The completed showcase is locked: wheel, slider and API cannot take it apart,
// only an explicit replay releases the latch.
test('the finished showcase stays locked against wheel, slider and API until replay', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  await waitLocked(page);
  await page.getByRole('button', { name: '暂停轮换' }).click();
  const slider = page.getByRole('slider', { name: '装配进度' });
  await expect(slider).toBeDisabled();
  await expect(page.locator('#progress-value')).toHaveText('100%');
  await page.mouse.move(640, 200);
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(300);
  let locked = await page.evaluate(() => window.__workshopDemo.getState());
  expect(locked.completionLocked).toBe(true);
  expect(locked.progress).toBe(.94);
  expect(locked.displayProgress).toBe(1);
  // The page itself still scrolls; only the progress stays locked.
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.evaluate(() => { window.__workshopDemo.setProgress(0); window.__workshopDemo.setProgress(.4); });
  await frames(page, 2);
  locked = await page.evaluate(() => window.__workshopDemo.getState());
  expect(locked.completionLocked).toBe(true);
  expect(locked.progress).toBe(.94);
  expect(await page.evaluate(() => window.__workshopDemo.getParts().every((part) => part.object.visible))).toBe(true);
  await expect(page.locator('#machine-labels')).toBeVisible();
  await replay(page);
  const open = await page.evaluate(() => window.__workshopDemo.getState());
  expect(open.progress).toBe(0);
  expect(open.showcase.active).toBe(false);
  await expect(slider).toBeEnabled();
  await expect(page.locator('#machine-labels')).toBeHidden();
  await slider.fill('400');
  const scrubbed = await page.evaluate(() => window.__workshopDemo.getState());
  expect(scrubbed.progress).toBeCloseTo(.4 * .94, 4);
  expect(scrubbed.showcase.machines.every((machine) => machine.rotation[3] === 1)).toBe(true);
});

// Real 5 s auto rotation, measured from each machine's actual world Box3 centre
// projected on RIGHT / EYE. Only laser is the front slot by default.
test('the real five-second clock moves the triangle to the next front machine', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  await waitLocked(page);
  const project = () => page.evaluate(() => {
    const api = window.__workshopDemo;
    const Box = api.getBounds().constructor;
    const eye = [11, 0, 14].map((value) => value / Math.hypot(11, 14));
    const right = [14, 0, -11].map((value) => value / Math.hypot(14, 11));
    const out = {};
    for (const machine of api.getMachines()) {
      const box = new Box();
      for (const part of machine.parts) box.union(new Box().setFromObject(part.object));
      const c = box.getCenter(machine.homeBounds.min.clone());
      out[machine.id] = { right: c.x * right[0] + c.z * right[2], eye: c.x * eye[0] + c.z * eye[2] };
    }
    return { state: api.getState(), centres: out };
  });
  const before = await project();
  expect(before.state.completionLocked).toBe(true);
  expect(before.centres.mill.eye).toBeGreaterThan(before.centres.laser.eye + 3);
  await expect(page.locator('#active-part')).toContainText('每 5 秒轮换');
  const started = Date.now();
  let after = null;
  while (Date.now() - started < 9000) {
    after = await project();
    if (after.state.showcase.moving) break;
    await page.waitForTimeout(100);
  }
  expect(after, 'rotation starts within 9 s').not.toBeNull();
  expect(after.state.showcase.moving).toBe(true);
  expect(after.state.showcase.active).toBe(true);
  await expect.poll(async () => (await project()).state.showcase.moving, { timeout: 4000 }).toBe(false);
  const done = await project();
  expect(done.state.showcase.frontId).toBe('laser');
  expect(done.centres.laser.eye).toBeGreaterThan(done.centres.mill.eye + 3);
  expect(done.centres.laser.eye).toBeGreaterThan(done.centres.lathe.eye + 3);
  expect(done.centres.mill.right).toBeLessThan(-3);
  expect(done.centres.lathe.right).toBeGreaterThan(3);
  expect(Date.now() - started).toBeLessThan(9000);
  await expect(page.getByRole('button', { name: '将激光切割机移到前方' })).toHaveAttribute('aria-pressed', 'true');
});

// Real canvas picking: click the visible body of a back machine and it must
// become the front one, as confirmed by its real world Box3 projection.
test('clicking a real back machine body on the canvas brings that machine to the front', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  await waitLocked(page);
  await page.getByRole('button', { name: '暂停轮换' }).click();
  await frames(page, 3);
  await expect(page.locator('#workshop-scene canvas')).toHaveCSS('pointer-events', 'auto');
  const point = await bodyPoint(page, 'lathe');
  expect(point, 'visible real body point of the lathe').not.toBeNull();
  expect(await page.evaluate(({ x, y }) => window.__workshopDemo.pickMachineAt(x, y), point)).toBe('lathe');
  await page.mouse.click(point.x, point.y);
  await waitLocked(page);
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getState().showcase.frontId), { timeout: 4000 }).toBe('lathe');
  await expect(page.getByRole('button', { name: '将车床移到前方' })).toHaveAttribute('aria-pressed', 'true');
  const centres = await page.evaluate(() => {
    const api = window.__workshopDemo;
    const eye = [11, 0, 14].map((value) => value / Math.hypot(11, 14));
    const out = {};
    for (const machine of api.getMachines()) {
      const Box = api.getBounds().constructor; const box = new Box();
      for (const part of machine.parts) box.union(new box.constructor().setFromObject(part.object));
      const c = box.getCenter(machine.homeBounds.min.clone());
      out[machine.id] = c.x * eye[0] + c.z * eye[2];
    }
    return out;
  });
  expect(centres.lathe).toBeGreaterThan(centres.mill + 3);
  expect(centres.lathe).toBeGreaterThan(centres.laser + 3);
});

// Real pointer drag on the canvas: only the dragged machine's poses change, its
// internal proportions stay fixed, nothing is sent to the front, camera stays put.
test('dragging a real machine on the canvas rotates only that machine and never the camera', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  await waitLocked(page);
  await page.getByRole('button', { name: '暂停轮换' }).click();
  await frames(page, 3);
  const capture = () => page.evaluate(() => ({
    front: window.__workshopDemo.getState().showcase.frontId,
    camera: window.__workshopDemo.getCamera().getWorldDirection(window.__workshopDemo.getCamera().position.clone()).toArray(),
    cameraPosition: window.__workshopDemo.getCamera().position.toArray(),
    viewScales: Object.fromEntries(window.__workshopDemo.getShowcaseState().machines.map(machine => [machine.id, machine.viewScale])),
    labels: [...document.querySelectorAll('.machine-label')].map(node => node.getBoundingClientRect().toJSON()),
    parts: window.__workshopDemo.getParts().map((part) => ({ id: part.id, machineId: part.machineId, position: part.object.position.toArray(), quaternion: part.object.quaternion.toArray() })),
  }));
  const internalDistances = (parts, machineId, viewScale) => {
    const owned = parts.filter((part) => part.machineId === machineId);
    const distances = [];
    for (let a = 0; a < owned.length; a++) for (let b = a + 1; b < owned.length; b += Math.max(1, Math.floor(owned.length / 6))) {
      distances.push(owned[a].position.reduce((sum, value, axis) => sum + (value - owned[b].position[axis]) ** 2, 0) / viewScale ** 2);
    }
    return distances;
  };
  for (const id of ['mill', 'lathe', 'laser']) {
    expect(await page.evaluate(() => window.__workshopDemo.getState().showcase.frontId)).toBe('mill');
    await expect.poll(() => page.evaluate(() => window.__workshopDemo.getState().showcase.moving), { timeout: 4000 }).toBe(false);
    await frames(page, 2);
    const point = await bodyPoint(page, id);
    expect(point, `body point of ${id}`).not.toBeNull();
    const before = await capture();
    expect(before.front).toBe('mill');
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 24, point.y + 10, { steps: 6 });
    await frames(page, 2);
    const during = await capture();
    expect(during.cameraPosition).toEqual(before.cameraPosition);
    expect(during.labels).toEqual(before.labels);
    expect(during.parts.filter(part => part.machineId !== id)).toEqual(before.parts.filter(part => part.machineId !== id));
    await page.mouse.up();
    await frames(page, 2);
    const after = await capture();
    expect(after.cameraPosition).toEqual(before.cameraPosition);
    expect(after.labels).toEqual(before.labels);
    expect(after.front).toBe('mill');
    for (let axis = 0; axis < 3; axis++) expect(Math.abs(after.camera[axis] - before.camera[axis])).toBeLessThan(1e-6);
    const changed = new Set();
    for (let index = 0; index < after.parts.length; index++) {
      const A = before.parts[index], B = after.parts[index];
      if (A.position.some((value, axis) => Math.abs(value - B.position[axis]) > 1e-6)
        || Math.abs(A.quaternion.reduce((sum, value, axis) => sum + value * B.quaternion[axis], 0)) < Math.cos(1e-4)) changed.add(A.machineId);
    }
    expect([...changed]).toEqual([id]);
    const beforeDistances = internalDistances(before.parts, id, before.viewScales[id]);
    const afterDistances = internalDistances(after.parts, id, after.viewScales[id]);
    beforeDistances.forEach((value, index) => expect(afterDistances[index]).toBeCloseTo(value, 4));
    await expectFixedCamera(page, `after dragging ${id}`);
  }
});

test('an inspected model returns after three idle seconds; a new click restarts the delay without moving the shared frame', async ({ page }) => {
  await ready(page);
  await page.locator('#complete').click();
  await page.locator('#toggle-showcase').click();
  await frames(page, 3);
  const fixed = await page.evaluate(() => ({ camera: window.__workshopDemo.getCamera().position.toArray(),
    labels: [...document.querySelectorAll('.machine-label')].map(node => node.style.transform) }));
  const point = await bodyPoint(page, 'mill');
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 90, point.y - 50, { steps: 8 });
  await page.mouse.up(); await frames(page, 3);
  const rotation = await page.evaluate(() => window.__workshopDemo.getShowcaseState().machines.find(m => m.id === 'mill').rotation);
  expect(Math.abs(rotation[3])).toBeLessThan(.95);
  await page.waitForTimeout(1800);
  // Clicking this same front label leaves the layout fixed and renews inspection.
  await page.getByRole('button', { name: '将铣床移到前方' }).click();
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => window.__workshopDemo.getShowcaseState().machines.find(m => m.id === 'mill').rotation)).toEqual(rotation);
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getShowcaseState().machines.find(m => m.id === 'mill').rotation), { timeout: 4000 }).toEqual([0, 0, 0, 1]);
  const after = await page.evaluate(() => ({ camera: window.__workshopDemo.getCamera().position.toArray(),
    labels: [...document.querySelectorAll('.machine-label')].map(node => node.style.transform),
    scales: window.__workshopDemo.getParts().map(part => part.object.scale.toArray()) }));
  expect(after.camera).toEqual(fixed.camera); expect(after.labels).toEqual(fixed.labels);
  expect(after.scales.every(scale => scale.every(value => value === 1))).toBe(true);
  const rendered = await page.evaluate(() => window.__workshopDemo.getRenderStats().frames);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__workshopDemo.getRenderStats().frames)).toBe(rendered);
});

test('each model keeps its own three-second return clock while another model is held or clicked', async ({ page }) => {
  await ready(page); await page.locator('#complete').click(); await page.locator('#toggle-showcase').click();
  await frames(page, 3);
  const machine = id => page.evaluate(id => window.__workshopDemo.getShowcaseState().machines.find(m => m.id === id), id);
  const first = await bodyPoint(page, 'mill');
  await page.mouse.move(first.x, first.y); await page.mouse.down();
  await page.mouse.move(first.x + 55, first.y - 24, { steps: 6 }); await page.mouse.up();
  const firstDeadline = (await machine('mill')).returnAt;
  expect(firstDeadline).not.toBeNull();
  await page.waitForTimeout(600);
  const second = await bodyPoint(page, 'lathe');
  await page.mouse.move(second.x, second.y); await page.mouse.down();
  await page.mouse.move(second.x + 40, second.y - 20, { steps: 6 }); await frames(page, 2);
  const held = await machine('lathe');
  expect(held.returnAt).toBeNull(); expect(Math.abs(held.rotation[3])).toBeLessThan(.99);
  expect((await machine('mill')).returnAt).toBe(firstDeadline);
  // The mill reaches its own deadline while the pointer still holds the lathe.
  await expect.poll(async () => (await machine('mill')).rotation, { timeout: 5000 }).toEqual([0, 0, 0, 1]);
  expect((await machine('lathe')).rotation).toEqual(held.rotation);
  expect(await page.evaluate(() => window.__workshopDemo.getShowcaseState().draggingId)).toBe('lathe');
  await page.mouse.up();
  const secondDeadline = (await machine('lathe')).returnAt;
  expect(secondDeadline).toBeGreaterThan(firstDeadline + 3000);
  await page.getByRole('button', { name: '将铣床移到前方' }).click();
  expect((await machine('lathe')).returnAt).toBe(secondDeadline);
  await expect.poll(async () => (await machine('lathe')).rotation, { timeout: 5000 }).toEqual([0, 0, 0, 1]);
  expect(await page.evaluate(() => window.__workshopDemo.getShowcaseState().machines.every(m => m.returnAt === null && !m.returning))).toBe(true);
});

test('desktop rear slots spread farther apart while phone homes and front depth stay the same', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await ready(page); await page.locator('#complete').click(); await page.locator('#toggle-showcase').click();
  const positions = () => page.evaluate(() => {
    const api = window.__workshopDemo;
    const right = [14, 0, -11].map(value => value / Math.hypot(14, 11));
    return { spread: api.getShowcaseState().spread, homes: api.getParts().map(p => p.homePosition.toArray()),
      machines: api.getShowcaseState().machines.map(m => ({ id: m.id, x: m.center.reduce((sum, value, i) => sum + value * right[i], 0), center: m.center })) };
  });
  const desktop = await positions(); expect(desktop.spread).toBe(1.15);
  expectFramed(await geometry(page), 'desktop spread');
  await page.setViewportSize({ width: 375, height: 812 }); await frames(page, 3);
  const phone = await positions(); expect(phone.spread).toBe(1); expect(phone.homes).toEqual(desktop.homes);
  for (const id of ['lathe', 'laser']) {
    expect(Math.abs(desktop.machines.find(m => m.id === id).x)).toBeCloseTo(Math.abs(phone.machines.find(m => m.id === id).x) * 1.15, 5);
  }
  expect(desktop.machines.find(m => m.id === 'mill').center).toEqual(phone.machines.find(m => m.id === 'mill').center);
  expectFramed(await geometry(page), 'phone spread');
});

test('scrolling naturally into completion locks the machines until replay', async ({ page }) => {
  await ready(page);
  await page.mouse.move(180, 240);
  await page.mouse.wheel(0, 5000);
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getState().completionLocked), { timeout: 12000 }).toBe(true);
  await expect(page.locator('#assembled-count')).toHaveText('91');
  await page.mouse.wheel(0, -5000);
  await page.waitForTimeout(300);
  const locked = await page.evaluate(() => window.__workshopDemo.getState());
  expect(locked.progress).toBe(.94);
  expect(locked.settling).toBe(false);
  await replay(page);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getState().progress)).toBeGreaterThan(.01);
  expect(await page.evaluate(() => window.__workshopDemo.getState().completionLocked)).toBe(false);
});

test('a large back-row rotation persists when selected to the front and resized; idle rendering stops', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  await page.getByRole('button', { name: '暂停轮换' }).click();
  await frames(page, 3);
  const point = await bodyPoint(page, 'lathe');
  expect(point).not.toBeNull();
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 120, point.y - 180, { steps: 10 });
  await page.mouse.up();
  await frames(page, 3);
  const state = await page.evaluate(() => window.__workshopDemo.getShowcaseState());
  expect(state.frontId).toBe('mill');
  const rotation = state.machines.find(m => m.id === 'lathe').rotation;
  expect(Math.abs(rotation[3])).toBeLessThan(.8);
  expectFramed(await geometry(page), 'large back rotation');
  const rotatedPoint = await bodyPoint(page, 'lathe');
  expect(rotatedPoint).not.toBeNull();
  await page.mouse.click(rotatedPoint.x, rotatedPoint.y);
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getShowcaseState().frontId)).toBe('lathe');
  expect(await page.evaluate(() => window.__workshopDemo.getShowcaseState().machines.find(m => m.id === 'lathe').rotation)).toEqual(rotation);
  expectFramed(await geometry(page), 'large front rotation');
  const size = page.viewportSize();
  await page.setViewportSize({ width: size.width === 375 ? 1280 : 375, height: 812 });
  await frames(page, 3);
  expect(await page.evaluate(() => window.__workshopDemo.getShowcaseState().machines.find(m => m.id === 'lathe').rotation)).toEqual(rotation);
  expectFramed(await geometry(page), 'resized large rotation');
  await expectFixedCamera(page);
  const rendered = await page.evaluate(() => window.__workshopDemo.getRenderStats().frames);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__workshopDemo.getRenderStats().frames)).toBe(rendered);
});

test('label buttons, pause/resume and reduced selection act on the real triangle', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  await waitLocked(page);
  // Keyboard Enter on a label button brings that machine to the front.
  const button = page.getByRole('button', { name: '将车床移到前方' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getState().showcase.frontId), { timeout: 4000 }).toBe('lathe');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__workshopDemo.getState().showcase.moving), { timeout: 4000 }).toBe(false);
  expect(await button.evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  // Pause blocks the automatic rotation; resume restores it.
  await page.getByRole('button', { name: '暂停轮换' }).click();
  await expect(page.getByRole('button', { name: '继续轮换' })).toHaveAttribute('aria-pressed', 'true');
  const paused = await page.evaluate(() => window.__workshopDemo.getState().showcase);
  expect(paused.paused).toBe(true);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__workshopDemo.getState().showcase.nextMoveAt)).toBeNull();
  await page.getByRole('button', { name: '继续轮换' }).click();
  await expect(page.getByRole('button', { name: '继续轮换' })).toHaveCount(0);
  await expect(page.locator('#toggle-showcase')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.__workshopDemo.getState().showcase.paused)).toBe(false);
  await replay(page);
  expect(await page.evaluate(() => window.__workshopDemo.getState().completionLocked)).toBe(false);

  // Reduced motion: selection snaps at once and nothing auto-rotates.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '查看完成' }).click();
  await waitLocked(page);
  const reducedAt = await page.evaluate(() => window.__workshopDemo.getState().showcase);
  expect(reducedAt.reduced).toBe(true);
  await page.getByRole('button', { name: '将铣床移到前方' }).click();
  const snapped = await page.evaluate(() => window.__workshopDemo.getState().showcase);
  expect(snapped.moving).toBe(false);
  expect(snapped.frontId).toBe('mill');
  expect(snapped.nextMoveAt).toBeNull();
  await expect(page.locator('#toggle-showcase')).toBeHidden();
  await expect(page.locator('#machine-labels')).toBeVisible();

  // Resize keeps the lock and the user rotation of a machine.
  const turned = await page.evaluate(() => {
    const api = window.__workshopDemo;
    return api.getShowcaseState().machines.map((machine) => ({ id: machine.id, rotation: machine.rotation }));
  });
  expect(turned).toHaveLength(3);
  await page.setViewportSize({ width: 900, height: 800 });
  await frames(page, 4);
  const resized = await page.evaluate(() => window.__workshopDemo.getState());
  expect(resized.completionLocked).toBe(true);
  expect(resized.showcase.machines.map((machine) => machine.rotation)).toEqual(turned.map((machine) => machine.rotation));
  expect(resized.showcase.frontId).toBe('mill');
  expectFramed(await geometry(page), 'resized reduced');
});

// Mid-rotation and after a user drag, every part corner stays inside the frame
// and labels never collide with the controls or each other.
test('mid-rotation and user-turned geometry stay framed with non-overlapping labels', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '查看完成' }).click();
  await waitLocked(page);
  const started = Date.now();
  while (Date.now() - started < 9000) {
    if (await page.evaluate(() => window.__workshopDemo.getState().showcase.moving)) break;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(700); // mid transition, ~half way through the 1.4 s move
  expect(await page.evaluate(() => window.__workshopDemo.getState().showcase.moving)).toBe(true);
  await frames(page, 2);
  expectFramed(await geometry(page), 'mid rotation');
  await expect(page.locator('#active-part')).toContainText('每 5 秒轮换');
  await page.waitForTimeout(1200);
  // A real drag that turns the front machine, then the fitted frame must hold.
  const point = await bodyPoint(page, 'laser');
  expect(point).not.toBeNull();
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x - 30, point.y - 14, { steps: 6 });
  await page.mouse.up();
  await frames(page, 3);
  expectFramed(await geometry(page), 'after user turn');
  expect(await page.evaluate(() => document.querySelector('.controls').getBoundingClientRect().top)).toBeGreaterThan(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await frames(page, 4);
  const narrow = await geometry(page);
  expectFramed(narrow, 'narrow after user turn');
  expect(narrow.scrollWidth).toBe(narrow.width);
});
