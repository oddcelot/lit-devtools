import {whileLoading} from './progress.ts';
import {createReader} from './serialize.ts';
import {DATA_HEADER, type PageData} from './shared.ts';
import {show, viewOf, type Site} from './site.ts';

type History = 'push' | 'replace';

/** The parts of the Navigation API the router uses. */
interface NavigateEvent extends Event {
  readonly canIntercept: boolean;
  readonly hashChange: boolean;
  readonly downloadRequest: string | null;
  readonly formData: FormData | null;
  readonly navigationType: History | 'reload' | 'traverse';
  readonly destination: {readonly url: string};
  readonly signal: AbortSignal;
  readonly info: unknown;
  intercept(options: {handler: () => Promise<void>}): void;
}

interface Navigation {
  addEventListener(
    type: 'navigate',
    listener: (event: NavigateEvent) => void
  ): void;
  navigate(url: string, options: {history: History; info: Fetched}): unknown;
}

/** A page's data, fetched before its navigation commits. */
interface Fetched {
  /** Where the page is, after any redirect. */
  url: string;
  page: PageData;
}

/**
 * From here on the page is the router's: a navigation to another page of
 * the site fetches that page's data and renders it into the outlet, without
 * loading a document. Links, Back and Forward, and `location.assign` all
 * arrive as one `navigate` event, from inside shadow roots too.
 *
 * Without the Navigation API, every navigation stays a full page load. A
 * link with `data-reload` always is one.
 */
export const takeOver = (site: Site, outlet: HTMLElement): void => {
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
    if (reload || !routable(event) || letThrough(event.destination.url)) return;
    dispatch(event, navigation, site, outlet);
  });
};

const dispatch = (
  event: NavigateEvent,
  navigation: Navigation,
  site: Site,
  outlet: HTMLElement
) => {
  const url = event.destination.url;
  const fetched = fetchedFor(event.info, url);
  if (fetched) {
    intercept(event, () =>
      renderPage(site, outlet, fetched.page, event.signal)
    );
  } else if (event.formData) {
    // A form post: the router posts it, then renders what comes back.
    event.preventDefault();
    void submitFirst(navigation, url, event.formData);
  } else if (event.navigationType === 'traverse') {
    intercept(event, () => revisit(site, outlet, url, event.signal));
  } else {
    // Not committed yet: the URL changes only once the data is here.
    event.preventDefault();
    void fetchFirst(navigation, url, event.navigationType as History);
  }
};

const intercept = (event: NavigateEvent, handler: () => Promise<void>) =>
  event.intercept({handler});

const fetchedFor = (info: unknown, url: string) =>
  (info as Fetched | undefined)?.url === url ? (info as Fetched) : undefined;

const isReloadLink = (target: EventTarget) =>
  target instanceof HTMLAnchorElement && target.hasAttribute('data-reload');

/** A navigation to another page of this site, which the router can render. */
const routable = (event: NavigateEvent) =>
  event.canIntercept && plain(event) && sameOrigin(event.destination.url);

/** Not a jump within the page, a download or a reload. */
const plain = (event: NavigateEvent) =>
  !event.hashChange &&
  event.downloadRequest === null &&
  event.navigationType !== 'reload';

const sameOrigin = (url: string) => new URL(url).origin === location.origin;

/** A URL on its way to a full load, which the router must not catch. */
let passing: string | undefined;

const letThrough = (url: string) => {
  const pass = url === passing;
  passing = undefined;
  return pass;
};

let pending: AbortController | undefined;

/**
 * Fetches the page before its navigation commits, then navigates again
 * with the data in hand. Anything that isn't page data, such as a 404,
 * becomes the full load it would have been without the router.
 *
 * Deciding first matters: once the router has committed an entry, the
 * entries it made stay tied to this document in the history, even after a
 * reload or a replace. A server's page loaded into one of them left Back
 * changing the address and nothing else, with no router there to render.
 */
const fetchFirst = async (
  navigation: Navigation,
  url: string,
  history: History
) => {
  pending?.abort();
  const controller = (pending = new AbortController());
  const fetched = await fetchPage(url, controller.signal);
  if (controller.signal.aborted) return;
  if (!fetched) return loadDocument(url, history);
  navigation.navigate(fetched.url, {history, info: fetched});
};

