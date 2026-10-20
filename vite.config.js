import { defineConfig } from 'vite';

export default defineConfig({
  root: 'site',
  base: '/jinhai-machinery/',
  build: {
    outDir: '../dist', emptyOutDir: true,
    rolldownOptions: {
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
