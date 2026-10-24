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
import {
  type ConfigProblem,
  type ResolvedLanguageServerConfig,
  loadLanguageServerConfig,
} from './load-config.js';
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
  /** Loads a package's settings; `loadLanguageServerConfig` by default. */
  loadConfig?: (dir: string) => Promise<ResolvedLanguageServerConfig>;
  /**
   * Whether a package with a Vite config resolves imports through a Vite
   * server, so its aliases apply. On by default.
   */
  viteResolution?: boolean;
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
  /** The tags `file` can use: from source, then its package's manifests. */
  tags(file: string): Promise<string[]>;
  /**
   * Reads `file` again from `code`, an editor buffer or the file on disk.
   * Ignored unless the file is a script in a package's read folders.
   */
  update(file: string, code: string): Promise<void>;
  /** Forgets a deleted file. */
  remove(file: string): void;
  /** The settings of the package that holds `file`. */
  configOf(file: string): ResolvedLanguageServerConfig | undefined;
  /** Every package's settings problems. */
  problems(): ConfigProblem[];
  /** The config files whose change means the workspace should be read again. */
  watched(): string[];
  /** Stops the Vite servers some packages resolve with. */
  close(): Promise<void>;
}

/** One package, read with its own settings and resolver. */
interface PackageState {
  pkg: WorkspacePackage;
  config: ResolvedLanguageServerConfig;
  resolver: ImportResolver;
  close?: () => Promise<void>;
  /** Its read folders, real and with a trailing `/`. */
  folders: string[];
}

/**
 * A package's settings and resolver: through its Vite config when it has one
 * (unless `viteResolution` is off), so its aliases apply, else Node's. A Vite
 * server that fails to start is a settings problem; Node's resolution stands
 * in.
 */
const preparePackage = async (
  pkg: WorkspacePackage,
  options: WorkspaceOptions
): Promise<PackageState> => {
  const config = await (options.loadConfig ?? loadLanguageServerConfig)(
    pkg.dir
  );
  const folders = config.scan.map((dir) => `${realDir(`${pkg.dir}/${dir}`)}/`);
  const viteFile = config.viteConfigFile;
  if (viteFile && options.viteResolution !== false) {
    try {
      const {createViteResolver} =
        await import('../component-docs/vite-resolver.js');
      const vite = await createViteResolver(pkg.dir, viteFile);
      if (vite) return {pkg, config, folders, ...vite};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      config.problems.push({
        file: viteFile,
        message: `Couldn't resolve through it, so Node's resolution is used: ${message}`,
      });
    }
  }
  return {pkg, config, folders, resolver: createNodeResolver()};
};

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
  const fs = await nodeDocsFs();
  const sources = createSourceDocsIndex((id) => id, createPackageAncestors(fs));
  const states: PackageState[] = [];
  let files = 0;
  for (const pkg of layout.packages) {
    const state = await preparePackage(
      {...pkg, dir: realDir(pkg.dir)},
      options
    );
    states.push(state);
    files += await indexDirs(
      state.resolver,
      sources,
      state.pkg.dir,
      state.config.scan
    );
  }
  return createWorkspaceView({
    root: realDir(layout.root),
    states,
    files,
    sources,
    manifests: (pkg) =>
      createComponentDocsIndex({root: () => pkg.dir, fs: () => fs}),
  });
};

const createWorkspaceView = (parts: {
  root: string;
  states: PackageState[];
  files: number;
  sources: SourceDocsIndex;
  manifests: (pkg: WorkspacePackage) => ComponentDocsIndex;
}): Workspace => {
  const {sources, states} = parts;
  const packages = states.map((state) => state.pkg);
  const manifestsByPackage = new Map<string, ComponentDocsIndex>();
  const manifestsOf = (pkg: WorkspacePackage): ComponentDocsIndex => {
    let index = manifestsByPackage.get(pkg.dir);
    if (!index) {
      index = parts.manifests(pkg);
      manifestsByPackage.set(pkg.dir, index);
    }
    return index;
  };
  const stateOf = (id: string): PackageState | undefined => {
    const pkg = packageOf(packages, id);
    return states.find((state) => state.pkg === pkg);
  };
  /** The id and package of a file a package reads, else undefined. */
  const read = (file: string) => {
    const id = normalizePath(file);
    const state = stateOf(id);
    const inFolders = states.some((s) =>
      s.folders.some((folder) => id.startsWith(folder))
    );
    return state &&
      inFolders &&
      isScannedScript(id) &&
      !id.includes('/node_modules/')
      ? {id, state}
      : undefined;
  };
  const sourceTags = (): string[] =>
    sources
      .modules()
      .flatMap(({module}) => module.classes.flatMap((cls) => cls.tagName ?? []))
      .sort();
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
    sourceTags,
    async tags(file) {
      const pkg = packageOf(packages, normalizePath(file));
      const fromManifests = pkg ? await manifestsOf(pkg).tags() : [];
      return [...new Set([...sourceTags(), ...fromManifests])];
    },
    async update(file, code) {
      const target = read(file);
      if (target) {
        await indexModule(target.state.resolver, sources, code, target.id);
      }
    },
    remove(file) {
      const target = read(file);
      if (target) sources.delete(target.id);
    },
    configOf: (file) => stateOf(normalizePath(file))?.config,
    problems: () => states.flatMap((state) => state.config.problems),
    watched: () => [
      ...new Set(states.flatMap((state) => state.config.watched)),
    ],
    async close() {
      await Promise.all(
        states.flatMap((state) => (state.close ? [state.close()] : []))
      );
    },
  };
};
