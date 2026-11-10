import type {TemplateResult} from 'lit';

/** What a page's `load` gets: the parts of Elysia's context a page needs. */
export interface LoadContext<Params = Record<string, string>> {
  /** Typed by the route's path with `route('/notes/:id').load(...)`. */
  params: Params;
  query: Record<string, string | undefined>;
  request: Request;
}

/**
 * A page: one template, rendered on the server with the data its `load`
 * returned, then hydrated in the browser with the same data.
 */
export interface Page<Data = undefined, Form = unknown> {
  /** The document's `<title>`. */
  title?: (data: Data) => string;
  /** Tags for `<head>`: meta, links. They follow the layouts' own. */
  head?: (data: Data) => TemplateResult;
  /**
   * `form` is what the action a form posted to returned, on the page that
   * answers the post; otherwise `undefined`.
   */
  render: (data: Data, form?: Form) => TemplateResult;
}

/**
 * A layout, `_layout.ts`: it wraps every page in its folder and below,
 * outermost first. Its template renders the page's as `content`, so between
 * two pages under it only the content changes, and the layout's own DOM,
 * and the state of the elements in it, stays.
 */
export interface Layout<Data = undefined> {
  /** The title, for pages that don't set their own. */
  title?: (data: Data) => string;
  /** Tags for `<head>` on every page under it, before the page's own. */
  head?: (data: Data) => TemplateResult;
  render: (content: TemplateResult, data: Data) => TemplateResult;
}

/**
 * A page's data, loaded on the server for each request. Return a `Response`
 * instead, such as a redirect or a 404, to send it in place of the page.
 * The data travels to the browser as JSON, so keep it to what JSON holds.
 */
export type Load<Data, Params = Record<string, string>> = (
  context: LoadContext<Params>
) => Data | Response | Promise<Data | Response>;

/** The data a `load` gives its page. */
export type LoadedData<L extends (...args: never[]) => unknown> = Exclude<
  Awaited<ReturnType<L>>,
  Response
>;

/** What `_404.ts` and `_error.ts` render. */
export interface ErrorData {
  status: number;
  message: string;
}

/**
 * Thrown from a `load` to answer with an error page: `_404.ts` for a 404
 * when there is one, `_error.ts` otherwise.
 */
export class PageError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** `throw error(404, 'No such note')` from a `load`. */
export const error = (status: number, message: string): PageError =>
  new PageError(status, message);

/** What an action gets: the request, and the form's fields. */
export interface ActionContext<
  Params = Record<string, string>,
> extends LoadContext<Params> {
  /** The posted fields, as Elysia parsed them: strings, and files. */
  body: Record<string, unknown>;
}

/**
 * Returned from an action to render the page again with `data` as its
 * `form`, answering with `status`: a form that didn't validate.
 */
export class ActionFailure<Data = unknown> {
  constructor(
    readonly status: number,
    readonly data: Data
  ) {}
}

export const fail = <Data>(status: number, data: Data): ActionFailure<Data> =>
  new ActionFailure(status, data);

/**
 * An action, run for a form posted to its page: return a `Response`, such
 * as a redirect, to send it; return `fail(...)` or any other value to
 * render the page again with it as `form`.
 */
export type Action<Result = unknown, Params = Record<string, string>> = (
  context: ActionContext<Params>
) => Result | Promise<Result>;

/**
 * A `.server.ts` module's `actions`: `default` for a form without a name,
 * and others for `action="?/name"`.
 */
// `any` params: an action typed for its route's params is still an action.
// oxlint-disable-next-line typescript/no-explicit-any
export type Actions = Record<string, Action<unknown, any>>;

/** What a page's `form` can be, from its actions. */
export type ActionData<A extends Actions> = {
  [K in keyof A]: Awaited<ReturnType<A[K]>> extends infer R
    ? R extends Response
      ? never
      : R extends ActionFailure<infer D>
        ? D
        : R
    : never;
}[keyof A];

/** Types a `.server.ts` module's `actions` export. */
export const defineActions = <A extends Actions>(actions: A): A => actions;

/** Types a page module's default export. */
export const definePage = <Data = undefined, Form = unknown>(
  page: Page<Data, Form>
): Page<Data, Form> => page;

/** Types a `_layout.ts` module's default export. */
export const defineLayout = <Data = undefined>(
  layout: Layout<Data>
): Layout<Data> => layout;

/** Types a `.server.ts` module's `load` export. */
export const defineLoad = <Data>(load: Load<Data>): Load<Data> => load;
