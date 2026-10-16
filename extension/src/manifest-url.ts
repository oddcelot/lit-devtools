/**
 * Per site, the user's arrangement of Custom Elements Manifests (which to
 * read, in what order; see `manifest-list.ts`) and the found ones they
 * ignore.
 *
 * Kept in `storage.local` next to the enabled origins, a list per origin,
 * and held to the same rule as every other fetch the panel makes: on the
 * inspected site itself, which the extension already has access to.
 *
 * Takes the storage area as an argument, structurally typed, so it is
 * unit-testable with a fake.
 */

import type {StorageAreaLike} from './registry.js';
import {asStored, type StoredManifest} from './manifest-list.js';

/** The `storage.local` key holding each origin's manifests. */
export const MANIFEST_URLS_KEY = 'lit:manifest-urls';

/**
 * The `storage.local` key holding, per origin, the found manifests the user
 * chose to ignore, so the panel offers them no more until they reset one.
 */
export const MANIFEST_IGNORED_KEY = 'lit:manifest-ignored';

/** A stored list of URLs; a single string reads as a list of it. */
const asList = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
};

/** The value stored under `key` for `origin`. */
const readStored = async (
  storage: StorageAreaLike,
  key: string,
  origin: string
): Promise<unknown> => {
  const all = (await storage.get(key))[key];
  return all !== null && typeof all === 'object'
    ? (all as Record<string, unknown>)[origin]
    : undefined;
};

/** Store `value` for `origin` under `key`; an empty list is dropped. */
const writeStored = async (
  storage: StorageAreaLike,
  key: string,
  origin: string,
  value: unknown[]
): Promise<void> => {
  const stored = (await storage.get(key))[key];
  const all = {
    ...(stored !== null && typeof stored === 'object'
      ? (stored as Record<string, unknown>)
      : {}),
  };
  if (value.length === 0) delete all[origin];
  else all[origin] = value;
  await storage.set({[key]: all});
};

/** `origin`'s manifests as the user arranged them. */
export const readManifests = async (
  storage: StorageAreaLike,
  origin: string
): Promise<StoredManifest[]> =>
  asStored(await readStored(storage, MANIFEST_URLS_KEY, origin));

/** Store `origin`'s arrangement of manifests. */
export const writeManifests = (
  storage: StorageAreaLike,
  origin: string,
  manifests: StoredManifest[]
): Promise<void> => writeStored(storage, MANIFEST_URLS_KEY, origin, manifests);

/** The found manifests the user ignores on `origin`. */
export const readIgnoredManifests = async (
  storage: StorageAreaLike,
  origin: string
): Promise<string[]> =>
  asList(await readStored(storage, MANIFEST_IGNORED_KEY, origin));

/** Ignore the found `url` on `origin`, or stop ignoring it with `false`. */
export const setManifestIgnored = async (
  storage: StorageAreaLike,
  origin: string,
  url: string,
  ignore: boolean
): Promise<void> => {
  const list = (await readIgnoredManifests(storage, origin)).filter(
    (u) => u !== url
  );
  await writeStored(
    storage,
    MANIFEST_IGNORED_KEY,
    origin,
    ignore ? [...list, url] : list
  );
};

/**
 * What the user typed, as an absolute URL: a path such as
 * `/dist/custom-elements.json` resolves against `base`, the page's own URL;
 * empty input is refused. `site` reduces a URL to the origin the extension
 * compares (a host without its port, in Firefox). A URL on another site than
 * `origin` is taken only with `otherSites`, and marked so the caller asks
 * for access to it first.
 */
export const parseManifestUrl = (
  input: string,
  base: string,
  origin: string,
  site: (url: string) => string | undefined,
  otherSites = false
): {url: string; otherSite: boolean} | {error: string} => {
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
  const otherSite = site(url.href) !== origin;
  if (otherSite && !otherSites) {
    return {
      error: `Must be on ${origin}: this browser can't grant access to another site from DevTools`,
    };
  }
  return {url: url.href, otherSite};
};
