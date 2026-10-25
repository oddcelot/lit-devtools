import {defineConfig} from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';
import lit from '@oddsquad/lit-devtools/astro';

export default defineConfig({
  // Prebuilt pages, but /on-demand/ renders for each request on Node.
  adapter: node({mode: 'standalone'}),
  integrations: [
    // Preact for the islands next to Lit's, on its own files only: by
    // default it runs Babel over every `.ts`, which can't parse decorators.
    preact({include: ['**/*.tsx']}),
    lit({sourceOverlay: true}),
  ],
  vite: {
    optimizeDeps: {
      // The ClientRouter's modules, pre-bundled from the start. Found on the
      // first page load instead, they re-run the optimizer, and next to
      // Preact's integration that leaves Astro's dev toolbar broken until a
      // restart.
      include: [
        'astro/virtual-modules/transitions-events.js',
        'astro/virtual-modules/transitions-router.js',
        'astro/virtual-modules/transitions-swap-functions.js',
        'astro/virtual-modules/transitions-types.js',
      ],
    },
  },
});
