import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/demo-browser',
  fullyParallel: true,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: 'artifacts/tmp/mill-demo-tests',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    launchOptions: process.env.CI ? {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'demo-desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'demo-mobile', use: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 }, defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run demo:preview',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: !process.env.CI,
  },
});
