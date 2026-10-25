/**
 * Picks the language server the extension starts, in order: the
 * `lit.server.path` setting; the project's own install of
 * `@oddsquad/lit-language-server`, so its version matches the project; the
 * package's source in the vite-plugin-lit repo itself; else the copy bundled
 * with the extension.
 */

import {isAbsolute, join, resolve} from 'node:path';

const PACKAGE = '@oddsquad/lit-language-server';
const BIN = 'dist/bin.mjs';

export type ServerSource = 'setting' | 'project' | 'repo' | 'bundled';

export interface FoundServer {
  path: string;
  source: ServerSource;
}

export interface FindServerOptions {
  /** The `lit.server.path` setting. */
  setting?: string | null;
  /** The workspace folders' paths, first one first. */
  folders: readonly string[];
  /** The server bundled with the extension. */
  bundled: string;
  /** A file's text, or undefined when there's none. */
  readText: (file: string) => string | undefined;
}

/** Whether `dir` holds a built copy of the language server package. */
const isBuiltServer = (
  dir: string,
  readText: FindServerOptions['readText']
): boolean => {
  const manifest = readText(join(dir, 'package.json'));
  if (manifest === undefined || readText(join(dir, BIN)) === undefined)
    return false;
  try {
    return (JSON.parse(manifest) as {name?: unknown}).name === PACKAGE;
  } catch {
    return false;
  }
};

export const findServer = ({
  setting,
  folders,
  bundled,
  readText,
}: FindServerOptions): FoundServer => {
  if (setting) {
    const path = isAbsolute(setting)
      ? setting
      : resolve(folders[0] ?? '', setting);
    return {path, source: 'setting'};
  }
  for (const folder of folders) {
    const candidates: [string, ServerSource][] = [
      [join(folder, 'node_modules', PACKAGE), 'project'],
      // This repo: the workspace package, built by `vp pack`.
      [join(folder, 'packages/lit-language-server'), 'repo'],
    ];
    for (const [dir, source] of candidates) {
      if (isBuiltServer(dir, readText)) return {path: join(dir, BIN), source};
    }
  }
  return {path: bundled, source: 'bundled'};
};
