/**
 * A constructed stylesheet, or on a server, a stand-in for one.
 *
 * Node has no `CSSStyleSheet`, so a sheet module that builds one at import
 * (`?css-sheet`, `urlSheet()`) used to throw the moment a server render
 * imported a component that adopts it. The stand-in keeps the css text as
 * `cssText`, which is what Lit's server renderer writes into a component's
 * declarative shadow root, so the styles arrive with the server's HTML.
 *
 * Used by `css.ts`, and dependency-free like it. A build writes its own
 * stand-in into each sheet module (`plugins/css-queries.ts`).
 *
 * @module
 */

/** Whether constructed sheets don't exist here: a server render. */
export const noSheets = (): boolean => typeof CSSStyleSheet === 'undefined';

/** What a server render reads off a style: its text. */
class ServerSheet {
  cssText = '';
  readonly cssRules: unknown[] = [];

  replaceSync(css: string): void {
    this.cssText = css;
  }

  replace(css: string): Promise<this> {
    this.replaceSync(css);
    return Promise.resolve(this);
  }
}

/** `new CSSStyleSheet()`, or {@link ServerSheet} where there is none. */
export const newSheet = (): CSSStyleSheet =>
  noSheets()
    ? (new ServerSheet() as unknown as CSSStyleSheet)
    : new CSSStyleSheet();
