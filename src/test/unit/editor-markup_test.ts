import {describe, expect, test} from 'vite-plus/test';
import {
  type DocumentKind,
  contextAt,
  markupRegions,
  scanMarkup,
} from '../../lib/editor/markup.js';

/** The context at `‸`, with offsets turned back into text for reading. */
const at = (source: string, kind: DocumentKind = 'script') => {
  const offset = source.indexOf('‸');
  const code = source.replace('‸', '');
  const context = contextAt(code, kind, offset);
  if (!context) return undefined;
  const {kind: on, prefix, start, end} = context;
  return {
    on,
    tag: context.element.tag,
    prefix,
    replaces: code.slice(start, end),
    ...(context.kind === 'attribute' ? {binding: context.binding} : {}),
    ...(context.kind === 'value' ? {attribute: context.attribute.name} : {}),
  };
};

const lit = (inner: string) =>
  `import {html} from 'lit';\nclass A {\n  render() {\n    return html\`\n      ${inner}\n    \`;\n  }\n}\n`;

describe('contextAt in a Lit template', () => {
  test('a tag name being typed', () => {
    expect(at(lit('<x-‸'))).toEqual({
      on: 'tag',
      tag: 'x-',
      prefix: 'x-',
      replaces: 'x-',
    });
  });

  test('a bare < at the end of a line', () => {
    expect(at(lit('<‸\n      <div></div>'))).toMatchObject({
      on: 'tag',
      prefix: '',
      replaces: '',
    });
  });

  test('inside an existing tag name', () => {
    expect(at(lit('<x-but‸ton size="large"></x-button>'))).toMatchObject({
      on: 'tag',
      tag: 'x-button',
      prefix: 'x-but',
      replaces: 'x-button',
    });
  });

  test('a new attribute after the tag name', () => {
    expect(at(lit('<x-button ‸></x-button>'))).toEqual({
      on: 'attribute',
      tag: 'x-button',
      prefix: '',
      replaces: '',
      binding: '',
    });
  });

  test('an attribute name being typed', () => {
    expect(at(lit('<x-button si‸ze="large">'))).toMatchObject({
      on: 'attribute',
      prefix: 'si',
      replaces: 'size',
      binding: '',
    });
  });

  test.each([
    ['.', '.'],
    ['@', '@'],
    ['?', '?'],
  ] as const)('a %s binding prefix alone', (prefix, binding) => {
    expect(at(lit(`<x-button ${prefix}‸></x-button>`))).toMatchObject({
      on: 'attribute',
      prefix: '',
      replaces: '',
      binding,
    });
  });

  test('a binding name being typed, before its value', () => {
    expect(at(lit('<x-button .da‸ta=${{a: 1}}></x-button>'))).toMatchObject({
      on: 'attribute',
      prefix: 'da',
      replaces: 'data',
      binding: '.',
    });
  });

  test('an event name, unclosed at the end of the template', () => {
    const code = 'html`<x-button @submit-st‸';
    expect(at(code)).toMatchObject({
      on: 'attribute',
      tag: 'x-button',
      prefix: 'submit-st',
      replaces: 'submit-st',
      binding: '@',
    });
  });

  test('a quoted value', () => {
    expect(at(lit('<x-button size="la‸rge">'))).toEqual({
      on: 'value',
      tag: 'x-button',
      attribute: 'size',
      prefix: 'la',
      replaces: 'large',
    });
  });

  test('an empty value with its closing quote not typed yet', () => {
    expect(at(lit('<x-button size="‸'))).toMatchObject({
      on: 'value',
      attribute: 'size',
      prefix: '',
    });
  });

  test('an unquoted value, empty and filled', () => {
    expect(at(lit('<x-button size=‸>'))).toMatchObject({
      on: 'value',
      prefix: '',
      replaces: '',
    });
    expect(at(lit('<x-button size=sm‸all>'))).toMatchObject({
      on: 'value',
      prefix: 'sm',
      replaces: 'small',
    });
  });

  test('a later attribute after one with a hole', () => {
    expect(
      at(lit('<x-button .data=${{a: {b: 1}}} si‸ze="large">'))
    ).toMatchObject({on: 'attribute', prefix: 'si', replaces: 'size'});
  });

  test('a tag in a template nested in a hole', () => {
    expect(
      at(lit('<ul>${items.map((i) => html`<x-item ‸></x-item>`)}</ul>'))
    ).toMatchObject({on: 'attribute', tag: 'x-item'});
  });

  test.each([
    ['in text', '<x-button>Go‸</x-button>'],
    ['right after the >', '<x-button>‸</x-button>'],
    ['in a closing tag', '<x-button></x-but‸ton>'],
    ['in a comment', '<!-- <x-button ‸ -->'],
    ['in a hole', '<x-button .data=${{a‸: 1}}></x-button>'],
    ['in a hole that holds the whole value', '<x-button size=${s‸}>'],
  ])('nothing %s', (_, inner) => {
    expect(at(lit(inner))).toBeUndefined();
  });

  test('nothing outside templates', () => {
    expect(at("const a = '<x-button ‸>';")).toBeUndefined();
    expect(at('const a = css`<x-button ‸>`;')).toBeUndefined();
  });
});

