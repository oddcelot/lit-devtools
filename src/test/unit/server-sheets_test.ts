import {afterEach, expect, test, vi} from 'vite-plus/test';
import type {CssSheetBuild} from '../../lib/css-sheet-build.js';
import {litCssQueries} from '../../lib/plugins/css-queries.js';
import {inlineSheet, urlSheet} from '../../lib/runtime/css.js';

// The node env has no CSSStyleSheet, which is the server render this covers.
afterEach(() => {
  vi.unstubAllGlobals();
});

const cssTextOf = (sheet: unknown): unknown =>
  (sheet as {cssText?: unknown}).cssText;

/**
 * The sheet a build's `?css-sheet` module exports, evaluated here with
 * `imported` standing in for the css text or asset URL it imports.
 */
const builtSheet = async (
  mode: CssSheetBuild,
  imported: string,
  compiled = imported
): Promise<unknown> => {
  const plugin = litCssQueries(() => mode);
  const configResolved = plugin.configResolved as (config: object) => void;
  configResolved({command: 'build', root: '/app', build: {lib: false}});
  const load = plugin.load as (
    this: unknown,
    id: string
  ) => Promise<{code: string}>;
  const context = {
    resolve: (id: string) => Promise.resolve({id}),
    load: () => Promise.resolve({code: JSON.stringify(compiled)}),
  };
  const {code} = await load.call(
    context,
    '\0lit-plugin:css-sheet:./src/x.css.js'
  );
  const body = code
    .replace(
      /^import (\w+) from .*;$/m,
      (_, name: string) => `const ${name} = ${JSON.stringify(imported)};`
    )
    .replace('export default sheet;', 'return sheet;');
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(body)();
};

test('an inline sheet on a server carries its css as cssText', async () => {
  expect(typeof CSSStyleSheet).toBe('undefined');
  const {sheet, onHotUpdate} = inlineSheet(':host { color: red; }');
  expect(cssTextOf(sheet)).toBe(':host { color: red; }');
  onHotUpdate({default: ':host { color: blue; }'});
  expect(cssTextOf(sheet)).toBe(':host { color: blue; }');
  expect(cssTextOf(await builtSheet('inline', 'a { b: c; }'))).toBe(
    'a { b: c; }'
  );
  // A sheet that needs the `@property` hoisting skips it on a server.
  const property = '@property --x { syntax: "*"; inherits: false; }';
  expect(cssTextOf(await builtSheet('inline', property))).toBe(property);
});

test('fetch-backed sheets on a server stay empty and fetch nothing', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(cssTextOf(urlSheet('/utils.css').sheet)).toBe('');
  expect(
    cssTextOf(await builtSheet('url', '/assets/utils-abc.css', 'a {}'))
  ).toBe('');
  expect(fetch).not.toHaveBeenCalled();
});

/** The stand-in a server build's `?css-sheet` module exports. */
const serverSheet = async (css: string): Promise<unknown> => {
  const plugin = litCssQueries(() => 'auto');
  const configResolved = plugin.configResolved as (config: object) => void;
  configResolved({command: 'build', root: '/app', build: {lib: false}});
  const load = plugin.load as (
    this: unknown,
    id: string,
    options: {ssr: boolean}
  ) => Promise<{code: string}>;
  const {code} = await load.call({}, '\0lit-plugin:css-sheet:./src/x.css.js', {
    ssr: true,
  });
  const body = code
    .replace(
      /^import (\w+) from .*;$/m,
      (_, name: string) => `const ${name} = ${JSON.stringify(css)};`
    )
    .replace('export default ', 'return ');
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(body)();
};

test("a server build's sheet imports the client's asset once a framework registers it", async () => {
  const key = Symbol.for('@oddsquad/vite-plugin-lit#sheet-urls');
  const registry = globalThis as {[key]?: Record<string, string>};
  const sheet = await serverSheet('a { b: c; }');
  try {
    // Nothing registered: the css itself, as before.
    expect(cssTextOf(sheet)).toBe('a { b: c; }');
    // Read on each render, so a registry set after the module ran counts.
    registry[key] = {'src/x.css': '/assets/x-abc.css'};
    expect(cssTextOf(sheet)).toBe('@import url("/assets/x-abc.css");');
    registry[key] = {'src/other.css': '/assets/other.css'};
    expect(cssTextOf(sheet)).toBe('a { b: c; }');
  } finally {
    delete registry[key];
  }
});
