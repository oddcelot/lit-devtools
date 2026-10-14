import {describe, expect, test} from 'vite-plus/test';
import {loadedUrlFor} from '../../../extension/src/loaded-source.js';

describe('loadedUrlFor', () => {
  test('matches a root-relative URL, ignoring the query', () => {
    expect(
      loadedUrlFor('/home/me/app/src/x.ts', [
        'http://localhost:5173/src/other.ts',
        'http://localhost:5173/src/x.ts?t=1',
      ])
    ).toBe('http://localhost:5173/src/x.ts?t=1');
  });

  test('matches Vite’s /@fs form for a file outside the root', () => {
    expect(
      loadedUrlFor('/home/me/lib/x.ts', [
        'http://localhost:5173/@fs/home/me/lib/x.ts',
      ])
    ).toBe('http://localhost:5173/@fs/home/me/lib/x.ts');
  });

  test('prefers the longest matching pathname', () => {
    expect(
      loadedUrlFor('/home/me/app/src/x.ts', [
        'http://localhost:5173/x.ts',
        'http://localhost:5173/src/x.ts',
      ])
    ).toBe('http://localhost:5173/src/x.ts');
  });

  test('decodes the pathname', () => {
    expect(
      loadedUrlFor('/home/me/my app/x.ts', [
        'http://localhost:5173/my%20app/x.ts',
      ])
    ).toBe('http://localhost:5173/my%20app/x.ts');
  });

  test('treats a relative file as rooted', () => {
    expect(loadedUrlFor('src/x.ts', ['http://a.test/src/x.ts'])).toBe(
      'http://a.test/src/x.ts'
    );
  });

  test('matches the page only as its index.html, and never a non-URL', () => {
    expect(
      loadedUrlFor('/home/me/app/src/x.ts', ['http://a.test/', 'nonsense'])
    ).toBeUndefined();
  });

  test('opens an HTML file at the page, not its inline-script proxy', () => {
    const urls = [
      'http://localhost:5173/',
      'http://localhost:5173/index.html?html-proxy&index=1.js',
    ];
    expect(loadedUrlFor('index.html', urls)).toBe('http://localhost:5173/');
    expect(
      loadedUrlFor('/home/me/app/docs/index.html', [
        'http://localhost:5173/docs/',
        'http://localhost:5173/docs/index.html?html-proxy&index=0.js',
      ])
    ).toBe('http://localhost:5173/docs/');
  });

  test('prefers the HTML file DevTools lists over the page that serves it', () => {
    expect(
      loadedUrlFor('index.html', [
        'http://localhost:5173/',
        'http://localhost:5173/index.html',
      ])
    ).toBe('http://localhost:5173/index.html');
  });

  test('matches a Windows path written with backslashes', () => {
    expect(
      loadedUrlFor('C:\\work\\lib\\x.ts', [
        'http://localhost:5173/@fs/C:/work/lib/x.ts',
      ])
    ).toBe('http://localhost:5173/@fs/C:/work/lib/x.ts');
    expect(
      loadedUrlFor('C:/work/lib/x.ts', [
        'http://localhost:5173/@fs/C:/work/lib/x.ts',
      ])
    ).toBe('http://localhost:5173/@fs/C:/work/lib/x.ts');
  });

  test('finds nothing for an unrelated file', () => {
    expect(
      loadedUrlFor('/home/me/app/src/x.ts', ['http://a.test/src/y.ts'])
    ).toBeUndefined();
  });
});
