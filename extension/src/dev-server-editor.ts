/**
 * Opening a source in the developer's editor through the page's own dev
 * server, on a page the plugin never built.
 *
 * Every Vite dev server answers `/__open-in-editor?file=path:line:column`
 * (its error overlay's link), and passes the path to `launch-editor`, which
 * resolves a relative one against the server's working directory. The
 * locations the extension resolves through Vite's sourcemaps are URLs: a file
 * inside the root is served at its root-relative path (`/src/a.ts`), one
 * outside it under `/@fs/` with its absolute path. So the root-relative path
 * opens whenever the server runs in its root, which is how `vite` is usually
 * started; an `/@fs/` path opens wherever.
 *
 * The endpoint answers 200 whether or not the file exists, so a miss can't be
 * told from a hit; what can be told is whether the site is a Vite dev server
 * at all: asked with no `file`, it answers 500 with the middleware's name.
 *
 * The same server tells where its root is, which the panel prints absolute
 * paths relative to (Astro marks its markup with absolute ones): Vite serves
 * a file in its root at the root-relative path, as a module with `?import`,
 * and answers 404 to any other tail of that file's absolute path. So the
 * shortest tail it serves is the root-relative path, and what comes before
 * it is the root.
 */

import type {ElementSource} from '../../src/types/inspector.js';

const OPEN_IN_EDITOR_PATH = '/__open-in-editor';

/**
 * The `file:line:column` the endpoint at `origin` takes for `location`, or
 * `undefined` when the location isn't a file that server serves. A plugin
 * stamp (no `url`) is already relative to the Vite root.
 */
export const editorFileFor = (
  location: ElementSource,
  origin: string
): string | undefined => {
  const position = `:${location.line}:${location.column ?? 1}`;
  if (location.url === undefined) return `${location.file}${position}`;
  let url: URL;
  try {
    url = new URL(location.url);
  } catch {
    return undefined;
  }
  if (url.origin !== origin) return undefined;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return undefined;
  }
  const file = path.startsWith('/@fs/')
    ? path.slice('/@fs'.length)
    : path.replace(/^\/+/, '');
  return file === '' ? undefined : `${file}${position}`;
};

export interface DevServerEditorOptions {
  fetch: (url: string) => Promise<Response>;
}

export interface DevServerEditor {
  /** Opens `location` through `origin`'s dev server; false if it can't. */
  open(origin: string, location: ElementSource): Promise<boolean>;
  /**
   * The root of `origin`'s dev server, worked out from `file`, an absolute
   * path in it; `undefined` when the server isn't Vite or doesn't serve it.
   */
  rootFor(origin: string, file: string): Promise<string | undefined>;
}

/** Tails of an absolute path tried at most, shortest first. */
const MAX_TAILS = 8;

export const createDevServerEditor = ({
  fetch,
}: DevServerEditorOptions): DevServerEditor => {
  const probes = new Map<string, Promise<boolean>>();

  const probe = async (origin: string): Promise<boolean> => {
    try {
      const response = await fetch(`${origin}${OPEN_IN_EDITOR_PATH}`);
      return (
        response.status === 500 &&
        (await response.text()).includes('launch-editor')
      );
    } catch {
      return false;
    }
  };

  const hasEndpoint = (origin: string): Promise<boolean> => {
    let known = probes.get(origin);
    if (known === undefined) {
      known = probe(origin);
      probes.set(origin, known);
    }
    return known;
  };

  /** Whether `origin` serves `path` as a module, so it is in the root. */
  const serves = async (origin: string, path: string): Promise<boolean> => {
    try {
      const response = await fetch(`${origin}${encodeURI(path)}?import`);
      return (
        response.ok &&
        /javascript/.test(response.headers.get('content-type') ?? '')
      );
    } catch {
      return false;
    }
  };

  return {
    async rootFor(origin, file) {
      if (!(await hasEndpoint(origin))) return undefined;
      const slashes = [...file.matchAll(/\//g)].map((m) => m.index);
      // The last slash starts the file name alone; the first, the whole path.
      for (const at of slashes.reverse().slice(0, MAX_TAILS)) {
        if (at === 0) break;
        if (await serves(origin, file.slice(at))) return file.slice(0, at);
      }
      return undefined;
    },
    async open(origin, location) {
      const file = editorFileFor(location, origin);
      if (file === undefined || !(await hasEndpoint(origin))) return false;
      try {
        const params = new URLSearchParams({file});
        const response = await fetch(
          `${origin}${OPEN_IN_EDITOR_PATH}?${params.toString()}`
        );
        return response.ok;
      } catch {
        return false;
      }
    },
  };
};
