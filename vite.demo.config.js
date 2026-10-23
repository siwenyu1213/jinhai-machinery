import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Deliberately separate from site/: this experiment is never an input to the
// production website build or its GitHub Pages deployment.
// Three pages share one standalone build: the mill assembly (/index.html), the
// static model review (/model-review.html) and the three-machine workshop
// (/workshop.html). Absolute inputs keep the demo root.
export default defineConfig({
  root: 'demos/mill-assembly',
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./demos/mill-assembly/index.html', import.meta.url)),
        review: fileURLToPath(new URL('./demos/mill-assembly/model-review.html', import.meta.url)),
        workshop: fileURLToPath(new URL('./demos/mill-assembly/workshop.html', import.meta.url)),
      },
    },
  },
  server: { port: 5175, strictPort: true },
  preview: { port: 4175, strictPort: true },
});
