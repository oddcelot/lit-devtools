import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {litPlugin, type LitPluginOptions} from '@oddsquad/vite-plugin-lit';
import {
  isRunnableDevEnvironment,
  normalizePath,
  type Plugin,
  type PluginOption,
  type ResolvedConfig,
  type ViteDevServer,
} from 'vite';
import {sendResponse, toRequest} from './node.ts';
import {scanRoutes, type RouteFile} from './routes.ts';

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
  const routesDir = () =>
    path.resolve(config.root, options.routes ?? 'src/routes');
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
          await builder.build(builder.environments.ssr!);
        },
      },
      environments: {
        client: {build: {outDir: 'dist/client', manifest: false}},
        ssr: {
          build: {
            outDir: 'dist/server',
            ssr: true,
            rollupOptions: {
              input: {entry: ENTRY_ID},
              ...(command === 'build' && {external: [/^node:/]}),
            },
          },
        },
      },
    }),

    configResolved(resolved) {
      config = resolved;
    },

    resolveId(id) {
      if (id === CLIENT_URL) return CLIENT_ID;
      if (id === SERVER_ID) return RESOLVED_SERVER_ID;
      if (id === ENTRY_ID) return RESOLVED_ENTRY_ID;
      return undefined;
    },

    async load(id) {
      if (id === CLIENT_ID) {
        const routes = await scanRoutes(routesDir());
        return clientModule(routes, config.command === 'serve');
      }
      if (id === RESOLVED_SERVER_ID) {
        return serverModule(await scanRoutes(routesDir()), serverFile());
      }
      if (id === RESOLVED_ENTRY_ID) {
        const shell = await readFile(
          path.resolve(config.root, 'dist/client/index.html'),
          'utf8'
        );
        return entryModule(shell);
      }
      return undefined;
    },

    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        {
          tag: 'script',
          attrs: {type: 'module', src: CLIENT_URL},
          injectTo: 'head',
        },
      ],
    },

    configureServer(server) {
      watchRoutes(server, routesDir());
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
const watchRoutes = (server: ViteDevServer, dir: string) => {
  const onChange = (file: string) => {
    if (!path.resolve(file).startsWith(dir + path.sep)) return;
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

const serverModule = (routes: RouteFile[], serverFile: string | undefined) => `
import {Elysia} from 'elysia';
import {pages} from ${json(runtime('./server.ts'))};
${serverFile ? `import userApp from ${json(serverFile)};` : 'const userApp = undefined;'}
const routes = [
${routes
  .map(
    (route) =>
      `  {path: ${json(route.path)}, ${serverModuleOf(route)}, layouts: [${route.layouts
        .map((layout) => `{${serverModuleOf(layout)}}`)
        .join(', ')}]},`
  )
  .join('\n')}
];
// The user's app goes in as a plugin, so its prefix and scoped hooks stay
// its own instead of reaching the pages.
export const createApp = (shell) => {
  const app = new Elysia();
  if (userApp) app.use(userApp);
  return app.use(pages({routes, shell}));
};
`;

const entryModule = (shell: string) => `
import {createApp} from ${json(SERVER_ID)};
import {staticFiles} from ${json(runtime('./static.ts'))};
const shell = ${json(shell)};
const app = staticFiles(new URL('../client/', import.meta.url));
export default app.use(createApp(() => shell));
`;
