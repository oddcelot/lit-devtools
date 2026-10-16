/**
 * What a `?css-sheet` import compiles to under `vite build`.
 *
 * The helpers in `css.ts` carry what dev needs (the dev server's raw-css
 * fetch, a hot-swap callback, `@property` hoisting on every swap), and a
 * build that called them would ship all of it. An unminified build keeps
 * this comment, so it names none of those by their identifiers. These build the sheet once. The
 * plugin passes `hoistPropertyRules` as `hoist` only for a sheet that has a
 * `@property` rule, so a build without one leaves the hoisting out.
 *
 * @module
 */

import {newSheet, noSheets} from './new-sheet.js';

type Hoist = (sheet: CSSStyleSheet) => () => void;

/** A shared `CSSStyleSheet` holding `css`, inlined into the chunk. */
export const inlinedSheet = (css: string, hoist?: Hoist): CSSStyleSheet => {
  const sheet = newSheet();
  sheet.replaceSync(css);
  hoist?.(sheet)();
  return sheet;
};

/**
 * A shared `CSSStyleSheet` filled from the emitted `.css` asset at `url`.
 * Empty until the fetch resolves.
 */
export const fetchedSheet = (url: string, hoist?: Hoist): CSSStyleSheet => {
  const sheet = newSheet();
  // On a server there is no page to fetch the asset relative to.
  if (noSheets()) return sheet;
  fetch(url)
    .then((r) => {
      // A 404 still has a body (the server's fallback page); don't adopt it as css.
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })
    .then((css) => {
      sheet.replaceSync(css);
      hoist?.(sheet)();
    })
    .catch((err: unknown) => {
      console.warn(`[lit-plugin] ?css-sheet: failed to load ${url}:`, err);
    });
  return sheet;
};
