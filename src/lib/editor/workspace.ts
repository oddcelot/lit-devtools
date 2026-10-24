/**
 * The language server's view of a workspace: the docs of every package's
 * components, read from source and kept current from the editor's buffers,
 * with each package's dependency manifests behind them.
 *
 * Sources come first, so a component is documented as it is written now, not
 * as a manifest last described it. Every package's sources share one index,
 * so a component inherits from a base class in another workspace package.
 */

import type {ComponentDocs} from '../../types/component-docs.js';
import {
  type ImportResolver,
  indexModule,
} from '../component-docs/index-module.js';
import {
  type ComponentDocsIndex,
  createComponentDocsIndex,
  nodeDocsFs,
} from '../component-docs/load.js';
import {realDir} from '../component-docs/manifest-file.js';
import {createNodeResolver} from '../component-docs/node-resolver.js';
import {createPackageAncestors} from '../component-docs/package-ancestors.js';
import {normalizePath} from '../component-docs/paths.js';
import {indexDirs, isScannedScript} from '../component-docs/scan.js';
import {
  type SourceDocsIndex,
  createSourceDocsIndex,
} from '../component-docs/source-index.js';
import {
  type WorkspacePackage,
  findWorkspace,
  packageOf,
} from './workspace-packages.js';

export interface WorkspaceOptions {
  /** The folders to read in a package, relative to it; `src` by default. */
  dirs?: (pkg: WorkspacePackage) => readonly string[];
}

export interface Workspace {
  root: string;
  packages: readonly WorkspacePackage[];
  /** How many files the first read took in. */
  files: number;
  /** The docs of `tagName` as `file` sees them: sources, then its package's manifests. */
  get(file: string, tagName: string): Promise<ComponentDocs | null>;
  /** The tags of every component read from source. */
  sourceTags(): string[];
  /**
   * Reads `file` again from `code`, an editor buffer or the file on disk.
   * Ignored unless the file is a script in a package's read folders.
   */
  update(file: string, code: string): Promise<void>;
  /** Forgets a deleted file. */
  remove(file: string): void;
}

/**
 * Reads the workspace `from` (a file or folder) belongs to. Undefined outside
 * any package.
 */
export const createWorkspace = async (
  from: string,
  options: WorkspaceOptions = {}
): Promise<Workspace | undefined> => {
  const layout = await findWorkspace(from);
  if (!layout) return undefined;
  const packages = layout.packages.map((pkg) => ({
    ...pkg,
    dir: realDir(pkg.dir),
  }));
  const dirsOf = options.dirs ?? (() => ['src']);
  const fs = await nodeDocsFs();
  const sources = createSourceDocsIndex((id) => id, createPackageAncestors(fs));
  const resolver = createNodeResolver();
  const folders = packages.flatMap((pkg) =>
    dirsOf(pkg).map((dir) => `${realDir(`${pkg.dir}/${dir}`)}/`)
  );
  let files = 0;
  for (const pkg of packages) {
    files += await indexDirs(resolver, sources, pkg.dir, dirsOf(pkg));
  }
  return createWorkspaceView({
    root: realDir(layout.root),
    packages,
    files,
    sources,
    resolver,
    folders,
    manifests: (pkg) =>
      createComponentDocsIndex({root: () => pkg.dir, fs: () => fs}),
  });
};

const createWorkspaceView = (parts: {
  root: string;
  packages: WorkspacePackage[];
  files: number;
  sources: SourceDocsIndex;
  resolver: ImportResolver;
  folders: string[];
  manifests: (pkg: WorkspacePackage) => ComponentDocsIndex;
}): Workspace => {
  const {sources, resolver, folders, packages} = parts;
  const manifestsByPackage = new Map<string, ComponentDocsIndex>();
  const manifestsOf = (pkg: WorkspacePackage): ComponentDocsIndex => {
    let index = manifestsByPackage.get(pkg.dir);
    if (!index) {
      index = parts.manifests(pkg);
      manifestsByPackage.set(pkg.dir, index);
    }
    return index;
  };
  const read = (file: string): string | undefined => {
    const id = normalizePath(file);
    return isScannedScript(id) &&
      !id.includes('/node_modules/') &&
      folders.some((folder) => id.startsWith(folder))
      ? id
      : undefined;
  };
  return {
    root: parts.root,
    packages,
    files: parts.files,
    async get(file, tagName) {
      const fromSource = sources.get(tagName);
      if (fromSource) return fromSource;
      const pkg = packageOf(packages, normalizePath(file));
      return pkg ? manifestsOf(pkg).get(tagName) : null;
    },
    sourceTags: () =>
      sources
        .modules()
        .flatMap(({module}) =>
          module.classes.flatMap((cls) => cls.tagName ?? [])
        )
        .sort(),
    async update(file, code) {
      const id = read(file);
      if (id) await indexModule(resolver, sources, code, id);
    },
    remove(file) {
      const id = read(file);
      if (id) sources.delete(id);
    },
  };
};
