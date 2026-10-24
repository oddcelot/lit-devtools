/**
 * The manifest as a file: the index rendered to its JSON text, and that text
 * written into the project. Shared by the plugin's outputs and the CLI.
 */

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, posix, relative, resolve} from 'node:path';
import {normalizePath} from 'vite';
import type {SourceDocsIndex} from './source-index.js';
import {writeManifest} from './write-manifest.js';

/** The manifest `index` holds, as file text, module paths relative to `root`. */
export const manifestText = (index: SourceDocsIndex, root: string): string => {
  const base = normalizePath(root);
  const manifest = writeManifest(index.modules(), (id) =>
    posix.relative(base, normalizePath(id))
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
