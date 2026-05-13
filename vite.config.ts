import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/chat/',
  root: 'frontend',
  plugins: [react()],
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/chat/api': {
        target: 'http://127.0.0.1:4100',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/chat\/api/, ''),
      },
    },
  },
});
