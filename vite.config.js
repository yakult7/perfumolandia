import { defineConfig } from 'vite';

// base relativa: o mesmo build serve para GitHub Pages (subpasta), Electron e Capacitor
export default defineConfig({
  root: 'web',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 900 },
  server: { host: true, port: 5173 },
});
