/* @ts-self-types="./embed.d.ts" */
/**
 * The Lit DevTools panel as one web-standard request handler, for servers
 * that are not Vite: Elysia, Hono, `Bun.serve`, a SvelteKit or Next.js route.
 *
 * The host mounts {@link LitDevtools.handler} on a catch-all under
 * {@link LitDevtools.base} and puts {@link LitDevtools.script} at the top of
 * its pages' `<head>`. The panel, the page script and the RPC all answer on
 * the host's own origin, so nothing binds a port of its own and the page's
 * requests are never cross-origin.
 *
 * RPC runs over SSE rather than a WebSocket: SSE is plain HTTP through the
 * same handler, while a WebSocket needs the host's upgrade wiring, which
 * differs per server.
 *
 * As with `lit-devtools dev`, there are no build-time transforms here, so
 * HMR patching is unavailable. The tree, inspector and timeline work, and
 * component locations come from the page's sourcemaps.
 */

import {initDevframe} from 'devframe/initiate';
import {createNodeActions} from './node-actions.js';
import {PACKAGE_VERSION, PANEL_DIST_DIR} from './paths.js';
import {createStandaloneLitDevframe} from './rpc-source.js';
import {standaloneScriptResponse} from './standalone-script.js';

export interface LitDevtoolsOptions {
  /**
   * Path the panel and its endpoints answer under, with a leading and a
   * trailing slash. Default `/__lit-devtools/`.
   */
  base?: string;
  /**
   * Gate the RPC behind devframe's one-time code, printed to the server's
   * console when a page or panel first asks for one. On by default: anything
   * that can reach the host can otherwise read the session and open files in
   * the developer's editor. Pass `false` only for a dev server bound to
   * loopback.
   */
  auth?: boolean;
  /**
   * Dock the panel in the page: a button in the corner opens it in a drawer
   * along the bottom, and picking an element opens it there. On by default;
   * with `false` the panel is only its own tab at {@link LitDevtools.base}.
   */
  dock?: boolean;
}

export interface LitDevtools {
  /** The normalized mount path, e.g. `/__lit-devtools/`. */
  base: string;
  /** Path of the page script, for `<script src>` at the top of `<head>`. */
  script: string;
  /** Answers every request under {@link base}; anything else is a 404. */
  handler: (request: Request) => Promise<Response>;
  /** Resolves once the devframe is set up; the handler awaits it itself. */
  ready: Promise<void>;
  /** Tears down the RPC sessions. */
  close: () => Promise<void>;
}

/**
 * Creates the Lit DevTools for a server that is not Vite. Call once per
 * process; it starts setting up right away.
 *
 * ```ts
 * const devtools = createLitDevtools();
 * new Elysia()
 *   .all(`${devtools.base}*`, ({request}) => devtools.handler(request))
 * // and in each page: <script src="${devtools.script}"></script>
 * ```
 */
export const createLitDevtools = ({
  base = '/__lit-devtools/',
  auth = true,
  dock = true,
}: LitDevtoolsOptions = {}): LitDevtools => {
  const devframe = initDevframe(
    createStandaloneLitDevframe({
      host: 'standalone',
      version: PACKAGE_VERSION,
      clientAssets: PANEL_DIST_DIR,
      nodeActions: createNodeActions(),
      // Where components are defined, read off the page's own sourcemaps.
      pageSourceMaps: true,
    }),
    {base, auth, ws: false}
  );
  // The page script finds its server from its own address, so it has to be
  // served under the base, next to the endpoints it dials.
  const script = `${devframe.base}lit-devtools.js`;

  return {
    base: devframe.base,
    script,
    handler: async (request) => {
      if (new URL(request.url).pathname !== script) {
        return devframe.handler(request);
      }
      await devframe.ready;
      return standaloneScriptResponse(
        new URL(devframe.base, request.url).href,
        devframe.connectionMeta(),
        {dock}
      );
    },
    ready: devframe.ready,
    close: devframe.close,
  };
};
