/**
 * Mounts the Lit devframe ({@link createLitDevframe}) into the Vite DevTools
 * hub and bridges the page runtime's `import.meta.hot` transport to the
 * definition's `TimelineSource` port. Everything Vite-specific lives here:
 * the definition itself must keep running under `createDevServer()` with no
 * Vite installed.
 *
 * Vite DevTools 0.7+ is itself built on devframe, so its plugin context is a
 * devframe hub context: `ctx.install(definition)` serves the panel SPA from
 * the definition's `clientAssets`, registers its dock, and exposes its RPC
 * over the hub's authenticated WebSocket. That is all
 * `createPluginFromDevframe()` from `@vitejs/devtools-kit` does, so calling
 * `install` directly keeps DevTools an optional peer we never import at
 * runtime — the hook below is duck-typed, exactly as the panel's previous
 * dock registration was.
 *
 * @see plans/devframe-foundation.md
 */

import type {Server} from 'node:http';
import {homedir} from 'node:os';
import {join} from 'node:path';
import type {Plugin, ViteDevServer} from 'vite';
import type {DevframeDefinition} from 'devframe';
import type {DevframeInstance} from 'devframe/initiate';
import type {FeatureSettings} from '../../types/timeline.js';
import type {SourceLocator} from '../source-locator.js';
import {type NodeActionsOptions, createNodeActions} from './node-actions.js';
import {createLitDevframe} from './definition.js';
import {fromViteHot} from '../runtime/page-transport.js';
import {TimelineChannelCodec} from './page-codec.js';
import {PANEL_DIST_DIR} from './paths.js';
import {LIT_DEVFRAME_ID} from './protocol.js';
import {STANDALONE_PANEL_BASE, clientAuthDisabled} from './standalone-panel.js';

/**
 * The slice of the Vite DevTools hub context this plugin uses. Structurally a
 * subset of `ViteDevToolsNodeContext` from `@vitejs/devtools-kit/node`;
 * declared here so the package never imports that optional peer at runtime.
 * Install `@vitejs/devtools-kit` as a dev dependency to check it against the
 * real declarations.
 */
interface DevToolsHubContext {
  readonly viteServer?: ViteDevServer;
  /** Serve a devframe's SPA, register its dock, and run its `setup()`. */
  install: (
    devframe: DevframeDefinition,
    options?: {base?: string; dock?: Record<string, unknown>}
  ) => Promise<void>;
  docks?: {
    activate?: (dockId: string, params?: Record<string, unknown>) => void;
  };
  commands?: {register?: (command: Record<string, unknown>) => unknown};
  /**
   * The hub's host runtime. Structurally the slice of devframe's
   * `DevframeHost` {@link registerInstance} needs; `DevframeHubContext`
   * extends `DevframeNodeContext`, which carries it.
   */
  host?: {resolveOrigin?: () => string};
}

declare module 'vite' {
  interface Plugin {
    /** Vite DevTools plugin hook, contributed by `@vitejs/devtools`. */
    devtools?: {
      capabilities?: {dev?: boolean; build?: boolean};
      setup: (ctx: DevToolsHubContext) => void | Promise<void>;
    };
  }
}

export interface CreateLitDevframePluginOptions {
  version: string;
  /**
   * Read in `devtools.setup()`; when it returns false the panel is not
   * mounted. Defaults to always on.
   */
  enabled?: () => boolean;
  features?: () => FeatureSettings | null;
  /** See {@link CreateLitDevframeOptions.configuredEditor}. */
  configuredEditor?: () => string | undefined;
  /** Override the built panel SPA directory. Defaults to `dist/client`. */
  clientAssets?: string;
  /** See {@link CreateLitDevframeOptions.sourceLocator}. */
  sourceLocator?: () => SourceLocator;
  /** See {@link NodeActionsOptions.sourceDocs}. */
  sourceDocs?: NodeActionsOptions['sourceDocs'];
}

/**
 * One warning per process, not per dev server: a restart-heavy session
 * should not paper the terminal with the same advisory. Carries the reason,
 * because "discovery unavailable" with no cause is the kind of message that
 * costs an afternoon when the guess below finally goes stale.
 */
let warnedDiscoveryUnavailable = false;

