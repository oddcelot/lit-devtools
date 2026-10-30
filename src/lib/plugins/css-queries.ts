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
 * Copies the `@property` rules of `sheet` into a sheet the document adopts.
 * Browsers ignore `@property` inside a shadow root, so a property the sheet
 * registers there keeps no initial value (Tailwind v4's shadow, ring and
 * transform utilities read properties registered that way); a registration
 * in the document applies in every shadow root. Runs once, after the sheet
 * is filled.
 */
const HOIST_PROPERTY_RULES =
  `if (typeof document != "undefined" && typeof CSSPropertyRule != "undefined") {\n` +
  `  const propertyRules = (rules) => [...rules].flatMap((rule) =>\n` +
  `    rule instanceof CSSPropertyRule ? [rule.cssText]\n` +
  `      : "cssRules" in rule ? propertyRules(rule.cssRules) : []);\n` +
  `  const found = propertyRules(sheet.cssRules);\n` +
  `  if (found.length > 0) {\n` +
  `    const hoisted = new CSSStyleSheet();\n` +
  `    hoisted.replaceSync(found.join("\\n"));\n` +
  `    document.adoptedStyleSheets = [...document.adoptedStyleSheets, hoisted];\n` +
  `  }\n` +
  `}\n`;

/**
 * The specifiers of the `/css` helpers (`urlSheet`, `inlineSheet`,
 * `devCacheBust`), the plugin's own and the umbrella package's.
 */
const CSS_HELPERS_SPECIFIERS = new Set([
  '@oddsquad/vite-plugin-lit/css.js',
  '@oddsquad/lit-devtools/css',
]);
const CSS_HELPERS_BUILD_ID = '\0lit-plugin:css-helpers.js';

/**
 * The `/css` helpers in a build: what `runtime/css.ts` does once a page has
 * loaded, written into a module of the app's own, so a build carries none
 * of ours, as with `?css-sheet`. Their HMR half is gone: `onHotUpdate` does
 * nothing, `devCacheBust` returns the URL it is given, and `urlSheet`
 * fetches the asset once, as it is, with no dev query and no guard against
 * a later fetch landing first. The `@property` hoisting stays, since the
 * css isn't known here; on a server the sheet is a stand-in carrying its
 * text, as `new-sheet.ts` makes.
 */
const CSS_HELPERS_BUILD_CODE =
  `const newSheet = () => typeof CSSStyleSheet != "undefined"\n` +
  `  ? new CSSStyleSheet() : {cssText: "", cssRules: [], replaceSync(css) { this.cssText = css; }};\n` +
  `const fill = (sheet, css) => {\n` +
  `  sheet.replaceSync(css);\n` +
  HOIST_PROPERTY_RULES.replace(/^/gm, '  ').replace(/ +$/, '') +
  `};\n` +
  `const ignore = () => {};\n` +
  `export const devCacheBust = (url) => url;\n` +
  `export const inlineSheet = (css) => {\n` +
  `  const sheet = newSheet();\n` +
  `  fill(sheet, css);\n` +
  `  return {sheet, onHotUpdate: ignore};\n` +
  `};\n` +
  `export const urlSheet = (url) => {\n` +
  `  const sheet = newSheet();\n` +
  `  if (typeof CSSStyleSheet != "undefined") {\n` +
  `    fetch(url)\n` +
  // A 404 still has a body (the server's fallback page); don't adopt it as css.
  `      .then((r) => r.ok ? r.text() : Promise.reject(new Error("HTTP " + r.status)))\n` +
  `      .then((css) => fill(sheet, css), (err) => {\n` +
  `        console.warn("[lit-plugin] urlSheet: failed to load " + url + ":", err);\n` +
  `      });\n` +
  `  }\n` +
  `  return {sheet, onHotUpdate: ignore};\n` +
  `};\n`;

/** A function body that fills `sheet` from `css`, then hoists if asked. */
const fillCode = (hoist: boolean): string =>
  `sheet.replaceSync(css);\n` + (hoist ? HOIST_PROPERTY_RULES : '');

/**
 * `?css-sheet` in a build: the sheet is built once, in code written into the
 * module itself, so a build carries no module of the plugin's. A library's
 * dist then has nothing of ours for its consumers to bundle twice or to
 * resolve. Either way it is constructed once per virtual module, so adopters
 * share it. The `@property` hoisting only comes along for a sheet that needs
 * it; the url form checks the same css compiled inline.
 *
 * On a server there is no `CSSStyleSheet`, so the sheet is a stand-in that
 * carries its text as `cssText`, which Lit's server renderer writes into a
 * component's declarative shadow root. A fetch-backed one stays empty there:
 * there is no page to fetch the asset relative to.
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
  const hasSheets = `typeof CSSStyleSheet != "undefined"`;
  if (!fetched) {
    return (
      `import css from ${JSON.stringify(css)};\n` +
      `let sheet = {cssText: css};\n` +
      `if (${hasSheets}) {\n` +
      `sheet = new CSSStyleSheet();\n` +
      fillCode(hoist) +
      `}\n` +
      `export default sheet;\n`
    );
  }
  return (
    `import url from ${JSON.stringify(`${file}?url`)};\n` +
    `let sheet = {cssText: ""};\n` +
    `if (${hasSheets}) {\n` +
    `sheet = new CSSStyleSheet();\n` +
    `fetch(url)\n` +
    // A 404 still has a body (the server's fallback page); don't adopt it as css.
    `  .then((r) => r.ok ? r.text() : Promise.reject(new Error("HTTP " + r.status)))\n` +
    `  .then((css) => {\n${fillCode(hoist)}}, (err) => {\n` +
    `    console.warn("[lit-plugin] ?css-sheet: failed to load " + url + ":", err);\n` +
    `  });\n` +
    `}\n` +
    `export default sheet;\n`
  );
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
      if (isBuild && CSS_HELPERS_SPECIFIERS.has(id)) {
        return CSS_HELPERS_BUILD_ID;
      }
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
    async load(id, options) {
      if (id === CSS_HELPERS_BUILD_ID) {
        return {code: CSS_HELPERS_BUILD_CODE, moduleType: 'js'};
      }
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
            ? await buildSheetCode(
                this,
                file,
                // A server has no page to fetch an asset from, so its sheet
                // carries the css text for the renderer to write out.
                options?.ssr === true ? 'inline' : getCssSheetBuild(),
                isLib
              )
            : devSheetCode(file);
      return {code, moduleType: 'js'};
    },
  };
};
