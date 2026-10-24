/**
 * The extension's page script: the Lit runtime, injected into the MAIN world
 * at `document_start` on the sites the user enabled (see `registry.ts`).
 *
 * The same install modules `lit-devtools dev` serves (`standalone.ts`), minus
 * what tied that script to a dev server: it has no `document.currentScript`
 * to read (the browser injects it, no `<script>` loads it) and nothing to
 * dial. Its traffic leaves the page through `window.postMessage` instead, to
 * the relay in the ISOLATED world (`content.ts`), the only world with
 * `chrome.runtime`.
 *
 * Bundled as a self-contained classic script (see `vite.config.ts`): content
 * scripts are not modules and cannot import. Being first on the page is the
 * point: the capture layers wrap `customElements.define` before the page's own
 * scripts define anything.
 */

import {installDefineSites} from '../../src/lib/runtime/define-sites.js';
import {installTemplateSites} from '../../src/lib/runtime/template-sites.js';
import {installInternalsHook} from '../../src/lib/runtime/element-internals.js';
import {forgetOwnLit} from '../../src/lib/runtime/own-lit.js';
import '../../src/lib/runtime/timeline/install.js';
import '../../src/lib/runtime/inspector/install.js';
import {installWindowOverrideStore} from '../../src/lib/runtime/inspector/window-override-storage.js';
import {initSourceOverlay} from '../../src/lib/runtime/source-overlay/overlay-element.js';
import {attachWindowTransport} from '../../src/lib/runtime/window-transport.js';
import {joinPage} from '../../src/lib/runtime/runtime-registry.js';

joinPage('extension');
// Where each class is defined comes from the stack of its define call, so
// this has to run before the page's scripts do (our own imports' defines
// are not the page's and need no record).
installDefineSites();
// Which template rendered an element, likewise: lit-html reports its
// templates only to a hook that is set before it loads.
installTemplateSites();
// Custom states and form values live in ElementInternals, which only the
// element holds: the hook has to be there when it attaches them.
installInternalsHook();
// The picker's LitElement brought a Lit of our own: not the page's to count.
forgetOwnLit();
attachWindowTransport();
// Overrides kept across reloads, in the extension's storage rather than the
// site's: through the relay, before the page defines anything.
installWindowOverrideStore();

// The picker reports a pick on the page channel; the panel is the DevTools
// tab the user already has open, so there is nothing to raise.
const startPicker = () => initSourceOverlay({hosts: 'lit'});
// At document_start there is no <body> to attach to yet.
if (document.body === null) {
  document.addEventListener('DOMContentLoaded', startPicker, {once: true});
} else {
  startPicker();
}
