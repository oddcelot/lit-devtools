/**
 * Classes and mixins a project's components extend from its dependencies,
 * read from those packages' own Custom Elements Manifests. The source-docs
 * index stops where a superclass leaves the project (`extends WaBadge`);
 * this lets it carry on one step, into the package's manifest, which lists
 * that declaration's members with what it inherits already folded in.
 *
 * Disk access goes through `DocsFs`, like the rest of the manifest reading.
 * A package's manifest is found once and re-read when it changes.
 */

import {packageOfPath} from '../package-path.js';
import type {ClassDocsBody} from './extract.js';
import {type DocsFs, packageManifest} from './load.js';
import {declarationFromManifest} from './manifest.js';

export interface PackageAncestor {
  /** Its declared name in the package. */
  name: string;
  package: string;
  /** The manifest's path for its module, inside the package. */
  module: string;
  docs: ClassDocsBody;
}

/**
 * The declaration `name` exported by the package file `id` resolved to, or
 * `undefined` outside a package, or for a package with no manifest that
 * declares it.
 */
export type PackageAncestors = (
  id: string,
  name: string
) => PackageAncestor | undefined;

interface Cached {
  mtime: number;
  manifest: unknown;
}

export const createPackageAncestors = (fs: DocsFs): PackageAncestors => {
  const sources = new Map<string, ReturnType<typeof packageManifest>>();
  const manifests = new Map<string, Cached>();

  const manifestAt = (path: string): unknown => {
    const mtime = fs.mtime(path);
    if (mtime === undefined) return undefined;
    const cached = manifests.get(path);
    if (cached?.mtime === mtime) return cached.manifest;
    let manifest: unknown;
    try {
      manifest = JSON.parse(fs.readFile(path) ?? 'null');
    } catch {
      manifest = undefined;
    }
    manifests.set(path, {mtime, manifest});
    return manifest;
  };

  return (id, name) => {
    const file = id.split('?', 1)[0].replace(/\\/g, '/');
    const pkg = packageOfPath(file);
    if (pkg === undefined) return undefined;
    const packageDir = file.slice(0, file.length - pkg.inner.length - 1);
    if (!sources.has(packageDir))
      sources.set(packageDir, packageManifest(fs, packageDir));
    const source = sources.get(packageDir);
    if (source === undefined) return undefined;
    // A manifest's module paths are often relative to its own folder: Web
    // Awesome's `dist/custom-elements.json` names `components/badge/…`.
    const manifestDir = source.relative.replace(/[^/]*$/, '');
    const local = pkg.inner.startsWith(manifestDir)
      ? pkg.inner.slice(manifestDir.length)
      : pkg.inner;
    const manifest = manifestAt(source.path);
    const found =
      declarationFromManifest(manifest, local, name) ??
      declarationFromManifest(manifest, pkg.inner, name);
    return found === undefined
      ? undefined
      : {...found, package: source.package ?? pkg.name};
  };
};
