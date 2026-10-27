import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { isolatedApiOrigin } from './scripts/isolated-qa-safety.mjs';

// Project contract: TVTMS-REACT-UI-RESTORED-SOURCE-v3

export default defineConfig(({ mode }) => {
  const isolated = process.env.TVTMS_ISOLATED_DEV === '1';
  const apiOrigin = isolated ? isolatedApiOrigin(process.env.VITE_PHP_API_ORIGIN)
    : process.env.VITE_PHP_API_ORIGIN || 'http://127.0.0.1:8000';
  return {
  plugins: [react()],
  base: '/',
  server: {
    port: 5173,
    ...(isolated ? { host: '127.0.0.1', strictPort: true } : {}),
    proxy: mode === 'development' || isolated ? {
      '/api': {
        target: apiOrigin,
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: apiOrigin,
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
  };
});
