import {ENV_PREFIX, envEnum} from './env.js';

/**
 * What a `?css-sheet` import compiles to under `vite build`.
 *
 * - `'url'`: fetch-backed sheet over the emitted `.css` asset.
 * - `'inline'`: css text embedded in the JS chunk, processed by the css
 *   pipeline (`?inline`).
 * - `'inline-raw'`: css text embedded verbatim, skipping the css pipeline
 *   (`?raw`).
 * - `'auto'`: `'inline'` when `build.lib` is set, `'url'` otherwise.
 */
export type CssSheetBuild = 'auto' | 'url' | 'inline' | 'inline-raw';

const CSS_SHEET_BUILD_MODES: readonly CssSheetBuild[] = [
  'auto',
  'url',
  'inline',
  'inline-raw',
];

/**
 * The explicit option first, then `LIT_PLUGIN_CSS_SHEET_BUILD`, then `'auto'`.
 * Shared by `resolveOptions()` and `litCss()`, which skips the full options
 * layer.
 */
export const resolveCssSheetBuild = (
  option: string | undefined,
  env: Record<string, string>
): CssSheetBuild =>
  envEnum(option, CSS_SHEET_BUILD_MODES, 'cssSheetBuild') ??
  envEnum(
    env[`${ENV_PREFIX}_CSS_SHEET_BUILD`],
    CSS_SHEET_BUILD_MODES,
    `${ENV_PREFIX}_CSS_SHEET_BUILD`
  ) ??
  'auto';
