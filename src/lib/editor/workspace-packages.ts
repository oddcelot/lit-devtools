/**
 * Finds the workspace a file belongs to and the packages in it: the folders a
 * `pnpm-workspace.yaml` or a `package.json` `workspaces` field names, plus the
 * root package. A file outside any workspace gets its nearest package alone.
 */

import {existsSync, readFileSync} from 'node:fs';
import {readdir} from 'node:fs/promises';
import {dirname, join, relative} from 'node:path';
import {normalizePath} from '../component-docs/paths.js';

export interface WorkspacePackage {
  /** Absolute, `/`-separated. */
  dir: string;
  /** From its `package.json`; undefined when it has none. */
  name?: string;
}

export interface WorkspaceLayout {
  root: string;
  /** The root package first, then the others in path order. */
  packages: WorkspacePackage[];
}

const readJson = (file: string): Record<string, unknown> | undefined => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

/** The `packages:` list of a `pnpm-workspace.yaml`, read line by line. */
const pnpmPatterns = (yaml: string): string[] => {
  const patterns: string[] = [];
  let inList = false;
  for (const line of yaml.split('\n')) {
    if (/^packages\s*:/.test(line)) inList = true;
    else if (inList && /^\s+-\s*/.test(line)) {
      patterns.push(
        line.replace(/^\s+-\s*/, '').replace(/^['"]|['"]\s*$/g, '')
      );
    } else if (inList && /^\S/.test(line)) inList = false;
  }
  return patterns.map((pattern) => pattern.trim()).filter(Boolean);
};

/** The `workspaces` of a `package.json`: an array, or `{packages: […]}`. */
const npmPatterns = (json: Record<string, unknown>): string[] | undefined => {
  const field = json.workspaces;
  const list = Array.isArray(field)
    ? field
    : (field as {packages?: unknown} | undefined)?.packages;
  return Array.isArray(list)
    ? list.filter((item): item is string => typeof item === 'string')
    : undefined;
};

/** The workspace patterns declared in `dir`, or undefined when it declares none. */
const patternsIn = (dir: string): string[] | undefined => {
  const yaml = join(dir, 'pnpm-workspace.yaml');
  if (existsSync(yaml)) return pnpmPatterns(readFileSync(yaml, 'utf8'));
  const json = readJson(join(dir, 'package.json'));
  return json && npmPatterns(json);
};

const parents = (from: string): string[] => {
  const dirs = [from];
  for (let dir = from; dirname(dir) !== dir; dir = dirname(dir)) {
    dirs.push(dirname(dir));
  }
  return dirs;
};

/** `**` any depth, `*` one segment's worth of characters. */
const toRegExp = (pattern: string): RegExp => {
  const body = pattern
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
    .split('/')
    .map((segment) =>
      segment === '**'
        ? '(?:.*)'
        : segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*')
    )
    .join('/');
  return new RegExp(`^${body.replaceAll('(?:.*)/', '(?:.*/)?')}$`);
};

const SKIPPED = new Set(['node_modules', '.git', 'dist']);

/** Every folder under `root` holding a `package.json`, relative and `/`-separated. */
async function* packageDirs(root: string, dir = root): AsyncGenerator<string> {
  const entries = await readdir(dir, {withFileTypes: true}).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIPPED.has(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (existsSync(join(path, 'package.json'))) {
      yield normalizePath(relative(root, path));
    }
    yield* packageDirs(root, path);
  }
}

const packageAt = (dir: string): WorkspacePackage => {
  const name = readJson(join(dir, 'package.json'))?.name;
  return {
    dir: normalizePath(dir),
    ...(typeof name === 'string' ? {name} : {}),
  };
};

/**
 * The workspace `file` (or folder) belongs to: the nearest folder up from it
 * that declares workspace patterns, with every package they match; else the
 * nearest package alone. Undefined outside any package.
 */
export const findWorkspace = async (
  file: string
): Promise<WorkspaceLayout | undefined> => {
  const dirs = parents(
    existsSync(join(file, 'package.json')) ? file : dirname(file)
  );
  const root = dirs.find((dir) => patternsIn(dir) !== undefined);
  if (root === undefined) {
    const own = dirs.find((dir) => existsSync(join(dir, 'package.json')));
    return own === undefined
      ? undefined
      : {root: normalizePath(own), packages: [packageAt(own)]};
  }
  const patterns = patternsIn(root) ?? [];
  const include = patterns.filter((p) => !p.startsWith('!')).map(toRegExp);
  const exclude = patterns
    .filter((p) => p.startsWith('!'))
    .map((p) => toRegExp(p.slice(1)));
  const matched: string[] = [];
  for await (const dir of packageDirs(root)) {
    if (
      include.some((re) => re.test(dir)) &&
      !exclude.some((re) => re.test(dir))
    ) {
      matched.push(dir);
    }
  }
  const packages = [
    ...(existsSync(join(root, 'package.json')) ? [packageAt(root)] : []),
    ...matched.sort().map((dir) => packageAt(join(root, dir))),
  ];
  return {root: normalizePath(root), packages};
};

/** The package of `packages` that holds `file`: the deepest whose folder contains it. */
export const packageOf = (
  packages: readonly WorkspacePackage[],
  file: string
): WorkspacePackage | undefined =>
  packages
    .filter((pkg) => file.startsWith(`${pkg.dir}/`))
    .sort((a, b) => b.dir.length - a.dir.length)[0];
