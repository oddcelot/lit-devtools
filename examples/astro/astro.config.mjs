import {fileURLToPath} from 'node:url';
import {defineConfig} from 'astro/config';
import lit from '@awesome.me/astro-lit';
import litDevtools from '@oddsquad/vite-plugin-lit/astro';

/** Adds `client:on`, which hydrates an island on a click elsewhere. */
const clientOn = () => ({
  name: 'client-on',
  hooks: {
    'astro:config:setup': ({addClientDirective}) => {
      addClientDirective({
        name: 'on',
        entrypoint: fileURLToPath(
          new URL('./directives/on.js', import.meta.url)
        ),
      });
    },
  },
});

export default defineConfig({
  integrations: [lit(), litDevtools({sourceOverlay: true}), clientOn()],
});
