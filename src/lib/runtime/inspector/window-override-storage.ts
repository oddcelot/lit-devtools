/**
 * Keeps prop overrides across reloads for the browser extension, whose page
 * runtime must not write the site's own storage. The overrides live in the
 * extension's `chrome.storage.session`, which only the ISOLATED world's relay
 * can reach (through the background), so the store here holds them in memory
 * and talks to the relay over `window.postMessage`:
 *
 * - on install it asks for the saved overrides (`want`); the relay answers
 *   with `seed` once the background has read them, and also sends `seed`
 *   unasked as soon as it has them, since either script may load first;
 * - every save goes out as `save`, the whole store as JSON, for the relay to
 *   hand to the background.
 *
 * The background keys them by the page's origin, from the sender the browser
 * reports, not from anything the page says.
 */

import {setProp} from './collect.js';
import {
  OVERRIDES_SOURCE,
  overridesMessageOf,
  type OverridesWindowMessage,
} from './overrides-window.js';
import {
  OVERRIDES_SS_KEY,
  installOverrideStore,
  loadSaved,
  saveOverrides,
} from './override-store.js';

/** Install the override store over the relay on `target`. */
export const installWindowOverrideStore = (target: Window = window): void => {
  let held: string | null = null;
  let seeded = false;
  // A save before the seed would replace what the extension holds with this
  // load's part of it; it waits, and goes out merged once the seed is in.
  let unsent = false;
  const send = (json: string): void => {
    const message: OverridesWindowMessage = {
      source: OVERRIDES_SOURCE,
      type: 'save',
      json,
    };
    target.postMessage(message, '*');
  };
  installOverrideStore(
    {
      getItem: (key) => (key === OVERRIDES_SS_KEY ? held : null),
      setItem: (key, value) => {
        if (key !== OVERRIDES_SS_KEY) return;
        held = value;
        if (seeded) send(value);
        else unsent = true;
      },
    },
    setProp
  );
  target.addEventListener('message', (event) => {
    const message = overridesMessageOf(event, target);
    if (message?.type !== 'seed' || seeded) return;
    seeded = true;
    if (message.json !== null) loadSaved(message.json);
    if (unsent) saveOverrides();
  });
  const want: OverridesWindowMessage = {source: OVERRIDES_SOURCE, type: 'want'};
  target.postMessage(want, '*');
};
