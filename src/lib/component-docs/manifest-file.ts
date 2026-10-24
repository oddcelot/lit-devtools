/**
 * The manifest as a file: the index rendered to its JSON text, and that text
 * written into the project. Shared by the plugin's outputs and the CLI.
 */

import {realpathSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, posix, relative, resolve} from 'node:path';
import {normalizePath} from './paths.js';
import type {SourceDocsIndex} from './source-index.js';
import {type ManifestPaths, writeManifest} from './write-manifest.js';

/**
 * `dir` with symlinks resolved, forward slashes, as Vite writes module ids:
 * a project opened through a symlink (macOS `/tmp`, a linked workspace) has
 * ids under the real path, and paths compared with them must be too.
 */
export const realDir = (dir: string): string => {
  try {
    return normalizePath(realpathSync(dir));
  } catch {
    return normalizePath(dir);
  }
};

/**
 * The manifest `index` holds, as file text. Module paths are the source
 * files' relative to `root`, unless `paths` says otherwise.
 */
export const manifestText = (
  index: SourceDocsIndex,
  root: string,
  paths?: ManifestPaths
): string => {
  const base = realDir(root);
  const manifest = writeManifest(
    index.modules(),
    paths ?? {path: (id) => posix.relative(base, normalizePath(id))}
  );
  return `${JSON.stringify(manifest, null, 2)}\n`;
};

/**
 * Writes `text` to `file` (relative to `root`) unless it already holds it,
 * and points the root's `package.json` at it when that names no manifest
 * yet, telling `log` so.
 */
export const writeManifestFile = async (
  root: string,
  file: string,
  text: string,
  log: (message: string) => void
): Promise<void> => {
  const target = resolve(root, file);
  const current = await readFile(target, 'utf8').catch(() => undefined);
  if (current !== text) {
    await mkdir(dirname(target), {recursive: true});
    await writeFile(target, text);
  }
  const pkgPath = resolve(root, 'package.json');
  const pkgText = await readFile(pkgPath, 'utf8').catch(() => undefined);
  if (pkgText === undefined) return;
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(pkgText) as Record<string, unknown>;
  } catch {
    return;
  }
  if (pkg.customElements !== undefined) return;
  const field = normalizePath(relative(root, target));
  pkg.customElements = field;
  const indent = /^[ \t]+/m.exec(pkgText)?.[0] ?? '  ';
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, indent)}\n`);
  log(`set "customElements": "${field}" in package.json`);
};

/** What `bundlePaths` reads of an output chunk. */
export interface BuiltChunk {
  fileName: string;
  /** Each module the chunk was built from; `renderedLength` 0 when tree-shaking dropped all of it. */
  modules: Readonly<Record<string, {renderedLength: number}>>;
  /** The module the chunk stands for, such as an entry that only re-exports. */
  facadeModuleId: string | null;
  exports: readonly string[];
}

/**
 * Module paths for a built bundle: each source module is written as the
 * chunk that holds it, relative to `root` (`dist/x-a.js`), and keeps an
 * export only when that chunk exports the name. A module tree-shaking
 * dropped, whose code is in no chunk, is left out.
 */
export const bundlePaths = (
  chunks: readonly BuiltChunk[],
  outDir: string,
  root: string
): ManifestPaths => {
  const dir = posix.relative(normalizePath(root), normalizePath(outDir));
  const chunkOf = new Map<string, BuiltChunk>();
  for (const chunk of chunks) {
    for (const [id, module] of Object.entries(chunk.modules))
      if (module.renderedLength > 0) chunkOf.set(normalizePath(id), chunk);
    // A barrel renders no code of its own, but it is the chunk's face.
    if (chunk.facadeModuleId !== null)
      chunkOf.set(normalizePath(chunk.facadeModuleId), chunk);
  }
  return {
    path: (id) => {
      const chunk = chunkOf.get(normalizePath(id));
      return chunk === undefined ? undefined : posix.join(dir, chunk.fileName);
    },
    exported: (id, name) =>
      chunkOf.get(normalizePath(id))?.exports.includes(name) ?? false,
  };
};
