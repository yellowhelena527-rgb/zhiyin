import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  // 生产构建用相对路径，供 Electron file:// 加载
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve('index.html'),
        ball: resolve('ball.html'),
      },
    },
  },
});
