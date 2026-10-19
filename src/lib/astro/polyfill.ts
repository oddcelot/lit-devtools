/* @ts-self-types="./polyfill.d.ts" */
/**
 * The `shadowRootPolyfill` option: declarative shadow roots for a browser
 * that can't parse them, attached by `shadow-roots.ts`. The integration's
 * page script imports this ahead of the page's own scripts, so the shadow
 * roots are in place before any component is defined: a component defined
 * first would make an empty shadow root of its own and render anew instead
 * of hydrating the server's.
 */

import {attachShadowRoots} from './shadow-roots.js';

// `in`, not `Object.hasOwn`: the browsers this is for may lack that too.
if (!('shadowRootMode' in HTMLTemplateElement.prototype)) {
  attachShadowRoots(document);
}
