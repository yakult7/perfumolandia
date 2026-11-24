import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// base relativa: o mesmo build serve para GitHub Pages (subpasta), Electron e Capacitor
// duas páginas: o site (raiz) e o aplicativo (/app/)
export default defineConfig({
  root: 'web',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        site: resolve(import.meta.dirname, 'web/index.html'),
        app: resolve(import.meta.dirname, 'web/app/index.html'),
      },
    },
  },
  optimizeDeps: { exclude: ['@jsquash/webp'] },
  server: { host: true, port: 5173 },
});