/**
 * Posts a form, then renders the page the server answered with: the one a
 * redirect named, as a new entry, or this page again, with the action's
 * result as its `form`, in place of the current entry.
 */
const submitFirst = async (
  navigation: Navigation,
  url: string,
  formData: FormData
) => {
  pending?.abort();
  const controller = (pending = new AbortController());
  const fetched = await fetchPage(url, controller.signal, {
    method: 'POST',
    body: formData,
  });
  if (controller.signal.aborted) return;
  if (!fetched) return submitDocument(url, formData);
  const target = answerUrl(fetched, url);
  navigation.navigate(target, {
    history: target === location.href ? 'replace' : 'push',
    info: {...fetched, url: target},
  });
};

/** Where a post's answer goes: where it redirected, or where the form was. */
const answerUrl = (fetched: Fetched, posted: string) =>
  fetched.url === posted ? location.href : fetched.url;

/**
 * The post the router couldn't render, sent as the browser would have sent
 * it. Text fields only: files need the form they came from.
 */
const submitDocument = (url: string, formData: FormData) => {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = url;
  form.hidden = true;
  for (const [name, value] of formData) {
    if (typeof value !== 'string') continue;
    form.append(Object.assign(document.createElement('input'), {name, value}));
  }
  passing = url;
  document.body.append(form);
  form.submit();
};

/** A full load of `url`, in a new entry or in place of the current one. */
const loadDocument = (url: string, history: History) => {
  passing = url;
  if (history === 'replace') location.replace(url);
  else location.assign(url);
};

/**
 * Back or Forward to an entry the router made: those commit at once, so
 * when the page is no longer there, reload the entry for the server's
 * answer.
 */
const revisit = async (
  site: Site,
  outlet: HTMLElement,
  url: string,
  signal: AbortSignal
) => {
  const fetched = await fetchPage(url, signal);
  if (signal.aborted) return;
  if (!fetched) return location.reload();
  await renderPage(site, outlet, fetched.page, signal);
};

const renderPage = async (
  site: Site,
  outlet: HTMLElement,
  next: PageData,
  signal: AbortSignal
) => {
  // The page's modules, the first time it is shown.
  const view = await whileLoading(() => viewOf(site, next.route));
  if (signal.aborted) return;
  show(outlet, view, next);
};

/** The page's data, and where it is after any redirect. */
const fetchPage = (
  url: string,
  signal: AbortSignal,
  init: RequestInit = {}
): Promise<Fetched | undefined> =>
  whileLoading(() => requestPage(url, signal, init));

const requestPage = async (
  url: string,
  signal: AbortSignal,
  init: RequestInit
): Promise<Fetched | undefined> => {
  const response = await fetch(url, {
    ...init,
    headers: {[DATA_HEADER]: 'data'},
    signal,
  }).catch(() => undefined);
  const body = pageData(response);
  const page = body && (await readPage(body, signal));
  if (!page) return undefined;
  return {
    // `fetch` drops the fragment, so keep the URL as asked unless redirected.
    url: response!.redirected ? response!.url : url,
    page,
  };
};

/** The body, when the server answered with page data. */
const pageData = (response: Response | undefined) =>
  response?.headers.get(DATA_HEADER) === 'data'
    ? (response.body ?? undefined)
    : undefined;

/**
 * The page's data from its first record; the rest are read as they arrive,
 * each settling a promise in it.
 */
const readPage = async (
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal
): Promise<PageData | undefined> => {
  const lines = readLines(body);
  const first = await lines.next().catch(() => undefined);
  if (!first || first.done) return undefined;
  const reader = createReader();
  const page = reader.read<PageData>(first.value);
  void readRest(lines, reader, signal);
  return page;
};

/** Leaving the page rejects what is still pending. */
const readRest = async (
  lines: AsyncGenerator<string>,
  reader: ReturnType<typeof createReader>,
  signal: AbortSignal
) => {
  try {
    for await (const line of lines) reader.read(line);
  } catch (error) {
    reader.abort(signal.aborted ? signal.reason : error);
  }
};

/** A response body, one line at a time. */
async function* readLines(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let rest = '';
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    const lines = (rest + decoder.decode(chunk, {stream: true})).split('\n');
    rest = lines.pop()!;
    yield* lines.filter(Boolean);
  }
  if (rest) yield rest;
}
