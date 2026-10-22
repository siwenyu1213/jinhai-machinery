import { defineConfig } from 'vite';

// Deliberately separate from site/: this experiment is never an input to the
// production website build or its GitHub Pages deployment.
export default defineConfig({
  root: 'demos/mill-assembly',
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5175, strictPort: true },
  preview: { port: 4175, strictPort: true },
});
