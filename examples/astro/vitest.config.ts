/// <reference types="vitest/config" />
import {getViteConfig} from 'astro/config';

// Astro's own config, integrations included, so the renderer and the
// plugin's transforms apply to what the tests render.
export default getViteConfig({
  // Processed, as Vite does: a `?css-sheet` import renders its css on the
  // server, and Vitest empties css it doesn't process.
  test: {include: ['test/**/*.test.ts'], css: true},
});
