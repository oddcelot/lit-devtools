/**
 * Design token CSS custom properties for the Lit DevTools, as plain text.
 *
 * Kept free of Lit: the page runtime injects these into every page it runs
 * on, and importing Lit there would bundle lit-html, whose `lit-html`
 * Trusted Types policy would then exist before the page's own Lit asks for
 * it. `tokens.ts` adds the panel's Lit `css` template on top.
 *
 * Two entry points:
 *  - **`tokens`** — Lit `css` template that defines the theme-agnostic base
 *    tokens on `:host`. Semantic color aliases (`--lit-devtools-bg`, `--lit-devtools-surface`, `--lit-devtools-text`,
 *    etc.) are inherited from `:root`, where {@link injectTokens} installs them.
 *    Use as `static styles = [tokens, css`…`]`.
 *  - **`injectTokens()`** — injects `:root { … }` into the page `<head>` once.
 *    This makes semantic aliases available to every devtools surface, both
 *    runtime elements (indicator, source-overlay) that build their shadow DOM
 *    via `innerHTML` and Lit panel components that inherit from `:root`.
 *    The injected stylesheet reacts to `prefers-color-scheme` and to
 *    `.color-scheme-light` / `.color-scheme-dark` classes on `:root`. A page
 *    that shows panel views among its own content (the docs) passes a
 *    {@link InjectTokensOptions.scope} instead, so only that wrapper gets them.
 *
 * The values come from packages/webawesome-theme-lit through the generated
 * `design-tokens.ts`; this file only adds the DevTools' own sizes, fonts and
 * corners. Defaults to the dark DevTools theme; the light lit.dev website
 * palette is applied when the OS/browser requests a light color scheme or
 * when `:root` has the matching theme class.
 */

import {designBaseCSS, designDarkCSS, designLightCSS} from './design-tokens.js';

/**
 * What the DevTools add on top of the design tokens: their control and row
 * sizes. The fonts are the design system's: the system sans, and Lilex for
 * code, which the panel bundles (src/panel/main.ts). The in-page UI loads no
 * font files, so its code falls back to the system monospace.
 */
const devtoolsTokenCSS = `
  /* ---- Shared sizing: toolbar controls and tree/list rows ---- */
  --lit-devtools-control-height:  28px;
  --lit-devtools-row-height:      22px;
`;

export const baseTokenCSS = `${designBaseCSS}${devtoolsTokenCSS}`;

const darkThemeCSS = designDarkCSS;

const darkSchemeCSS = `color-scheme: dark;`;

const lightThemeCSS = designLightCSS;

const lightSchemeCSS = `color-scheme: light;`;

const _injected = new Set<string>();

/**
 * The panel's Web Awesome density: 13px body (WA's `m`), 12px `s` for small
 * controls, the toolbar control height, and the DevTools fonts. Set unlayered
 * so it outranks the Lit theme's `wa-theme-overrides` layer.
 */
const webAwesomeDensityCSS = `
  --wa-font-family-body: var(--lit-devtools-font-sans);
  --wa-font-family-heading: var(--lit-devtools-font-sans);
  --wa-font-family-code: var(--lit-devtools-font-mono);
  --wa-font-size-scale: 0.8125;
  --wa-form-control-height: var(--lit-devtools-control-height);
`;

/**
 * Options for {@link injectTokens} / {@link tokenStyleText}.
 */
export interface InjectTokensOptions {
  /**
   * Also declare `color-scheme` on `:root`. Only safe when the devtools OWN
   * the target document (the panel iframe / standalone panel page). Never set
   * this when injecting into the host page: `color-scheme` on the embedder's
   * `:root` makes the UA repaint the canvas dark for apps that don't declare
   * an opaque background. Defaults to `false`.
   */
  colorScheme?: boolean;
  /**
   * The selector that gets the tokens. Defaults to `:root`. Anything else
   * (say `.lit-devtools-root`) confines them to that element, for a page
   * that shows panel views among its own content. A scoped sheet follows
   * the page's scheme from `.color-scheme-*` classes or `data-theme` on
   * `:root`, or from a `.wa-dark` / `.wa-light` ancestor (the kitchen
   * sink's halves), falling back to `prefers-color-scheme`.
   */
  scope?: string;
  /**
   * Also set Web Awesome's tokens to the panel's density. Only where the
   * panel's controls are the `wa-*` on the page (the panel document) or
   * under a {@link scope}: the in-page UI must not touch an app's own WA.
   */
  webAwesome?: boolean;
}

/**
 * Builds the token stylesheet text injected by {@link injectTokens}.
 *
 * By default the sheet defines custom properties only — inert for the host
 * page. With `colorScheme: true` it additionally declares `color-scheme` so
 * the owning document's UA surfaces (canvas, form controls, scrollbars)
 * follow the devtools theme.
 */
export const tokenStyleText = ({
  colorScheme = false,
  scope = ':root',
  webAwesome = false,
}: InjectTokensOptions = {}): string => {
  const dark = colorScheme
    ? `${darkThemeCSS}\n  ${darkSchemeCSS}`
    : darkThemeCSS;
  const light = colorScheme
    ? `${lightThemeCSS}\n  ${lightSchemeCSS}`
    : lightThemeCSS;
  const forced = (scheme: 'light' | 'dark'): string =>
    scope === ':root'
      ? `:root.color-scheme-${scheme}`
      : `:root.color-scheme-${scheme} ${scope}, :root[data-theme='${scheme}'] ${scope}, .wa-${scheme} ${scope}`;
  return `
    ${scope} {
      ${baseTokenCSS}
      ${webAwesome ? webAwesomeDensityCSS : ''}
      ${dark}
    }
    @media (prefers-color-scheme: light) {
      ${scope} {
        ${light}
      }
    }
    ${forced('light')} {
      ${light}
    }
    ${forced('dark')} {
      ${dark}
    }
  `;
};

/**
 * Injects `:root { … }` (or the {@link InjectTokensOptions.scope}) into the
 * page `<head>`, once per scope.
 *
 * CSS custom properties defined on `:root` cascade through shadow DOM
 * boundaries, so this makes every `var(--lit-devtools-accent)` etc. resolve inside both
 * runtime elements (indicator, source-overlay) and Lit panel components.
 *
 * The injected stylesheet reacts to `prefers-color-scheme` and to
 * `.color-scheme-light` / `.color-scheme-dark` classes on the document root.
 * It never sets `color-scheme` on the host page; the panel opts in via
 * {@link InjectTokensOptions.colorScheme} for its own document.
 */
export const injectTokens = (options?: InjectTokensOptions): void => {
  const scope = options?.scope ?? ':root';
  if (_injected.has(scope)) return;
  _injected.add(scope);
  const style = document.createElement('style');
  style.setAttribute('data-lit-devtools-tokens', '');
  style.textContent = tokenStyleText(options);
  document.head.prepend(style);
};