const warnDiscoveryUnavailable = (reason: string): void => {
  if (warnedDiscoveryUnavailable) return;
  warnedDiscoveryUnavailable = true;
  console.warn(
    `[lit-plugin] devframe instance-registry discovery unavailable ` +
      `(${reason}); stdio MCP clients cannot auto-discover this dev ` +
      `server. The MCP endpoint itself is unaffected — point clients at ` +
      `<dev-server-origin>/__devtools/__mcp directly.`
  );
};

/**
 * Serve the Lit devframe on Vite's own server when no Vite DevTools hub
 * mounted it: the panel SPA, `__connection.json`, the RPC WebSocket (on
 * Vite's HTTP server, or a side-car in middleware mode), SSE and MCP, all
 * under {@link STANDALONE_PANEL_BASE}. The RPC is gated by devframe's
 * one-time code, as the hub gates it, since anything that reaches the port
 * could otherwise drive it; the same switches turn it off (see
 * {@link clientAuthDisabled}). State lives where the hub keeps it, so
 * settings carry over between the two.
 */
async function serveWithoutHub(
  definition: DevframeDefinition,
  server: ViteDevServer
): Promise<DevframeInstance | undefined> {
  try {
    const [{initDevframe}, {createInteractiveAuth}] = await Promise.all([
      import('devframe/initiate'),
      import('devframe/recipes/interactive-auth'),
    ]);
    const root = server.config.root;
    const origin = () =>
      server.resolvedUrls?.local[0]?.replace(/\/$/, '') ?? '';
    const instance = initDevframe(definition, {
      base: STANDALONE_PANEL_BASE,
      ...(server.httpServer
        ? {server: server.httpServer as Server}
        : {ws: {sidecar: true}}),
      origin,
      register: {name: definition.name},
      // The link printed with the code opens the panel, which takes the code
      // from it; by default it would open the app at the origin, which never
      // reads it. A factory, since the handler needs devframe's context:
      // initDevframe passes it on to the instance shell, which takes one,
      // though its own type says otherwise.
      auth: clientAuthDisabled(server)
        ? false
        : (((ctx: Parameters<typeof createInteractiveAuth>[0]) =>
            createInteractiveAuth(ctx, {
              serverUrl: () => `${origin()}${STANDALONE_PANEL_BASE}`,
            })) as unknown as ReturnType<typeof createInteractiveAuth>),
      getStorageDir: (scope) =>
        scope === 'workspace'
          ? join(root, 'node_modules/.vite/devtools')
          : join(homedir(), '.vite/devtools'),
    });
    await instance.ready;
    // With the server, not its HTTP server: in middleware mode there is none,
    // and the side-car socket would keep the process alive after close.
    const close = server.close.bind(server);
    server.close = async () => {
      await instance.close().catch(() => {});
      return close();
    };
    // Next to the URLs Vite prints, so the panel is findable without docs.
    const printUrls = server.printUrls.bind(server);
    server.printUrls = () => {
      printUrls();
      const local = server.resolvedUrls?.local[0];
      if (local !== undefined) {
        const url = new URL(STANDALONE_PANEL_BASE.slice(1), local).href;
        server.config.logger.info(`  ➜  Lit DevTools: ${url}`);
      }
    };
    return instance;
  } catch (error) {
    console.warn(
      `[lit-plugin] could not serve the Lit panel at ` +
        `${STANDALONE_PANEL_BASE}: ${String(error)}`
    );
    return undefined;
  }
}

