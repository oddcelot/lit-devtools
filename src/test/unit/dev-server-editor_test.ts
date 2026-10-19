import {describe, expect, test} from 'vite-plus/test';
import {
  createDevServerEditor,
  editorFileFor,
} from '../../../extension/src/dev-server-editor.js';

const ORIGIN = 'http://localhost:5173';

describe('editorFileFor', () => {
  test('a file in the root opens by its root-relative path', () => {
    expect(
      editorFileFor(
        {file: 'src/a.ts', line: 4, column: 2, url: `${ORIGIN}/src/a.ts?v=1`},
        ORIGIN
      )
    ).toBe('src/a.ts:4:2');
  });

  test('an /@fs/ file opens by its absolute path, decoded', () => {
    expect(
      editorFileFor(
        {file: 'x', line: 1, url: `${ORIGIN}/@fs/home/me/my%20lib/a.ts`},
        ORIGIN
      )
    ).toBe('/home/me/my lib/a.ts:1:1');
  });

  test('a plugin stamp is already relative to the root', () => {
    expect(editorFileFor({file: 'src/a.ts', line: 3}, ORIGIN)).toBe(
      'src/a.ts:3:1'
    );
  });

  test('a source another server or scheme names has no file here', () => {
    expect(
      editorFileFor({file: 'a', line: 1, url: 'https://cdn.test/a.ts'}, ORIGIN)
    ).toBeUndefined();
    expect(
      editorFileFor({file: 'a', line: 1, url: 'webpack://app/./a.ts'}, ORIGIN)
    ).toBeUndefined();
  });
});

describe('createDevServerEditor', () => {
  const vite = (calls: string[]) => (url: string) => {
    calls.push(url);
    return Promise.resolve(
      url.includes('?')
        ? new Response('')
        : new Response('launch-editor-middleware: required query param', {
            status: 500,
          })
    );
  };

  test('asks a Vite dev server to open the file, probing it once', async () => {
    const calls: string[] = [];
    const editor = createDevServerEditor({fetch: vite(calls)});
    const location = {file: 'src/a.ts', line: 2, url: `${ORIGIN}/src/a.ts`};
    expect(await editor.open(ORIGIN, location)).toBe(true);
    expect(await editor.open(ORIGIN, location)).toBe(true);
    expect(calls).toEqual([
      `${ORIGIN}/__open-in-editor`,
      `${ORIGIN}/__open-in-editor?file=src%2Fa.ts%3A2%3A1`,
      `${ORIGIN}/__open-in-editor?file=src%2Fa.ts%3A2%3A1`,
    ]);
  });

  test('leaves a server without the endpoint alone', async () => {
    const calls: string[] = [];
    const editor = createDevServerEditor({
      fetch: (url) => {
        calls.push(url);
        return Promise.resolve(new Response('not found', {status: 404}));
      },
    });
    expect(
      await editor.open(ORIGIN, {file: 'a', line: 1, url: `${ORIGIN}/a.ts`})
    ).toBe(false);
    expect(calls).toEqual([`${ORIGIN}/__open-in-editor`]);
  });
});

describe('rootFor', () => {
  const ROOT = '/home/me/app';
  /** Vite with `files` under its root, every request recorded. */
  const viteServing = (files: string[], calls: string[]) => (url: string) => {
    calls.push(url);
    const {pathname, search} = new URL(url);
    if (pathname === '/__open-in-editor' && search === '') {
      return Promise.resolve(
        new Response('launch-editor-middleware: required query param', {
          status: 500,
        })
      );
    }
    return Promise.resolve(
      search === '?import' && files.includes(decodeURI(pathname))
        ? new Response('export {}', {
            headers: {'content-type': 'text/javascript'},
          })
        : new Response('not found', {status: 404})
    );
  };

  test('the shortest tail Vite serves is the root-relative path', async () => {
    const calls: string[] = [];
    const editor = createDevServerEditor({
      fetch: viteServing(['/src/pages/a.astro'], calls),
    });
    expect(await editor.rootFor(ORIGIN, `${ROOT}/src/pages/a.astro`)).toBe(
      ROOT
    );
    expect(calls.slice(1)).toEqual([
      `${ORIGIN}/a.astro?import`,
      `${ORIGIN}/pages/a.astro?import`,
      `${ORIGIN}/src/pages/a.astro?import`,
    ]);
  });

  test('a file directly in the root counts', async () => {
    const editor = createDevServerEditor({
      fetch: viteServing(['/index.astro'], []),
    });
    expect(await editor.rootFor(ORIGIN, `${ROOT}/index.astro`)).toBe(ROOT);
  });

  test('a file the server does not serve has no root', async () => {
    const editor = createDevServerEditor({fetch: viteServing([], [])});
    expect(
      await editor.rootFor(ORIGIN, `${ROOT}/src/pages/a.astro`)
    ).toBeUndefined();
  });
});
