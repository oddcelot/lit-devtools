/**
 * The Custom Elements Manifests the user pointed the panel at, per site, for
 * pages that host them but don't link them with
 * `<link rel="custom-elements-manifest">` (`component-docs/linked.ts`), and
 * the found ones they ignore. Read only when the page links none.
 *
 * Kept in `storage.local` next to the enabled origins, a list per origin,
 * and held to the same rule as every other fetch the panel makes: on the
 * inspected site itself, which the extension already has access to.
 *
 * Takes the storage area as an argument, structurally typed, so it is
 * unit-testable with a fake.
 */

import type {StorageAreaLike} from './registry.js';

/** The `storage.local` key holding the manifest URLs of each origin. */
export const MANIFEST_URLS_KEY = 'lit:manifest-urls';

/**
 * The `storage.local` key holding, per origin, the found manifests the user
 * chose to ignore, so the panel offers them no more until they reset one.
 */
export const MANIFEST_IGNORED_KEY = 'lit:manifest-ignored';

/**
 * A stored list. A single string, as an earlier build saved a site's one
 * manifest, reads as a list of it.
 */
const asList = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
};

const readList = async (
  storage: StorageAreaLike,
  key: string,
  origin: string
): Promise<string[]> => {
  const all = (await storage.get(key))[key];
  return all !== null && typeof all === 'object'
    ? asList((all as Record<string, unknown>)[origin])
    : [];
};

/** Change `origin`'s list under `key`; an emptied list is dropped. */
const updateList = async (
  storage: StorageAreaLike,
  key: string,
  origin: string,
  change: (list: string[]) => string[]
): Promise<void> => {
  const stored = (await storage.get(key))[key];
  const all = {
    ...(stored !== null && typeof stored === 'object'
      ? (stored as Record<string, unknown>)
      : {}),
  };
  const next = [...new Set(change(asList(all[origin])))];
  if (next.length === 0) delete all[origin];
  else all[origin] = next;
  await storage.set({[key]: all});
};

const adding = (url: string) => (list: string[]) => [...list, url];
const removing = (url: string) => (list: string[]) =>
  list.filter((u) => u !== url);

/** The manifest URLs set for `origin`, in the order they were added. */
export const readManifestUrls = (
  storage: StorageAreaLike,
  origin: string
): Promise<string[]> => readList(storage, MANIFEST_URLS_KEY, origin);

/** Read `url` on `origin` too. */
export const addManifestUrl = (
  storage: StorageAreaLike,
  origin: string,
  url: string
): Promise<void> => updateList(storage, MANIFEST_URLS_KEY, origin, adding(url));

/** Stop reading `url` on `origin`. */
export const removeManifestUrl = (
  storage: StorageAreaLike,
  origin: string,
  url: string
): Promise<void> =>
  updateList(storage, MANIFEST_URLS_KEY, origin, removing(url));

/** The found manifests the user ignores on `origin`. */
export const readIgnoredManifests = (
  storage: StorageAreaLike,
  origin: string
): Promise<string[]> => readList(storage, MANIFEST_IGNORED_KEY, origin);

/** Ignore the found `url` on `origin`, or stop ignoring it with `false`. */
export const setManifestIgnored = (
  storage: StorageAreaLike,
  origin: string,
  url: string,
  ignore: boolean
): Promise<void> =>
  updateList(
    storage,
    MANIFEST_IGNORED_KEY,
    origin,
    ignore ? adding(url) : removing(url)
  );

/**
 * What the user typed, as an absolute URL on the inspected site: a path such
 * as `/dist/custom-elements.json` resolves against `base`, the page's own
 * URL; empty input is refused. `site` reduces a URL to the origin
 * the extension compares (a host without its port, in Firefox), which must
 * be `origin`.
 */
export const parseManifestUrl = (
  input: string,
  base: string,
  origin: string,
  site: (url: string) => string | undefined
): {url: string} | {error: string} => {
  const text = input.trim();
  if (text === '') return {error: 'Enter a path or a URL'};
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
