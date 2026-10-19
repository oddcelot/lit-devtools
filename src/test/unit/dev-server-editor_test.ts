import {describe, expect, test} from 'vite-plus/test';
import {
  createDevServerEditor,
  editorPathFor,
} from '../../../extension/src/dev-server-editor.js';

const ORIGIN = 'http://localhost:5173';
const ROOT = '/home/me/app';

describe('editorPathFor', () => {
  test('a file in the root is its root-relative path', () => {
    expect(
      editorPathFor(
        {file: 'src/a.ts', line: 4, url: `${ORIGIN}/src/a.ts?v=1`},
        ORIGIN
      )
    ).toBe('src/a.ts');
  });

  test('an /@fs/ file is its absolute path, decoded', () => {
    expect(
      editorPathFor(
        {file: 'x', line: 1, url: `${ORIGIN}/@fs/home/me/my%20lib/a.ts`},
        ORIGIN
      )
    ).toBe('/home/me/my lib/a.ts');
  });

  test('under a base, the base is not part of the path', () => {
    const at = (path: string) =>
      editorPathFor(
        {file: 'x', line: 1, url: `${ORIGIN}${path}`},
        ORIGIN,
        '/app/'
      );
    expect(at('/app/src/a.ts')).toBe('src/a.ts');
    expect(at('/app/@fs/home/me/a.ts')).toBe('/home/me/a.ts');
    expect(at('/src/a.ts')).toBeUndefined();
  });

  test('a plugin stamp or an Astro mark is its own path', () => {
    expect(editorPathFor({file: 'src/a.ts', line: 3}, ORIGIN)).toBe('src/a.ts');
    expect(
      editorPathFor({file: `${ROOT}/src/pages/a.astro`, line: 3}, ORIGIN)
    ).toBe(`${ROOT}/src/pages/a.astro`);
  });

  test('a source another server or scheme names has no path here', () => {
    expect(
      editorPathFor({file: 'a', line: 1, url: 'https://cdn.test/a.ts'}, ORIGIN)
    ).toBeUndefined();
    expect(
      editorPathFor({file: 'a', line: 1, url: 'webpack://app/./a.ts'}, ORIGIN)
    ).toBeUndefined();
  });
});

interface Site {
  base?: string;
  vite?: boolean;
  /** `trusted`: it takes the extension's request as no site's. */
  plugin?: boolean | 'trusted';
  /** Root-relative paths the server serves as modules. */
  files?: string[];
  /** Status the plugin's endpoint answers the page with. */
  pluginStatus?: number;
}

/** A dev server as the extension sees it, every request recorded. */
const devServer = ({
  base = '/',
  vite = true,
  plugin = false,
  files = [],
  pluginStatus = 200,
}: Site = {}) => {
  const calls: string[] = [];
  const fromPage: string[] = [];
  const editor = createDevServerEditor({
    base: () => Promise.resolve(base),
    fetch: (url) => {
      calls.push(url);
      const {pathname, search} = new URL(url);
      if (pathname === `${base}__open-in-editor` && vite) {
        return Promise.resolve(
          search === ''
            ? new Response('launch-editor-middleware: required query param', {
                status: 500,
              })
            : new Response('')
        );
      }
      if (pathname === '/__lit-open-in-editor' && plugin) {
        return Promise.resolve(
          plugin === 'trusted'
            ? new Response('missing file parameter', {status: 400})
            : new Response('forbidden', {status: 403})
        );
      }
      const path = decodeURI(pathname.slice(base.length));
      return Promise.resolve(
        search === '?import' && files.includes(path)
          ? new Response('export {}', {
              headers: {'content-type': 'text/javascript'},
            })
          : new Response('not found', {status: 404})
      );
    },
    fetchFromPage: (url) => {
      fromPage.push(url);
      return Promise.resolve(pluginStatus);
    },
  });
  return {editor, calls, fromPage};
};

