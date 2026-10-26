import {expect, test} from 'vite-plus/test';
import {docsSourceFor} from '../../../packages/lit-language-server/src/documents.js';
import type {ComponentDocs} from '../../types/component-docs.js';
import type {FeatureRequest} from '../../lib/editor/features.js';
import {unknownNameProblems} from '../../lib/editor/unknown-names.js';
import type {Workspace} from '../../lib/editor/workspace.js';

const button: ComponentDocs = {
  tagName: 'x-button',
  className: 'XButton',
  properties: [
    {name: 'size', type: "'small' | 'large'"},
    {name: 'count', type: 'number'},
  ],
  attributes: [
    {name: 'size', type: "'small' | 'large'"},
    {name: 'count', type: 'number'},
    {name: 'disabled', type: 'boolean'},
  ],
  events: [],
  slots: [],
  cssParts: [],
  cssProperties: [],
  cssStates: [],
  origin: {manifest: '', module: 'src/x-button.ts', source: true},
};

const card: ComponentDocs = {
  ...button,
  tagName: 'x-card',
  className: 'XCard',
  properties: [],
  attributes: [],
  slots: [{name: ''}, {name: 'header'}, {name: 'footer'}],
};

const workspace = {
  get: async (_file: string, tag: string) =>
    tag === 'x-button' ? button : tag === 'x-card' ? card : null,
  tags: async () => ['x-button', 'x-card'],
} as unknown as Workspace;

const problemsIn = async (
  template: string,
  extra: Partial<Omit<FeatureRequest, 'offset'>> = {}
) => {
  const code = `html\`${template}\`;`;
  const problems = await unknownNameProblems(
    docsSourceFor(workspace, 'script'),
    {file: '/app/src/app.ts', code, kind: 'script', ...extra}
  );
  return problems.map((p) => [p.rule, code.slice(p.start, p.end), p.message]);
};

test('an unknown element, with the component it is a typo of', async () => {
  expect(await problemsIn('<x-buton></x-buton><x-other></x-other>')).toEqual([
    [
      'unknown-element',
      'x-buton',
      "`<x-buton>` isn't HTML, SVG or a component this file can use. Did you mean `<x-button>`?",
    ],
    [
      'unknown-element',
      'x-other',
      "`<x-other>` isn't HTML, SVG or a component this file can use.",
    ],
  ]);
});

test('unknown attributes and properties on components and HTML', async () => {
  expect(
    await problemsIn(
      '<x-button sise="small" ?disabled=${d} .cont=${1} .hidden=${h} .textContent=${t} data-x aria-label="a" defer-hydration></x-button><div colour="red" id="a"></div>'
    )
  ).toEqual([
    [
      'unknown-attribute',
      'sise',
      '`<x-button>` has no attribute `sise`. Did you mean `size`?',
    ],
    [
      'unknown-binding',
      '.cont',
      '`<x-button>` has no property `.cont`. Did you mean `.count`?',
    ],
    ['unknown-attribute', 'colour', '`<div>` has no attribute `colour`.'],
  ]);
});

test('SVG elements take the attributes every element has', async () => {
  expect(
    await problemsIn(
      '<svg role="img" part="icon" slot="x" xmlns="http://www.w3.org/2000/svg"><line part="hand" x1="0"></line></svg>'
    )
  ).toEqual([]);
});

test('a value outside the attribute type', async () => {
  expect(
    await problemsIn(
      '<x-button size="huge" count="three"></x-button><x-button size="large" count="3" size=${s}></x-button>'
    )
  ).toEqual([
    [
      'invalid-value',
      'huge',
      '`size` takes one of `small`, `large`, not `huge`.',
    ],
    ['invalid-value', 'three', '`count` takes a number, not `three`.'],
  ]);
});

test('ignored tags and attributes, events and expressions are left alone', async () => {
  expect(
    await problemsIn(
      '<legacy-thing></legacy-thing><x-button legacy-flag .legacyProp=${1} @whatever=${f} ${spread}></x-button><${tag}></${tag}>',
      {ignoreTags: ['legacy-*'], ignoreAttributes: ['legacy*']}
    )
  ).toEqual([]);
});

test('a slot the parent component does not declare', async () => {
  expect(
    await problemsIn(
      '<x-card><h2 slot="heder">a</h2><p slot="footer">b</p><div><span slot="x">c</span></div><img slot="side"><x-button slot="any"></x-button></x-card><x-button><i slot="x"></i></x-button>'
    )
  ).toEqual([
    [
      'unknown-slot',
      'heder',
      '`<x-card>` has no slot `heder`. Did you mean `header`?',
    ],
    [
      'unknown-slot',
      'side',
      '`<x-card>` has no slot `side`. Its slots: `header`, `footer`.',
    ],
    [
      'unknown-slot',
      'any',
      '`<x-card>` has no slot `any`. Its slots: `header`, `footer`.',
    ],
  ]);
});

const inDialect = async (
  code: string,
  kind: 'jsx' | 'astro' | 'html' | 'mdx',
  file: string
) => {
  const problems = await unknownNameProblems(docsSourceFor(workspace, kind), {
    file,
    code,
    kind,
  });
  return problems.map((p) => [p.rule, code.slice(p.start, p.end)]);
};

test('in JSX, custom elements only, with what JSX passes them', async () => {
  const code = [
    'export const App = () => (',
    '  <div colour="x" className="a">',
    '    <x-button key="1" ref={r} className="b" id="c" onclick={go} size="huge" sise="small" prop:count={1} prop:cont={2} on:whatever={f} />',
    '    <x-buton />',
    '    <Widget anything="x" />',
    '  </div>',
    ');',
  ].join('\n');
  expect(await inDialect(code, 'jsx', '/app/src/app.tsx')).toEqual([
    ['invalid-value', 'huge'],
    ['unknown-attribute', 'sise'],
    ['unknown-binding', 'prop:cont'],
    ['unknown-element', 'x-buton'],
  ]);
});

test('in Astro and HTML files, custom elements and their attributes', async () => {
  const astro = [
    '---',
    "import Layout from './Layout.astro';",
    '---',
    '<Layout title="x">',
    '  <x-card client:load set:html={h} class:list={c}><h2 slot="heder">a</h2></x-card>',
    '  <x-button sise="small"></x-button>',
    '  <x-local></x-local>',
    '</Layout>',
    '<script>',
    "  customElements.define('x-local', class extends HTMLElement {});",
    '</script>',
  ].join('\n');
  expect(await inDialect(astro, 'astro', '/app/src/page.astro')).toEqual([
    ['unknown-attribute', 'sise'],
    ['unknown-slot', 'heder'],
  ]);
  const page =
    '<div foo="1"><x-buton></x-buton><x-button tabindex="0" sise></x-button></div>';
  expect(await inDialect(page, 'html', '/app/index.html')).toEqual([
    ['unknown-element', 'x-buton'],
    ['unknown-attribute', 'sise'],
  ]);
});
