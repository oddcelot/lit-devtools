import type {AnyElysia, Context} from 'elysia';
import type {TemplateResult} from 'lit';
import type {
  LayoutData,
  LayoutPath,
  Query,
  Register,
  RouteData,
  RouteForm,
  RoutePath,
} from './routes-types.ts';
import {ROUTE} from './shared.ts';

/** The `context` plugin `src/server.ts` exports, once the list registers it. */
type ContextApp = Register extends {context: infer App} ? App : undefined;

/**
 * Elysia's context for the page routes: cookies, `set`, `redirect`,
 * `headers`, and whatever the `context` plugin decorates and derives.
 */
type ElysiaContextOf<App> = App extends AnyElysia
  ? Context<
      {},
      {
        decorator: App['~Singleton']['decorator'];
        store: App['~Singleton']['store'];
        derive: App['~Singleton']['derive'] &
          App['~Ephemeral']['derive'] &
          App['~Volatile']['derive'];
      }
    >
  : Context;

/**
 * What a page's `load` gets: Elysia's context, typed with what the
 * `context` plugin in `src/server.ts` adds, and the framework's own.
 */
export type LoadContext<
  Params = Record<string, string>,
  QueryOf = Query,
> = Omit<ElysiaContextOf<ContextApp>, 'params' | 'query' | 'body'> & {
  /** Typed by the route's path with `route('/notes/:id').load(...)`. */
  params: Params;
  /**
   * Checked and coerced by the schema in `route(path, {query})`: a query
   * that doesn't fit it answers 400 before the load runs.
   */
  query: QueryOf;
  request: Request;
  /**
   * Aborts when the client goes before the page is done: the router moved
   * on to another page. Pass it on, to `fetch` or a query, so a page nobody
   * waits for any more stops its work.
   */
  signal: AbortSignal;
  /**
   * Headers for the response, the page's document and the router's data
   * alike: `setHeaders({'cache-control': 'max-age=60'})` lets the browser
   * cache the page, and the router reuses it within that time.
   */
  setHeaders: (headers: Record<string, string>) => void;
  /**
   * Keys this data depends on: `invalidate('notes')` in the browser loads
   * the page on screen again when it depends on `notes`.
   */
  depends: (...keys: string[]) => void;
};

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
  /**
   * `false`: the first load is rendered on the server alone. The document
   * leaves its data out, and the browser hydrates the layouts around it,
   * not its template; the components in it still hydrate themselves, from
   * their attributes. For a page heavy with data that its components don't
   * need, it sends the data once, as HTML, instead of twice.
   *
   * So on that load, what only the browser runs in its own template, an
   * `@event` listener or a `.property`, doesn't, and deferred data doesn't
   * fill in. When the router renders it, after a link or an `invalidate`,
   * it renders it as any other page, from its data.
   */
  hydrate?: false;
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
export type Load<Data, Params = Record<string, string>, QueryOf = Query> = (
  context: LoadContext<Params, QueryOf>
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
  QueryOf = Query,
> extends LoadContext<Params, QueryOf> {
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
export type Action<
  Result = unknown,
  Params = Record<string, string>,
  QueryOf = Query,
> = (context: ActionContext<Params, QueryOf>) => Result | Promise<Result>;

/**
 * A `.server.ts` module's `actions`: `default` for a form without a name,
 * and others for `action="?/name"`.
 */
// `any` params and query: an action typed for its route's is still an action.
// oxlint-disable-next-line typescript/no-explicit-any
export type Actions = Record<string, Action<unknown, any, any>>;

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

/**
 * Types a page module's default export. Name the page's path, and its data
 * and form come from its `.server.ts` through the generated route list:
 * `definePage('/notes/:id', {render: (note) => ...})`. The server checks
 * the path against the file's.
 */
export function definePage<P extends RoutePath>(
  path: P,
  page: Page<RouteData<P>, RouteForm<P>>
): Page<RouteData<P>, RouteForm<P>>;
/** Types a page with its data given: `definePage<Note>({...})`. */
export function definePage<Data = undefined, Form = unknown>(
  page: Page<Data, Form>
): Page<Data, Form>;
export function definePage(
  ...args: [string, Page<unknown>] | [Page<unknown>]
): Page<unknown> {
  return args.length === 2
    ? Object.assign(args[1], {[ROUTE]: args[0]})
    : args[0];
}

/**
 * Types a `_layout.ts` module's default export. Name its folder as a path,
 * `/` for the top one, and its data comes from its `.server.ts` through
 * the generated route list: `defineLayout('/notes', {...})`.
 */
export function defineLayout<P extends LayoutPath>(
  path: P,
  layout: Layout<LayoutData<P>>
): Layout<LayoutData<P>>;
/** Types a layout with its data given: `defineLayout<Data>({...})`. */
export function defineLayout<Data = undefined>(
  layout: Layout<Data>
): Layout<Data>;
export function defineLayout(
  ...args: [string, Layout<unknown>] | [Layout<unknown>]
): Layout<unknown> {
  return args.length === 2
    ? Object.assign(args[1], {[ROUTE]: args[0]})
    : args[0];
}

/** Types a `.server.ts` module's `load` export. */
export const defineLoad = <Data>(load: Load<Data>): Load<Data> => load;
