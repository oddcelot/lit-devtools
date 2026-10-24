/**
 * Reads a project's sources into a source-docs index without building or
 * serving it, for the `lit-devtools manifest` command: every script under the
 * given folders, imports resolved by a Vite server in middleware mode, so the
 * project's `vite.config` aliases and resolve conditions apply.
 */

import {readFile, readdir} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {
  type PluginOption,
  createServer,
  loadConfigFromFile,
  normalizePath,
} from 'vite';
import {type ImportResolver, indexModule} from '../plugins/component-docs.js';
import {nodeDocsFs} from './load.js';
import {realDir} from './manifest-file.js';
import {createPackageAncestors} from './package-ancestors.js';
import {createSourceDocsIndex, type SourceDocsIndex} from './source-index.js';

const SCRIPT_RE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const DECLARATION_RE = /\.d\.[cm]?ts$/;

/** Folders never read: dependencies, build output, tool caches. */
const SKIPPED_DIRS = new Set(['node_modules', 'dist']);

/** Whether `file` is a script a scan reads: not a declaration file. */
export const isScannedScript = (file: string): boolean =>
  SCRIPT_RE.test(file) && !DECLARATION_RE.test(file);

async function* scripts(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, {withFileTypes: true}).catch(() => []);
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) yield* scripts(path);
    } else if (isScannedScript(entry.name)) yield path;
  }
}

export interface ScanOptions {
  root: string;
  /** Folders to read, relative to `root`. */
  dirs: readonly string[];
  /** The Vite config file to load, or `false` for none; found as Vite does by default. */
  configFile?: string | false;
}

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
 * Reads every script under `dirs` (relative to `root`) into `index`, imports
 * resolved by `resolver`. Returns how many files it read.
 */
export const indexDirs = async (
  resolver: ImportResolver,
  index: SourceDocsIndex,
  root: string,
  dirs: readonly string[]
): Promise<number> => {
  let files = 0;
  for (const dir of dirs) {
    // Under the real path, as Vite resolves the imports that lead here.
    for await (const file of scripts(realDir(resolve(root, dir)))) {
      files++;
      const id = normalizePath(file);
      await indexModule(resolver, index, await readFile(file, 'utf8'), id);
    }
  }
  return files;
};

/** The index of every script under `dirs`, and how many files were read. */
export const scanSources = async (
  options: ScanOptions
): Promise<{index: SourceDocsIndex; files: number}> => {
  const root = resolve(options.root);
  // Loaded here rather than by `createServer`, so this package's plugins can
  // be left out of it.
  const loaded =
    options.configFile === false
      ? undefined
      : await loadConfigFromFile(
          {command: 'serve', mode: 'development'},
          options.configFile,
          root,
          'silent'
        );
  const config = loaded?.config ?? {};
  const server = await createServer({
    ...config,
    plugins: await foreignPlugins(config.plugins ?? []),
    root,
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: {middlewareMode: true, ws: false, watch: null},
    optimizeDeps: {noDiscovery: true, include: []},
  });
  const index = createSourceDocsIndex(
    (id) => id,
    createPackageAncestors(await nodeDocsFs())
  );
  const context: ImportResolver = {
    resolve: (specifier, importer) =>
      server.pluginContainer.resolveId(specifier, importer),
  };
  try {
    return {index, files: await indexDirs(context, index, root, options.dirs)};
  } finally {
    await server.close();
  }
};
