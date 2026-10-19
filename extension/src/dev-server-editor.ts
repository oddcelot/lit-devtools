/**
 * Opening a source in the developer's editor through the page's own dev
 * server, and finding where that server's project is.
 *
 * Two endpoints can open a file, and a site may have both:
 *
 * - The plugin's `/__lit-open-in-editor?file=&line=&column=`. It resolves a
 *   relative path against the Vite root, whatever directory the server was
 *   started in, and answers 404 for a file that isn't there. It only trusts
 *   a request from the page itself, so it is asked through the page
 *   ({@link DevServerEditorOptions.fetchFromPage}). Asked by the extension
 *   with no `file`, it answers either 403 or, when the browser sends the
 *   request as no site's (`Sec-Fetch-Site: none`), 400 for the missing
 *   parameter; either is how the extension knows it is there.
 * - Vite's own `<base>__open-in-editor?file=path:line:column`, which every
 *   Vite dev server answers (its error overlay's link). It resolves a
 *   relative path against the server's working directory, which is the root
 *   only when the server was started there, so a path goes to it absolute
 *   whenever the root is known. It answers 200 whether or not the file
 *   exists; asked with no `file`, it answers 500 with the middleware's name,
 *   which is how the extension knows it is there.
 *
 * The locations the extension resolves through Vite's sourcemaps are URLs:
 * a file in the root is served at `<base><root-relative path>`, one outside
 * it at `<base>@fs<absolute path>`. A plugin stamp is a path relative to the
 * root, and Astro marks its markup with absolute paths.
 *
 * The same server tells where its root is: it serves a file in the root at
 * the root-relative path, as a module with `?import`, and answers 404 to any
 * other tail of that file's absolute path. So the shortest tail it serves is
 * the root-relative path, and what comes before it is the root. With no
 * absolute path to start from, the root stays unknown until the user names
 * it ({@link DevServerEditor.useRoot}); a folder they name is checked the
 * same way, against a module the page loaded.
 *
 * Whether a click will open anything is known ahead of it
 * ({@link EditorReach}), so the panel neither offers a link that does
 * nothing nor stays quiet about why.
 */

import type {ElementSource} from '../../src/types/inspector.js';

const VITE_OPEN_PATH = '__open-in-editor';
const PLUGIN_OPEN_PATH = '/__lit-open-in-editor';

/** Tails of an absolute path tried at most, shortest first. */
const MAX_TAILS = 8;

const isAbsolute = (path: string): boolean => /^(?:\/|[A-Za-z]:\/)/.test(path);

/**
 * The file `location` names, as the dev server at `origin` with `base` knows
 * it: relative to the root, or absolute. `undefined` when the location is a
 * URL that server doesn't serve.
 */
export const editorPathFor = (
  location: ElementSource,
  origin: string,
  base = '/'
): string | undefined => {
  if (location.url === undefined) return location.file.replace(/\\/g, '/');
  let url: URL;
  try {
    url = new URL(location.url);
  } catch {
    return undefined;
  }
  if (url.origin !== origin || !url.pathname.startsWith(base)) return undefined;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname.slice(base.length));
  } catch {
    return undefined;
  }
  if (path.startsWith('@fs/')) return path.slice('@fs'.length);
  return path === '' ? undefined : path;
};

export interface DevServerEditorOptions {
  fetch: (url: string) => Promise<Response>;
  /** The page's Vite base (`/` without one), for the server at `origin`. */
  base: (origin: string) => Promise<string>;
  /**
   * Fetches `url` from the inspected page itself, so a server that trusts
   * only its own pages answers; the status, or `undefined` when it can't.
   */
  fetchFromPage: (url: string) => Promise<number | undefined>;
}

/**
 * How far the editor reaches from a site: `sure` when the plugin's endpoint
 * is there or Vite's root is known; `unsure` when only Vite's endpoint is,
 * which opens a root-relative path only if the server was started in its
 * root; `none` when no endpoint answers.
 */
export type EditorReach = 'sure' | 'unsure' | 'none';

export interface DevServerEditor {
  /** How far the editor reaches from the dev server at `origin`. */
  reach(origin: string): Promise<EditorReach>;
  /** Takes `root` as the root of `origin`'s dev server. */
  useRoot(origin: string, root: string): Promise<void>;
  /**
   * Whether `root` holds `modulePath`, a root-relative module the page at
   * `origin` loaded: so whether it is that server's root.
   */
  isRoot(origin: string, root: string, modulePath: string): Promise<boolean>;
  /** Opens `location` through `origin`'s dev server; false if it can't. */
  open(origin: string, location: ElementSource): Promise<boolean>;
  /**
   * The root of `origin`'s dev server, worked out from `file`, an absolute
   * path in it; `undefined` when the server isn't Vite or doesn't serve it.
   */
  rootFor(origin: string, file: string): Promise<string | undefined>;
}

