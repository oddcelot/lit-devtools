import {defineConfig} from 'vite';
import {litPlugin} from '@oddsquad/lit-devtools/vite';

export default defineConfig({
  // The Vite DevTools dock, where the plugin adds its Lit panel. See the
  // flame example for what these options do.
  devtools: {
    enabled: true,
    apply: 'serve',
    clientAuth: false,
    dockPreferences: {defaultMode: 'edge', defaultPosition: 'bottom'},
  },
  plugins: [
    litPlugin({
      hmr: {indicator: {count: true}},
      timeline: true,
      sourceOverlay: true,
    }),
  ],
});
