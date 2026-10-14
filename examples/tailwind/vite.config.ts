import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/vite';
import {litPlugin} from '@oddsquad/vite-plugin-lit';

export default defineConfig({
  build: {
    // Leave the output readable, so you can find the utilities and the
    // `@property` rules in `dist/assets/tailwind-*.css`.
    cssMinify: false,
  },
  plugins: [
    // Generates the utilities your source uses into `src/tailwind.css`.
    // Nothing Lit-specific: the components import that file with
    // `?css-sheet` and the lit plugin does the rest.
    tailwindcss(),
    litPlugin({
      // HMR is on by default: edit a component and it is patched in place.
      // The corner counts patches; a sheet swap pulses without counting.
      hmr: {indicator: {count: true}},
    }),
  ],
});
