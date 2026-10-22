import {litPlugin} from '@oddsquad/vite-plugin-lit';
import {defineConfig} from 'vite-plus';
import {kitchenSinkDocs} from './kitchen-sink/docs-plugin.js';

/**
 * Serves the kitchen sink (index.html) with the repo's own plugin, so an
 * edit to a component hot-patches every instance on the page, and with each
 * element's documented API for its generated sections. Both come from the
 * workspace root's build output: run `pnpm run build` there first.
 */
export default defineConfig({
  plugins: [litPlugin(), kitchenSinkDocs()],
});
