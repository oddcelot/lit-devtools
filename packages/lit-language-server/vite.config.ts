import {defineConfig} from 'vite-plus';

export default defineConfig({
  pack: {
    // The shared editor code under the repo's src/lib is bundled in, so the
    // package needs neither the Vite plugin nor Vite. Vite is imported only
    // for a package with a Vite config, where it is installed.
    entry: ['src/bin.ts', 'src/index.ts'],
    format: ['esm'],
    platform: 'node',
    // Off for now: the declaration build writes .d.ts files next to the
    // shared sources outside this package (vpl-w13x.7 fixes it before the
    // first publish).
    dts: false,
    deps: {neverBundle: ['vite']},
  },
});
