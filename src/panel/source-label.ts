/**
 * How the panel prints a source location's file.
 *
 * A file under `node_modules` is named by its package: the name, the version
 * when the path carries one (pnpm's `.pnpm/<name>@<version>_<peers>/`
 * folders do), and the path inside the package. pnpm's store path alone runs
 * to a hundred characters before reaching the package, so printing it whole
 * fills five lines of the details pane. The full path stays available to the
 * caller for a tooltip.
 *
 * Pure, so it is tested without a panel.
 */

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

const NODE_MODULES = 'node_modules/';

/** The version pnpm encodes in the store folder holding `name`, if any. */
const pnpmVersion = (before: string, name: string): string | undefined => {
  // `…/.pnpm/@awesome.me+webawesome@3.14.0_@floating-ui+utils@0.2.12/`
  const folder = /\.pnpm\/([^/]+)\/$/.exec(before)?.[1];
  const prefix = `${name.replace('/', '+')}@`;
  if (folder === undefined || !folder.startsWith(prefix)) return undefined;
  const version = folder.slice(prefix.length).split('_')[0];
  return version === '' ? undefined : version;
};

/**
 * The label for `file`. Backslashes read as slashes and a query is dropped.
 * A file under `node_modules` but in no package (Vite's `.vite/deps`
 * pre-bundles, pnpm's own folders) keeps its path.
 */
export const sourceLabel = (file: string): SourceLabel => {
  const path = file.replace(/\\/g, '/').replace(/[?#].*$/, '');
  const at = path.lastIndexOf(NODE_MODULES);
  if (at === -1) return {path};
  const rest = path.slice(at + NODE_MODULES.length);
  const parts = rest.split('/');
  const nameLength = parts[0]?.startsWith('@') ? 2 : 1;
  if (parts.length <= nameLength || parts[0]!.startsWith('.')) return {path};
  const name = parts.slice(0, nameLength).join('/');
  const version = pnpmVersion(path.slice(0, at), name);
  return {
    pkg: version === undefined ? {name} : {name, version},
    path: parts.slice(nameLength).join('/'),
  };
};
