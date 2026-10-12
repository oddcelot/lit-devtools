/**
 * Where the overrides a page keeps across reloads live in the extension:
 * `chrome.storage.session`, one item per origin, holding the store the page
 * runtime writes (every path's saved overrides, as JSON). The session area
 * is the extension's, never the site's, and is cleared with the browser
 * session.
 *
 * Takes the storage area as an argument, so it is unit-testable with a fake.
 */

import type {OverridesRequest} from './protocol.js';
import type {StorageAreaLike} from './registry.js';

/** The storage key of `origin`'s saved overrides. */
export const savedOverridesKey = (origin: string): string =>
  `lit-overrides:${origin}`;

/** The saved overrides' JSON for a `get`, or `null` after a `set`. */
export const handleOverridesRequest = async (
  area: StorageAreaLike,
  origin: string,
  request: OverridesRequest
): Promise<string | null> => {
  const key = savedOverridesKey(origin);
  if (request.type === 'lit:overrides-set') {
    await area.set({[key]: request.json});
    return null;
  }
  const value = (await area.get(key))[key];
  return typeof value === 'string' ? value : null;
};
