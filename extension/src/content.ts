/**
 * The extension's relay, in the ISOLATED world at `document_start` on the
 * sites the user enabled: the page runtime (`page.ts`) cannot reach
 * `chrome.runtime` from the MAIN world, so this script opens the document's
 * port to the background and carries messages between it and the page's
 * `window`.
 *
 * One port at a time per document. The background pairs it with the panel
 * inspecting this tab (`hub.ts`); a navigation loads a new copy of this
 * script, which opens a new port. A port lost to the back/forward cache or a
 * service worker restart is reopened (`reconnect.ts`); the hub's newest page
 * port for a tab replaces the older.
 *
 * Bundled as a self-contained classic script, like `page.ts`.
 */

import {relayWindowToPort} from '../../src/lib/runtime/window-transport.js';
import {
  OVERRIDES_SOURCE,
  overridesMessageOf,
  type OverridesWindowMessage,
} from '../../src/lib/runtime/inspector/overrides-window.js';
import {PAGE_PORT, type OverridesRequest} from './protocol.js';
import {keepConnected} from './reconnect.js';

const relay = keepConnected({
  open() {
    const port = chrome.runtime.connect({name: PAGE_PORT});
    // Stops itself when the port disconnects; the next port gets a new relay,
    // which announces `connected` so the runtime re-announces to the panel.
    relayWindowToPort(window, port);
    return port;
  },
  // `chrome.runtime.id` is gone once the extension is reloaded or removed.
  alive: () => chrome.runtime?.id !== undefined,
});

// Chrome closed the port when the page went into the back/forward cache.
addEventListener('pageshow', (event) => {
  if (event.persisted) relay.reconnect();
});

// Overrides the page keeps across reloads: the page runtime holds them in
// memory and must not write the site's storage, so they go through here to
// the background's `storage.session`. Read once, as early as possible, and
// handed over unasked and again when the runtime asks, since either script
// may run first.
const request = (message: OverridesRequest): Promise<string | null> =>
  chrome.runtime.sendMessage(message).catch(() => null) as Promise<
    string | null
  >;
const saved = request({type: 'lit:overrides-get'});
const seed = (): void =>
  void saved.then((json) => {
    const message: OverridesWindowMessage = {
      source: OVERRIDES_SOURCE,
      type: 'seed',
      json,
    };
    window.postMessage(message, '*');
  });
seed();
addEventListener('message', (event) => {
  const message = overridesMessageOf(event, window);
  if (message?.type === 'want') seed();
  else if (message?.type === 'save') {
    void request({type: 'lit:overrides-set', json: message.json});
  }
});
