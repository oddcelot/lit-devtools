/**
 * Finds a Custom Elements Manifest a site hosts without linking it, to
 * offer to the user (`manifest-url.ts` keeps what they accept). Sites tend
 * to publish `custom-elements.json` beside their bundles: Web Awesome's sits
 * at `/dist/custom-elements.json` next to `/dist/webawesome.ssr-loader.js`.
 * So the candidates are that name in the folder of each of the page's
 * scripts and the folders above it, up to the site's root.
 *
 * Polite by design: the panel asks only when the page links no manifest and
 * the user set none, probes a handful of URLs one at a time on the site
 * itself, and reads only the start of each response to tell a manifest from
 * an HTML 404 page, so a large manifest is not downloaded just to be found.
 * The probes run from the panel, not the page, so a miss never shows in the
 * page's console.
 */

/** The file name probed for in each folder. */
const MANIFEST_FILE = 'custom-elements.json';

/** Most URLs probed for one page. */
const MAX_PROBES = 8;

/** Bytes read from a response to tell whether it is a manifest. */
const SNIFF_BYTES = 4096;

/**
 * Where to look, most likely first: for each script on `origin`, its own
 * folder, then each folder above it, then the root. Scripts elsewhere are
 * skipped; duplicates keep their first place.
 */
export const manifestCandidates = (
  scripts: readonly string[],
  allows: (url: string) => boolean,
  max = MAX_PROBES
): string[] => {
  const out = new Set<string>();
  for (const script of scripts) {
    let url: URL;
    try {
      url = new URL(script);
    } catch {
      continue;
    }
    if (!allows(url.href)) continue;
    let dir = new URL('./', url);
    for (;;) {
      out.add(new URL(MANIFEST_FILE, dir).href);
      const up = new URL('../', dir);
      if (up.href === dir.href) break;
      dir = up;
    }
  }
  return [...out].slice(0, max);
};

/** Whether the start of a response reads as a Custom Elements Manifest. */
export const looksLikeManifest = (head: string): boolean =>
  /^\s*\{/.test(head) && /"(?:schemaVersion|modules)"\s*:/.test(head);

/** The first {@link SNIFF_BYTES} of a response's body, then stop reading. */
const sniff = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader();
  if (reader === undefined)
    return (await response.text()).slice(0, SNIFF_BYTES);
  const decoder = new TextDecoder();
  let head = '';
  try {
    while (head.length < SNIFF_BYTES) {
      const {done, value} = await reader.read();
      if (done) break;
      head += decoder.decode(value, {stream: true});
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  return head;
};

/**
 * The first of `candidates` that answers with a manifest, probing one at a
 * time; `undefined` when none does.
 */
export const findManifest = async (
  candidates: readonly string[],
  fetchUrl: (url: string) => Promise<Response>
): Promise<string | undefined> => {
  for (const url of candidates) {
    try {
      const response = await fetchUrl(url);
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        continue;
      }
      if (looksLikeManifest(await sniff(response))) return url;
    } catch {
      // Unreachable: try the next one.
    }
  }
  return undefined;
};