describe('contextAt in an HTML file', () => {
  const page = (inner: string) =>
    `<!doctype html>\n<html>\n  <body>\n    ${inner}\n  </body>\n</html>\n`;

  test('an attribute and a value', () => {
    expect(
      at(page('<x-button ‸ disabled>Go</x-button>'), 'html')
    ).toMatchObject({on: 'attribute', tag: 'x-button', prefix: ''});
    expect(at(page('<x-button size="‸">'), 'html')).toMatchObject({
      on: 'value',
      attribute: 'size',
    });
  });

  test('nothing in a style element', () => {
    expect(at(page('<style>x-button { ‸ }</style>'), 'html')).toBeUndefined();
  });

  test('a template in an inline module script', () => {
    const inner =
      '<script type="module">\n      render(html`<x-button .‸>`, document.body);\n    </script>';
    expect(at(page(inner), 'html')).toMatchObject({
      on: 'attribute',
      tag: 'x-button',
      binding: '.',
    });
  });
});

describe('contextAt in JSX, Astro and MDX', () => {
  test("a JSX prop is plain, and Solid's namespaces are bindings", () => {
    expect(at('const a = <x-a onpi‸ck={go} />;', 'jsx')).toEqual({
      on: 'attribute',
      tag: 'x-a',
      prefix: 'onpi',
      replaces: 'onpick',
      binding: '',
    });
    expect(at('const a = <x-a on:pi‸ck={go} />;', 'jsx')).toEqual({
      on: 'attribute',
      tag: 'x-a',
      prefix: 'pi',
      replaces: 'pick',
      binding: '@',
    });
  });

  test("a . or @ isn't a binding outside Lit", () => {
    expect(at('<x-a @cli‸ck />', 'astro')).toMatchObject({binding: ''});
  });

  test('nothing in an expression, in code or after a comparison', () => {
    expect(at('<x-a label={x‸} />', 'astro')).toBeUndefined();
    expect(at('```\n<x-a ‸>\n```', 'mdx')).toBeUndefined();
    expect(at('const a = b <x-a ‸;', 'jsx')).toBeUndefined();
  });

  test('marks elements with their dialect', () => {
    const code = '<x-a />';
    const [region] = markupRegions(code, 'mdx');
    expect(scanMarkup(code, region)[0]).toMatchObject({dialect: 'jsx'});
  });
});

describe('scanMarkup', () => {
  const scan = (code: string) => {
    const regions = markupRegions(code, 'script');
    return regions.flatMap((region) =>
      scanMarkup(code, region).map((element) => ({
        tag: element.tag,
        closed: element.closed,
        attributes: element.attributes.map((a) => ({
          name: `${a.binding}${a.name}`,
          value: a.value && {
            text: code.slice(a.value.start, a.value.end),
            expression: a.value.expression,
          },
        })),
      }))
    );
  };

  test('reads every start tag, attribute and binding', () => {
    expect(
      scan(
        'html`<x-button size="large" .data=${d} ?disabled=${x} @go=${f} hidden></x-button><p>${t}</p>`'
      )
    ).toEqual([
      {
        tag: 'x-button',
        closed: true,
        attributes: [
          {name: 'size', value: {text: 'large', expression: false}},
          {name: '.data', value: {text: '${d}', expression: true}},
          {name: '?disabled', value: {text: '${x}', expression: true}},
          {name: '@go', value: {text: '${f}', expression: true}},
          {name: 'hidden', value: undefined},
        ],
      },
      {tag: 'p', closed: true, attributes: []},
    ]);
  });

  test('leaves out element-position holes', () => {
    expect(scan('html`<input ${ref(r)} value="a">`')).toMatchObject([
      {tag: 'input', attributes: [{name: 'value'}]},
    ]);
  });

  test('ends an unclosed tag at the next one', () => {
    expect(scan('html`<x-a foo\n<x-b bar></x-b>`')).toMatchObject([
      {tag: 'x-a', closed: false, attributes: [{name: 'foo'}]},
      {tag: 'x-b', closed: true, attributes: [{name: 'bar'}]},
    ]);
  });

  test('reads a < that starts no tag as text', () => {
    expect(scan('html`<p>${a} < ${b}</p>`')).toMatchObject([{tag: 'p'}]);
  });
});

describe('half-typed input', () => {
  const component = `import {LitElement, html} from 'lit';
class A extends LitElement {
  render() {
    // A comment with a \` backtick and a /regex-like/ slash.
    const half = this.count / 2;
    return html\`
      <x-button size="large" .data=\${{a: {b: 1}}} ?disabled=\${half > 1}
        @submit-start=\${() => this.go(\`done\`)}>Go</x-button>
      <!-- <x-nope> -->
      \${this.items.map((i) => html\`<li class=\${i.c}>\${i.label}</li>\`)}
      <x-vanilla tone=warm></x-vanilla>
    \`;
  }
}
`;

  test('every cut and every cursor gives a context in range or none', () => {
    for (let cut = 0; cut <= component.length; cut++) {
      const code = component.slice(0, cut);
      for (let offset = 0; offset <= code.length; offset++) {
        const context = contextAt(code, 'script', offset);
        if (!context) continue;
        expect(context.start).toBeGreaterThanOrEqual(0);
        expect(context.end).toBeLessThanOrEqual(code.length);
        expect(context.start).toBeLessThanOrEqual(context.end);
        expect(code.slice(context.start, offset)).toBe(context.prefix);
      }
    }
  });
});
