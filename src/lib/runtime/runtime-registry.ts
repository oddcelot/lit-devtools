/**
 * Which Lit DevTools runtimes are on this page.
 *
 * Three can load one: the plugin's, served through Vite; the Lit Inspector
 * extension's, injected at `document_start` on a site the user enabled; and
 * the `lit-devtools dev` script. Each brings its own copy of the runtime
 * modules, but they share every page global keyed by `Symbol.for`, the page
 * channel among them, so two on one page step on each other: one carrier
 * wins, two inspectors answer every command, two pickers listen to one
 * toggle. That happens when the extension is enabled for a dev server the
 * plugin already runs on.
 *
 * Each runtime joins here, under the same global, before it installs. A copy
 * of a module loaded twice by one runtime joins under the same kind and
 * counts once. A second kind is warned about once in the console and
 * reported to the panels (the inspector's `ready`).
 *
 * @module
 */

import {
  PAGE_RUNTIME_NAMES,
  type PageRuntimeKind,
} from '../../types/inspector.js';

export type {PageRuntimeKind};

interface Registry {
  kinds: PageRuntimeKind[];
  listeners: Array<() => void>;
  warned: boolean;
}

const KEY = Symbol.for('@oddsquad/vite-plugin-lit#runtimes');

const registry = (): Registry => {
  const g = globalThis as unknown as Record<symbol, Registry | undefined>;
  return (g[KEY] ??= {kinds: [], listeners: [], warned: false});
};

/** The runtimes on this page, in the order they joined. */
export const runtimesOnPage = (): readonly PageRuntimeKind[] =>
  registry().kinds;

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
  if (r.kinds.length > 1 && !r.warned) {
    r.warned = true;
    const names = r.kinds.map((k) => PAGE_RUNTIME_NAMES[k]);
    console.warn(
      `[lit-plugin] Two Lit DevTools runtimes are on this page: ` +
        `${names.join(' and ')}. They share one channel, so the element ` +
        `picker and the panels' data can break. Keep one: on a dev server ` +
        `that runs the plugin, turn the extension off for the site.`
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
