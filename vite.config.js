import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'site',
  base: '/jinhai-machinery/',
  build: {
    outDir: '../dist', emptyOutDir: true,
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./site/index.html', import.meta.url)),
        machines: fileURLToPath(new URL('./site/machines.html', import.meta.url)),
      },
      output: {
        codeSplitting: {
          groups: [{ name: 'three-core', test: /node_modules[\\/]three[\\/]build[\\/]three\.core\.js$/ }],
        },
      },
    },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
