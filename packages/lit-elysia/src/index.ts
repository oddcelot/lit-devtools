import {existsSync} from 'node:fs';
import {readFile, writeFile} from 'node:fs/promises';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {litPlugin, type LitPluginOptions} from '@oddsquad/vite-plugin-lit';
import {
  isRunnableDevEnvironment,
  mergeConfig,
  normalizePath,
  type Plugin,
  type PluginOption,
  type ResolvedConfig,
  type ViteDevServer,
} from 'vite';
import {ADAPTERS, type Adapter, type AdapterName} from './adapters.ts';
import {sendResponse, toRequest} from './node.ts';
import {scanRoutes, type RouteFile, type Routes} from './routes.ts';

export interface LitElysiaOptions {
  /** Where the pages are, from the project root. Default `src/routes`. */
  routes?: string;
  /**
   * A module whose default export is your Elysia app, from the project
   * root: its routes, its API, its plugins. The pages are added to it.
   * Default `src/server.ts`; without one, the pages get an app of their own.
   */
  server?: string;
  /** Options for the Lit Vite plugin, or `false` to leave it out. */
  lit?: LitPluginOptions | false;
  /**
   * Where to write the list of routes that types `href` and `route`, from
   * the project root, or `false` for none. Default `routes.gen.d.ts` beside
   * the routes folder.
   */
  types?: string | false;
  /**
   * A Content-Security-Policy for the pages, with `{nonce}` where each
   * response's nonce goes. The nonce lands on every script, style and link
   * a page carries, so a policy can leave out `'unsafe-inline'`:
   * `script-src 'self' 'nonce-{nonce}'; style-src 'self' 'nonce-{nonce}'`.
   * The dev server sends it report-only: the Lit plugin's dev tools add
   * styles it would block.
   */
  csp?: string;
  /**
   * Where the build runs: `node` (the default) and `bun` write
   * `dist/server/index.js`, which starts a server on `PORT`; `cloudflare`
   * writes a Worker, `dist/server/entry.js`, for Workers Static Assets to
   * serve `dist/client` beside.
   */
  adapter?: AdapterName;
}

/** URL of the client entry, which `index.html` gets a script for. */
export const CLIENT_URL = '/@lit-elysia/client';
const CLIENT_ID = '\0lit-elysia:client';
/** The pages on the user's app, loaded in the SSR environment. */
const SERVER_ID = 'virtual:lit-elysia/server';
const RESOLVED_SERVER_ID = `\0${SERVER_ID}`;
/** The built server's entry: the app, the shell and the client's files. */
const ENTRY_ID = 'virtual:lit-elysia/entry';
const RESOLVED_ENTRY_ID = `\0${ENTRY_ID}`;
/** The adapter's server start, `dist/server/index.js`. */
const START_ID = 'virtual:lit-elysia/start';
const RESOLVED_START_ID = `\0${START_ID}`;

const runtime = (file: string) =>
  normalizePath(fileURLToPath(new URL(file, import.meta.url)));

/**
 * A Lit framework on Elysia 2: pages from files under `src/routes`, rendered
 * on the server with `@lit-labs/ssr`, streamed and hydrated. In dev the
 * Elysia app runs inside Vite's SSR environment, behind the dev server;
 * `vite build` writes the client to `dist/client` and a server entry to
 * `dist/server/entry.js`, whose default export is the Elysia app.
 */
export const litElysia = (options: LitElysiaOptions = {}): PluginOption[] => [
  options.lit === false ? [] : litPlugin(options.lit),
  framework(options),
];

