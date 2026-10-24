import type {HtmlTagDescriptor, Plugin, ResolvedConfig} from 'vite';
import type {SourceDocsIndex} from '../component-docs/source-index.js';
import type {ResolvedManifest} from '../manifest-options.js';
import type {OptionsContext} from './context.js';

/** How long the dev server waits after the last change before rewriting the project's file. */
const WRITE_DELAY_MS = 200;

const MANIFEST_LINK_REL = 'custom-elements-manifest';

/** The manifest the index holds, as the file's text. */
const manifestText = async (
  index: SourceDocsIndex,
  root: string
): Promise<string> => {
  const [{writeManifest}, {normalizePath}, {posix}] = await Promise.all([
    import('../component-docs/write-manifest.js'),
    import('vite'),
    import('node:path'),
  ]);
  const base = normalizePath(root);
  const manifest = writeManifest(index.modules(), (id) =>
    posix.relative(base, normalizePath(id))
  );
  return `${JSON.stringify(manifest, null, 2)}\n`;
};

/**
 * Writes `text` to `file` under `root` unless it already holds it, and points
 * the root's `package.json` at it when that names no manifest yet.
 */
const writeProjectFile = async (
  config: ResolvedConfig,
  file: string,
  text: string
): Promise<void> => {
  const [{readFile, writeFile, mkdir}, {dirname, resolve, relative}] =
    await Promise.all([import('node:fs/promises'), import('node:path')]);
  const target = resolve(config.root, file);
  const current = await readFile(target, 'utf8').catch(() => undefined);
  if (current !== text) {
    await mkdir(dirname(target), {recursive: true});
    await writeFile(target, text);
  }
  const pkgPath = resolve(config.root, 'package.json');
  const pkgText = await readFile(pkgPath, 'utf8').catch(() => undefined);
  if (pkgText === undefined) return;
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(pkgText) as Record<string, unknown>;
  } catch {
    return;
  }
  if (pkg.customElements !== undefined) return;
  pkg.customElements = relative(config.root, target).replace(/\\/g, '/');
  const indent = /^[ \t]+/m.exec(pkgText)?.[0] ?? '  ';
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, indent)}\n`);
  config.logger.info(
    `[lit-plugin] set "customElements": "${String(pkg.customElements)}" in package.json`
  );
};

/** The dev endpoint's URL under Vite's `base`. */
export const endpointUrl = (base: string, path: string): string =>
  (base.endsWith('/') ? base : `${base}/`) + path.replace(/^\//, '');

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
      const {indexModule} = await import('./component-docs.js');
      await indexModule(this, await loadIndex(), code, id);
      return null;
    },
    async watchChange(id, change) {
      if (readsInBuild() && change.event === 'delete')
        (await loadIndex()).delete(id);
    },
    async generateBundle() {
      const manifest = options();
      if (!isBuild() || manifest === false || manifest.build === false) return;
      this.emitFile({
        type: 'asset',
        fileName: manifest.build,
        source: await manifestText(await loadIndex(), config!.root),
      });
    },
    async closeBundle() {
      const manifest = options();
      if (!isBuild() || manifest === false || manifest.write === false) return;
      const text = await manifestText(await loadIndex(), config!.root);
      await writeProjectFile(config!, manifest.write, text);
    },
    async configureServer(server) {
      const manifest = options();
      if (manifest === false) return;
      const index = await loadIndex();
      const root = server.config.root;
      if (manifest.dev !== false) {
        const url = endpointUrl(server.config.base, manifest.dev);
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?', 1)[0] !== url) return next();
          void manifestText(index, root).then((text) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(text);
          }, next);
        });
      }
      if (manifest.write !== false) {
        const file = manifest.write;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const write = () =>
          manifestText(index, root)
            .then((text) => writeProjectFile(server.config, file, text))
            .catch((error: unknown) =>
              server.config.logger.warn(
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
