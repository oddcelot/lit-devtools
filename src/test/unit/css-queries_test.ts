import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, test, vi} from 'vite-plus/test';
import {litCssQueries} from '../../lib/plugins/css-queries.js';

/**
 * `?css-sheet` and `?hmr-url` resolve through whatever plugin owns the CSS
 * file, then read it by URL. A module with no file behind it can't work, and
 * the warning says so instead of leaving a broken sheet.
 */

// Any file that exists will do; the plugin only checks for one.
const REAL_FILE = fileURLToPath(import.meta.url);

const resolveWith = async (id: string, resolvedId: string) => {
  const warn = vi.fn();
  const plugin = litCssQueries();
  const hook = plugin.resolveId as (
    this: unknown,
    id: string,
    importer: string
  ) => Promise<unknown>;
  const context = {warn, resolve: () => Promise.resolve({id: resolvedId})};
  const result = await hook.call(context, id, '/app/src/main.ts');
  return {plugin, hook, context, warn, result};
};

describe('litCssQueries resolveId', () => {
  test('wraps a CSS file on disk without a warning', async () => {
    const {warn, result} = await resolveWith('./card.css?css-sheet', REAL_FILE);
    // Relative to the root (the cwd, before `configResolved`), so no
    // absolute path reaches a chunk's region comments.
    const rel = path.relative(process.cwd(), REAL_FILE).replace(/\\/g, '/');
    expect(result).toBe(`\0lit-plugin:css-sheet:./${rel}.js`);
    expect(warn).not.toHaveBeenCalled();
  });

  test('warns about a \\0 virtual module', async () => {
    const {warn} = await resolveWith(
      'virtual:uno.css?css-sheet',
      '\0/__uno.css'
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain('unoSheet()');
  });

  test('warns about a path that is not on disk', async () => {
    const {warn} = await resolveWith(
      'virtual:uno.css?hmr-url',
      '/app/src/__uno.css'
    );
    expect(warn).toHaveBeenCalledOnce();
  });

  test('warns once per specifier', async () => {
    const {hook, context, warn} = await resolveWith(
      'virtual:uno.css?css-sheet',
      '\0/__uno.css'
    );
    await hook.call(context, 'virtual:uno.css?css-sheet', '/app/src/b.ts');
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('litCssQueries load', () => {
  /** The `?css-sheet` module a build makes for `/app/src/x.css`. */
  const buildSheet = async (ssr: boolean) => {
    const plugin = litCssQueries(() => 'url');
    const configResolved = plugin.configResolved as (config: object) => void;
    configResolved({command: 'build', root: '/app', build: {lib: false}});
    const load = plugin.load as (
      this: unknown,
      id: string,
      options?: {ssr?: boolean}
    ) => Promise<{code: string}>;
    const context = {
      resolve: (id: string) => Promise.resolve({id}),
      load: () => Promise.resolve({code: 'export default ".x{}"'}),
    };
    return (
      await load.call(context, '\0lit-plugin:css-sheet:./src/x.css.js', {ssr})
    ).code;
  };

  test('a server build inlines the css, whatever cssSheetBuild says', async () => {
    expect(await buildSheet(false)).toContain('fetch(url)');
    const server = await buildSheet(true);
    expect(server).not.toContain('fetch(');
    expect(server).toContain('/app/src/x.css?inline');
  });
});
