import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      // `sim.html` is the dev-only bot visualiser; it is built but not linked from the game.
      input: { main: resolve(__dirname, 'index.html'), sim: resolve(__dirname, 'sim.html') },
    },
  },
});
