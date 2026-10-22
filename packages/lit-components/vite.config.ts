import {litPlugin} from '@oddsquad/vite-plugin-lit';
import {defineConfig} from 'vite-plus';

/**
 * Serves the kitchen sink (index.html) with the repo's own plugin, so an
 * edit to a component hot-patches every instance on the page. The plugin
 * comes from the workspace root's build output: run `pnpm run build` there
 * first.
 */
export default defineConfig({
  plugins: [litPlugin()],
});
