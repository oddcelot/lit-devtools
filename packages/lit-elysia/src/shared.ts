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
}
