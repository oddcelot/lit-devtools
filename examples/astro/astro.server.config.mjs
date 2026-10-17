import {defineConfig} from 'astro/config';
import node from '@astrojs/node';
import lit from '@oddsquad/vite-plugin-lit/astro';

// The same site rendered on demand by a Node server instead of prebuilt:
// `pnpm build:server`, then `pnpm start:server`.
export default defineConfig({
  output: 'server',
  adapter: node({mode: 'standalone'}),
  integrations: [lit({sourceOverlay: true})],
});
