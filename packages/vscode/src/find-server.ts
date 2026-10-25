/**
 * Picks the language server the extension starts, in order: the
 * `lit.server.path` setting; the project's own install of
 * `@oddsquad/lit-language-server`, or of `@oddsquad/lit-devtools`, which
 * installs it as its own dependency where pnpm keeps it out of the project's
 * `node_modules`, so its version matches the project; the package's source in
 * the vite-plugin-lit repo itself; else the copy bundled with the extension.
 */

import {isAbsolute, join, resolve} from 'node:path';

/** A package that can start the server, and the file that does. */
interface ServerPackage {
  name: string;
  bin: string;
}

const SERVER: ServerPackage = {
  name: '@oddsquad/lit-language-server',
  bin: 'dist/bin.mjs',
};
const UMBRELLA: ServerPackage = {
  name: '@oddsquad/lit-devtools',
  bin: 'bin/lit-language-server.mjs',
};

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

/** Whether `dir` holds a built copy of `pkg`. */
const isBuilt = (
  dir: string,
  pkg: ServerPackage,
  readText: FindServerOptions['readText']
): boolean => {
  const manifest = readText(join(dir, 'package.json'));
  if (manifest === undefined || readText(join(dir, pkg.bin)) === undefined)
    return false;
  try {
    return (JSON.parse(manifest) as {name?: unknown}).name === pkg.name;
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
    const candidates: [string, ServerPackage, ServerSource][] = [
      [join(folder, 'node_modules', SERVER.name), SERVER, 'project'],
      [join(folder, 'node_modules', UMBRELLA.name), UMBRELLA, 'project'],
      // This repo: the workspace package, built by `vp pack`.
      [join(folder, 'packages/lit-language-server'), SERVER, 'repo'],
    ];
    for (const [dir, pkg, source] of candidates) {
      if (isBuilt(dir, pkg, readText))
        return {path: join(dir, pkg.bin), source};
    }
  }
  return {path: bundled, source: 'bundled'};
};
