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
