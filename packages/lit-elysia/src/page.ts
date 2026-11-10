import type {TemplateResult} from 'lit';

/** What a page's `load` gets: the parts of Elysia's context a page needs. */
export interface LoadContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  request: Request;
}

/**
 * A page: one template, rendered on the server with the data its `load`
 * returned, then hydrated in the browser with the same data.
 */
export interface Page<Data = undefined> {
  /** The document's `<title>`. */
  title?: (data: Data) => string;
  render: (data: Data) => TemplateResult;
}

/**
 * A page's data, loaded on the server for each request. Return a `Response`
 * instead, such as a redirect or a 404, to send it in place of the page.
 * The data travels to the browser as JSON, so keep it to what JSON holds.
 */
export type Load<Data> = (
  context: LoadContext
) => Data | Response | Promise<Data | Response>;

/** The data a `load` gives its page. */
export type LoadedData<L extends (...args: never[]) => unknown> = Exclude<
  Awaited<ReturnType<L>>,
  Response
>;

/** Types a page module's default export. */
export const definePage = <Data = undefined>(page: Page<Data>): Page<Data> =>
  page;

/** Types a `.server.ts` module's `load` export. */
export const defineLoad = <Data>(load: Load<Data>): Load<Data> => load;
