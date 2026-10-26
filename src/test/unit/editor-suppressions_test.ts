import {expect, test} from 'vite-plus/test';
import {suppressionsOf} from '../../lib/editor/suppressions.js';

const at = (code: string, needle: string) => code.indexOf(needle);

test('an HTML comment silences the next element, for the rules it names', () => {
  const code =
    'html`<!-- lit-ignore unknown-attribute --><x-a foo bar></x-a><x-b foo></x-b>`;';
  const suppressed = suppressionsOf(code, 'script');
  expect(
    suppressed({rule: 'unknown-attribute', start: at(code, 'foo bar')})
  ).toBe(true);
  expect(suppressed({rule: 'unknown-element', start: at(code, 'x-a')})).toBe(
    false
  );
  expect(
    suppressed({rule: 'unknown-attribute', start: at(code, 'foo></x-b>')})
  ).toBe(false);
});

test('next-line and file-wide comments, with every rule when none is named', () => {
  const code = [
    '// lit-ignore-next-line',
    'html`<x-a .b=${1}>`;',
    'html`<x-a .b=${2}>`;',
  ].join('\n');
  const suppressed = suppressionsOf(code, 'script');
  expect(suppressed({rule: 'binding-type', start: at(code, '1}')})).toBe(true);
  expect(suppressed({rule: 'binding-type', start: at(code, '2}')})).toBe(false);
  const file = `/* lit-ignore-file css, event-type */\n${code}`;
  const wide = suppressionsOf(file, 'script');
  expect(wide({rule: 'css', start: file.length - 1})).toBe(true);
  expect(wide({rule: 'binding-type', start: at(file, '2}')})).toBe(false);
});

test('nothing without a comment', () => {
  expect(
    suppressionsOf('html`<x-a>`;', 'script')({rule: 'css', start: 0})
  ).toBe(false);
});
