import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The release build is one self-contained `dist/index.html` (JS and CSS inlined).
// `sim.html` (dev-only bot visualiser) is only served by `npm run dev`.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
});
