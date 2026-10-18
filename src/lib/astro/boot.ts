/**
 * What every page the Astro renderer serves loads before its components,
 * right after Lit's hydrate support (the integration's injected script
 * imports both, so a page doesn't have to by hand): the release of
 * elements the renderer deferred (`release.ts`).
 *
 * Runs again after each Astro view transition, which swaps the page's
 * content without loading the page anew, and before it attaches the
 * incoming page's declarative shadow roots (`shadow-roots.ts`), which it
 * hands the page's custom element registry once they are in.
 */

import {releaseMarked} from './release.js';
import {adoptShadowRoots, attachShadowRoots} from './shadow-roots.js';

releaseMarked();
// Attached in the incoming document, before the swap; handed this page's
// registry after it, before anything in them hydrates.
let swappedIn: ShadowRoot[] = [];
document.addEventListener('astro:before-swap', (event) => {
  swappedIn = attachShadowRoots(
    (event as Event & {newDocument: Document}).newDocument
  );
});
document.addEventListener('astro:after-swap', () => {
  adoptShadowRoots(swappedIn);
  swappedIn = [];
});
document.addEventListener('astro:page-load', () => releaseMarked());
