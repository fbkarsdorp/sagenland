import { defineConfig } from 'vite';

// Relative base so the build can live in any subfolder of karsdorp.io
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
});
