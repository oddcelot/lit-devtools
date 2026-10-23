/**
 * The page side of the live panel: the extension's page runtime
 * (`extension/src/page.ts`) in a frame of the panel page (`panel-page.ts`),
 * with its components loaded behind it. The difference from the extension
 * is the carrier: instead of a window relay to a content script, the panel
 * page hands this frame one end of a `MessageChannel`.
 *
 * The capture hooks go in before the components load, as on every page the
 * runtime serves: where a class is defined comes from its define call's
 * stack, and only defines after `installDefineSites()` are seen. So the
 * caller passes its components as a loader, and they are imported once the
 * hooks are in.
 */
import {installDefineSites} from '../../../lib/runtime/define-sites.js';
import {installTemplateSites} from '../../../lib/runtime/template-sites.js';
import {forgetOwnLit} from '../../../lib/runtime/own-lit.js';
import '../../../lib/runtime/timeline/install.js';
import '../../../lib/runtime/inspector/install.js';
import {initSourceOverlay} from '../../../lib/runtime/source-overlay/overlay-element.js';
import {pageChannel} from '../../../lib/runtime/page-channel.js';
import {joinPage} from '../../../lib/runtime/runtime-registry.js';
import {portPageTransport} from '../../../lib/devframe/port-link.js';
import {LIVE_PORT_MESSAGE, messagePortLike} from './message-port.js';

/** The scheme the panel page pinned, if any (see `panel-page.ts`). */
const pinnedScheme = (): 'light' | 'dark' | null => {
  const scheme = new URLSearchParams(location.search).get('scheme');
  return scheme === 'light' || scheme === 'dark' ? scheme : null;
};

/** The panel page handing this frame its end of the channel. */
const isPortMessage = (event: MessageEvent): boolean =>
  event.source === window.parent &&
  (event.data as {type?: unknown})?.type === LIVE_PORT_MESSAGE;

export const startDemoPage = async (
  loadComponents: () => Promise<unknown>
): Promise<void> => {
  joinPage('extension');
  const scheme = pinnedScheme();
  if (scheme !== null) document.documentElement.style.colorScheme = scheme;
  installDefineSites();
  installTemplateSites();
  forgetOwnLit();

  // The panel page posts the port once this frame has loaded; the runtime
  // announces itself on attach, so the panel sees the page from then on.
  window.addEventListener('message', (event: MessageEvent) => {
    const port = isPortMessage(event) ? event.ports[0] : undefined;
    if (port !== undefined) {
      pageChannel.attach(portPageTransport(messagePortLike(port)));
    }
  });

  // The picker reports a pick on the page channel, and the panel beside this
  // frame takes it, as in the extension.
  initSourceOverlay({hosts: 'lit'});

  await loadComponents();
};
