import { defineConfig, devices } from '@playwright/test';

// The review preview runs beside the original demo preview, so its port is
// configurable; the standalone demo keeps 4175 by default.
const port = Number(process.env.MILL_DEMO_PORT || 4175);
const origin = `http://127.0.0.1:${port}`;
// Keep CSS viewports and real WebGL scenes in the Linux checks. A smaller
// drawing buffer lets SwiftShader run input and timing assertions promptly.
const softwareScale = process.env.CI ? { deviceScaleFactor: .5 } : {};

export default defineConfig({
  testDir: './tests/demo-browser',
  fullyParallel: true,
  workers: process.env.CI ? 1 : 2,
  timeout: process.env.CI ? 120_000 : 45_000,
  expect: { timeout: process.env.CI ? 15_000 : 10_000 },
  reporter: [['list']],
  outputDir: 'artifacts/tmp/mill-demo-tests',
  use: {
    baseURL: origin,
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    launchOptions: process.env.CI ? {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'demo-desktop', use: { viewport: { width: 1280, height: 900 }, ...softwareScale } },
    { name: 'demo-mobile', use: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 }, defaultBrowserType: 'chromium', ...softwareScale } },
  ],
  webServer: {
    command: `npm run demo:preview -- --port ${port}`,
    url: origin,
    reuseExistingServer: !process.env.CI,
  },
});
