/**
 * The live panel's two documents, the panel page and the demo frame inside
 * it, talk over a `MessageChannel`. Its ports become the {@link PortLike}
 * the extension's port link takes, so the panel side runs
 * `createLocalLitHost()` and the page side `portPageTransport()` exactly as
 * the extension does, with a channel in place of `chrome.runtime.Port`.
 */
import type {PortLike} from '../../../lib/devframe/port-message.js';

/** The `type` of the message that hands the demo frame its port. */
export const LIVE_PORT_MESSAGE = 'lit-live-panel:port';

/** `port` as a {@link PortLike}. Starts it, since nothing else will. */
export const messagePortLike = (port: MessagePort): PortLike => {
  port.start();
  return {
    postMessage: (message) => port.postMessage(message),
    onMessage: {
      addListener: (callback) =>
        port.addEventListener('message', (event) => callback(event.data)),
    },
  };
};
