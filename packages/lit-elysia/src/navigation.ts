import {render} from 'lit';
import type {Page} from './page.ts';
import {decode} from './serialize.ts';
import {DATA_HEADER, type PageData} from './shared.ts';

export type ClientRoutes = Record<
  string,
  () => Promise<{default: Page<unknown>}>
>;

/** The parts of the Navigation API the router uses. */
interface NavigateEvent extends Event {
  readonly canIntercept: boolean;
  readonly hashChange: boolean;
  readonly downloadRequest: string | null;
  readonly formData: FormData | null;
  readonly navigationType: 'push' | 'replace' | 'reload' | 'traverse';
  readonly destination: {readonly url: string};
  readonly signal: AbortSignal;
  intercept(options: {handler: () => Promise<void>}): void;
}

interface Navigation {
  addEventListener(
    type: 'navigate',
    listener: (event: NavigateEvent) => void
  ): void;
}

export const pageFor = (routes: ClientRoutes, route: string) => {
  const load = routes[route];
  if (!load) throw new Error(`[lit-elysia] no page for route ${route}`);
  return load;
};

/**
 * From here on the page is the router's: a navigation to another page of
 * the site fetches that page's data and renders it into the outlet, without
 * loading a document. Links, Back and Forward, and `location.assign` all
 * arrive as one `navigate` event, from inside shadow roots too.
 *
 * Without the Navigation API, every navigation stays a full page load. A
 * link with `data-reload` always is one.
 */
export const takeOver = (routes: ClientRoutes, outlet: HTMLElement): void => {
  const navigation = (window as {navigation?: Navigation}).navigation;
  if (!navigation) return;
  let reload = false;
  document.addEventListener(
    'click',
    (event) => {
      reload = event.composedPath().some(isReloadLink);
      // The click's navigation, if any, comes before this task ends.
      setTimeout(() => (reload = false));
    },
    {capture: true}
  );
  navigation.addEventListener('navigate', (event) => {
    if (reload || !routable(event)) return;
    event.intercept({
      handler: () => show(routes, outlet, event.destination.url, event.signal),
    });
  });
};

const isReloadLink = (target: EventTarget) =>
  target instanceof HTMLAnchorElement && target.hasAttribute('data-reload');

/** A navigation to another page of this site, which the router can render. */
const routable = (event: NavigateEvent) =>
  event.canIntercept && plain(event) && sameOrigin(event.destination.url);

/** Not a jump within the page, a download, a form post or a reload. */
const plain = (event: NavigateEvent) =>
  !event.hashChange &&
  event.downloadRequest === null &&
  event.formData === null &&
  event.navigationType !== 'reload';

const sameOrigin = (url: string) => new URL(url).origin === location.origin;

const show = async (
  routes: ClientRoutes,
  outlet: HTMLElement,
  url: string,
  signal: AbortSignal
) => {
  const next = await fetchPage(url, signal);
  if (signal.aborted) return;
  // Not one of the pages, or the server said something else (a 404, an
  // error): let the server show it, as a full load of the URL.
  if (!next) return location.reload();
  await renderPage(routes, outlet, next, signal);
};

const renderPage = async (
  routes: ClientRoutes,
  outlet: HTMLElement,
  next: PageData,
  signal: AbortSignal
) => {
  const page = (await pageFor(routes, next.route)()).default;
  if (signal.aborted) return;
  render(page.render(next.data), outlet);
  if (next.title !== undefined) document.title = next.title;
};

/** The page's data, with the URL it ended up at after any redirect. */
const fetchPage = async (
  url: string,
  signal: AbortSignal
): Promise<PageData | undefined> => {
  const response = await fetch(url, {
    headers: {[DATA_HEADER]: 'data'},
    signal,
  }).catch(() => undefined);
  if (response?.headers.get(DATA_HEADER) !== 'data') return undefined;
  if (response.redirected) history.replaceState(null, '', response.url);
  return decode<PageData>(await response.text());
};
