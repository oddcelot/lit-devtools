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
    expect(result).toBe(`\0lit-plugin:css-sheet:${REAL_FILE}.js`);
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
