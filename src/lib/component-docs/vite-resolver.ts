/**
 * Resolves a scan's imports with a Vite server in middleware mode, so the
 * project's `vite.config` aliases and resolve conditions apply. Only loaded
 * when the project has a Vite config.
 */

import {type PluginOption, createServer, loadConfigFromFile} from 'vite';
import type {ImportResolver} from './index-module.js';

/** This package's plugins: serving the panel or patching modules has no place in a scan. */
const isOwnPlugin = (name: string): boolean =>
  name.startsWith('lit-') || name === 'devframe:lit';

/** `plugins` flattened, without this package's own. */
const foreignPlugins = async (
  plugins: PluginOption[]
): Promise<PluginOption[]> => {
  const out: PluginOption[] = [];
  for (const option of plugins) {
    const plugin = await option;
    if (Array.isArray(plugin)) out.push(...(await foreignPlugins(plugin)));
    else if (plugin && !isOwnPlugin(plugin.name)) out.push(plugin);
  }
  return out;
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
  const loaded = await loadConfigFromFile(
    {command: 'serve', mode: 'development'},
    configFile,
    root,
    'silent'
  );
  if (!loaded) return undefined;
  const server = await createServer({
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
