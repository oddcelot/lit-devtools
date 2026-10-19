import {afterEach, describe, expect, test} from 'vite-plus/test';
import {sourceLabel, useProjectRoot} from '../../panel/source-label.js';

describe('sourceLabel', () => {
  afterEach(() => useProjectRoot(undefined));

  test('a project file keeps its path', () => {
    expect(sourceLabel('src/my-el.ts')).toEqual({path: 'src/my-el.ts'});
  });

  test("names a scoped package in pnpm's store, with its version", () => {
    expect(
      sourceLabel(
        'node_modules/.pnpm/@awesome.me+webawesome@3.14.0_@floating-ui+utils@0.2.12_@types+node@26.6.3/node_modules/@awesome.me/webawesome/dist/chunks/chunk.7VGCIHDG.js'
      )
    ).toEqual({
      pkg: {name: '@awesome.me/webawesome', version: '3.14.0'},
      path: 'dist/chunks/chunk.7VGCIHDG.js',
    });
  });

  test('names an unscoped package, and a prerelease version whole', () => {
    expect(
      sourceLabel(
        '/home/me/app/node_modules/.pnpm/lit-element@4.2.0-next.1/node_modules/lit-element/lit-element.js'
      )
    ).toEqual({
      pkg: {name: 'lit-element', version: '4.2.0-next.1'},
      path: 'lit-element.js',
    });
  });

  test('a flat node_modules names the package without a version', () => {
    expect(sourceLabel('node_modules/@lit/reactive-element/x.js')).toEqual({
      pkg: {name: '@lit/reactive-element'},
      path: 'x.js',
    });
  });

  test('takes the innermost package of a nested node_modules', () => {
    expect(
      sourceLabel('node_modules/a/node_modules/b/index.js').pkg?.name
    ).toBe('b');
  });

  test("leaves Vite's pre-bundles and a bare package folder as they are", () => {
    expect(sourceLabel('node_modules/.vite/deps/lit.js?v=1a2b')).toEqual({
      path: 'node_modules/.vite/deps/lit.js',
    });
    expect(sourceLabel('node_modules/@scope')).toEqual({
      path: 'node_modules/@scope',
    });
  });

  test('reads backslashes as slashes', () => {
    expect(sourceLabel('C:\\app\\node_modules\\lit\\index.js')).toEqual({
      pkg: {name: 'lit'},
      path: 'index.js',
    });
  });

  test('an absolute path in the project reads relative to its root', () => {
    useProjectRoot('/home/me/app/');
    expect(sourceLabel('/home/me/app/src/pages/a.astro')).toEqual({
      path: 'src/pages/a.astro',
    });
    expect(sourceLabel('/home/me/application/x.ts')).toEqual({
      path: '/home/me/application/x.ts',
    });
  });

  test('a Windows root matches with either slash', () => {
    useProjectRoot('C:\\app');
    expect(sourceLabel('C:/app/src/a.ts')).toEqual({path: 'src/a.ts'});
  });
});
