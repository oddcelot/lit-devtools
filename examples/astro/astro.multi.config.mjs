import {defineConfig} from 'astro/config';
import preact from '@astrojs/preact';
import lit from '@oddsquad/vite-plugin-lit/astro';

// Lit next to another renderer, on pages of their own in `multi/`:
// `pnpm build:multi`, then `pnpm preview:multi`.
export default defineConfig({
  srcDir: './multi',
  outDir: './dist-multi',
  integrations: [
    // Only its own files: by default it runs Babel over every `.ts`, which
    // can't parse Lit's decorators.
    preact({include: ['**/*.tsx']}),
    lit(),
  ],
});
