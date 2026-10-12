import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path: '/' (domain root) atau mis. '/logistik/' bila aplikasi di sub-folder. Set lewat env VITE_BASE saat build.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: { port: 5174 },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 },
});
