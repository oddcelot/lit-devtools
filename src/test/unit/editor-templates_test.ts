import {describe, expect, test} from 'vite-plus/test';
import {
  findDocumentRegions,
  findTemplates,
} from '../../lib/editor/templates.js';

/** Each template's text, with its holes written as `${}`. */
const texts = (code: string, tags?: string[]) =>
  findTemplates(code, tags).map(({start, end, holes}) => {
    let text = '';
    let at = start;
    for (const hole of holes) {
      text += `${code.slice(at, hole.start)}\${}`;
      at = hole.end;
    }
    return text + code.slice(at, end);
  });

describe('findTemplates', () => {
  test('finds html and svg templates, with their holes', () => {
    const code =
      'const a = html`<x-a .v=${1} @e=${() => {}}></x-a>`;\n' +
      'const b = svg`<circle r=${r}></circle>`;';
    expect(texts(code)).toEqual([
      '<x-a .v=${} @e=${}></x-a>',
      '<circle r=${}></circle>',
    ]);
  });

  test('skips untagged templates and other tags', () => {
    expect(texts('const a = `<x-a>`; const b = css`:host{}`;')).toEqual([]);
  });

  test('reads a member tag and spaces before the backtick', () => {
    expect(texts('lit.html `<x-a></x-a>`')).toEqual(['<x-a></x-a>']);
  });

  test('takes the tags it is given', () => {
    expect(texts('h`<x-a>`; html`<x-b>`', ['h'])).toEqual(['<x-a>']);
  });

  test('follows templates nested in holes', () => {
    const code = 'html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`';
    expect(texts(code)).toEqual(['<ul>${}</ul>', '<li>${}</li>']);
  });

  test('keeps braces in a hole from ending it early', () => {
    const code = 'html`<x-a .v=${{a: {b: 1}}}></x-a>`';
    expect(texts(code)).toEqual(['<x-a .v=${}></x-a>']);
  });

  test('ignores backticks in strings, comments and regular expressions', () => {
    const code = [
      "const s = 'html`<no-a>`';",
      '// html`<no-b>`',
      '/* html`<no-c>` */',
      'const r = /html`<no-d>`/g;',
      'const x = html`<x-a></x-a>`;',
    ].join('\n');
    expect(texts(code)).toEqual(['<x-a></x-a>']);
  });

  test('reads a slash after a value as a division', () => {
    const code = 'const half = a / 2; const t = html`<x-a></x-a>`; b / 2;';
    expect(texts(code)).toEqual(['<x-a></x-a>']);
  });

  test('skips escaped backticks in a template', () => {
    expect(texts('html`<x-a title="\\`q\\`"></x-a>`')).toEqual([
      '<x-a title="\\`q\\`"></x-a>',
    ]);
  });

  test('runs an unclosed template to the end of the code', () => {
    const code = 'render() {\n  return html`\n    <x-button .';
    const [region] = findTemplates(code);
    expect(code.slice(region.start, region.end)).toBe('\n    <x-button .');
  });

  test('runs an unclosed hole to the end of the code', () => {
    const code = 'html`<x-a .v=${foo(';
    const [region] = findTemplates(code);
    expect(region.end).toBe(code.length);
    expect(region.holes).toEqual([
      {start: code.indexOf('$'), end: code.length},
    ]);
  });
});

/** Each region's dialect and text, with its holes written as `{}`. */
const regions = (code: string, found: ReturnType<typeof findTemplates>) =>
  found.map(({start, end, holes, dialect}) => {
    let text = '';
    let at = start;
    for (const hole of holes.filter((h) => h.start >= start && h.end <= end)) {
      text += `${code.slice(at, hole.start)}{}`;
      at = hole.end;
    }
    return `${dialect ?? 'lit'}: ${text + code.slice(at, end)}`;
  });

describe('findTemplates with JSX', () => {
  const jsx = (code: string) =>
    regions(code, findTemplates(code, undefined, {jsx: true}));

  test('finds elements where an expression starts, with nested ones in holes', () => {
    const code =
      'const App = () => (<div><x-a onpick={(e) => go(e)}>{items.map((i) => <x-b name={i} />)}</x-a></div>);';
    expect(jsx(code)).toEqual([
      'jsx: <div><x-a onpick={}>{}</x-a></div>',
      'jsx: <x-b name={} />',
    ]);
  });

  test("leaves comparisons, generic calls and a generic arrow's <T,> as code", () => {
    const code =
      'const a = b < c; const f = g<T>(x); const k = <T,>(x: T) => x;\nif (a < b) { return <x-b/>; }';
    expect(jsx(code)).toEqual(['jsx: <x-b/>']);
  });

  test('finds Lit templates next to JSX, and none without the option', () => {
    const code = 'const t = html`<x-a></x-a>`; const j = <x-b></x-b>;';
    expect(jsx(code)).toEqual(['lit: <x-a></x-a>', 'jsx: <x-b></x-b>']);
    expect(regions(code, findTemplates(code))).toEqual(['lit: <x-a></x-a>']);
  });
});

describe('findDocumentRegions', () => {
  test('reads an Astro body after its frontmatter, and templates in the frontmatter', () => {
    const code =
      '---\nconst t = html`<x-f></x-f>`;\n---\n<x-card name={title} {...rest}>{list.map((i) => <x-item label={i} />)}</x-card>\n<script>if (a < b) {}</script>';
    expect(regions(code, findDocumentRegions(code, 'astro'))).toEqual([
      'lit: <x-f></x-f>',
      'astro: <x-card name={} {}>{}</x-card>\n<script>if (a < b) {}</script>',
      'astro: <x-item label={} />',
    ]);
  });

  test("reads MDX's body, leaving out code, import blocks and inline code", () => {
    const code =
      "import {X} from './x.js'\n\n# Don't {1 + 1}\n\n`<x-inline>`\n\n```html\n<x-fenced {no}>\n```\n\n<x-card name=\"a\">{list.map((i) => <x-item label={i} />)}</x-card>";
    expect(regions(code, findDocumentRegions(code, 'mdx'))).toEqual([
      'jsx: {}\n\n# Don\'t {}\n\n{}\n\n{}\n\n<x-card name="a">{}</x-card>',
      'jsx: <x-item label={} />',
    ]);
  });
});
