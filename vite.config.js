import { defineConfig } from 'vite';
import { exportPlugin } from './scripts/vite-plugin-export.js';

export default defineConfig({
  plugins: [exportPlugin()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'esnext',
  },
});