const framework = (options: LitElysiaOptions): Plugin => {
  let config: ResolvedConfig;
  const adapter = ADAPTERS[options.adapter ?? 'node'];
  const routesDir = () =>
    path.resolve(config.root, options.routes ?? 'src/routes');
  const typesFile = () =>
    options.types === false
      ? undefined
      : path.resolve(
          config.root,
          options.types ??
            path.join(
              path.dirname(options.routes ?? 'src/routes'),
              'routes.gen.d.ts'
            )
        );
  const serverFile = () => {
    const file = path.resolve(config.root, options.server ?? 'src/server.ts');
    return existsSync(file) ? normalizePath(file) : undefined;
  };

  return {
    name: '@oddsquad/lit-elysia',

    config: (_, {command}) => ({
      appType: 'custom',
      // Lit's hydrate support, a dependency of this package, patches the
      // project's Lit, so both have to load the one copy.
      resolve: {
        dedupe: ['lit', 'lit-html', 'lit-element', '@lit/reactive-element'],
      },
      // Its sources are TypeScript, which Node cannot load as a dependency.
      ssr: {noExternal: ['@oddsquad/lit-elysia']},
      optimizeDeps: {
        entries: [
          `${options.routes ?? 'src/routes'}/**/*.{ts,js}`,
          `!**/*.server.{ts,js}`,
        ],
      },
      builder: {
        buildApp: async (builder) => {
          // The client first: the server entry inlines its index.html.
          await builder.build(builder.environments.client!);
          await adapter.afterClient?.(
            path.resolve(builder.config.root, 'dist/client')
          );
          await builder.build(builder.environments.ssr!);
        },
      },
      environments: {
        // The manifest maps each page to its chunks, for the preloads.
        client: {build: {outDir: 'dist/client', manifest: true}},
        ssr: mergeConfig(
          {
            build: {
              outDir: 'dist/server',
              ssr: true,
              rollupOptions: {
                input: {
                  entry: ENTRY_ID,
                  ...(adapter.start && {index: START_ID}),
                },
                ...(command === 'build' && {external: [/^node:/]}),
                // Every chunk beside the entries: shared code finds the
                // client's files at ../client/ from any of them.
                output: {chunkFileNames: '[name]-[hash].js'},
              },
            },
          },
          adapter.ssr ?? {}
        ),
      },
    }),

    configResolved(resolved) {
      config = resolved;
    },

    async buildStart() {
      await writeRouteTypes(routesDir(), typesFile(), serverFile());
    },

    resolveId(id) {
      if (id === CLIENT_URL) return CLIENT_ID;
      if (id === SERVER_ID) return RESOLVED_SERVER_ID;
      if (id === ENTRY_ID) return RESOLVED_ENTRY_ID;
      if (id === START_ID) return RESOLVED_START_ID;
      return undefined;
    },

    async load(id) {
      if (id === CLIENT_ID) {
        const {pages, errors} = await scanRoutes(routesDir());
        return clientModule([...pages, ...errors], config.command === 'serve');
      }
      if (id === RESOLVED_SERVER_ID) {
        return serverModule(
          await scanRoutes(routesDir()),
          serverFile(),
          options.csp,
          config.command === 'serve'
        );
      }
      if (id === RESOLVED_ENTRY_ID) {
        const client = path.resolve(config.root, 'dist/client');
        const shell = await readFile(path.join(client, 'index.html'), 'utf8');
        const preloads = await preloadsOf(
          config,
          await scanRoutes(routesDir()),
          path.join(client, '.vite/manifest.json')
        );
        return entryModule(shell, preloads, adapter);
      }
      if (id === RESOLVED_START_ID) return adapter.start?.(ENTRY_ID);
      return undefined;
    },

    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        {
          tag: 'script',
          // Async: it waits for the page's first data record itself, so a
          // page still streaming deferred data hydrates before it ends.
          attrs: {type: 'module', async: true, src: CLIENT_URL},
          injectTo: 'head',
        },
      ],
    },

    configureServer(server) {
      watchRoutes(server, routesDir(), () =>
        writeRouteTypes(routesDir(), typesFile(), serverFile())
      );
      // The server module's exports type loads and the Eden client.
      server.watcher.on('change', (changed) => {
        if (path.resolve(changed) === serverFile()) {
          void writeRouteTypes(routesDir(), typesFile(), serverFile());
        }
      });
      // After Vite's own middleware, so its files and modules come first and
      // anything left over goes to Elysia.
      return () => {
        server.middlewares.use((req, res, next) => {
          handle(server, req, res).catch(next);
        });
      };
    },

    // An edit to code only the server runs, such as a `load`, changes
    // nothing the open page has: reload it so it asks the server again.
    hotUpdate({file, server}) {
      if (this.environment.name !== 'ssr') return;
      const client = server.environments.client.moduleGraph;
      if (client.getModulesByFile(file)?.size) return;
      server.environments.client.hot.send({type: 'full-reload'});
    },
  };
};