/**
 * Publish this devframe in devframe's global instance registry
 * (`~/.devframe/instances/`), so stdio MCP connectors — `devframe connect`,
 * this package's own `lit-devtools mcp` — find the running dev server
 * without port guessing.
 *
 * `createDevServer()` registers itself, but this plugin never goes through
 * it: it mounts into the Vite DevTools hub, and `@vitejs/devtools@0.7.5`
 * calls `initHub()` with no `register` option, which defaults to off. So a
 * Vite-hosted devframe is invisible to discovery unless a plugin publishes
 * the record itself — which is all this does. `registerDevframeInstance()`
 * is documented for exactly this case ("custom hosts that serve a devframe
 * in-process call this explicitly with the origin they are reachable at"),
 * and the registry is a directory of per-`pid`+`port` JSON files, so
 * registrants coexist.
 *
 * The mount path is the soft spot: `/__devtools/` is where this version of
 * Vite DevTools mounts, not a promise about where a devframe host mounts in
 * general. So the guess is verified before it is published — the same
 * `probeDevframeOrigin()` primitive the registry's own liveness check uses
 * has to answer at that base, or nothing is registered. A record that
 * doesn't answer is worse than no record: an agent dials it and gets 404s
 * from a server that claimed to be there.
 *
 * The MCP path is then taken from what that probe *reports* rather than
 * assumed to be the `__mcp` default, which removes the second guess
 * entirely. Note the two path conventions in play: `__connection.json`
 * serves `mcp.path` **relative** to the base (`"__mcp"`), while a registry
 * record stores it **absolute** (`"/__devtools/__mcp"`) because the
 * connector dials `origin + record.mcp.path` directly. Joining the two is
 * exactly what devframe's own `probePort()` does with its root-mounted
 * probe.
 *
 * Known sharp edge: records are keyed by `pid`+`port` alone. Another
 * devframe-hosting plugin in the same Vite process would share this file,
 * and whichever unregisters first removes it for both. Single-devframe use
 * is the common case and there is no cross-plugin coordination primitive
 * today.
 */
async function registerInstance(
  ctx: DevToolsHubContext,
  name: string,
  /** The port the HTTP server is listening on, when it reports one. */
  listeningPort: number | undefined
): Promise<{unregister: () => void} | {reason: string}> {
  // Both imports are dynamic and optional: `@vitejs/devtools-kit` is an
  // optional peer this package must never hard-resolve, and `devframe`'s
  // `internal` subpath is only needed on this path.
  const constants = await import('@vitejs/devtools-kit/constants').catch(
    () => null
  );
  const internal = await import('devframe/internal').catch(() => null);
  if (!constants) return {reason: '@vitejs/devtools-kit not resolvable'};
  if (!internal) return {reason: 'devframe/internal not resolvable'};

  const basePath = constants.DEVTOOLS_MOUNT_PATH;
  const resolved = ctx.host?.resolveOrigin?.();
  if (!resolved) return {reason: 'host origin unavailable'};
  // The host falls back to `server.port` when Vite has no resolved URLs, as
  // in middleware mode with an HTTP server handed in, where that is 5173
  // and someone else's server, or no one's. The port actually listening
  // wins.
  const origin = withPort(resolved, listeningPort);

  const probed = await internal.probeDevframeOrigin(origin, basePath);
  if (!probed) {
    return {reason: `no devframe answered at ${origin}${basePath}`};
  }

  // Relative (`"__mcp"`) as served, absolute as stored — see above. A host
  // that already reports an absolute path is passed through unchanged.
  const reported = probed.meta.mcp?.path;
  const mcpPath =
    reported === undefined
      ? null
      : reported.startsWith('/')
        ? reported
        : `${basePath}${reported}`;

  const {unregister} = internal.registerDevframeInstance({
    pid: process.pid,
    // The probe reports the origin that actually answered — a `localhost`
    // bind may only be dialable as `127.0.0.1` or `[::1]` — so its port is
    // the one truly listening, which `config.server.port` is not when the
    // configured port was taken.
    port: Number(new URL(probed.origin).port) || 0,
    origin: probed.origin,
    basePath,
    id: LIT_DEVFRAME_ID,
    name,
    rootDir: process.cwd(),
    // Registering with `mcp: null` is honest rather than useless: the
    // connector surfaces the instance with its own "MCP disabled" hint,
    // which beats the instance being invisible.
    mcp: mcpPath === null ? null : {path: mcpPath},
    startedAt: Date.now(),
  });
  return {unregister};
}

/** `origin` with its port swapped for `port`, when there is one. */
function withPort(origin: string, port: number | undefined): string {
  if (port === undefined) return origin;
  const url = new URL(origin);
  url.port = String(port);
  return url.origin;
}

/**
 * Register once the dev server is actually accepting connections. The
 * DevTools `setup()` hook runs during server construction, well before
 * `listen()` resolves, so probing from there always fails to connect — the
 * record has to wait for the port it is about to advertise to be real.
 */
