import type {AnySchema, UnwrapSchema} from 'elysia';
import type {
  Action,
  ActionData,
  Actions,
  Load,
  LoadContext,
  LoadedData,
} from './page.ts';

/**
 * Filled in by the `routes.gen.d.ts` the plugin writes from the routes
 * folder: every page by its path and every layout by its folder's, each
 * with what its `.server.ts` gives it.
 *
 *     declare module '@oddsquad/lit-elysia/routes' {
 *       interface Register {
 *         routes: {'/notes/:id': ServerTypes<typeof import('./notes/[id].server')>};
 *         layouts: {'/': ServerTypes<typeof import('./_layout.server')>};
 *       }
 *     }
 */
// oxlint-disable-next-line typescript/no-empty-interface
export interface Register {}

/**
 * What a module's `.server.ts` gives it: its data, its form's result, and
 * the names of its actions.
 */
export interface RouteTypes {
  data: unknown;
  form: unknown;
  actions: string;
  query: Query;
}

/** A query no schema checked: each name's value, if it's there. */
export type Query = Record<string, string | undefined>;

/** What a link may put in a query no schema checks. */
export type LinkQuery = Record<string, string | number | undefined>;

/**
 * Carried by a `load` that `route(path, {query})` made, for the types
 * alone: what links put in its query, and what the load gets from it.
 */
export interface QueryTypes<Input = LinkQuery, Output = Query> {
  readonly '~query'?: {input: Input; output: Output};
}

/** What a query schema takes from a link, and what a load gets. */
export type SchemaQuery<Schema extends AnySchema> = {
  input: UnwrapSchema<Schema, {}, 'input'>;
  output: UnwrapSchema<Schema, {}, 'output'>;
};

/**
 * The types of a `.server.ts` module, by its exports: the data its `load`
 * returns, what its `actions` render the page with, and their names.
 * Without them, `undefined`, and no names; `ServerTypes<undefined>` for a
 * module with no `.server.ts`.
 */
export interface ServerTypes<Module> {
  data: Module extends {load: infer L extends (...args: never[]) => unknown}
    ? LoadedData<L>
    : undefined;
  form: Module extends {actions: infer A extends Actions}
    ? ActionData<A>
    : undefined;
  actions: Module extends {actions: infer A extends Actions}
    ? Extract<keyof A, string>
    : never;
  /** What links put in the query: typed by the load's schema, if it has one. */
  query: Module extends {load: QueryTypes<infer Input, unknown>}
    ? Input
    : LinkQuery;
}

type Unregistered = Record<string, RouteTypes>;
type RouteMap = Register extends {routes: infer R} ? R : Unregistered;
type LayoutMap = Register extends {layouts: infer L} ? L : Unregistered;

/** A page's path, such as `/notes/:id`: any string until the list is written. */
export type RoutePath = Extract<keyof RouteMap, string>;

/** A layout's folder as a path: `/` for the top one, `/notes` below. */
export type LayoutPath = Extract<keyof LayoutMap, string>;

/** The data a page's `load` returns, by the page's path. */
export type RouteData<P extends RoutePath> = RouteMap[P] extends {
  data: infer D;
}
  ? D
  : unknown;

/** What the page's actions render it with, by the page's path. */
export type RouteForm<P extends RoutePath> = RouteMap[P] extends {
  form: infer F;
}
  ? F
  : unknown;

/** The names of the page's actions: `default`, and those for `?/name`. */
export type RouteActions<P extends RoutePath> = RouteMap[P] extends {
  actions: infer A;
}
  ? A
  : string;

/** What a link puts in a page's query: what its schema takes, if any. */
export type RouteQuery<P extends RoutePath> = RouteMap[P] extends {
  query: infer Q;
}
  ? Q
  : LinkQuery;

/** The data a layout's `load` returns, by its folder's path. */
export type LayoutData<P extends LayoutPath> = LayoutMap[P] extends {
  data: infer D;
}
  ? D
  : unknown;

type Segments<P extends string> = P extends `/${infer Head}/${infer Tail}`
  ? Head | Segments<`/${Tail}`>
  : P extends `/${infer Head}`
    ? Head
    : never;

/** The params a path names: `/notes/:id` has `id`, `/files/*` has `*`. */
export type ParamsOf<P extends string> = {
  [
    S in Segments<P> as S extends `:${infer Name}`
      ? Name
      : S extends '*'
        ? '*'
        : never
  ]: string;
};

/** What `href` takes for a path's params: numbers are fine too. */
export type LinkParams<P extends string> = {
  [K in keyof ParamsOf<P>]: string | number;
};

export interface LinkOptions<Q = LinkQuery> {
  query?: Q;
  hash?: string;
}

/**
 * A path with no params needs none; one with params needs all of them.
 * The query is the page's schema's, when its load has one.
 */
export type HrefArgs<P extends RoutePath> = keyof ParamsOf<P> extends never
  ? [params?: Record<string, never>, options?: LinkOptions<RouteQuery<P>>]
  : [params: LinkParams<P>, options?: LinkOptions<RouteQuery<P>>];

/** What a route's query schema makes of it, or the plain query without one. */
export interface QuerySides {
  input: unknown;
  output: unknown;
}

/** A `load` and `actions` typed for one route's params and query. */
export interface RouteHelpers<
  P extends string,
  Q extends QuerySides = {input: LinkQuery; output: Query},
> {
  load<Data>(
    load: (
      context: LoadContext<ParamsOf<P>, Q['output']>
    ) => Data | Response | Promise<Data | Response>
  ): Load<Data, ParamsOf<P>, Q['output']> & QueryTypes<Q['input'], Q['output']>;
  actions<A extends Record<string, Action<unknown, ParamsOf<P>, Q['output']>>>(
    actions: A
  ): A;
}
