import type {AnySchema} from 'elysia';
import {PARAMS, QUERY, ROUTE} from './shared.ts';
import type {
  HrefArgs,
  LinkOptions,
  ParamsFrom,
  QuerySidesOf,
  RouteActions,
  RouteHelpers,
  RoutePath,
} from './routes-types.ts';

export type {
  LayoutData,
  LayoutPath,
  LinkOptions,
  ParamsOf,
  Query,
  Register,
  RouteData,
  RouteQuery,
  RouteActions,
  RouteForm,
  RoutePath,
  RouteTypes,
  ServerTypes,
} from './routes-types.ts';

/**
 * A link to a page by its path, with its params filled in and encoded:
 * `href('/notes/:id', {id: 2})` is `/notes/2`. With the generated route
 * list in the project, a path that isn't a page, or a missing param, fails
 * the type check.
 */
export const href = <P extends RoutePath>(
  path: P,
  ...[params, options]: HrefArgs<P>
): string => {
  const values = (params ?? {}) as Record<string, string | number>;
  const filled = path
    .split('/')
    .map((segment) => fill(segment, values))
    .join('/');
  return filled + queryOf(options) + (options?.hash ? `#${options.hash}` : '');
};

/**
 * A form's `action` for one of a page's actions:
 * `action('/notes/:id', 'save', {id: 2})` is `/notes/2?/save`, and the
 * `default` action is the page's path alone. With the generated route
 * list, a name the page's `actions` don't have fails the type check.
 */
export const action = <P extends RoutePath>(
  path: P,
  name: RouteActions<P>,
  ...[params, options]: HrefArgs<P>
): string => {
  const base = href(path, ...([params] as HrefArgs<P>));
  const query = queryOf(options);
  const search =
    name === 'default'
      ? query
      : `?/${encodeURIComponent(String(name))}${query.replace(/^\?/, '&')}`;
  return base + search + (options?.hash ? `#${options.hash}` : '');
};

const fill = (segment: string, values: Record<string, string | number>) => {
  if (segment === '*') {
    return String(values['*'] ?? '')
      .split('/')
      .map(encodeURIComponent)
      .join('/');
  }
  if (!segment.startsWith(':')) return segment;
  const value = values[segment.slice(1)];
  if (value === undefined)
    throw new Error(`[lit-elysia] href: no value for ${segment}`);
  return encodeURIComponent(String(value));
};

/** The query, with a name once per item of a list, and none for `undefined`. */
const queryOf = (options: LinkOptions<unknown> | undefined) => {
  const query = (options?.query ?? {}) as Record<string, unknown>;
  const entries = Object.entries(query).flatMap(([key, value]) =>
    // A query schema takes strings, numbers and booleans, and lists of them.
    (Array.isArray(value) ? value : [value]).flatMap(
      (item: string | number | boolean | undefined) =>
        item === undefined ? [] : [[key, String(item)]]
    )
  );
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

export {ROUTE};

/** What `route` takes besides the path: schemas, Elysia's `t` or any Standard Schema. */
export interface RouteOptions {
  /**
   * For the query: the server checks and coerces it before the load or
   * the action runs, and answers 400 when it doesn't fit. Links to the
   * page are typed by what it takes.
   */
  query?: AnySchema;
  /**
   * For the path's params: `{id: t.Numeric()}` makes `params.id` a
   * number, and a param that doesn't fit answers 404, as no such page.
   */
  params?: AnySchema;
}

/**
 * Types a page's `load` and `actions` by its route's path:
 * `route('/notes/:id').load(({params}) => findNote(params.id))`, and by
 * schemas for its query and params:
 * `route('/search', {query: t.Object({q: t.String()})})`. The server
 * checks the path against the file's, so a copied one can't type the
 * wrong params unnoticed.
 */
export const route = <P extends RoutePath, O extends RouteOptions = {}>(
  path: P,
  options?: O
): RouteHelpers<P, QuerySidesOf<O>, ParamsFrom<P, O>> => {
  const mark = <T extends object>(value: T): T =>
    Object.assign(value, {
      [ROUTE]: path,
      ...(options?.query && {[QUERY]: options.query}),
      ...(options?.params && {[PARAMS]: options.params}),
    });
  return {load: mark, actions: mark} as never;
};

type Invalidator = (key?: string) => Promise<void>;
let invalidator: Invalidator | undefined;

/** For the router, once it has taken over the page. */
export const setInvalidator = (next: Invalidator): void => {
  invalidator = next;
};

/**
 * Loads data again after it changed somewhere the router can't see. The
 * page on screen loads again, in place, if it depends on `key` (see
 * `depends` in a load), or always without one; every other page the
 * router fetched before now skips the cache when next shown. A form action
 * does the same by itself. Does nothing on the server.
 */
export const invalidate = (key?: string): Promise<void> =>
  invalidator?.(key) ?? Promise.resolve();

export {configurePending, type PendingOptions} from './pending.ts';