describe('open', () => {
  test("asks Vite's endpoint, reading the server once", async () => {
    const {editor, calls} = devServer();
    const location = {file: 'src/a.ts', line: 2, url: `${ORIGIN}/src/a.ts`};
    expect(await editor.open(ORIGIN, location)).toBe(true);
    expect(await editor.open(ORIGIN, location)).toBe(true);
    expect(calls).toEqual([
      `${ORIGIN}/__open-in-editor`,
      `${ORIGIN}/__lit-open-in-editor`,
      `${ORIGIN}/__open-in-editor?file=src%2Fa.ts%3A2%3A1`,
      `${ORIGIN}/__open-in-editor?file=src%2Fa.ts%3A2%3A1`,
    ]);
  });

  test("goes under the page's base", async () => {
    const {editor, calls} = devServer({base: '/app/'});
    const location = {file: 'x', line: 2, url: `${ORIGIN}/app/src/a.ts`};
    expect(await editor.open(ORIGIN, location)).toBe(true);
    expect(calls.at(-1)).toBe(
      `${ORIGIN}/app/__open-in-editor?file=src%2Fa.ts%3A2%3A1`
    );
  });

  test('sends an absolute path once the root is known', async () => {
    const {editor, calls} = devServer({files: ['src/pages/a.astro']});
    expect(await editor.rootFor(ORIGIN, `${ROOT}/src/pages/a.astro`)).toBe(
      ROOT
    );
    await editor.open(ORIGIN, {file: 'src/b.ts', line: 1, column: 3});
    expect(calls.at(-1)).toBe(
      `${ORIGIN}/__open-in-editor?file=${encodeURIComponent(`${ROOT}/src/b.ts:1:3`)}`
    );
  });

  test("prefers the plugin's endpoint, asked from the page", async () => {
    const {editor, calls, fromPage} = devServer({plugin: true});
    expect(
      await editor.open(ORIGIN, {file: 'src/b.ts', line: 4, column: 2})
    ).toBe(true);
    expect(fromPage).toEqual([
      `${ORIGIN}/__lit-open-in-editor?file=src%2Fb.ts&line=4&column=2`,
    ]);
    expect(calls.some((url) => url.includes('?file='))).toBe(false);
  });

  test("knows the plugin's endpoint by either way it answers", async () => {
    const {editor, fromPage} = devServer({vite: false, plugin: 'trusted'});
    expect(await editor.canOpen(ORIGIN)).toBe(true);
    expect(await editor.open(ORIGIN, {file: 'src/b.ts', line: 4})).toBe(true);
    expect(fromPage).toHaveLength(1);
  });

  test("falls back to Vite's when the plugin's can't find the file", async () => {
    const {editor, calls} = devServer({plugin: true, pluginStatus: 404});
    expect(await editor.open(ORIGIN, {file: 'src/b.ts', line: 4})).toBe(true);
    expect(calls.at(-1)).toBe(
      `${ORIGIN}/__open-in-editor?file=src%2Fb.ts%3A4%3A1`
    );
  });

  test('a server with neither endpoint opens nothing', async () => {
    const {editor, fromPage} = devServer({vite: false});
    expect(await editor.canOpen(ORIGIN)).toBe(false);
    expect(await editor.open(ORIGIN, {file: 'a.ts', line: 1})).toBe(false);
    expect(fromPage).toEqual([]);
  });
});

describe('rootFor', () => {
  test('the shortest tail Vite serves is the root-relative path', async () => {
    const {editor, calls} = devServer({files: ['src/pages/a.astro']});
    expect(await editor.rootFor(ORIGIN, `${ROOT}/src/pages/a.astro`)).toBe(
      ROOT
    );
    expect(calls.slice(2)).toEqual([
      `${ORIGIN}/a.astro?import`,
      `${ORIGIN}/pages/a.astro?import`,
      `${ORIGIN}/src/pages/a.astro?import`,
    ]);
    // Known from then on: no more requests for a file inside it.
    const before = calls.length;
    expect(await editor.rootFor(ORIGIN, `${ROOT}/src/b.astro`)).toBe(ROOT);
    expect(calls.length).toBe(before);
  });

  test('under a base, and for a file directly in the root', async () => {
    const {editor, calls} = devServer({base: '/app/', files: ['index.astro']});
    expect(await editor.rootFor(ORIGIN, `${ROOT}/index.astro`)).toBe(ROOT);
    expect(calls.at(-1)).toBe(`${ORIGIN}/app/index.astro?import`);
  });

  test('a file the server does not serve has no root', async () => {
    const {editor} = devServer();
    expect(
      await editor.rootFor(ORIGIN, `${ROOT}/src/pages/a.astro`)
    ).toBeUndefined();
  });
});
