/**
 * A Custom Elements Manifest the user pointed the panel at, per site, for
 * pages that host one but don't link it with
 * `<link rel="custom-elements-manifest">` (`component-docs/linked.ts`). Read
 * only when the page links none.
 *
 * Kept in `storage.local` next to the enabled origins, one URL per origin,
 * and held to the same rule as every other fetch the panel makes: on the
 * inspected site itself, which the extension already has access to.
 *
 * Takes the storage area as an argument, structurally typed, so it is
 * unit-testable with a fake.
 */

import type {StorageAreaLike} from './registry.js';

/** The `storage.local` key holding the manifest URL of each origin. */
export const MANIFEST_URLS_KEY = 'lit:manifest-urls';

/**
 * The `storage.local` key holding, per origin, the found manifest the user
 * chose to ignore, so the panel neither offers nor looks for one again until
 * they reset it.
 */
export const MANIFEST_IGNORED_KEY = 'lit:manifest-ignored';

type ByOrigin = Record<string, string>;

const readAll = async (
  storage: StorageAreaLike,
  key: string
): Promise<ByOrigin> => {
  const value = (await storage.get(key))[key];
  return value !== null && typeof value === 'object' ? (value as ByOrigin) : {};
};

const writeOne = async (
  storage: StorageAreaLike,
  key: string,
  origin: string,
  url: string | undefined
): Promise<void> => {
  const all = {...(await readAll(storage, key))};
  if (url === undefined) delete all[origin];
  else all[origin] = url;
  await storage.set({[key]: all});
};

/** The manifest URL set for `origin`, if any. */
export const readManifestUrl = async (
  storage: StorageAreaLike,
  origin: string
): Promise<string | undefined> =>
  (await readAll(storage, MANIFEST_URLS_KEY))[origin];

/** Set the manifest URL of `origin`, or forget it with `undefined`. */
export const writeManifestUrl = (
  storage: StorageAreaLike,
  origin: string,
  url: string | undefined
): Promise<void> => writeOne(storage, MANIFEST_URLS_KEY, origin, url);

/** The found manifest the user ignores on `origin`, if any. */
export const readIgnoredManifest = async (
  storage: StorageAreaLike,
  origin: string
): Promise<string | undefined> =>
  (await readAll(storage, MANIFEST_IGNORED_KEY))[origin];

/** Ignore `url` on `origin`, or stop ignoring with `undefined`. */
export const writeIgnoredManifest = (
  storage: StorageAreaLike,
  origin: string,
  url: string | undefined
): Promise<void> => writeOne(storage, MANIFEST_IGNORED_KEY, origin, url);

/**
 * What the user typed, as an absolute URL on the inspected site: a path such
 * as `/dist/custom-elements.json` resolves against `base`, the page's own
 * URL. Empty input clears the setting. `site` reduces a URL to the origin
 * the extension compares (a host without its port, in Firefox), which must
 * be `origin`.
 */
export const parseManifestUrl = (
  input: string,
  base: string,
  origin: string,
  site: (url: string) => string | undefined
): {url: string | undefined} | {error: string} => {
  const text = input.trim();
  if (text === '') return {url: undefined};
  let url: URL;
  try {
    url = new URL(text, base);
  } catch {
    return {error: 'Not a URL'};
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {error: 'Not an http(s) URL'};
  }
  if (site(url.href) !== origin) {
    return {error: `Must be on ${origin}`};
  }
  return {url: url.href};
};
