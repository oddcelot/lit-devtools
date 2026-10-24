import {expect, test} from 'vite-plus/test';
import {extractModuleDocs} from '../../lib/component-docs/extract.js';
import {docsFromManifest} from '../../lib/component-docs/manifest.js';
import {createSourceDocsIndex} from '../../lib/component-docs/source-index.js';
import {writeManifest} from '../../lib/component-docs/write-manifest.js';

const relative = (id: string) => id.replace('/app/', '');

const index = () => {
  const docs = createSourceDocsIndex(relative);
  const add = (
    id: string,
    code: string,
    superclassIds: Record<string, string> = {}
  ) =>
    docs.set(
      id,
      extractModuleDocs(code, id),
      new Map(Object.entries(superclassIds))
    );
  return {docs, add, manifest: () => writeManifest(docs.modules(), relative)};
};

const BASE = `
  /**
   * The shared base.
   * @fires change - Base change
   * @slot - Base content
   * @cssprop [--x-gap=4px] - The gap.
   */
  export default class Base extends LitElement {
    /** The base value. */
    @property({reflect: true}) value: string = '';
    /** Resets it. */
    reset(): void {}
    focus() {}
  }
`;

const ELEMENT = `
  import Base from './base.js';
  import {Sized} from './sized.js';
  /**
   * @summary An element.
   * @csspart label - The label.
   */
  @customElement('x-a')
  export class XA extends Sized(Base) {
    /** Own label. */
    @property({attribute: 'aria-text'}) label = 'hi';
    /** Redeclared. */
    @property() value = 'own';
    /** Own focus. */
    focus(options?: FocusOptions) {}
  }
`;

const SIZED = `
  /** Adds a size. */
  export const Sized = (superClass) =>
    class extends superClass {
      @property() size: 's' | 'm' = 'm';
    };
`;

const project = () => {
  const p = index();
  p.add('/app/src/base.ts', BASE);
  p.add('/app/src/sized.ts', SIZED);
  p.add('/app/src/x-a.ts', ELEMENT, {
    './base.js': '/app/src/base.ts?v=1',
    './sized.js': '/app/src/sized.ts',
  });
  return p;
};

test('one module per file, sorted by path, with exports and definitions', () => {
  const {manifest} = project();
  const result = manifest();
  expect(result.schemaVersion).toBe('2.1.0');
  expect(result.modules.map((m) => m.path)).toEqual([
    'src/base.ts',
    'src/sized.ts',
    'src/x-a.ts',
  ]);
  expect(result.modules[2].exports).toEqual([
    {kind: 'js', name: 'XA', declaration: {name: 'XA', module: 'src/x-a.ts'}},
    {
      kind: 'custom-element-definition',
      name: 'x-a',
      declaration: {name: 'XA', module: 'src/x-a.ts'},
    },
  ]);
  expect(result.modules[0].exports).toEqual([
    {
      kind: 'js',
      name: 'default',
      declaration: {name: 'Base', module: 'src/base.ts'},
    },
  ]);
});

