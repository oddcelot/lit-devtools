/**
 * The panel's single connection to the node side.
 *
 * The panel is served by the devframe host as a static SPA, so
 * `connectDevframe()` discovers the node side from the page URL — it reads
 * `__connection.json` next to `document.baseURI`, then dials the host's
 * WebSocket and completes the trust handshake. Every view shares one
 * connection through {@link litRpc}; opening a second would mean a second
 * socket and a second handshake.
 *
 * Replaces the old transport, where each view opened its own `EventSource`
 * against `/__lit-devtools-events` and POSTed to bespoke endpoints.
 */

import {connectDevframe, getDevframeConnection} from 'devframe/client';
import type {
  DevframeRpcClient,
  DevframeScopedClientContext,
} from 'devframe/client';
import type {SettingsForNamespace} from 'devframe';
import {LIT_DEVFRAME_ID} from '../lib/devframe/protocol.js';
import {STANDALONE_PANEL_BASE} from '../lib/devframe/standalone-panel.js';
import type {LitGetMetaResult} from '../lib/devframe/protocol.js';
import {createSettingsGate} from './settings-sync.js';

/**
 * The `lit:`-scoped client. The second parameter is what makes
 * `client.settings` typed against `DevframeSettingsRegistry.lit` (see
 * `lib/devframe/protocol.ts`) instead of a bare `Record<string, any>` —
 * `client.scope()` infers it, but this alias has to say so.
 */
export type LitClient = DevframeScopedClientContext<
  typeof LIT_DEVFRAME_ID,
  SettingsForNamespace<typeof LIT_DEVFRAME_ID>
>;

let connecting: Promise<LitClient> | undefined;
let local = false;

/**
 * Supply the client instead of connecting: for a host page that runs the
 * devframe in-process (the browser extension, see
 * `lib/devframe/local-host.ts`), where there is no `__connection.json` to
 * discover and no server to trust. Takes the unscoped client; the panel
 * scopes it to `lit:` itself.
 *
 * Must run before anything calls {@link litRpc}: the panel connects once, so
 * a client supplied afterwards would never be used. Throws if it is too late.
 */
export const useLocalClient = (
  client: Pick<DevframeRpcClient, 'scope'>
): void => {
  if (connecting !== undefined) {
    throw new Error(
      '[lit-devtools] useLocalClient() must run before the panel connects'
    );
  }
  connecting = Promise.resolve(client.scope(LIT_DEVFRAME_ID));
  local = true;
};

/**
 * Whether the panel was handed a client with {@link useLocalClient}: it
 * reaches its page over a port of its own, as Lit Inspector's tab and the
 * docs' live panel do, rather than through a dev server.
 */
export const hasLocalClient = (): boolean => local;

/**
 * Run with no host at all: for a page that shows panel views over recorded
 * data (the docs). Every {@link litRpc} rejects at once, without looking for
 * a server or asking for a code, so views settle on what they show without
 * one: no editor links, nothing to command.
 *
 * Must run before anything calls {@link litRpc}, like {@link useLocalClient}.
 */
export const useNoHost = (): void => {
  if (connecting !== undefined) {
    throw new Error(
      '[lit-devtools] useNoHost() must run before the panel connects'
    );
  }
  connecting = Promise.reject(
    new Error('[lit-devtools] no host: these views show recorded data')
  );
  // Callers handle the rejection; this keeps it from reporting as unhandled.
  connecting.catch(() => {});
};

/** Long enough to type a code from the terminal into the frame's host. */
const AUTH_TIMEOUT_MS = 10 * 60_000;

/**
 * The panel the plugin serves at `/__lit/`, in a frame: Astro's dev toolbar
 * embeds it. A hub-mounted panel lives under the hub's path, and the hub
 * handles trust for it.
 */
const framedWithoutHub = (): boolean =>
  window.self !== window.top &&
  new URL(document.baseURI).pathname === STANDALONE_PANEL_BASE;

/**
 * devframe asks for its one-time code with `prompt()` only in a top-level
 * page, and a framed panel never gets as far as the terminal printing one.
 * So once a stored token has had a moment to be accepted, ask the server to
 * print a code: the frame's host asks for it and hands it back in the URL
 * fragment (see `lib/astro/toolbar-app.ts`). A code entered in a top-level
 * panel tab trusts this one too, over devframe's channel between tabs.
 */
const requestCodeIfUntrusted = async (
  client: Pick<DevframeRpcClient, 'ensureTrusted' | 'requestAuthCode'>
): Promise<void> => {
  const trusted = await client.ensureTrusted(1_500).catch(() => false);
  if (!trusted) await client.requestAuthCode().catch(() => {});
};

/**
 * The shared, `lit:`-scoped RPC client. Connects on first call; every later
 * call awaits the same connection.
 *
 * Rejects if the handshake never completes (the host is gone, or trust was
 * denied). Callers render an error state rather than retrying: the panel is
 * an iframe the developer can reload.
 */
export const litRpc = (): Promise<LitClient> =>
  (connecting ??= (async () => {
    const client = await connectDevframe();
    if (framedWithoutHub()) await requestCodeIfUntrusted(client);
    // The host mints a token per browser; until it does, calls would fail
    // with an auth error rather than waiting.
    await client.ensureTrusted(AUTH_TIMEOUT_MS);
    return client.scope(LIT_DEVFRAME_ID);
  })());

/**
 * {@link litRpc} once the durable settings store has synced with the server.
 * Every read and write of `settings.global` goes through this, never through
 * {@link litRpc} directly: a write that beats the first sync is overwritten by
 * it, and the server's store is reset with it (see `settings-sync.ts`).
 */
export const litSettingsRpc: () => Promise<LitClient> =
  createSettingsGate(litRpc);

/**
 * Whether this panel is a frozen snapshot rather than a live session.
 *
 * A static deploy answers queries out of a baked RPC dump and has no server
 * behind it, so anything that would *command* the page — refreshing the tree,
 * picking an element, toggling recording — has nothing to reach and is not
 * in the dump at all. Views check this to hide those affordances instead of
 * offering buttons that can only fail.
 *
 * Reads the already-resolved connection, so it is safe to call synchronously
 * during render once {@link litRpc} has settled; before that it reports
 * `false`, which is the right default for the live case.
 */
export const isSnapshot = (): boolean =>
  getDevframeConnection()?.connectionMeta.backend === 'static';

/** One-shot metadata: version, layer list, resolved settings, stream address. */
export const getMeta = async (): Promise<LitGetMetaResult> => {
  const rpc = await litRpc();
  return rpc.rpc.call('get-meta');
};

/**
 * Formats a connection failure for display. `DevframeConnectionError` carries
 * a `type` of `'connection' | 'auth' | 'timeout'`; anything else is shown as
 * its message.
 */
export const describeError = (error: unknown): string => {
  if (error && typeof error === 'object' && 'type' in error) {
    const type = (error as {type: unknown}).type;
    if (type === 'auth') {
      return 'DevTools denied this panel access. Approve the connection in your terminal, then reload.';
    }
    if (type === 'timeout') {
      return 'The Lit plugin did not answer in time. Is the dev server still running?';
    }
    if (type === 'connection') {
      return 'Lost the connection to the dev server. Reload the panel once it is back.';
    }
  }
  return error instanceof Error ? error.message : String(error);
};
