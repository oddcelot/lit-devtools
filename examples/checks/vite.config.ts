import {defineConfig} from 'vite';
import {litPlugin} from '@oddsquad/lit-devtools/vite';

export default defineConfig({
  plugins: [
    litPlugin({
      // Writes custom-elements.json from the components' JSDoc while the dev
      // server runs, and serves it to the DevTools panel. `npm run manifest`
      // writes the same file without a server. Only src/components is read:
      // src/mistakes is broken on purpose.
      manifest: {write: 'custom-elements.json', scan: ['src/components']},
      languageServer: {
        // The server would read only the manifest's folders. It reads all of
        // src, so the mistakes are checked too.
        scan: ['src'],
        // legacy-ui ships no manifest of its own, so its elements would be
        // unknown. This one, written by hand, makes them complete, show their
        // docs and get checked like the rest.
        manifests: ['./vendor/legacy-ui/custom-elements.json'],
        // What main.ts imports counts as imported in every file, for
        // missing-import.
        entries: ['src/main.ts'],
        // Two rules are off unless turned on. Oxlint takes its severities
        // from oxlint.config.ts instead; this is for the editor.
        diagnostics: {
          'missing-import': 'warning',
          'property-visibility': 'warning',
        },
      },
    }),
  ],
});
