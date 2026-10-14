import {existsSync} from 'node:fs';
import * as path from 'node:path';
import type {Plugin} from 'vite';
import type {CssSheetBuild} from '../css-sheet-build.js';
import {resolveRuntimeModule} from './shared.js';

/**
 * `import href from './x.css?hmr-url'` — `?url` semantics with working HMR.
 * The string is a real stylesheet URL (dev-served CSS file; hashed `.css`
 * asset on build) for shadow-root `<link>` hrefs and `@import url()`s. In
 * dev, each HMR re-execution yields a freshly cache-busted href, so the
 * browser refetches the changed stylesheet; in build the `?url` asset URL
 * passes through unchanged.
 */
const CSS_URL_QUERY_RE = /^([^?]+\.css)\?(?:[^&]*&)*hmr-url(?:&.*)?$/;
const CSS_URL_VIRTUAL_PREFIX = '\0lit-plugin:hmr-url:';

/**
 * `import sheet from './x.css?css-sheet'` — a constructed, shareable
 * `CSSStyleSheet` that hot-swaps in place. Adopt it from any number of
 * components (`static styles = [sheet]`); a source edit `replaceSync()`s it,
 * updating every shadow root that adopted it without re-rendering a component
 * or reloading the page.
 *
 * In dev the generated module builds the sheet from the file's `?inline` text
 * and accepts updates to that module: the `import.meta.hot.accept` lives here
 * (where Vite's static analysis sees the literal specifier), so callers write
 * a bare import and never touch `import.meta.hot` themselves. `?inline` rather
 * than a fetch of `?url`, because a plugin that generates the CSS from other
 * files (Tailwind) ties its updates to the CSS module it transformed, and
 * Tailwind leaves `?url` imports alone.
 *
 * Under `vite build` it is fetch-backed over the emitted `.css` asset, or
 * inlines the css text (see `cssSheetBuild`): a library's consumers bundle its
 * JS only, so a fetch-backed sheet would 404 on the `.css` asset that never
 * reached their build.
 */
const CSS_SHEET_QUERY_RE = /^([^?]+\.css)\?(?:[^&]*&)*css-sheet(?:&.*)?$/;
const CSS_SHEET_VIRTUAL_PREFIX = '\0lit-plugin:css-sheet:';
// The virtual id must not end in `.css`, or Vite's CSS plugins (which match
// the id's extension regardless of `\0`) would compile the wrapper as CSS.
const CSS_VIRTUAL_SUFFIX = '.js';

/**
 * The css file as the virtual id carries it: relative to Vite's root, so the
 * id, which an unminified chunk prints in its `//#region` comments, doesn't
 * spell out the developer's directories. A leading `./` or `../` marks it as
 * relative. An id that isn't a path, or a file on another drive, stays as is.
 */
const toIdPath = (file: string, root: string): string => {
  if (!path.isAbsolute(file)) return file;
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (path.isAbsolute(rel)) return file;
  return rel.startsWith('../') ? rel : `./${rel}`;
};

/** The css file's path back from {@link toIdPath}. */
const fromIdPath = (idPath: string, root: string): string =>
  idPath.startsWith('./') || idPath.startsWith('../')
    ? path.resolve(root, idPath).replace(/\\/g, '/')
    : idPath;

/** The part of a build's plugin context {@link hasPropertyRule} uses. */
interface ModuleLoader {
  resolve(source: string): Promise<{id: string} | null>;
  load(options: {id: string}): Promise<{code: string | null}>;
}

/**
 * Whether the css that `specifier` compiles to registers a custom property.
 * Read after the whole css pipeline, so `@property` rules a plugin generates
 * (Tailwind's) count. When it can't tell, it says yes and the sheet keeps
 * the hoisting.
 */
const hasPropertyRule = async (
  ctx: ModuleLoader,
  specifier: string
): Promise<boolean> => {
  const resolved = await ctx.resolve(specifier);
  if (resolved === null) return true;
  const {code} = await ctx.load({id: resolved.id});
  return code === null || code.includes('@property');
};

/**
 * Whether `id` is a module some plugin makes up, with no file behind it
 * (`\0`-prefixed, or a path that isn't on disk, as UnoCSS resolves
 * `virtual:uno.css` to under `vite build`). `?url` has nothing to serve or
 * emit for one, so the sheet would load the wrong thing or fail the build.
 */
const isVirtualCss = (id: string): boolean =>
  id.startsWith('\0') || !existsSync(id.split('?')[0]!);

/** `?hmr-url`: the `?url` asset, cache-busted per HMR re-execution in dev. */
const hmrUrlCode = (file: string, isBuild: boolean): string => {
  const url = JSON.stringify(`${file}?url`);
  // A build's URL is a hashed asset, so there is nothing to bust.
  return isBuild
    ? `export {default} from ${url};\n`
    : `import url from ${url};\n` +
        `import {devCacheBust} from ${JSON.stringify(resolveRuntimeModule('css'))};\n` +
        `export default devCacheBust(url);\n`;
};

