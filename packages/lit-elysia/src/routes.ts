import {readdir} from 'node:fs/promises';
import * as path from 'node:path';

/** A module and its `.server.ts` sibling, which loads its data. */
export interface ModuleFiles {
  /** The module: its template, rendered on the server and hydrated. */
  page: string;
  /** Its `.server.ts` sibling, which loads its data on the server. */
  server?: string;
}

/** One page found under the routes directory. */
export interface RouteFile extends ModuleFiles {
  /** The Elysia path it answers, such as `/notes/:id`. */
  path: string;
  /** The `_layout.ts` files around it, outermost first. */
  layouts: ModuleFiles[];
}

const MODULE = /\.(?:[cm]?[jt]s)$/;
const SERVER = /\.server\.(?:[cm]?[jt]s)$/;

/**
 * The Elysia path for a page file, relative to the routes directory:
 * `index.ts` is `/`, `notes/[id].ts` is `/notes/:id` and
 * `files/[...rest].ts` is `/files/*`.
 */
export const routePath = (file: string): string => {
  const segments = file
    .replace(MODULE, '')
    .split(/[\\/]/)
    .filter((segment) => segment !== 'index')
    .map((segment) => {
      const rest = /^\[\.\.\.(\w+)\]$/.exec(segment);
      if (rest) return '*';
      const param = /^\[(\w+)\]$/.exec(segment);
      return param ? `:${param[1]}` : segment;
    });
  return `/${segments.join('/')}`;
};

/** Types and tests, which are never pages. */
const ignored = (file: string) =>
  /\.d\.[cm]?ts$/.test(file) || /[._-](?:test|spec)\.[cm]?[jt]s$/.test(file);

/** Files the framework reads by name, and folders kept out of the routes. */
const special = (file: string) =>
  file.split('/').some((part) => part.startsWith('_'));

const LAYOUT = /(?:^|\/)_layout\.[cm]?[jt]s$/;

/** Every module under `dir`, relative to it, with `/` between folders. */
const listModules = async (dir: string): Promise<string[]> => {
  try {
    const files = await readdir(dir, {recursive: true});
    return files
      .map((file) => file.split(path.sep).join('/'))
      .filter((file) => MODULE.test(file) && !ignored(file));
  } catch {
    return [];
  }
};

/** A module with its `.server.ts` sibling, when there is one. */
const withServer = (
  dir: string,
  files: string[],
  file: string
): ModuleFiles => {
  const base = file.replace(MODULE, '');
  const server = files.find(
    (other) => SERVER.test(other) && other.replace(SERVER, '') === base
  );
  return {
    page: path.join(dir, file),
    ...(server && {server: path.join(dir, server)}),
  };
};

/** The folders from the routes directory down to `file`'s, outermost first. */
const foldersOf = (file: string) => {
  const parts = file.split('/').slice(0, -1);
  return ['', ...parts.map((_, i) => parts.slice(0, i + 1).join('/'))];
};

/** Every page under `dir`, each with its loader and the layouts around it. */
export const scanRoutes = async (dir: string): Promise<RouteFile[]> => {
  const files = await listModules(dir);
  const layouts = new Map(
    files
      .filter((file) => LAYOUT.test(file))
      .map((file) => [path.posix.dirname(file).replace(/^\.$/, ''), file])
  );
  const layoutsFor = (file: string) =>
    foldersOf(file).flatMap((folder) => {
      const layout = layouts.get(folder);
      return layout ? [withServer(dir, files, layout)] : [];
    });
  return files
    .filter((file) => !SERVER.test(file) && !special(file))
    .map((file) => ({
      path: routePath(file),
      ...withServer(dir, files, file),
      layouts: layoutsFor(file),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
};
