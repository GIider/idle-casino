import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json';

// The release build is one self-contained `dist/index.html` (JS and CSS inlined).
// `sim.html` (dev-only bot visualiser) is only served by `npm run dev`.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toLocaleDateString('sv')),
  },
  plugins: [viteSingleFile()],
});
