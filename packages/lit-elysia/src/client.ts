// Lit's hydrate support is loaded first by the generated client entry,
// from hydrate-support.ts: it must come before Lit itself.
import {hydrate} from '@lit-labs/ssr-client';
import {compose} from './compose.ts';
import {takeOver} from './navigation.ts';
import {configurePending, type PendingOptions} from './pending.ts';
import {enablePrefetch} from './prefetch.ts';
import {enableInvalidate} from './revalidate.ts';
import {createReader, type Reader} from './serialize.ts';
import {OUTLET_ID, QUEUE, type Payload} from './shared.ts';
import {
  remember,
  show,
  shownPage,
  usesFile,
  viewOf,
  type Site,
} from './site.ts';

export {NAVIGATED, NAVIGATING} from './progress.ts';

/**
 * Hydrates the page the server rendered: the same templates with the same
 * data, so Lit adopts the DOM it finds instead of building it again. Then
 * the router takes over the navigations that follow.
 *
 * It starts as soon as the page's first data record is in, which the server
 * sends right after the page, so a page still streaming its deferred data
 * hydrates without waiting for it. The page modules, and the components
 * they import, load after this one.
 */
export const boot = async (
  site: Site,
  options: {pending?: Partial<PendingOptions>} = {}
): Promise<void> => {
  configurePending(options.pending ?? {});
  const queue = await firstRecord();
  const outlet = document.getElementById(OUTLET_ID);
  if (!outlet) return;
  const reader = createReader();
  const payload = reader.read<Payload>(queue[0]!);
  follow(queue, reader);
  hydrate(compose(await viewOf(site, payload.route), payload), outlet);
  // After the elements' first updates, which hydrate against the server's
  // HTML: from here on, styles they write get the nonce.
  setTimeout(useCspNonce);
  remember(payload);
  takeOver(site, outlet);
  enableInvalidate(site, outlet);
  enablePrefetch(site);
};

/**
 * Lit's `litNonce`, from the document's csp-nonce meta: Lit's fallback
 * styles take it, and so do components that write a <style> of their own,
 * as Web Awesome's wa-page does when it renders again in the browser.
 */
const useCspNonce = () => {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[property="csp-nonce"]'
  );
  if (meta?.nonce) (globalThis as {litNonce?: string}).litNonce = meta.nonce;
};

type Queue = object[];

const queueOf = (): Queue =>
  ((globalThis as Record<string, unknown>)[QUEUE] ??= []) as Queue;

/** The queue, once the record that follows the page is on it. */
const firstRecord = (): Promise<Queue> => {
  const queue = queueOf();
  if (queue.length) return Promise.resolve(queue);
  return new Promise((resolve) => {
    queue.push = (...items) => {
      const length = Array.prototype.push.apply(queue, items);
      resolve(queue);
      return length;
    };
  });
};

/** Reads the records queued after the first, and each one pushed later. */
const follow = (queue: Queue, reader: Reader) => {
  for (const record of queue.slice(1)) reader.read(record);
  queue.push = (...items) => {
    for (const record of items) reader.read(record);
    return queue.length;
  };
};

/**
 * A page or layout module, edited in dev: the router takes the new one from
 * now on, and when the page on screen renders with it, it renders again
 * with the data it has. The Lit plugin keeps the DOM of the templates that
 * didn't change, so the elements in the page keep their state.
 */
export const hotModule = async (
  site: Site,
  file: string,
  module: {default: unknown}
): Promise<void> => {
  site.files[file] = () => Promise.resolve(module);
  const shown = shownPage();
  const outlet = document.getElementById(OUTLET_ID);
  if (!shown || !outlet || !usesFile(site, shown.route, file)) return;
  const view = await viewOf(site, shown.route);
  keepChildState();
  show(outlet, view, shown);
};

/**
 * An edited template is a new template to Lit, which clones fresh DOM for
 * it, components included. The Lit plugin's patch runtime pairs each
 * element dropped in the next moment with its replacement and carries the
 * state over, as it does for a component's own template; this opens that
 * window. Its state sits under a global key, as no public hook exists yet.
 */
const keepChildState = () => {
  const patch = (globalThis as Record<symbol, unknown>)[PATCH] as
    | {childState?: {open(): void}}
    | undefined;
  patch?.childState?.open();
};

const PATCH = Symbol.for('@oddsquad/vite-plugin-lit#patch');
