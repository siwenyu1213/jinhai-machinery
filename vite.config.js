import { defineConfig } from 'vite';

export default defineConfig({
  root: 'site',
  base: '/jinhai-machinery/',
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
