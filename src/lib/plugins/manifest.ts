import {resolve} from 'node:path';
import type {
  HtmlTagDescriptor,
  Plugin,
  ResolvedConfig,
  ViteDevServer,
} from 'vite';
import type {SourceDocsIndex} from '../component-docs/source-index.js';
import type {ResolvedManifest} from '../manifest-options.js';
import type {OptionsContext} from './context.js';

/** How long the dev server waits after the last change before rewriting the project's file. */
const WRITE_DELAY_MS = 200;

const MANIFEST_LINK_REL = 'custom-elements-manifest';

const manifestFile = () => import('../component-docs/manifest-file.js');

/** The dev endpoint's URL under Vite's `base`. */
export const endpointUrl = (base: string, path: string): string =>
  (base.endsWith('/') ? base : `${base}/`) + path.replace(/^\//, '');

/**
 * Reads every script under `dirs` into `index` in the background, and each
 * one again when it is added, changed or removed on disk, so the dev
 * server's manifest lists components no page has loaded. Modules a page
 * loads are read by the component-docs plugin as well; both write the same
 * entry.
 */
const scanInDev = async (
  server: ViteDevServer,
  index: SourceDocsIndex,
  dirs: readonly string[]
): Promise<void> => {
  // Before any await: the watcher can turn ready while the imports load. A
  // file added between the first read and then emits no `add` (the watcher
  // ignores what its initial scan finds), so the folders are read again.
  const watcherReady = new Promise<void>((resolve) =>
    server.watcher.once('ready', () => resolve())
  );
  const [
    {indexDirs, isScannedScript},
    {indexModule},
    {readFile},
    path,
    vite,
    {realDir},
  ] = await Promise.all([
    import('../component-docs/scan.js'),
    import('../component-docs/index-module.js'),
    import('node:fs/promises'),
    import('node:path'),
    import('vite'),
    import('../component-docs/manifest-file.js'),
  ]);
  const {root, logger} = server.config;
  const resolver = {
    resolve: (specifier: string, importer: string) =>
      server.pluginContainer.resolveId(specifier, importer),
  };
  // Module ids are real paths; the watcher reports paths under `root` as
  // configured, which may run through a symlink.
  const shown = `${vite.normalizePath(path.resolve(root))}/`;
  const real = `${realDir(root)}/`;
  const toReal = (file: string): string => {
    const normal = vite.normalizePath(file);
    return normal.startsWith(shown)
      ? real + normal.slice(shown.length)
      : normal;
  };
  const folders = dirs.map((dir) => `${toReal(path.resolve(root, dir))}/`);
  const scanned = (file: string): boolean =>
    isScannedScript(file) &&
    !file.includes('/node_modules/') &&
    folders.some((folder) => file.startsWith(folder));
  const reread = (raw: string) => {
    const file = toReal(raw);
    if (!scanned(file)) return;
    readFile(file, 'utf8').then(
      (code) => indexModule(resolver, index, code, file),
      () => index.delete(file)
    );
  };
  server.watcher.on('add', reread);
  server.watcher.on('change', reread);
  server.watcher.on('unlink', (raw) => {
    const file = toReal(raw);
    if (scanned(file)) index.delete(file);
  });
  const read = () =>
    indexDirs(resolver, index, root, dirs).catch((error: unknown) =>
      logger.warn(
        `[lit-plugin] could not read ${dirs.join(', ')}: ${String(error)}`
      )
    );
  await read();
  void watcherReady.then(read);
};

/**
 * Writes a Custom Elements Manifest from the project's own sources, to the
 * outputs `manifest` switches on: an asset of `vite build`, an endpoint of
 * the dev server, and a file kept in the project.
 *
 * The docs come from the same index the DevTools panel reads. In dev the
 * component-docs plugin fills it as modules are transformed; under `vite
 * build` this plugin does, from every module of the bundle, before the
 * source is compiled (`pre`). Its code is imported only once an output is
 * on, so a build without a manifest loads none of it.
 *
 * @param loadIndex The index shared with the component-docs plugin.
 */
export const litManifest = (
  ctx: OptionsContext,
  loadIndex: () => Promise<SourceDocsIndex>
): Plugin => {
  let config: ResolvedConfig | undefined;
  // The first output's manifest, which `write` keeps once the build closes.
  let built: string | undefined;
  const options = (): ResolvedManifest | false => ctx.get().manifest;
  const isBuild = () => config?.command === 'build';
  const readsInBuild = (): boolean => {
    const manifest = options();
    return (
      isBuild() && manifest !== false && (!!manifest.build || !!manifest.write)
    );
  };

  return {
    name: 'lit-manifest',
    enforce: 'pre',
    configResolved(resolved) {
      config = resolved;
    },
    async transform(code, id, transformOptions) {
      if (!readsInBuild() || !ctx.shouldTransform(id, transformOptions))
        return null;
      const {indexModule} = await import('../component-docs/index-module.js');
      await indexModule(this, await loadIndex(), code, id);
      return null;
    },
    async watchChange(id, change) {
      if (readsInBuild() && change.event === 'delete')
        (await loadIndex()).delete(id);
    },
    buildStart() {
      built = undefined;
    },
    async generateBundle(outputOptions, bundle) {
      const manifest = options();
      if (!readsInBuild() || manifest === false) return;
      const {manifestText, bundlePaths} = await manifestFile();
      const {root, build} = config!;
      const chunks = Object.values(bundle).flatMap((output) =>
        output.type === 'chunk' ? [output] : []
      );
      const outDir = outputOptions.dir ?? resolve(root, build.outDir);
      const text = manifestText(
        await loadIndex(),
        root,
        bundlePaths(chunks, outDir, root)
      );
      built ??= text;
      if (manifest.build !== false)
        this.emitFile({type: 'asset', fileName: manifest.build, source: text});
    },
    async closeBundle() {
      const manifest = options();
      if (!isBuild() || manifest === false || manifest.write === false) return;
      if (built === undefined) return;
      const {writeManifestFile} = await manifestFile();
      const {root, logger} = config!;
      await writeManifestFile(root, manifest.write, built, (message) =>
        logger.info(`[lit-plugin] ${message}`)
      );
    },
    async configureServer(server) {
      const manifest = options();
      if (manifest === false) return;
      const index = await loadIndex();
      const {manifestText, writeManifestFile} = await manifestFile();
      const {root, logger} = server.config;
      const listsDev = manifest.dev !== false || manifest.write !== false;
      if (listsDev && manifest.scan.length > 0)
        void scanInDev(server, index, manifest.scan);
      if (manifest.dev !== false) {
        const url = endpointUrl(server.config.base, manifest.dev);
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?', 1)[0] !== url) return next();
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(manifestText(index, root));
        });
      }
      if (manifest.write !== false) {
        const file = manifest.write;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const write = () =>
          writeManifestFile(root, file, manifestText(index, root), (message) =>
            logger.info(`[lit-plugin] ${message}`)
          ).catch((error: unknown) =>
            logger.warn(
              `[lit-plugin] could not write ${file}: ${String(error)}`
            )
          );
        const unsubscribe = index.subscribe(() => {
          clearTimeout(timer);
          timer = setTimeout(() => void write(), WRITE_DELAY_MS);
        });
        server.httpServer?.once('close', () => {
          unsubscribe();
          clearTimeout(timer);
        });
      }
    },
    transformIndexHtml(): HtmlTagDescriptor[] {
      const manifest = options();
      if (isBuild() || manifest === false || manifest.dev === false) return [];
      return [
        {
          tag: 'link',
          attrs: {
            rel: MANIFEST_LINK_REL,
            href: endpointUrl(config?.base ?? '/', manifest.dev),
          },
          injectTo: 'head',
        },
      ];
    },
  };
};
