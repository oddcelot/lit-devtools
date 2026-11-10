import {readdir} from 'node:fs/promises';
import * as path from 'node:path';

/** One page found under the routes directory. */
export interface RouteFile {
  /** The Elysia path it answers, such as `/notes/:id`. */
  path: string;
  /** The page module: its template, rendered on the server and hydrated. */
  page: string;
  /** Its `.server.ts` sibling, which loads the page's data on the server. */
  server?: string;
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

/** Files the scan leaves out: types, tests, and anything starting with `_`. */
const ignored = (file: string) =>
  /\.d\.[cm]?ts$/.test(file) ||
  /[._-](?:test|spec)\.[cm]?[jt]s$/.test(file) ||
  file.split(/[\\/]/).some((part) => part.startsWith('_'));

/** Every page under `dir`, each with its `.server.ts` sibling when it has one. */
export const scanRoutes = async (dir: string): Promise<RouteFile[]> => {
  let files: string[];
  try {
    files = await readdir(dir, {recursive: true});
  } catch {
    return [];
  }
  const modules = new Set(
    files.filter((file) => MODULE.test(file) && !ignored(file))
  );
  const routes: RouteFile[] = [];
  for (const file of modules) {
    if (SERVER.test(file)) continue;
    const server = [...modules].find(
      (other) =>
        SERVER.test(other) &&
        other.replace(SERVER, '') === file.replace(MODULE, '')
    );
    routes.push({
      path: routePath(file),
      page: path.join(dir, file),
      ...(server && {server: path.join(dir, server)}),
    });
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path));
};
