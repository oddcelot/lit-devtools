/**
 * Keeps prop overrides across reloads of a dev-server page, in the tab's
 * `sessionStorage` (see `override-store.ts`). Loaded ahead of the app, so
 * the overrides go back on during each element's first update; the browser
 * extension leaves it out.
 *
 * Being ahead of the app, it also installs the hook that sees each element's
 * `ElementInternals` (see `../element-internals.ts`): an element attaches
 * them in its constructor, before any later script could look.
 */

import {setProp} from './collect.js';
import {installOverrideStore} from './override-store.js';
import {yieldsToAnotherRuntime} from '../runtime-registry.js';
import {installInternalsHook} from '../element-internals.js';

installInternalsHook();

// The extension keeps the overrides of a page it serves in its own storage.
if (
  typeof window !== 'undefined' &&
  !yieldsToAnotherRuntime((import.meta as {hot?: unknown}).hot)
) {
  try {
    installOverrideStore(sessionStorage, setProp);
  } catch {
    // No sessionStorage (sandboxed frame): overrides last one load.
  }
}
