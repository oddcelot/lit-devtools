/**
 * The Custom Elements Manifests the panel reads for one site, as one ordered
 * list: the ones the page links with `<link rel="custom-elements-manifest">`
 * and the ones the user added (or took from the found ones). Each can be
 * switched off and moved; component docs come from the first switched-on
 * manifest that describes a tag (`component-docs/linked.ts`).
 *
 * What is stored is the user's arrangement. A linked entry is stored once
 * the user moves or switches it, marked as linked, and counts only while the
 * page still links it; one the page links but the list has never held goes
 * first, switched on, as the page's own say comes first by default.
 *
 * Pure: storage is `manifest-url.ts`'s, the page's links the panel's.
 */

/** One stored manifest: its URL, whether it is read, where it came from. */
export interface StoredManifest {
  url: string;
  enabled: boolean;
  /** Linked by the page rather than added by the user. */
  linked?: true;
}

/** A manifest as the panel lists it for the current page. */
export interface ManifestEntry {
  url: string;
  enabled: boolean;
  /** The page links it right now. */
  linked: boolean;
}

/**
 * The list for the current page: the stored arrangement, minus linked
 * entries the page no longer links, with links it has never held first.
 */
export const entriesFor = (
  stored: readonly StoredManifest[],
  linkedNow: readonly string[]
): ManifestEntry[] => {
  const known = new Set(stored.map((s) => s.url));
  const fresh = linkedNow
    .filter((url) => !known.has(url))
    .map((url) => ({url, enabled: true, linked: true}));
  const kept = stored
    .filter((s) => s.linked !== true || linkedNow.includes(s.url))
    .map((s) => ({
      url: s.url,
      enabled: s.enabled,
      linked: linkedNow.includes(s.url),
    }));
  return [...fresh, ...kept];
};

/**
 * What to store for `entries`, keeping stored linked entries the page does
 * not link right now, so another page of the site still finds them as set.
 */
export const toStored = (
  entries: readonly ManifestEntry[],
  previous: readonly StoredManifest[]
): StoredManifest[] => {
  const shown = new Set(entries.map((e) => e.url));
  return [
    ...entries.map((e) => ({
      url: e.url,
      enabled: e.enabled,
      ...(e.linked ? {linked: true as const} : {}),
    })),
    ...previous.filter((s) => s.linked === true && !shown.has(s.url)),
  ];
};

/** The URLs to read, in order. */
export const enabledUrls = (entries: readonly ManifestEntry[]): string[] =>
  entries.filter((e) => e.enabled).map((e) => e.url);

/** Add `url` at the end, switched on; a URL already listed stays put. */
export const added = (
  entries: readonly ManifestEntry[],
  url: string
): ManifestEntry[] =>
  entries.some((e) => e.url === url)
    ? [...entries]
    : [...entries, {url, enabled: true, linked: false}];

/** Drop `url`, unless the page links it: that one can only be switched off. */
export const removed = (
  entries: readonly ManifestEntry[],
  url: string
): ManifestEntry[] => entries.filter((e) => e.url !== url || e.linked);

/** Switch `url` on or off. */
export const toggled = (
  entries: readonly ManifestEntry[],
  url: string,
  enabled: boolean
): ManifestEntry[] => entries.map((e) => (e.url === url ? {...e, enabled} : e));

/** Move `url` one place up (`-1`) or down (`1`); at an end, nothing moves. */
export const moved = (
  entries: readonly ManifestEntry[],
  url: string,
  by: -1 | 1
): ManifestEntry[] => {
  const from = entries.findIndex((e) => e.url === url);
  const to = from + by;
  if (from < 0 || to < 0 || to >= entries.length) return [...entries];
  const next = [...entries];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
};

/**
 * A stored value as a list of manifests. Earlier builds stored a site's
 * manifests as URLs: one string, or a list of them, each switched on.
 */
export const asStored = (value: unknown): StoredManifest[] => {
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item): StoredManifest[] => {
    if (typeof item === 'string') return [{url: item, enabled: true}];
    if (item === null || typeof item !== 'object') return [];
    const {url, enabled, linked} = item as Record<string, unknown>;
    if (typeof url !== 'string') return [];
    return [
      {url, enabled: enabled !== false, ...(linked === true ? {linked} : {})},
    ];
  });
};
