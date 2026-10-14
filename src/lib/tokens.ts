import {css, unsafeCSS} from 'lit';
import {baseTokenCSS} from './token-text.js';

export * from './token-text.js';

/**
 * Lit `css` template for use in panel component shadow roots.
 *
 * ```ts
 * import {tokens} from '../lib/tokens.js';
 * // ...
 * static override styles = [tokens, css`…`];
 * ```
 *
 * This installs the theme-agnostic base tokens on `:host`. Semantic aliases
 * (`--lit-devtools-bg`, `--lit-devtools-text`, etc.) are inherited from `:root`, where they are installed
 * by {@link injectTokens}. The panel iframe calls `injectTokens()` from
 * \`lit-devtools-panel.ts\` so all components inherit the same dark/light theme.
 */
export const tokens = css`
  :host {
    ${unsafeCSS(baseTokenCSS)}
  }
`;
