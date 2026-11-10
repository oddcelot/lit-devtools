/** Where `index.html` takes the page's `<title>`. */
export const HEAD = '<!--lit-elysia:head-->';
/** Where `index.html` takes the rendered page. */
export const BODY = '<!--lit-elysia:body-->';

/** The element the page renders into, on the server and in the browser. */
export const OUTLET_ID = 'lit-elysia';
/** The `<script type="application/json">` the page's data travels in. */
export const DATA_ID = 'lit-elysia-data';

/** What the server hands the browser to hydrate the page with. */
export interface Payload {
  /** The route's path, such as `/notes/:id`, which names its page module. */
  route: string;
  data: unknown;
  /** What each layout's `load` returned, outermost first. */
  layouts: unknown[];
}

/**
 * The header that asks a page's URL for its data instead of its HTML, and
 * marks the response that carries it.
 */
export const DATA_HEADER = 'x-lit-elysia';

/** A page's data as the router fetches it. */
export type PageData = Payload;
