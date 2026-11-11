import {defineConfig} from 'vite-plus';

export default defineConfig({
  pack: {
    // One file per module: the plugin hands Vite its runtime modules
    // (client, server, static, node) by path, so they have to stay files.
    entry: ['src/*.ts'],
    unbundle: true,
    format: ['esm'],
    platform: 'node',
    dts: true,
  },
});
