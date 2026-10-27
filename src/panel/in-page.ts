/**
 * The panel end of the direct page channel (see `types/in-page.ts`).
 *
 * Connected lazily, on first use, rather than at panel boot: connecting posts
 * handshake hellos at every window a page script could live in, and a panel
 * whose user never opens the Components tab has no reason to do that.
 *
 * There is deliberately no error path. The channel is an optimisation over a
 * working RPC route, and it legitimately never connects when the panel is
 * opened as its own tab (no ancestor page to handshake with). Callers check
 * {@link inPageConnected} and fall back.
 */

import {connectPanelChannel} from 'devframe/in-page-channel';
import type {PanelChannel} from 'devframe/in-page-channel';
import {LIT_IN_PAGE_CHANNEL, type LitInPageProtocol} from '../types/in-page.js';
import {hasLocalClient} from './client.js';

let channel: PanelChannel<LitInPageProtocol> | undefined;

/**
 * Whether no window a page script could live in is in reach: the panel is
 * not framed and was not opened by another window, as in a tab of its own
 * or the Firefox extension's DevTools panel. devframe looks no further, so
 * a channel would only buffer, and warn that it does.
 *
 * A panel with a local client counts as alone too. Its page is the one at
 * the other end of its own port, which is already direct, and the windows
 * around it are someone else's: the docs' live panel sits in a docs page
 * that runs a runtime of its own in dev, or Lit Inspector's on a site it is
 * enabled for. That runtime answered the handshake, and every highlight and
 * anatomy command went to a page without the selected element.
 */
const alone = (): boolean => {
  if (hasLocalClient()) return true;
  try {
    return window.parent === window && window.opener == null;
  } catch {
    return false;
  }
};

/** The shared channel endpoint, created on first call. */
export const inPageChannel = (): PanelChannel<LitInPageProtocol> =>
  (channel ??= connectPanelChannel<LitInPageProtocol>({
    name: LIT_IN_PAGE_CHANNEL,
    functions: {},
  }));

/**
 * Whether the fast path is usable right now. A plain status check, not a
 * promise: callers are on an interaction path (a pointer move over the tree)
 * and must decide synchronously which transport to use.
 */
export const inPageConnected = (): boolean =>
  !alone() && inPageChannel().status === 'connected';
