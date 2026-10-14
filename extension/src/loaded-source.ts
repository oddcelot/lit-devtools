/**
 * Which URL the browser loaded for a source file the plugin stamped.
 *
 * The plugin stamps a component with the file's path on disk, and DevTools'
 * Sources panel only knows URLs. Vite serves a file inside the project root
 * at its root-relative path and one outside it under `/@fs/`, so the path
 * can be matched against the URLs the page loaded without knowing the root.
 * Pure, so it is tested without a browser.
 */

/**
 * The file path `url` serves, decoded: a directory serves its `index.html`.
 * Undefined for a non-URL, and for Vite's `html-proxy` modules, which hold an
 * HTML file's inline scripts on their own and none of its lines.
 */
const pathnameOf = (url: string): string | undefined => {
  try {
    const {pathname, search} = new URL(url);
    if (search.includes('html-proxy')) return undefined;
    const file = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    try {
      return decodeURIComponent(file);
    } catch {
      return file;
    }
  } catch {
    return undefined;
  }
};

/**
 * The URL among `urls` that serves `file`, or `undefined`. Query and hash are
 * ignored (`?t=` stamps and `?v=` hashes change per load). A URL matches as
 * `/@fs` plus the absolute path, or as a root-relative pathname the path ends
 * with (`/src/x.ts` for `/home/me/app/src/x.ts`); the longest pathname wins,
 * so `/src/x.ts` beats a bare `/x.ts`. The page itself serves an HTML file
 * (`/` is `/index.html`), so a template inline in `index.html` opens there,
 * unless DevTools also lists `/index.html` itself: the original Vite's
 * sourcemaps name, which has the file's own lines and keeps its content
 * when DevTools opened after the page loaded.
 * Backslashes in a Windows path count as slashes.
 */
export const loadedUrlFor = (
  file: string,
  urls: readonly string[]
): string | undefined => {
  const slashed = file.replace(/\\/g, '/');
  const path = slashed.startsWith('/') ? slashed : `/${slashed}`;
  let best: {url: string; length: number} | undefined;
  for (const url of urls) {
    const pathname = pathnameOf(url);
    if (pathname === undefined) continue;
    // A directory's own `index.html` ranks just below the file itself.
    const length =
      pathname.length - (new URL(url).pathname.endsWith('/') ? 0.5 : 0);
    if (
      (pathname === `/@fs${path}` || path.endsWith(pathname)) &&
      (best === undefined || length > best.length)
    ) {
      best = {url, length};
    }
  }
  return best?.url;
};
