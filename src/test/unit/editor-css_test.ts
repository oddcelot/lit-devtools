import {describe, expect, test} from 'vite-plus/test';
import type {ComponentDocs} from '../../types/component-docs.js';
import {cssDocCompletions, cssTextOf, inCss} from '../../lib/editor/css.js';

const code = [
  "import {css, html} from 'lit';",
  'const a = css`',
  '  :host { color: red; }',
  '  .x { margin: ${gap}; }',
  '`;',
  'const b = html`<p>not css</p>`;',
].join('\n');

describe('cssTextOf', () => {
  const css = cssTextOf(code)!;

  test('keeps the length and the line breaks, so positions match', () => {
    expect(css.text).toHaveLength(code.length);
    expect(css.text.split('\n').map((line) => line.length)).toEqual(
      code.split('\n').map((line) => line.length)
    );
  });

  test('keeps the CSS and blanks everything else, holes included', () => {
    const lines = css.text.split('\n');
    expect(lines[0].trim()).toBe('');
    expect(lines[2]).toBe('  :host { color: red; }');
    expect(lines[3]).toBe('  .x { margin:       ; }');
    expect(lines[5].trim()).toBe('');
  });

  test('notes the lines that hold a hole', () => {
    expect([...css.holeLines]).toEqual([3]);
  });

  test('tells CSS from the rest', () => {
    expect(inCss(css, code.indexOf('color'))).toBe(true);
    expect(inCss(css, code.indexOf('gap'))).toBe(false);
    expect(inCss(css, code.indexOf('not css'))).toBe(false);
  });

  test('is undefined without css templates, and takes other tags', () => {
    expect(cssTextOf('html`<p></p>`')).toBeUndefined();
    expect(cssTextOf('styles`a { b: c }`', ['styles'])?.text).toBe(
      '       a { b: c } '
    );
  });
});

describe('cssDocCompletions', () => {
  const button = {
    tagName: 'x-button',
    cssProperties: [
      {name: '--x-button-gap', default: '4px', description: 'The gap.'},
    ],
    cssParts: [{name: 'base', description: 'The button.'}],
  } as ComponentDocs;
  const source = {
    get: async () => button,
    tags: async () => ['x-button'],
  };
  const at = async (text: string) => {
    const offset = text.indexOf('‸');
    const items = await cssDocCompletions(
      source,
      '/a.ts',
      text.replace('‸', ''),
      offset
    );
    return items.map(({label, detail, start, end}) => ({
      label,
      detail,
      replaced: end - start,
    }));
  };

  test('documented custom properties after var(--', async () => {
    expect(await at('css`a { gap: var(--x‸ }`')).toEqual([
      {label: '--x-button-gap', detail: '= 4px from <x-button>', replaced: 3},
    ]);
  });

  test('documented parts after ::part(', async () => {
    expect(await at('css`x-button::part(‸`')).toEqual([
      {label: 'base', detail: 'from <x-button>', replaced: 0},
    ]);
  });

  test('nothing elsewhere', async () => {
    expect(await at('css`a { color: re‸ }`')).toEqual([]);
  });
});
