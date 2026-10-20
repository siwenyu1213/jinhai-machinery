import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'artifacts/tmp/playwright-report', open: 'never' }]],
  outputDir: 'artifacts/tmp/test-results',
  use: {
    baseURL: process.env.SITE_URL || 'http://127.0.0.1:4173/jinhai-machinery/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    launchOptions: process.env.CI ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {},
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: process.env.SITE_URL ? undefined : {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173/jinhai-machinery/',
    reuseExistingServer: !process.env.CI,
  },
});
