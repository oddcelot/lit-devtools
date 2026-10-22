/**
 * The live panel: the whole DevTools panel, inspecting a demo page in a
 * frame beside it (`demo-page.ts`), with no dev server. The docs embed this
 * page in a frame of its own, so the panel owns its document as it does in
 * the extension: tokens on `:root`, deep links in its own hash, and its own
 * Lit kept apart from the docs' and the demo's.
 *
 * It runs as the extension's DevTools tab does (`extension/src/panel.ts`),
 * in the same order:
 *
 * 1. the Lit devframe runs here (`createLocalLitHost`), listening on one end
 *    of a `MessageChannel` before anything can arrive on it;
 * 2. `useLocalClient()` hands its client to the panel, before any view asks
 *    for a connection and goes looking for a dev server;
 * 3. the panel SPA is imported, which mounts on the `<lit-devtools-panel>`
 *    already in the page;
 * 4. the demo frame loads and gets the other end, and its runtime announces
 *    itself.
 *
 * `?scheme=light|dark` pins both documents to a scheme, for a frame that
 * sits in a page of a known one (the kitchen sink's halves); without it they
 * follow the OS, or the panel's saved preference.
 */
import {version} from '../../../../package.json';
import {createLocalLitHost} from '../../../lib/devframe/port-link.js';
import {useLocalClient} from '../../client.js';
import {applyColorScheme} from '../../../lib/color-scheme.js';
import {LIVE_PORT_MESSAGE, messagePortLike} from './message-port.js';

const channel = new MessageChannel();
const client = await createLocalLitHost({
  port: messagePortLike(channel.port1),
  version,
});
useLocalClient(client);
await import('../../main.js');

const scheme = new URLSearchParams(location.search).get('scheme');
const pinned = scheme === 'light' || scheme === 'dark' ? scheme : null;
if (pinned !== null) applyColorScheme(pinned);

const frame = document.querySelector<HTMLIFrameElement>('iframe.demo');
if (frame !== null) {
  frame.addEventListener(
    'load',
    () =>
      frame.contentWindow?.postMessage(
        {type: LIVE_PORT_MESSAGE},
        location.origin,
        [channel.port2]
      ),
    {once: true}
  );
  const src = new URL(frame.dataset['src'] ?? '', location.href);
  if (pinned !== null) src.searchParams.set('scheme', pinned);
  frame.src = src.href;
}
