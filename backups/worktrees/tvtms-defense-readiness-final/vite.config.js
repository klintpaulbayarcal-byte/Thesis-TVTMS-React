import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Project contract: TVTMS-REACT-UI-RESTORED-SOURCE-v3

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: '/',
  server: {
    port: 5173,
    proxy: mode === 'development' ? {
      '/api': {
        target: process.env.VITE_PHP_API_ORIGIN || 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: process.env.VITE_PHP_API_ORIGIN || 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    } : undefined,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
}));
