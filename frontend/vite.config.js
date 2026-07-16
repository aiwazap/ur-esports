import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// claude 副本本地后端跑 3001(codex 侧 worktree 用 3011),仅此默认值与 codex 版不同
const apiProxy = process.env.VITE_API_PROXY || 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  cacheDir: './.vite',
  server: {
    port: 5173,
    proxy: {
      '/api': apiProxy,
      '/uploads': apiProxy,
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
