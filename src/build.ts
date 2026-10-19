/* @ts-self-types="./build.d.ts" */
/**
 * The build-only half of `litPlugin()`: the plugins a production build needs
 * (CSS import queries, Lightning CSS for `css` literals, the timeline stub)
 * and nothing else. `litPlugin()` already defers its dev-only code to the dev
 * server; this is for a build config that shouldn't depend on even the
 * options layer and the lazy shells:
 *
 * ```ts
 * plugins: [command === 'serve' ? litPlugin() : litCss()]
 * ```
 *
 * Nothing reachable from this module may import dev-only code;
 * `entry-imports_test.ts` walks its import graph to keep it that way.
 *
 * @module
 */
// A value import first: the compiler drops a type-only import along with
// the comments before it, and the @ts-self-types line JSR reads with them.
import {
  type CssSheetBuild,
  resolveCssSheetBuild,
} from './lib/css-sheet-build.js';
import {loadPluginEnv} from './lib/env.js';
import {litCssQueries} from './lib/plugins/css-queries.js';
import {litCssLiterals} from './lib/plugins/css-literals.js';
import {litTimelineVirtual} from './lib/plugins/timeline-virtual.js';
import type {Plugin} from 'vite';

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
