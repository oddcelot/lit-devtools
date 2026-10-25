import {describe, expect, test} from 'vite-plus/test';
import {findServer} from '../../../packages/vscode/src/find-server.js';

const manifest = '{"name": "@oddsquad/lit-language-server"}';

/** A `readText` over the files given, by path. */
const files =
  (tree: Record<string, string>) =>
  (file: string): string | undefined =>
    tree[file];

const bundled = '/ext/dist/server/bin.mjs';

describe('findServer', () => {
  test('takes the setting first, relative to the first folder', () => {
    const readText = files({});
    expect(
      findServer({setting: 'tools/ls.mjs', folders: ['/a'], bundled, readText})
    ).toEqual({path: '/a/tools/ls.mjs', source: 'setting'});
    expect(
      findServer({setting: '/abs/ls.mjs', folders: ['/a'], bundled, readText})
    ).toEqual({path: '/abs/ls.mjs', source: 'setting'});
  });

  test("prefers the project's install to the bundled copy", () => {
    const dir = '/b/node_modules/@oddsquad/lit-language-server';
    const readText = files({
      [`${dir}/package.json`]: manifest,
      [`${dir}/dist/bin.mjs`]: '',
    });
    expect(findServer({folders: ['/a', '/b'], bundled, readText})).toEqual({
      path: `${dir}/dist/bin.mjs`,
      source: 'project',
    });
  });

  test('finds the server through an installed @oddsquad/lit-devtools', () => {
    const dir = '/a/node_modules/@oddsquad/lit-devtools';
    const readText = files({
      [`${dir}/package.json`]: '{"name": "@oddsquad/lit-devtools"}',
      [`${dir}/bin/lit-language-server.mjs`]: '',
    });
    expect(findServer({folders: ['/a'], bundled, readText})).toEqual({
      path: `${dir}/bin/lit-language-server.mjs`,
      source: 'project',
    });
  });

  test("finds the repo's own package once it's built", () => {
    const dir = '/repo/packages/lit-language-server';
    const unbuilt = files({[`${dir}/package.json`]: manifest});
    expect(
      findServer({folders: ['/repo'], bundled, readText: unbuilt})
    ).toEqual({path: bundled, source: 'bundled'});
    const built = files({
      [`${dir}/package.json`]: manifest,
      [`${dir}/dist/bin.mjs`]: '',
    });
    expect(findServer({folders: ['/repo'], bundled, readText: built})).toEqual({
      path: `${dir}/dist/bin.mjs`,
      source: 'repo',
    });
  });

  test('skips a folder of the same path holding another package', () => {
    const dir = '/a/packages/lit-language-server';
    const readText = files({
      [`${dir}/package.json`]: '{"name": "something-else"}',
      [`${dir}/dist/bin.mjs`]: '',
    });
    expect(findServer({folders: ['/a'], bundled, readText})).toEqual({
      path: bundled,
      source: 'bundled',
    });
  });
});
