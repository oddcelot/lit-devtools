/**
 * How the panel prints a source location's file.
 *
 * A file under `node_modules` is named by its package: the name, the version
 * when the path carries one (pnpm's `.pnpm/<name>@<version>_<peers>/`
 * folders do), and the path inside the package. pnpm's store path alone runs
 * to a hundred characters before reaching the package, so printing it whole
 * fills five lines of the details pane. A file the host gave as an absolute
 * path inside the project (Astro marks its markup that way) reads relative to
 * the project's root, when the host said where that is
 * ({@link useProjectRoot}). The full path stays available to the caller for a
 * tooltip.
 *
 * No DOM, so it is tested without a panel.
 */

import {packageOfPath} from '../lib/package-path.js';

export interface SourcePackage {
  /** `lit`, `@awesome.me/webawesome`. */
  name: string;
  /** `3.14.0`, when the path says. */
  version?: string;
}

export interface SourceLabel {
  /** The package the file belongs to, for a file under `node_modules`. */
  pkg?: SourcePackage;
  /** The file to print: inside the package when there is one. */
  path: string;
}

let projectRoot: string | undefined;

/**
 * Sets the root absolute paths are printed relative to; the panel's host
 * client calls it with what `get-meta` reports. `undefined` forgets it.
 */
export const useProjectRoot = (root: string | undefined): void => {
  projectRoot =
    root === undefined
      ? undefined
      : root.replace(/\\/g, '/').replace(/\/$/, '');
};

/**
 * The label for `file`. Backslashes read as slashes and a query is dropped.
 * A file under `node_modules` but in no package (Vite's `.vite/deps`
 * pre-bundles, pnpm's own folders) keeps its path.
 */
export const sourceLabel = (file: string): SourceLabel => {
  const path = file.replace(/\\/g, '/').replace(/[?#].*$/, '');
  const found = packageOfPath(path);
  if (found !== undefined) {
    const {inner, ...pkg} = found;
    return {pkg, path: inner};
  }
  return projectRoot !== undefined && path.startsWith(`${projectRoot}/`)
    ? {path: path.slice(projectRoot.length + 1)}
    : {path};
};
