import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/vite';
import {litPlugin} from '@oddsquad/vite-plugin-lit';

export default defineConfig({
  // The Vite DevTools dock, where the plugin adds its Lit panel: the
  // component tree, the timeline and what made each component update.
  //
  // `clientAuth: false` skips the per-browser approval DevTools asks for in
  // the terminal, which nobody can answer on StackBlitz. Fine for a throwaway
  // demo; don't copy it into a server reachable from other machines.
  //
  // `dockPreferences` starts the dock as a toolbar along the bottom edge.
  // Only a default: a browser that has moved the dock keeps its own layout.
  devtools: {
    enabled: true,
    apply: 'serve',
    clientAuth: false,
    dockPreferences: {defaultMode: 'edge', defaultPosition: 'bottom'},
  },
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
      // The Lit panel in the dock. Its Timeline records clicks, keystrokes
      // and what each one caused.
      timeline: true,
      // Pick an element on the page (Ctrl/⌘+Shift+S, or Pick in the panel)
      // and jump to the component that rendered it.
      sourceOverlay: true,
    }),
  ],
});
