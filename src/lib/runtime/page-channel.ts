/**
 * The page runtime's one seam to whatever carries its traffic to the DevTools
 * server. Every `lit:*` message the runtime sends or receives (timeline
 * events, inspector data and commands, settings overrides, HMR-incompatibility
 * notices) goes through {@link pageChannel}, never through `import.meta.hot`
 * directly, so the carrier can be swapped without touching a call site.
 *
 * Carriers: Vite's HMR channel ({@link fromViteHot}), a dev server's RPC
 * (`rpc-transport.ts`), the extension's window relay (`window-transport.ts`).
 * More than one can be attached at once, when the extension's panel and the
 * dev server's both watch a page; each is attached with
 * {@link PageChannel.attach}, and listeners registered earlier bind to it.
 *
 * Vite's own lifecycle events (`vite:afterUpdate`, `vite:beforeFullReload`,
 * `vite:ws:*`) are not part of this channel: they describe the HMR connection
 * itself, so the sites that care still read `import.meta.hot` for those.
 */

export type {PageTransport, ViteHotLike} from './page-transport.js';
import {joinPage} from './runtime-registry.js';
import {
  fromViteHot,
  type PageTransport,
  type ViteHotLike,
} from './page-transport.js';

export interface PageChannel extends PageTransport {
  /** Whether a carrier is attached. Sends made before one is are dropped. */
  readonly attached: boolean;
  /** The carriers in use, so a replacement can hand the channel back. */
  readonly carriers: readonly PageTransport[];
  /**
   * Add `transport` as a carrier, or announce again on one already added.
   * Sends go to every carrier and listeners hear each, so two peers (the
   * extension's panel and the dev server's) can share one runtime. Listeners
   * already registered are bound to it, and `onAttach` callbacks run so their
   * owners can announce themselves to the new peer.
   */
  attach(transport: PageTransport): void;
  /** Remove a carrier `attach` added; its listeners are unbound. */
  detach(transport: PageTransport): void;
  /**
   * Add Vite's HMR client as a carrier, once per page whichever module asks
   * first, and count the Vite-served runtime among the page's
   * (`runtime-registry.ts`).
   */
  useViteHot(hot: ViteHotLike): void;
  /** Run `callback` on every later {@link attach}. Not run for past ones. */
  onAttach(callback: () => void): void;
}

const createPageChannel = (): PageChannel => {
  const carriers: PageTransport[] = [];
  let viteCarrier = false;
  const listeners: Array<{
    channel: string;
    handler: (data: unknown) => void;
    offs: Map<PageTransport, () => void>;
  }> = [];
  const attachCallbacks: Array<() => void> = [];

  const bind = (
    entry: (typeof listeners)[number],
    carrier: PageTransport
  ): void => {
    entry.offs.get(carrier)?.();
    entry.offs.set(carrier, carrier.on(entry.channel, entry.handler));
  };

  const channel: PageChannel = {
    get attached() {
      return carriers.length > 0;
    },
    get carriers() {
      return [...carriers];
    },
    send(name, data) {
      for (const carrier of carriers) carrier.send(name, data);
    },
    on(name, handler) {
      const entry: (typeof listeners)[number] = {
        channel: name,
        handler,
        offs: new Map(),
      };
      listeners.push(entry);
      for (const carrier of carriers) bind(entry, carrier);
      return () => {
        for (const off of entry.offs.values()) off();
        const index = listeners.indexOf(entry);
        if (index !== -1) listeners.splice(index, 1);
      };
    },
    attach(next) {
      if (!carriers.includes(next)) carriers.push(next);
      for (const entry of listeners) bind(entry, next);
      for (const callback of attachCallbacks) {
        try {
          callback();
        } catch {
          // One owner failing to announce must not strand the rest.
        }
      }
    },
    detach(carrier) {
      const index = carriers.indexOf(carrier);
      if (index === -1) return;
      carriers.splice(index, 1);
      for (const entry of listeners) {
        entry.offs.get(carrier)?.();
        entry.offs.delete(carrier);
      }
    },
    useViteHot(hot) {
      // Every module of the Vite-served runtime comes through here, each
      // with its own `import.meta.hot` on the one socket: one carrier.
      joinPage('vite');
      if (viteCarrier) return;
      viteCarrier = true;
      channel.attach(fromViteHot(hot));
    },
    onAttach(callback) {
      attachCallbacks.push(callback);
    },
  };
  return channel;
};

// One channel per page even if this module is loaded twice (for instance once
// through Vite's dependency optimizer and once directly), like the patch state.
const CHANNEL_KEY = Symbol.for('@oddsquad/vite-plugin-lit#page-channel');

const shared = globalThis as unknown as Record<symbol, PageChannel | undefined>;

export const pageChannel: PageChannel = (shared[CHANNEL_KEY] ??=
  createPageChannel());
