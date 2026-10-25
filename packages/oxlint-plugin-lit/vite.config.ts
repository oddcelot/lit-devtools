import {defineConfig} from 'vite-plus';

export default defineConfig({
  pack: {
    // Like the language server, it bundles the shared editor code under the
    // repo's src/lib and the server's document code, so it needs neither
    // package. Vite is imported only for a package with a Vite config.
    // The worker is its own entry: the plugin starts it by file URL.
    entry: ['src/index.ts', 'src/worker.ts'],
    format: ['esm'],
    platform: 'node',
    // Declarations come from `tsc -p tsconfig.dts.json` after the bundle, as
    // in packages/lit-language-server.
    dts: false,
    deps: {neverBundle: ['vite']},
  },
});
