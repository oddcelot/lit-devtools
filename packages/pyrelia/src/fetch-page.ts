import {whileLoading} from './progress.ts';
import {createReader} from './serialize.ts';
import {DATA_HEADER, type PageData} from './shared.ts';

/** A page's data, fetched before its navigation commits. */
export interface Fetched {
  /** Where the page is, after any redirect. */
  url: string;
  page: PageData;
}

/** When data last changed: a form post, or `invalidate`. */
let changedAt = 0;
/** When the router last fetched each URL's data. */
const fetchedAt = new Map<string, number>();

export const markChanged = (): void => {
  changedAt = Date.now();
};

/** When data last changed, for the prefetcher to drop what it had before. */
export const lastChanged = (): number => changedAt;

/**
 * How a fetch may use the browser's HTTP cache: freely, until data has
 * changed; after that, only for a URL fetched since, so `max-age` saves
 * requests without showing what a change made stale.
 */
const cacheFor = (url: string, init: RequestInit): RequestCache | undefined =>
  init.cache ?? (init.method !== 'POST' && stale(url) ? 'no-cache' : undefined);

/** Fetched before data last changed, or never since. */
const stale = (url: string) =>
  changedAt > 0 && (fetchedAt.get(keyOf(url)) ?? 0) <= changedAt;

const keyOf = (url: string) => new URL(url, location.href).href.split('#')[0]!;

export const fetchPage = (
  url: string,
  signal: AbortSignal,
  init: RequestInit = {}
): Promise<Fetched | undefined> =>
  whileLoading(() => requestPage(url, signal, init));

/** `fetchPage` without the page marked busy: for prefetching. */
export const requestPage = async (
  url: string,
  signal: AbortSignal,
  init: RequestInit
): Promise<Fetched | undefined> => {
  const response = await fetchData(url, signal, init);
  const body = pageData(response);
  const page = body && (await readPage(body, signal));
  if (!page) return undefined;
  return {
    // `fetch` drops the fragment, so keep the URL as asked unless redirected.
    url: response!.redirected ? response!.url : url,
    page,
  };
};

/** The data request, through the cache when it may, noting when it was. */
const fetchData = async (
  url: string,
  signal: AbortSignal,
  init: RequestInit
) => {
  const response = await fetch(url, {
    ...init,
    cache: cacheFor(url, init) ?? 'default',
    headers: {[DATA_HEADER]: 'data'},
    signal,
  }).catch(() => undefined);
  noteFetched(url, init, response);
  return response;
};

/** A page's data, read fresh: later visits may take it from the cache. */
const noteFetched = (url: string, init: RequestInit, response?: Response) => {
  if (response?.ok && init.method !== 'POST')
    fetchedAt.set(keyOf(url), Date.now());
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