/**
 * `?css-sheet` in dev. The accept specifier must be byte-identical to the
 * import above it — Vite resolves accepted HMR deps by static analysis.
 * Generating both here is exactly what frees the caller from writing it. The
 * swap is self-accepted at this boundary, so it never propagates to adopters.
 */
const devSheetCode = (file: string): string => {
  const inlineSpecifier = JSON.stringify(`${file}?inline`);
  return (
    `import css from ${inlineSpecifier};\n` +
    `import {inlineSheet} from ${JSON.stringify(resolveRuntimeModule('css'))};\n` +
    `const {sheet, onHotUpdate} = inlineSheet(css);\n` +
    `export default sheet;\n` +
    `if (import.meta.hot) {\n` +
    `  import.meta.hot.accept(${inlineSpecifier}, onHotUpdate);\n` +
    `}\n`
  );
};

/**
 * `?css-sheet` in a build: the sheet is built once, with none of the dev
 * helpers. Either way it is constructed once per virtual module, so adopters
 * share it. The `@property` hoisting only comes along for a sheet that needs
 * it; the url form checks the same css compiled inline.
 */
const buildSheetCode = async (
  ctx: ModuleLoader,
  file: string,
  mode: CssSheetBuild,
  isLib: boolean
): Promise<string> => {
  const fetched = mode === 'url' || (mode === 'auto' && !isLib);
  const inlineQuery = mode === 'inline-raw' ? '?raw' : '?inline';
  const css = `${file}${fetched ? '?inline' : inlineQuery}`;
  const hoist = await hasPropertyRule(ctx, css);
  const helper = fetched ? 'fetchedSheet' : 'inlinedSheet';
  const imports =
    `import {${helper}} from ${JSON.stringify(resolveRuntimeModule('css-build'))};\n` +
    (hoist
      ? `import {hoistPropertyRules} from ` +
        `${JSON.stringify(resolveRuntimeModule('property-rules'))};\n`
      : '');
  const source = fetched
    ? `import url from ${JSON.stringify(`${file}?url`)};\n`
    : `import css from ${JSON.stringify(css)};\n`;
  const args = `${fetched ? 'url' : 'css'}${hoist ? ', hoistPropertyRules' : ''}`;
  return `${source}${imports}export default ${helper}(${args});\n`;
};

/**
 * Import-query support, served in dev and build alike (source code using
 * `?hmr-url`/`?css-sheet` must keep working under `vite build`, where the HMR
 * plugin doesn't apply). Exported for the baseline e2e run, which needs the
 * queries working without the HMR plugin.
 *
 * `getCssSheetBuild` is a getter, not a value: `litPlugin()` re-resolves its
 * options against the loaded env in a `config` hook, which runs after the
 * plugin array is built. Standalone (no getter) it behaves like the `'auto'`
 * default.
 */
export const litCssQueries = (
  getCssSheetBuild: () => CssSheetBuild = () => 'auto'
): Plugin => {
  let isBuild = false;
  let isLib = false;
  let root = process.cwd();
  const warned = new Set<string>();
  return {
    name: 'lit-css-query',
    // Vite's core resolver claims `./x.css?hmr-url` for the CSS pipeline
    // before normal plugins get a look, so resolve ahead of it.
    enforce: 'pre',
    configResolved(config) {
      isBuild = config.command === 'build';
      root = config.root;
      isLib = config.build.lib !== false && config.build.lib !== undefined;
    },
    async resolveId(id, importer) {
      const prefix = CSS_URL_QUERY_RE.test(id)
        ? CSS_URL_VIRTUAL_PREFIX
        : CSS_SHEET_QUERY_RE.test(id)
          ? CSS_SHEET_VIRTUAL_PREFIX
          : null;
      if (prefix === null) {
        return null;
      }
      const file = id.slice(0, id.indexOf('?'));
      const resolved = await this.resolve(file, importer);
      if (resolved === null) {
        return null;
      }
      if (isVirtualCss(resolved.id) && !warned.has(file)) {
        warned.add(file);
        this.warn(
          `${id}: there is no file behind ${JSON.stringify(file)}, and ` +
            `?css-sheet and ?hmr-url need one. For UnoCSS's virtual:uno.css, ` +
            `write the utilities to a file with unoSheet() from ` +
            `@oddsquad/vite-plugin-lit/uno and import that instead.`
        );
      }
      return prefix + toIdPath(resolved.id, root) + CSS_VIRTUAL_SUFFIX;
    },
    async load(id) {
      const prefix = [CSS_URL_VIRTUAL_PREFIX, CSS_SHEET_VIRTUAL_PREFIX].find(
        (p) => id.startsWith(p)
      );
      if (prefix === undefined) {
        return null;
      }
      const file = fromIdPath(
        id.slice(prefix.length, -CSS_VIRTUAL_SUFFIX.length),
        root
      );
      const code =
        prefix === CSS_URL_VIRTUAL_PREFIX
          ? hmrUrlCode(file, isBuild)
          : isBuild
            ? await buildSheetCode(this, file, getCssSheetBuild(), isLib)
            : devSheetCode(file);
      return {code, moduleType: 'js'};
    },
  };
};