/** What a site's dev server offers, read once per origin. */
interface Server {
  base: string;
  /** Vite's `__open-in-editor` answers. */
  vite: boolean;
  /** The plugin's `/__lit-open-in-editor` is there. */
  plugin: boolean;
  root?: string;
}

export const createDevServerEditor = ({
  fetch,
  base: baseOf,
  fetchFromPage,
}: DevServerEditorOptions): DevServerEditor => {
  const servers = new Map<string, Promise<Server>>();

  /** Whether `url` answers one of `expected`: a status and its text. */
  const answers = async (
    url: string,
    ...expected: Array<[status: number, text: string]>
  ): Promise<boolean> => {
    try {
      const response = await fetch(url);
      const text = await response.text();
      return expected.some(
        ([status, part]) => response.status === status && text.includes(part)
      );
    } catch {
      return false;
    }
  };

  const read = async (origin: string): Promise<Server> => {
    // A page that can't be read (reloading, say) has no base to report.
    const base = await baseOf(origin).catch(() => '/');
    const [vite, plugin] = await Promise.all([
      answers(`${origin}${base}${VITE_OPEN_PATH}`, [500, 'launch-editor']),
      answers(
        `${origin}${PLUGIN_OPEN_PATH}`,
        [403, 'forbidden'],
        [400, 'missing file parameter']
      ),
    ]);
    return {base, vite, plugin};
  };

  const serverAt = (origin: string): Promise<Server> => {
    let server = servers.get(origin);
    if (server === undefined) {
      server = read(origin);
      servers.set(origin, server);
    }
    return server;
  };

  /** Whether `origin` serves `path` as a module, so it is in the root. */
  const serves = async (
    origin: string,
    base: string,
    path: string
  ): Promise<boolean> => {
    try {
      const response = await fetch(`${origin}${base}${encodeURI(path)}?import`);
      return (
        response.ok &&
        /javascript/.test(response.headers.get('content-type') ?? '')
      );
    } catch {
      return false;
    }
  };

  const viaPlugin = async (
    origin: string,
    file: string,
    location: ElementSource
  ): Promise<boolean> => {
    const params = new URLSearchParams({file, line: String(location.line)});
    if (location.column !== undefined) {
      params.set('column', String(location.column));
    }
    const status = await fetchFromPage(
      `${origin}${PLUGIN_OPEN_PATH}?${params.toString()}`
    );
    return status === 200;
  };

  const viaVite = async (
    origin: string,
    server: Server,
    file: string,
    location: ElementSource
  ): Promise<boolean> => {
    const path =
      isAbsolute(file) || server.root === undefined
        ? file
        : `${server.root}/${file}`;
    const params = new URLSearchParams({
      file: `${path}:${location.line}:${location.column ?? 1}`,
    });
    try {
      const response = await fetch(
        `${origin}${server.base}${VITE_OPEN_PATH}?${params.toString()}`
      );
      return response.ok;
    } catch {
      return false;
    }
  };

  return {
    async reach(origin) {
      const server = await serverAt(origin);
      if (server.plugin || (server.vite && server.root !== undefined)) {
        return 'sure';
      }
      return server.vite ? 'unsure' : 'none';
    },
    async useRoot(origin, root) {
      (await serverAt(origin)).root = root;
    },
    async isRoot(origin, root, modulePath) {
      const server = await serverAt(origin);
      const file = `${root}/${modulePath.replace(/^\/+/, '')}`;
      return serves(
        origin,
        server.base,
        `@fs${file.startsWith('/') ? '' : '/'}${file}`
      );
    },
    async rootFor(origin, file) {
      const server = await serverAt(origin);
      if (!server.vite) return undefined;
      if (server.root !== undefined && file.startsWith(`${server.root}/`)) {
        return server.root;
      }
      const slashes = [...file.matchAll(/\//g)].map((m) => m.index);
      // The last slash starts the file name alone; the first, the whole path.
      for (const at of slashes.reverse().slice(0, MAX_TAILS)) {
        if (at === 0) break;
        if (await serves(origin, server.base, file.slice(at + 1))) {
          server.root = file.slice(0, at);
          return server.root;
        }
      }
      return undefined;
    },
    async open(origin, location) {
      const server = await serverAt(origin);
      const file = editorPathFor(location, origin, server.base);
      if (file === undefined) return false;
      if (server.plugin && (await viaPlugin(origin, file, location))) {
        return true;
      }
      return server.vite && viaVite(origin, server, file, location);
    },
  };
};
