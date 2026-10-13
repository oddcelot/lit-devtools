/* @ts-self-types="./build.d.ts" */
/**
 * The build-only half of `litPlugin()`: the plugins a production build needs
 * (CSS import queries, Lightning CSS for `css` literals, the timeline stub)
 * and nothing else. Use it for builds and keep `litPlugin()` for the dev
 * server, so HMR, the source overlay and the DevTools panel are never even
 * imported into the build:
 *
 * ```ts
 * plugins: [command === 'serve' ? litPlugin() : litCss()]
 * ```
 *
 * Nothing reachable from this module may import dev-only code;
 * `build-entry_test.ts` walks its import graph to keep it that way.
 *
 * @module
 */
import type {Plugin} from 'vite';
import {
  type CssSheetBuild,
  resolveCssSheetBuild,
} from './lib/css-sheet-build.js';
import {loadPluginEnv} from './lib/env.js';
import {litCssQueries} from './lib/plugins/css-queries.js';
import {litCssLiterals} from './lib/plugins/css-literals.js';
import {litTimelineVirtual} from './lib/plugins/timeline-virtual.js';

export type {CssSheetBuild} from './lib/css-sheet-build.js';

/** Options for {@link litCss}; the build-relevant subset of `litPlugin()`'s. */
export interface LitCssOptions {
  /** See `LitPluginOptions.cssSheetBuild`. */
  cssSheetBuild?: CssSheetBuild;
}

/**
 * Build-only plugin set. Resolves `cssSheetBuild` the way `litPlugin()` does:
 * the option, then `LIT_PLUGIN_CSS_SHEET_BUILD` from env or `.env` files, then
 * `'auto'`.
 */
export const litCss = (options: LitCssOptions = {}): Plugin[] => {
  let cssSheetBuild: CssSheetBuild = resolveCssSheetBuild(
    options.cssSheetBuild,
    {}
  );
  const env: Plugin = {
    name: 'lit-css-options',
    enforce: 'pre',
    config(viteConfig, {mode}) {
      cssSheetBuild = resolveCssSheetBuild(
        options.cssSheetBuild,
        loadPluginEnv(viteConfig, mode)
      );
    },
  };
  return [
    env,
    litCssQueries(() => cssSheetBuild),
    // Always the no-op stub: the real timeline API is dev-only.
    litTimelineVirtual(() => false),
    litCssLiterals(),
  ];
};

export default litCss;
