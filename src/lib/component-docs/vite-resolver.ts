/**
 * Resolves a scan's imports with a Vite server in middleware mode, so the
 * project's `vite.config` aliases and resolve conditions apply. Only loaded
 * when the project has a Vite config.
 */

import {pathToFileURL} from 'node:url';
import {ResolverFactory} from 'oxc-resolver';
import type {Plugin, PluginOption} from 'vite';
import type {LitPluginOptions} from '../options.js';
import type {ImportResolver} from './index-module.js';

/** This package's plugins: serving the panel or patching modules has no place in a scan. */
const isOwnPlugin = (name: string): boolean =>
  name.startsWith('lit-') || name === 'devframe:lit';

/** `plugins` flattened, awaited, without the empty ones. */
const flatPlugins = async (plugins: PluginOption[]): Promise<Plugin[]> => {
  const out: Plugin[] = [];
  for (const option of plugins) {
    const plugin = await option;
    if (Array.isArray(plugin)) out.push(...(await flatPlugins(plugin)));
    else if (plugin) out.push(plugin as Plugin);
  }
  return out;
};

/** `plugins` flattened, without this package's own. */
const foreignPlugins = async (plugins: PluginOption[]): Promise<Plugin[]> =>
  (await flatPlugins(plugins)).filter((plugin) => !isOwnPlugin(plugin.name));

type Vite = typeof import('vite');

const viteResolver = new ResolverFactory({
  conditionNames: ['node', 'import', 'default'],
});

/**
 * The project's own Vite, so a server installed outside the project (the one
 * the VS Code extension bundles) loads the version its config is written
 * for; this package's, when the project's can't be found.
 */
const loadVite = async (root: string): Promise<Vite> => {
  const {path} = viteResolver.sync(root, 'vite');
  if (path) {
    try {
      return (await import(pathToFileURL(path).href)) as Vite;
    } catch {
      // Not loadable from here; fall back to this package's.
    }
  }
  return import('vite');
};

const loadConfig = async (root: string, configFile: string | undefined) => {
  const vite = await loadVite(root);
  const loaded = await vite.loadConfigFromFile(
    {command: 'serve', mode: 'development'},
    configFile,
    root,
    'silent'
  );
  return loaded ? {vite, ...loaded} : undefined;
};

/**
 * The options `litPlugin()` was given in the project's Vite config, read off
 * its options plugin's `api`; undefined without a config or the plugin.
 */
export const readLitPluginOptions = async (
  root: string,
  configFile: string | undefined
): Promise<LitPluginOptions | undefined> => {
  const loaded = await loadConfig(root, configFile);
  const plugins = await flatPlugins(loaded?.config.plugins ?? []);
  const own = plugins.find((plugin) => plugin.name === 'lit-plugin-options');
  return (own?.api as {options?: LitPluginOptions} | undefined)?.options;
};

/**
 * A resolver backed by the project's Vite config, and how to close its
 * server; undefined when no config file is found.
 */
export const createViteResolver = async (
  root: string,
  configFile: string | undefined
): Promise<
  {resolver: ImportResolver; close: () => Promise<void>} | undefined
> => {
  // Loaded here rather than by `createServer`, so this package's plugins can
  // be left out of it.
  const loaded = await loadConfig(root, configFile);
  if (!loaded) return undefined;
  const server = await loaded.vite.createServer({
    ...loaded.config,
    plugins: await foreignPlugins(loaded.config.plugins ?? []),
    root,
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: {middlewareMode: true, ws: false, watch: null},
    optimizeDeps: {noDiscovery: true, include: []},
  });
  return {
    resolver: {
      resolve: (specifier, importer) =>
        server.pluginContainer.resolveId(specifier, importer),
    },
    close: () => server.close(),
  };
};