/** The Elysia apps built from each version of the server module. */
const apps = new WeakMap<
  object,
  {fetch: (request: Request) => Promise<Response> | Response}
>();

const handle = async (
  server: ViteDevServer,
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse
) => {
  const ssr = server.environments.ssr;
  if (!isRunnableDevEnvironment(ssr)) {
    throw new Error('[lit-elysia] the ssr environment cannot run modules');
  }
  const module = (await ssr.runner.import(SERVER_ID)) as {
    createApp: (shell: (url: string) => Promise<string>) => {
      fetch: (request: Request) => Promise<Response> | Response;
    };
  };
  let app = apps.get(module);
  if (!app) {
    const index = path.join(server.config.root, 'index.html');
    app = module.createApp(async (url) =>
      server.transformIndexHtml(url, await readFile(index, 'utf8'))
    );
    apps.set(module, app);
  }
  const origin = `http://${req.headers.host ?? 'localhost'}`;
  try {
    await sendResponse(res, await app.fetch(toRequest(req, origin)));
  } catch (error) {
    if (error instanceof Error) server.ssrFixStacktrace(error);
    throw error;
  }
};

/** A page added or removed changes the routes: rebuild them, then reload. */
const watchRoutes = (
  server: ViteDevServer,
  dir: string,
  changed: () => Promise<void>
) => {
  const onChange = (file: string) => {
    if (!path.resolve(file).startsWith(dir + path.sep)) return;
    void changed();
    for (const env of Object.values(server.environments)) {
      for (const id of [CLIENT_ID, RESOLVED_SERVER_ID]) {
        const module = env.moduleGraph.getModuleById(id);
        if (module) env.moduleGraph.invalidateModule(module);
      }
    }
    server.environments.client.hot.send({type: 'full-reload'});
  };
  server.watcher.on('add', onChange);
  server.watcher.on('unlink', onChange);
};

const json = (value: unknown) => JSON.stringify(value);

/**
 * The server module's types for the list: its default export, the app
 * Eden types its client by, and its `context` plugin, which types loads.
 * Found by reading the file, so a server module that doesn't exist or
 * doesn't export them adds nothing.
 */
const serverTypes = async (target: string, serverFile: string | undefined) => {
  if (!serverFile) return '';
  const code = await readFile(serverFile, 'utf8').catch(() => '');
  const from = json(
    `./${path.relative(path.dirname(target), serverFile).replace(/\.[cm]?[jt]s$/, '')}`
  ).replaceAll('"', "'");
  return [
    /export\s+default\b/.test(code) &&
      `\n    app: typeof import(${from}).default;`,
    /export\s+const\s+context\b/.test(code) &&
      `\n    context: typeof import(${from}).context;`,
  ]
    .filter(Boolean)
    .join('');
};

/**
 * Writes the route list that types `href` and `route`, when it changed, so
 * an editor watching the file only hears of real changes.
 */
const writeRouteTypes = async (
  dir: string,
  target: string | undefined,
  serverFile: string | undefined
) => {
  if (!target) return;
  const {pages} = await scanRoutes(dir);
  // Laid out as the formatter would, so the two never rewrite each other.
  const union =
    pages
      .map((page) => `      | '${page.path.replaceAll("'", "\\'")}'`)
      .join('\n') || '      never';
  const content = `// Written by @oddsquad/lit-elysia from the routes folder. Don't edit.
declare module '@oddsquad/lit-elysia/routes' {
  interface Register {
    routes:
${union};${await serverTypes(target, serverFile)}
  }
}

export {};
`;
  const current = await readFile(target, 'utf8').catch(() => undefined);
  if (current !== content) await writeFile(target, content);
};

const file = (name: string) => json(normalizePath(name));

const clientModule = (routes: RouteFile[], dev: boolean) => {
  const files = [
    ...new Set(
      routes.flatMap((route) => [
        route.page,
        ...route.layouts.map((layout) => layout.page),
      ])
    ),
  ].map(file);
  return `
import {boot, hotModule} from ${json(runtime('./client.ts'))};
const site = {
  files: {
${files.map((name) => `    ${name}: () => import(${name}),`).join('\n')}
  },
  routes: {
${routes
  .map(
    (route) =>
      `    ${json(route.path)}: {page: ${file(route.page)}, layouts: [${route.layouts.map((layout) => file(layout.page)).join(', ')}]},`
  )
  .join('\n')}
  },
};
boot(site);
${dev ? hotAccept(files) : ''}`;
};

