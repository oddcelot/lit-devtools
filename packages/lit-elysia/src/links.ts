import {ROUTE} from './shared.ts';
import type {
  HrefArgs,
  LinkOptions,
  RouteHelpers,
  RoutePath,
} from './routes-types.ts';

export type {
  LayoutData,
  LayoutPath,
  LinkOptions,
  ParamsOf,
  Register,
  RouteData,
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

const queryOf = (options: LinkOptions | undefined) => {
  const entries = Object.entries(options?.query ?? {}).flatMap(
    ([key, value]) => (value === undefined ? [] : [[key, String(value)]])
  );
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

export {ROUTE};

/**
 * Types a page's `load` and `actions` by its route's path:
 * `route('/notes/:id').load(({params}) => findNote(params.id))`. The
 * server checks the path against the file's, so a copied one can't type
 * the wrong params unnoticed.
 */
export const route = <P extends RoutePath>(path: P): RouteHelpers<P> => ({
  load: (load) => Object.assign(load, {[ROUTE]: path}),
  actions: (actions) => Object.assign(actions, {[ROUTE]: path}),
});

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
