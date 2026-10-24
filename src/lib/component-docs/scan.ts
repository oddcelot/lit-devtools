/**
 * Reads a project's sources into a source-docs index without building or
 * serving it, for the `lit-devtools manifest` command: every script under the
 * given folders. Imports resolve through the project's Vite config when it
 * has one, so its aliases and resolve conditions apply, and Node's way
 * otherwise.
 */

import {readFile, readdir} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {type ImportResolver, indexModule} from './index-module.js';
import {nodeDocsFs} from './load.js';
import {createNodeResolver} from './node-resolver.js';
import {realDir} from './manifest-file.js';
import {normalizePath} from './paths.js';
import {createPackageAncestors} from './package-ancestors.js';
import {createSourceDocsIndex, type SourceDocsIndex} from './source-index.js';
import {findViteConfig} from './vite-config.js';

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

/**
 * The resolver a scan uses: the project's Vite config's when it has one, so
 * its aliases and resolve conditions apply, and Node's otherwise. Vite is
 * loaded only in the first case, so a project without it can be scanned.
 */
const scanResolver = async (
  root: string,
  configFile: string | false | undefined
): Promise<{resolver: ImportResolver; close?: () => Promise<void>}> => {
  const usesVite =
    configFile === undefined
      ? findViteConfig(root) !== undefined
      : configFile !== false;
  const vite = usesVite
    ? await (
        await import('./vite-resolver.js')
      ).createViteResolver(root, configFile || undefined)
    : undefined;
  return vite ?? {resolver: createNodeResolver()};
};

/** The index of every script under `dirs`, and how many files were read. */
export const scanSources = async (
  options: ScanOptions
): Promise<{index: SourceDocsIndex; files: number}> => {
  const root = resolve(options.root);
  const {resolver, close} = await scanResolver(root, options.configFile);
  const index = createSourceDocsIndex(
    (id) => id,
    createPackageAncestors(await nodeDocsFs())
  );
  try {
    return {index, files: await indexDirs(resolver, index, root, options.dirs)};
  } finally {
    await close?.();
  }
};