/**
 * The client entry is the HMR boundary for the pages and layouts: an edited
 * one renders again in place instead of reloading. Vite reads the list as
 * written, so it is spelled out.
 */
const hotAccept = (files: string[]) => `
if (import.meta.hot) {
  const files = [${files.join(', ')}];
  import.meta.hot.accept([${files.join(', ')}], (modules) => {
    modules.forEach((module, i) => module && hotModule(site, files[i], module));
  });
}
`;

/** A module and its loader, as the server entry's routes list them. */
const serverModuleOf = ({page, server}: {page: string; server?: string}) =>
  `page: () => import(${file(page)})${server ? `, server: () => import(${file(server)})` : ''}`;

const routeList = (routes: RouteFile[]) =>
  routes
    .map(
      (route) =>
        `  {path: ${json(route.path)}, ${serverModuleOf(route)}, layouts: [${route.layouts
          .map((layout) => `{${serverModuleOf(layout)}}`)
          .join(', ')}]},`
    )
    .join('\n');

const serverModule = (
  {pages, errors}: Routes,
  serverFile: string | undefined,
  csp: string | undefined,
  dev: boolean
) => `
import {Elysia} from 'elysia';
import {pages} from ${json(runtime('./server.ts'))};
${serverFile ? `import * as user from ${json(serverFile)};` : 'const user = {};'}
const userApp = user.default;
const routes = [
${routeList(pages)}
];
const errors = [
${routeList(errors)}
];
// The user's app goes in as a plugin, so its prefix and scoped hooks stay
// its own instead of reaching the pages. The pages are added to its
// \`context\` plugin, when it has one, so its locals and guards reach them.
export const createApp = (shell, extra = {}) => {
  const app = new Elysia();
  if (userApp) app.use(userApp);
  return app.use(
    pages({routes, errors, shell, base: user.context, csp: ${json(csp)}, cspReportOnly: ${dev}, ...extra})
  );
};
`;

const entryModule = (
  shell: string,
  preloads: Record<string, string[]>,
  adapter: Adapter
) => `
import {createApp} from ${json(SERVER_ID)};
${adapter.servesStatic ? `import {staticFiles} from ${json(runtime('./static.ts'))};` : ''}
const shell = ${json(shell)};
const preloads = ${json(preloads)};
const pages = createApp(() => shell, {preloads});
const app = ${
  adapter.servesStatic
    ? "staticFiles(new URL('../client/', import.meta.url)).use(pages)"
    : 'pages'
};
${adapter.exportApp}
`;

interface ManifestChunk {
  file: string;
  imports?: string[];
  css?: string[];
}

/**
 * Each route's chunks, from the client build's manifest: its page's and
 * layouts', the chunks they import, and their CSS. The document links
 * them, so the browser fetches them alongside the client entry instead of
 * one after another.
 */
const preloadsOf = async (
  config: ResolvedConfig,
  {pages, errors}: Routes,
  manifestFile: string
): Promise<Record<string, string[]>> => {
  const manifest = JSON.parse(
    await readFile(manifestFile, 'utf8').catch(() => '{}')
  ) as Record<string, ManifestChunk>;
  const keyOf = (file: string) =>
    normalizePath(path.relative(config.root, file));
  const collect = (key: string, into: Set<string>) => {
    const chunk = manifest[key];
    if (!chunk || into.has(config.base + chunk.file)) return;
    into.add(config.base + chunk.file);
    for (const css of chunk.css ?? []) into.add(config.base + css);
    for (const imported of chunk.imports ?? []) collect(imported, into);
  };
  return Object.fromEntries(
    [...pages, ...errors].map((route) => {
      const files = new Set<string>();
      for (const file of [
        route.page,
        ...route.layouts.map((layout) => layout.page),
      ]) {
        collect(keyOf(file), files);
      }
      return [route.path, [...files]];
    })
  );
};
