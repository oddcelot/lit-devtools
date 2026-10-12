/**
 * Keeps prop overrides across reloads of a dev-server page, in the tab's
 * `sessionStorage` (see `override-store.ts`). Loaded ahead of the app, so
 * the overrides go back on during each element's first update; the browser
 * extension leaves it out.
 */

import {setProp} from './collect.js';
import {installOverrideStore} from './override-store.js';

if (typeof window !== 'undefined') {
  try {
    installOverrideStore(sessionStorage, setProp);
  } catch {
    // No sessionStorage (sandboxed frame): overrides last one load.
  }
}
