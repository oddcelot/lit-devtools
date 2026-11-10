import {readdir} from 'node:fs/promises';
import * as path from 'node:path';
import {ERROR, NOT_FOUND} from './shared.ts';

/** A module and its `.server.ts` sibling, which loads its data. */
export interface ModuleFiles {
  /** The module: its template, rendered on the server and hydrated. */
  page: string;
  /** Its `.server.ts` sibling, which loads its data on the server. */
  server?: string;
}

/** A `_layout.ts`, named by its folder's path: `/`, `/notes`. */
export interface LayoutFile extends ModuleFiles {
  path: string;
}

/** One page found under the routes directory. */
export interface RouteFile extends ModuleFiles {
  /** The Elysia path it answers, such as `/notes/:id`. */
  path: string;
  /** The `_layout.ts` files around it, outermost first. */
  layouts: LayoutFile[];
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

/** What the scan finds: the pages, and the error pages that answer no path. */
export interface Routes {
  pages: RouteFile[];
  /** `_404.ts` and `_error.ts` at the top, named `#404` and `#error`. */
  errors: RouteFile[];
}

const ERROR_PAGES: Record<string, string> = {_404: NOT_FOUND, _error: ERROR};

/** Every page under `dir`, each with its loader and the layouts around it. */
export const scanRoutes = async (dir: string): Promise<Routes> => {
  const files = await listModules(dir);
  const layouts = new Map(
    files
      .filter((file) => LAYOUT.test(file))
      .map((file) => [path.posix.dirname(file).replace(/^\.$/, ''), file])
  );
  const route = (name: string, file: string): RouteFile => ({
    path: name,
    // Error pages render their error, not data of their own.
    page: path.join(dir, file),
    ...(name.startsWith('/') && withServer(dir, files, file)),
    layouts: foldersOf(file).flatMap((folder) => {
      const layout = layouts.get(folder);
      return layout
        ? [
            {
              path: routePath(`${folder}/index`),
              ...withServer(dir, files, layout),
            },
          ]
        : [];
    }),
  });
  return {
    pages: files
      .filter((file) => !SERVER.test(file) && !special(file))
      .map((file) => route(routePath(file), file))
      .sort((a, b) => a.path.localeCompare(b.path)),
    errors: files.flatMap((file) => {
      const name = ERROR_PAGES[file.replace(MODULE, '')];
      return name ? [route(name, file)] : [];
    }),
  };
};
