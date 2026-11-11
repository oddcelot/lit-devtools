import {PageError} from './page.ts';

/**
 * Wraps every promise in page data, in plain objects and arrays at any
 * depth, so a rejection reaches the browser as an error with a message the
 * page may show: a `PageError`'s own, or one that says nothing more. The
 * error itself, and its stack, stay in the server's log.
 */
export const safePromises = <T>(value: T): T => wrap(value, new Map()) as T;

/**
 * Copies only what holds a promise, and each object once, so data that
 * reaches one object twice still does.
 */
const wrap = (value: unknown, seen: Map<object, unknown>): unknown => {
  if (value instanceof Promise) return value.catch(publicError);
  if (!Array.isArray(value) && !isPlainObject(value)) return value;
  if (seen.has(value)) return seen.get(value);
  seen.set(value, value);
  const entries = Object.entries(value);
  const wrapped = entries.map(([, item]) => wrap(item, seen));
  if (wrapped.every((item, i) => item === entries[i]![1])) return value;
  const copy = Array.isArray(value)
    ? wrapped
    : Object.fromEntries(entries.map(([key], i) => [key, wrapped[i]]));
  seen.set(value, copy);
  return copy;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  Object.getPrototypeOf(value) === Object.prototype;

const publicError = (error: unknown): never => {
  if (!(error instanceof PageError)) console.error(error);
  const message =
    error instanceof PageError ? error.message : 'Something went wrong';
  const safe: {stack?: string} & Error = new Error(message);
  // seroval sends an error's stack along; this one has nothing to tell.
  delete safe.stack;
  throw safe;
};
