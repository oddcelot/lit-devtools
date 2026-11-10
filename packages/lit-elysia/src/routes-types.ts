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

/** What a module's `.server.ts` gives it: its data, and its form's result. */
export interface RouteTypes {
  data: unknown;
  form: unknown;
}

/**
 * The types of a `.server.ts` module, by its exports: the data its `load`
 * returns, and what its `actions` render the page with. Without them,
 * `undefined`.
 */
export interface ServerTypes<Module> {
  data: Module extends {load: infer L extends (...args: never[]) => unknown}
    ? LoadedData<L>
    : undefined;
  form: Module extends {actions: infer A extends Actions}
    ? ActionData<A>
    : undefined;
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

export interface LinkOptions {
  query?: Record<string, string | number | undefined>;
  hash?: string;
}

/** A path with no params needs none; one with params needs all of them. */
export type HrefArgs<P extends string> = keyof ParamsOf<P> extends never
  ? [params?: Record<string, never>, options?: LinkOptions]
  : [params: LinkParams<P>, options?: LinkOptions];

/** A `load` and `actions` typed for one route's params. */
export interface RouteHelpers<P extends string> {
  load<Data>(
    load: (
      context: LoadContext<ParamsOf<P>>
    ) => Data | Response | Promise<Data | Response>
  ): Load<Data, ParamsOf<P>>;
  actions<A extends Record<string, Action<unknown, ParamsOf<P>>>>(
    actions: A
  ): A;
}
