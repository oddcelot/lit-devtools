/* @ts-self-types="./rpc-transport.d.ts" */
/**
 * Carries the page channel over devframe RPC to a standalone
 * `lit-devtools dev` server, so a page that is not served by a DevTools-enabled
 * Vite dev server can still feed the panel. The server half is
 * `devframe/rpc-source.ts`.
 *
 * Opt-in and explicit: nothing connects until {@link connectToDevServer} is
 * called, and `devframe/client` is only imported then, so a page that never
 * asks pays nothing.
 *
 * @module
 */

import {
  LIT_DEVFRAME_ID,
  RPC_PAGE_RECEIVE,
  RPC_PAGE_SEND,
} from '../devframe/protocol.js';
import type {ConnectionMeta} from 'devframe';
import {channelListeners} from './channel-listeners.js';
import {pageChannel} from './page-channel.js';
import type {PageTransport} from './page-channel.js';

/** The slice of a scoped devframe client the transport uses. */
export interface PageRpc {
  /** Fires a devframe event on the server, without waiting for a reply. */
  callEvent(method: string, ...args: unknown[]): void;
  /** Registers a handler for an event the server sends to this page. */
  register(fn: {
    name: string;
    type: 'event';
    handler: (...args: any[]) => void;
  }): void;
}

/**
 * A {@link PageTransport} over a devframe RPC client: `send` becomes a
 * `page-send` event, and `page-receive` events fan out to the listeners
 * registered with `on`.
 */
export const createRpcTransport = (rpc: PageRpc): PageTransport => {
  const listeners = channelListeners();
  rpc.register({
    name: RPC_PAGE_RECEIVE,
    type: 'event',
    handler: (channel: string, data?: unknown) => listeners.emit(channel, data),
  });
  return {
    send(channel, data) {
      rpc.callEvent(RPC_PAGE_SEND, channel, data);
    },
    on: listeners.on,
  };
};

/** Options for {@link connectToDevServer}. */
export interface ConnectOptions {
  /**
   * A bearer token the server already trusts. Without one the client falls
   * back to devframe's own flow (a stored token, a magic-link code in the URL,
   * or a prompt for the one-time code the server prints) unless the server was
   * started with `--no-auth`.
   */
  authToken?: string;
  /**
   * The server's connection descriptor (what it serves at
   * `<url>/__connection.json`). Passing it skips that fetch, which is the
   * step a cross-origin page cannot make: the server sends no CORS headers,
   * and a classic script tag is exempt from them where `fetch` is not.
   */
  connectionMeta?: ConnectionMeta;
  /**
   * Called when the page has to ask for the one-time code itself. devframe
   * prompts for it only in a top-level window; in a frame (a cloud IDE's
   * preview, an embedded demo) it waits for a trust that never comes. With
   * this set, a framed page that holds no trusted token asks the server to
   * print a code and hands the caller a way to send it back.
   */
  onAuthRequired?: (auth: CodeRequest) => void;
}

/** What {@link ConnectOptions.onAuthRequired} gets. */
export interface CodeRequest {
  /** Sends a code; resolves `true` once the server trusts the page. */
  submit(code: string): Promise<boolean>;
  /** Asks the server to print a fresh code, for one that expired. */
  reissue(): Promise<void>;
}

/** devframe's own prompt runs only here; see `onAuthRequired`. */
const topLevel = (): boolean => {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
};

/**
 * Point this page's runtime at a standalone `lit-devtools dev` server.
 *
 * Resolves once the connection is trusted, after which the tree, inspector
 * and timeline traffic that used to go to this page's own Vite server goes to
 * `url` instead (the runtime announces itself again so the server can replay
 * recording state). Returns a function that disconnects and hands the channel
 * back to the carriers it replaced.
 *
 * The page's origin must be allowed to reach `url`; this does not set up
 * cross-origin access.
 *
 * @param url Origin of the dev server, e.g. `http://localhost:5180/`.
 */
export const connectToDevServer = async (
  url: string,
  options: ConnectOptions = {}
): Promise<() => void> => {
  const {getDevframeRpcClient} = await import('devframe/client');
  const client = await getDevframeRpcClient({
    baseURL: url,
    authToken: options.authToken,
    connectionMeta: options.connectionMeta,
  });
  if (options.onAuthRequired !== undefined && !topLevel()) {
    // A token stored by an earlier visit is tried as the client starts; give
    // it a moment before asking for a code.
    const trusted = await client.ensureTrusted(2000).catch(() => false);
    if (!trusted) {
      await client.requestAuthCode().catch(() => {});
      options.onAuthRequired({
        submit: (code) => client.requestTrustWithCode(code.trim()),
        reissue: () => client.requestAuthCode({reissue: true}),
      });
      // No timeout: the reader types at their own pace.
      await client.ensureTrusted(0);
    }
  } else {
    await client.ensureTrusted();
  }

  const replaced = pageChannel.carriers;
  for (const previous of replaced) pageChannel.detach(previous);
  const carrier = createRpcTransport(client.scope(LIT_DEVFRAME_ID).rpc);
  pageChannel.attach(carrier);

  return () => {
    client.close?.();
    pageChannel.detach(carrier);
    for (const previous of replaced) pageChannel.attach(previous);
  };
};
