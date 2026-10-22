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
 *    `.color-scheme-light` / `.color-scheme-dark` classes on `:root`.
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
 * sizes, system font stacks (no webfont download for a dev-only tool), and
 * square corners in the panel and the in-page UI.
 */
const devtoolsTokenCSS = `
  /* ---- Shared sizing: toolbar controls and tree/list rows ---- */
  --lit-devtools-control-height:  28px;
  --lit-devtools-row-height:      22px;

  /* ---- System fonts in place of Manrope / Roboto Mono ---- */
  --lit-devtools-font-sans:  system-ui, -apple-system, 'Segoe UI', sans-serif;
  --lit-devtools-font-mono:  ui-monospace, 'SF Mono', Menlo, Consolas, monospace;

  /* ---- Radius · square corners throughout ---- */
  --lit-devtools-radius-xs:   0;
  --lit-devtools-radius-sm:   0;
  --lit-devtools-radius-md:   0;
  --lit-devtools-radius-lg:   0;
  --lit-devtools-radius-xl:   0;
  --lit-devtools-radius-2xl:  0;
  --lit-devtools-radius-pill: 0;
`;

export const baseTokenCSS = `${designBaseCSS}${devtoolsTokenCSS}`;

const darkThemeCSS = designDarkCSS;

const darkSchemeCSS = `color-scheme: dark;`;

const lightThemeCSS = designLightCSS;

const lightSchemeCSS = `color-scheme: light;`;

let _injected = false;

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
}: InjectTokensOptions = {}): string => {
  const dark = colorScheme
    ? `${darkThemeCSS}\n  ${darkSchemeCSS}`
    : darkThemeCSS;
  const light = colorScheme
    ? `${lightThemeCSS}\n  ${lightSchemeCSS}`
    : lightThemeCSS;
  return `
    :root {
      ${baseTokenCSS}
      ${dark}
    }
    @media (prefers-color-scheme: light) {
      :root {
        ${light}
      }
    }
    :root.color-scheme-light {
      ${light}
    }
    :root.color-scheme-dark {
      ${dark}
    }
  `;
};

/**
 * Injects `:root { … }` into the page `<head>` once.
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
  if (_injected) return;
  _injected = true;
  const style = document.createElement('style');
  style.setAttribute('data-lit-devtools-tokens', '');
  style.textContent = tokenStyleText(options);
  document.head.prepend(style);
};
