/** Where `index.html` takes the page's `<title>`. */
export const HEAD = '<!--lit-elysia:head-->';
/** Around the tags the pages put in `<head>`, so the router can swap them. */
export const HEAD_START = 'lit-elysia-head';
export const HEAD_END = '/lit-elysia-head';

/** Where `index.html` takes the rendered page. */
export const BODY = '<!--lit-elysia:body-->';

/** The element the page renders into, on the server and in the browser. */
export const OUTLET_ID = 'lit-elysia';
/** The inline script that queues the page's data, right after the page. */
export const DATA_ID = 'lit-elysia-data';
/**
 * The global the document's data records queue on: the first right after
 * the page, then one per promise as it settles on the server.
 */
export const QUEUE = '__litElysia';

/**
 * The path a page, layout, `load` or `actions` was written for, so the
 * server can check it against the file's.
 */
export const ROUTE = Symbol.for('@oddsquad/lit-elysia#route');

/** The query schema `route(path, {query})` gave a `load` or `actions`. */
export const QUERY = Symbol.for('@oddsquad/lit-elysia#query');

/** The route names of `_404.ts` and `_error.ts`, which answer no path. */
export const NOT_FOUND = '#404';
export const ERROR = '#error';

/** What the server hands the browser to hydrate the page with. */
export interface Payload {
  /** The route's path, such as `/notes/:id`, which names its page module. */
  route: string;
  data: unknown;
  /** What each layout's `load` returned, outermost first. */
  layouts: unknown[];
  /** The response's status, when it isn't 200: an error page's. */
  status?: number;
  /** What the action a form posted to returned. */
  form?: unknown;
  /** The keys the loads said their data depends on. */
  depends?: string[];
}

/**
 * The header that asks a page's URL for its data instead of its HTML, and
 * marks the response that carries it.
 */
export const DATA_HEADER = 'x-lit-elysia';

/** A page's data as the router fetches it. */
export type PageData = Payload;
