import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/typography-browser',fullyParallel:true,workers:2,timeout:30000,expect:{timeout:8000},
  reporter:[['list']],outputDir:'artifacts/tmp/typography-tests',
  use:{baseURL:'http://127.0.0.1:4177/',channel:process.platform==='win32'?'msedge':undefined,trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'type-desktop',use:{viewport:{width:1280,height:1000}}},{name:'type-mobile',use:{viewport:{width:375,height:812}}}],
  webServer:{command:'npx vite preview --config design-previews/typography/vite.config.js',url:'http://127.0.0.1:4177/',reuseExistingServer:!process.env.CI},
});
