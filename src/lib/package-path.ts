/**
 * Which package a path lies in: the innermost `node_modules/<name>/` in it,
 * scoped names included, with the version when pnpm's store folder carries
 * one (`.pnpm/<name>@<version>_<peers>/`). The panel names a location's
 * package with it, and the extension the package of a manifest it fetched.
 *
 * Pure and browser-safe: a path or a URL's pathname, slashes either way.
 */

export interface PathPackage {
  /** `lit`, `@awesome.me/webawesome`. */
  name: string;
  /** `3.14.0`, when the path says. */
  version?: string;
  /** The rest of the path, inside the package. */
  inner: string;
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
 * The package `path` lies in, or `undefined` outside any. A path under
 * `node_modules` but in no package (Vite's `.vite/deps` pre-bundles, pnpm's
 * own folders, a bare scope) is in none.
 */
export const packageOfPath = (path: string): PathPackage | undefined => {
  const slashed = path.replace(/\\/g, '/');
  const at = slashed.lastIndexOf(NODE_MODULES);
  if (at === -1) return undefined;
  const parts = slashed.slice(at + NODE_MODULES.length).split('/');
  const nameLength = parts[0]?.startsWith('@') ? 2 : 1;
  if (parts.length <= nameLength || parts[0]!.startsWith('.')) return undefined;
  const name = parts.slice(0, nameLength).join('/');
  const version = pnpmVersion(slashed.slice(0, at), name);
  const inner = parts.slice(nameLength).join('/');
  return version === undefined ? {name, inner} : {name, version, inner};
};
