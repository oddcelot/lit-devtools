/**
 * What every page the Astro renderer serves loads before its components,
 * right after Lit's hydrate support (the integration's injected script
 * imports both, so a page doesn't have to by hand): the release of
 * elements the renderer deferred (`release.ts`).
 *
 * Runs again after each Astro view transition, which swaps the page's
 * content without loading the page anew.
 */

import {releaseMarked} from './release.js';

releaseMarked();
document.addEventListener('astro:page-load', () => releaseMarked());
