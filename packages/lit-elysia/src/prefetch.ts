import {lastChanged, requestPage, type Fetched} from './fetch-page.ts';
import {matchRoute, viewOf, type Site} from './site.ts';

/** How long prefetched data stays good, unless data changes first. */
const LIFETIME = 10_000;
/** How long the pointer rests on a link before it counts as intent. */
const HOVER = 60;

interface Entry {
  at: number;
  data: Promise<Fetched | undefined>;
  /** Handed to a navigation: kept only so the link isn't fetched again. */
  taken?: boolean;
}

const prefetched = new Map<string, Entry>();

const keyOf = (url: string) => url.split('#')[0]!;

/**
 * The data prefetched for `url`, once: the router takes it in place of a
 * request of its own. Nothing when it is older than its lifetime, or than
 * the last change to data.
 */
export const takePrefetched = (
  url: string
): Promise<Fetched | undefined> | undefined => {
  const entry = prefetched.get(keyOf(url));
  if (!entry || entry.taken || !fresh(entry.at)) return undefined;
  // Kept, marked: the focus a click gives its link would prefetch it again.
  entry.taken = true;
  return entry.data;
};

const fresh = (at: number) => Date.now() - at < LIFETIME && at > lastChanged();

/**
 * Fetches ahead what a link will need, when the pointer rests on it, it
 * gets focus or a finger lands on it: the modules of the page it leads to,
 * always, as code has no effect on the server; its data too, inside an
 * element with `data-prefetch`, as that runs its loads. A link can opt out
 * with `data-prefetch="off"`.
 */
export const enablePrefetch = (site: Site): void => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const intent = (event: Event, delay: number) => {
    const target = targetOf(event);
    clearTimeout(timer);
    if (target) timer = setTimeout(() => prefetch(site, target), delay);
  };
  const options = {capture: true, passive: true};
  document.addEventListener(
    'pointerover',
    (event) => intent(event, HOVER),
    options
  );
  document.addEventListener('pointerout', () => clearTimeout(timer), options);
  // A press is the click itself: the router fetches, a late prefetch would
  // only fetch again.
  document.addEventListener('pointerdown', () => clearTimeout(timer), options);
  document.addEventListener('focusin', (event) => intent(event, 0), options);
  document.addEventListener('touchstart', (event) => intent(event, 0), options);
};

interface Target {
  url: URL;
  data: boolean;
}

/** The link an event happened on, when the router would follow it. */
const targetOf = (event: Event): Target | undefined => {
  const path = event.composedPath();
  const link = path.find(
    (node): node is HTMLAnchorElement =>
      node instanceof HTMLAnchorElement && Boolean(node.href)
  );
  if (!link || !followable(link)) return undefined;
  return {
    url: new URL(link.href),
    data: wantsData(path),
  };
};

/**
 * Whether the nearest `data-prefetch` around the link asks for data: an
 * element can turn it on for everything inside, and a link inside can turn
 * it off for itself with `data-prefetch="off"`.
 */
const wantsData = (path: EventTarget[]) => {
  const nearest = path.find(
    (node): node is Element =>
      node instanceof Element && node.hasAttribute('data-prefetch')
  );
  return (
    nearest !== undefined && nearest.getAttribute('data-prefetch') !== 'off'
  );
};

const followable = (link: HTMLAnchorElement) =>
  new URL(link.href).origin === location.origin && inPlace(link);

/** Opens in this tab, and isn't a download or a full load. */
const inPlace = (link: HTMLAnchorElement) =>
  !link.hasAttribute('download') &&
  !link.hasAttribute('data-reload') &&
  ['', '_self'].includes(link.target);

const prefetch = (site: Site, {url, data}: Target) => {
  const route = matchRoute(site, url.pathname);
  if (route) void viewOf(site, route).catch(() => undefined);
  if (data && 'navigation' in window) prefetchData(url.href);
};

/** The page's data, unless a fresh copy is already on its way. */
const prefetchData = (url: string) => {
  const entry = prefetched.get(keyOf(url));
  if (entry && fresh(entry.at)) return;
  prefetched.set(keyOf(url), {
    at: Date.now(),
    data: requestPage(url, new AbortController().signal, {}),
  });
};
