/**
 * Entry module of the panel SPA. `index.html` loads this; Vite bundles it into
 * `dist/client`, which the devframe host serves as the dock's iframe.
 *
 * Importing the root element is enough — it registers `<lit-devtools-panel>`,
 * which the HTML already contains, and pulls in the views it renders. The Web
 * Awesome theme goes first so its tokens exist before any `wa-*` renders.
 *
 * Everything that styles the document itself happens here, not in the
 * element modules, so a page that embeds panel views (the docs) can import
 * them without taking over its own `:root`.
 */

import './wa-theme.css';
import {injectTokens} from '../lib/tokens.js';
import {
  applyColorScheme,
  readColorSchemePreference,
} from '../lib/color-scheme.js';
import './wa-icons.js';
import './lit-devtools-panel.js';
import {installTooltips} from './tooltip.js';

// The design tokens on the panel document's :root, before the views render;
// components inherit the semantic aliases from there. The panel owns this
// document, so it also declares `color-scheme` (host-page injections must
// not) and sets Web Awesome to its density (see `injectTokens`).
injectTokens({colorScheme: true, webAwesome: true});
// Re-assert the saved color-scheme preference (the Settings tab mounts
// lazily, so it can't). `auto` needs no JS: the tokens' `prefers-color-scheme`
// @media rule resolves it live.
applyColorScheme(readColorSchemePreference());

installTooltips();
