import {afterEach, expect, test, vi} from 'vite-plus/test';
import {inlineSheet, urlSheet} from '../../lib/runtime/css.js';
import {fetchedSheet, inlinedSheet} from '../../lib/runtime/css-build.js';

// The node env has no CSSStyleSheet, which is the server render this covers.
afterEach(() => {
  vi.unstubAllGlobals();
});

const cssTextOf = (sheet: CSSStyleSheet): unknown =>
  (sheet as unknown as {cssText?: unknown}).cssText;

test('an inline sheet on a server carries its css as cssText', () => {
  expect(typeof CSSStyleSheet).toBe('undefined');
  const {sheet, onHotUpdate} = inlineSheet(':host { color: red; }');
  expect(cssTextOf(sheet)).toBe(':host { color: red; }');
  onHotUpdate({default: ':host { color: blue; }'});
  expect(cssTextOf(sheet)).toBe(':host { color: blue; }');
  expect(cssTextOf(inlinedSheet('a { b: c; }'))).toBe('a { b: c; }');
});

test('fetch-backed sheets on a server stay empty and fetch nothing', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(cssTextOf(urlSheet('/utils.css').sheet)).toBe('');
  expect(cssTextOf(fetchedSheet('/assets/utils-abc.css'))).toBe('');
  expect(fetch).not.toHaveBeenCalled();
});