test('a custom element with its own and inherited members', () => {
  const [, , xa] = project().manifest().modules;
  expect((xa.declarations as unknown[])[0]).toEqual({
    kind: 'class',
    name: 'XA',
    summary: 'An element.',
    customElement: true,
    tagName: 'x-a',
    superclass: {name: 'Base', module: 'src/base.ts'},
    mixins: [{name: 'Sized', module: 'src/sized.ts'}],
    members: [
      {
        kind: 'field',
        name: 'label',
        description: 'Own label.',
        default: "'hi'",
        attribute: 'aria-text',
      },
      {
        kind: 'field',
        name: 'value',
        description: 'Redeclared.',
        default: "'own'",
        attribute: 'value',
      },
      {
        kind: 'field',
        name: 'size',
        type: {text: "'s' | 'm'"},
        default: "'m'",
        attribute: 'size',
        inheritedFrom: {name: 'Sized', module: 'src/sized.ts'},
      },
      {
        kind: 'method',
        name: 'focus',
        description: 'Own focus.',
        parameters: [
          {name: 'options', type: {text: 'FocusOptions'}, optional: true},
        ],
      },
      {
        kind: 'method',
        name: 'reset',
        description: 'Resets it.',
        return: {type: {text: 'void'}},
        inheritedFrom: {name: 'Base', module: 'src/base.ts'},
      },
    ],
    attributes: [
      {
        name: 'aria-text',
        description: 'Own label.',
        default: "'hi'",
        fieldName: 'label',
      },
      {
        name: 'value',
        description: 'Redeclared.',
        default: "'own'",
        fieldName: 'value',
      },
      {
        name: 'size',
        type: {text: "'s' | 'm'"},
        default: "'m'",
        fieldName: 'size',
        inheritedFrom: {name: 'Sized', module: 'src/sized.ts'},
      },
    ],
    events: [
      {
        name: 'change',
        description: 'Base change',
        inheritedFrom: {name: 'Base', module: 'src/base.ts'},
      },
    ],
    slots: [
      {
        name: '',
        description: 'Base content',
        inheritedFrom: {name: 'Base', module: 'src/base.ts'},
      },
    ],
    cssParts: [{name: 'label', description: 'The label.'}],
    cssProperties: [
      {
        name: '--x-gap',
        description: 'The gap.',
        default: '4px',
        inheritedFrom: {name: 'Base', module: 'src/base.ts'},
      },
    ],
  });
});

test('a mixin lists its own members', () => {
  const [, sized] = project().manifest().modules;
  expect(sized.declarations).toEqual([
    {
      kind: 'mixin',
      name: 'Sized',
      description: 'Adds a size.',
      members: [
        {
          kind: 'field',
          name: 'size',
          type: {text: "'s' | 'm'"},
          default: "'m'",
          attribute: 'size',
        },
      ],
      attributes: [
        {
          name: 'size',
          type: {text: "'s' | 'm'"},
          default: "'m'",
          fieldName: 'size',
        },
      ],
    },
  ]);
});

test('superclasses from packages, globals and unresolved imports', () => {
  const {add, manifest} = index();
  add(
    '/app/src/el.ts',
    `
    import {LitElement} from 'lit';
    import {Gone} from './gone.js';
    export class A extends LitElement {}
    export class B extends HTMLElement {}
    export class C extends Gone {}
    export class D extends A {}
  `
  );
  const superclasses = (
    manifest().modules[0].declarations as {superclass: unknown}[]
  ).map((d) => d.superclass);
  expect(superclasses).toEqual([
    {name: 'LitElement', package: 'lit'},
    {name: 'HTMLElement', package: 'global:'},
    {name: 'Gone'},
    {name: 'A', module: 'src/el.ts'},
  ]);
});

test('a reflecting field says so, and reads back', () => {
  const [base] = project().manifest().modules;
  const [field] = (base.declarations as {members: unknown[]}[])[0].members;
  expect(field).toMatchObject({name: 'value', reflects: true});
});

test('reads back as the docs the index gives', () => {
  const {docs, manifest} = project();
  const [read] = docsFromManifest(manifest(), {
    manifest: 'custom-elements.json',
  });
  const {origin: _origin, examples: _examples, ...fromIndex} = docs.get('x-a')!;
  const {origin: _readOrigin, ...fromManifest} = read;
  expect(fromManifest).toEqual(fromIndex);
});

test('the same sources write the same manifest in any order', () => {
  const a = project().manifest();
  const p = index();
  p.add('/app/src/x-a.ts', ELEMENT, {
    './base.js': '/app/src/base.ts?v=1',
    './sized.js': '/app/src/sized.ts',
  });
  p.add('/app/src/sized.ts', SIZED);
  p.add('/app/src/base.ts', BASE);
  expect(JSON.stringify(p.manifest())).toBe(JSON.stringify(a));
});
