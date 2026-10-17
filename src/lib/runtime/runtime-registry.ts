/**
 * Which Lit DevTools runtimes are on this page, and which one serves it.
 *
 * Three can load one: the plugin's, served through Vite; the Lit Inspector
 * extension's, injected at `document_start` on a site the user enabled; and
 * the `lit-devtools dev` script. Each brings its own copy of the runtime
 * modules, but they share every page global keyed by `Symbol.for`, the page
 * channel among them. Two installed side by side step on each other: two
 * inspectors answer every command, two pickers fight over one element name
 * and one toggle. That happens when the extension is enabled for a dev
 * server the plugin already runs on.
 *
 * So the first runtime to join serves the page, and a later one only adds
 * its carrier to the shared channel: the Vite-served modules check
 * {@link yieldsToAnotherRuntime} before they install. The extension is always
 * first, injected ahead of the page's scripts.
 *
 * Each runtime joins under its kind, the Vite-served one from every module
 * (`pageChannel.useViteHot()`), the others from their entry; joining again
 * under a kind counts once. A second kind is noted once in the console and
 * reported to the panels (the inspector's `ready`).
 *
 * @module
 */

import {
  PAGE_RUNTIME_NAMES,
  sentenceStart,
  type PageRuntimeKind,
} from '../../types/inspector.js';

export type {PageRuntimeKind};

interface Registry {
  kinds: PageRuntimeKind[];
  listeners: Array<() => void>;
  noted: boolean;
}

const KEY = Symbol.for('@oddsquad/vite-plugin-lit#runtimes');

const registry = (): Registry => {
  const g = globalThis as unknown as Record<symbol, Registry | undefined>;
  return (g[KEY] ??= {kinds: [], listeners: [], noted: false});
};

/** The runtimes on this page, in the order they joined; the first serves it. */
export const runtimesOnPage = (): readonly PageRuntimeKind[] =>
  registry().kinds;

/**
 * Whether this copy of a runtime module should install nothing: it is the
 * Vite-served runtime's, which `import.meta.hot` gives away (pass it in),
 * and another runtime joined the page first. It still adds its carrier.
 * The extension's and the script's copies have no `hot` and always install.
 */
export const yieldsToAnotherRuntime = (hot: unknown): boolean => {
  const [first] = registry().kinds;
  return hot !== undefined && first !== undefined && first !== 'vite';
};

/**
 * Run `callback` whenever another runtime joins the page. Every copy of the
 * runtime hears it, the one that joined first included.
 */
export const onRuntimeJoined = (callback: () => void): void => {
  registry().listeners.push(callback);
};

/** Add `kind` to the page's runtimes. Joining again under a kind is a no-op. */
export const joinPage = (kind: PageRuntimeKind): void => {
  const r = registry();
  if (r.kinds.includes(kind)) return;
  r.kinds.push(kind);
  if (r.kinds.length > 1 && !r.noted) {
    r.noted = true;
    const [first, ...later] = r.kinds.map((k) => PAGE_RUNTIME_NAMES[k]);
    console.info(
      `[lit-plugin] ${sentenceStart(first!)} already serves this page, so ` +
        `${later.join(' and ')} shares its runtime instead of loading a ` +
        `second one.`
    );
  }
  for (const listener of r.listeners) {
    try {
      listener();
    } catch {
      // One copy failing to react must not stop the rest.
    }
  }
};
