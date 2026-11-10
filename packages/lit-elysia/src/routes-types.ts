import type {Action, Load, LoadContext} from './page.ts';

/**
 * Filled in by the `routes.gen.d.ts` the plugin writes from the routes
 * folder, with every page's path:
 *
 *     declare module '@oddsquad/lit-elysia/routes' {
 *       interface Register { routes: '/' | '/notes/:id' }
 *     }
 */
// oxlint-disable-next-line typescript/no-empty-interface
export interface Register {}

/** A page's path, such as `/notes/:id`: any string until the list is written. */
export type RoutePath = Register extends {routes: infer R extends string}
  ? R
  : string;

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
