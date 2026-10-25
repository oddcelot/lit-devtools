import {defineConfig} from 'vite';
import {litPlugin} from '@oddsquad/lit-devtools/vite';

export default defineConfig({
  plugins: [litPlugin({hmr: {indicator: {count: true}}})],
});
