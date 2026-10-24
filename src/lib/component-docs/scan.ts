/**
 * Reads a project's sources into a source-docs index without building or
 * serving it, for the `lit-devtools manifest` command: every script under the
 * given folders, imports resolved by a Vite server in middleware mode, so the
 * project's `vite.config` aliases and resolve conditions apply.
 */

import {readFile, readdir} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {createServer} from 'vite';
import {type ImportResolver, indexModule} from '../plugins/component-docs.js';
import {createSourceDocsIndex, type SourceDocsIndex} from './source-index.js';

const SCRIPT_RE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const DECLARATION_RE = /\.d\.[cm]?ts$/;

/** Folders never read: dependencies, build output, tool caches. */
const SKIPPED_DIRS = new Set(['node_modules', 'dist']);

async function* scripts(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, {withFileTypes: true}).catch(() => []);
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) yield* scripts(path);
    } else if (SCRIPT_RE.test(entry.name) && !DECLARATION_RE.test(entry.name))
      yield path;
  }
}

export interface ScanOptions {
  root: string;
  /** Folders to read, relative to `root`. */
  dirs: readonly string[];
  /** The Vite config file to load, or `false` for none; found as Vite does by default. */
  configFile?: string | false;
}

/** The index of every script under `dirs`, and how many files were read. */
export const scanSources = async (
  options: ScanOptions
): Promise<{index: SourceDocsIndex; files: number}> => {
  const root = resolve(options.root);
  const server = await createServer({
    root,
    configFile: options.configFile,
    logLevel: 'error',
    appType: 'custom',
    server: {middlewareMode: true, ws: false, watch: null},
    optimizeDeps: {noDiscovery: true, include: []},
  });
  const index = createSourceDocsIndex((id) => id);
  const context: ImportResolver = {
    resolve: (specifier, importer) =>
      server.pluginContainer.resolveId(specifier, importer),
  };
  let files = 0;
  try {
    for (const dir of options.dirs) {
      for await (const file of scripts(resolve(root, dir))) {
        files++;
        await indexModule(context, index, await readFile(file, 'utf8'), file);
      }
    }
  } finally {
    await server.close();
  }
  return {index, files};
};
