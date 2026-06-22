import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const aliases = {
  '@shared': resolve('src/shared'),
  '@renderer': resolve('src/renderer')
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: aliases }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: aliases },
    build: { rollupOptions: { input: resolve('src/preload.ts') } }
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: aliases },
    plugins: [react()]
  }
});
