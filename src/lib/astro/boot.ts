/**
 * What every page the Astro renderer serves loads before its components,
 * right after Lit's hydrate support (the integration's injected script
 * imports both, so a page doesn't have to by hand): the release of
 * elements the renderer deferred (`release.ts`).
 *
 * Runs again after each Astro view transition, which swaps the page's
 * content without loading the page anew, and before it attaches the
 * incoming page's declarative shadow roots (`shadow-roots.ts`).
 */

import {releaseMarked} from './release.js';
import {attachShadowRoots} from './shadow-roots.js';

releaseMarked();
document.addEventListener('astro:before-swap', (event) => {
  attachShadowRoots((event as Event & {newDocument: Document}).newDocument);
});
document.addEventListener('astro:page-load', () => releaseMarked());