function registerInstanceWhenListening(
  ctx: DevToolsHubContext,
  name: string
): void {
  const httpServer = ctx.viteServer?.httpServer;
  if (!httpServer) {
    // Middleware mode: no server of our own to advertise.
    warnDiscoveryUnavailable('no HTTP server (middleware mode?)');
    return;
  }

  const run = (): void => {
    const address = httpServer.address();
    const port =
      typeof address === 'object' && address !== null
        ? address.port
        : undefined;
    registerInstance(ctx, name, port)
      .then((result) => {
        if ('unregister' in result) {
          httpServer.once('close', result.unregister);
        } else {
          warnDiscoveryUnavailable(result.reason);
        }
      })
      .catch((error: unknown) => {
        warnDiscoveryUnavailable(String(error));
      });
  };

  if (httpServer.listening) run();
  else httpServer.once('listening', run);
}

/**
 * The Vite plugin that mounts the Lit devframe on the DevTools hub. Without
 * the hub nothing calls `devtools.setup()`, so the plugin serves the panel
 * on Vite's own server at {@link STANDALONE_PANEL_BASE} instead.
 */
export function createLitDevframePlugin(
  options: CreateLitDevframePluginOptions
): Plugin {
  // The hub, once `setup()` has it. An overlay pick means the developer
  // clicked an element in the page and wants the Components tab: bring the
  // dock forward from the node side rather than having the panel reach into
  // the parent frame. The target rides the activation, not just the dock id:
  // the params ride the hub's `devframe:docks:active` state, so a panel that
  // mounts *because of* this pick still lands on the right element instead
  // of racing the separate `pick` message.
  let hub: DevToolsHubContext | undefined;
  const source = new TimelineChannelCodec({
    onPick: (id) => hub?.docks?.activate?.(LIT_DEVFRAME_ID, {componentId: id}),
  });
  let setupRan = false;
  const definition = createLitDevframe({
    host: 'vite',
    source,
    version: options.version,
    features: options.features,
    clientAssets: options.clientAssets ?? PANEL_DIST_DIR,
    nodeActions: createNodeActions({
      sourceLocator: options.sourceLocator,
      configuredEditor: options.configuredEditor,
      sourceDocs: options.sourceDocs,
    }),
  });

  // Serving the panel itself, when no hub did; see `serveWithoutHub`.
  let standalone: DevframeInstance | undefined;

  return {
    name: `devframe:${LIT_DEVFRAME_ID}`,
    configureServer(server) {
      // Mounted now, ahead of Vite's own middlewares, whose SPA fallback
      // would otherwise answer `/__lit/` with the app's index.html. It
      // passes everything on until the panel is served here.
      server.middlewares.use((req, res, next) => {
        if (standalone === undefined) next();
        else standalone.nodeMiddleware(req, res, next);
      });
      // Returned callbacks run after every plugin's `configureServer` has been
      // awaited, and DevTools mounts devframes from inside its own, so by then
      // `setup()` has run if it is going to.
      return async () => {
        if (setupRan) return;
        if (options.enabled && !options.enabled()) return;
        source.connect(fromViteHot(server.hot));
        standalone = await serveWithoutHub(definition, server);
      };
    },
    devtools: {
      // The panel reflects a running page, so there is nothing to mount
      // during `vite build`. A static snapshot goes through
      // `devframe/adapters/build` instead.
      capabilities: {dev: true, build: false},
      async setup(ctx) {
        setupRan = true;
        if (options.enabled && !options.enabled()) return;
        // Connect before installing: `install()` runs the definition's
        // `setup()`, which attaches to this source, and the dev server is
        // already available on the context by now. Calls made before this
        // are dropped: no page can emit before it reaches a server.
        hub = ctx;
        if (ctx.viteServer) source.connect(fromViteHot(ctx.viteServer.hot));
        await ctx.install(definition);

        // The overlay picker as a palette command with a managed shortcut.
        // Only meaningful when the source overlay is enabled, since that is
        // what draws the picker in the page.
        if (options.features?.()?.sourceOverlay.enabled) {
          ctx.commands?.register?.({
            id: 'lit:overlay:toggle',
            title: 'Pick Lit Element',
            description:
              'Click to inspect in the Components panel, hold Meta/Ctrl and click to open in your editor',
            icon: 'ph:crosshair-duotone',
            category: 'Lit',
            keybindings: [{key: 'Meta+Shift+E'}],
            handler: () => source.toggleOverlay(),
          });
        }

        // Discovery is a convenience on top of a panel that already works,
        // so this never blocks `setup()` and never throws: a failure costs
        // the user the stdio MCP shortcut, and the direct URL still works.
        registerInstanceWhenListening(ctx, definition.name);
      },
    },
  };
}
