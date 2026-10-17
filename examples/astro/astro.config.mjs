import {defineConfig} from 'astro/config';
import lit from '@oddsquad/vite-plugin-lit/astro';

export default defineConfig({
  integrations: [lit({sourceOverlay: true})],
});
