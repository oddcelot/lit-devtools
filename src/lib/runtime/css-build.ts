/**
 * What a `?css-sheet` import compiles to under `vite build`.
 *
 * The helpers in `css.ts` carry what dev needs (the `?direct` fetch, an
 * `onHotUpdate` callback, `@property` hoisting on every swap), and a build
 * that called them would ship all of it. These build the sheet once; the
 * plugin passes `hoistPropertyRules` as `hoist` to register the sheet's
 * `@property` rules on the document.
 *
 * @module
 */

type Hoist = (sheet: CSSStyleSheet) => () => void;

/** A shared `CSSStyleSheet` holding `css`, inlined into the chunk. */
export const inlinedSheet = (css: string, hoist?: Hoist): CSSStyleSheet => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  hoist?.(sheet)();
  return sheet;
};

/**
 * A shared `CSSStyleSheet` filled from the emitted `.css` asset at `url`.
 * Empty until the fetch resolves.
 */
export const fetchedSheet = (url: string, hoist?: Hoist): CSSStyleSheet => {
  const sheet = new CSSStyleSheet();
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
