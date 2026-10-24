import {describe, expect, test} from 'vite-plus/test';
import {extractModuleDocs} from '../../lib/component-docs/extract.js';

const only = (code: string, id = '/app/src/el.ts') => {
  const {classes} = extractModuleDocs(code, id);
  expect(classes).toHaveLength(1);
  return classes[0];
};

describe('tags', () => {
  test('from @customElement on an exported class', () => {
    const cls = only(`
      import {LitElement} from 'lit';
      import {customElement} from 'lit/decorators.js';
      @customElement('x-a')
      export class XA extends LitElement {}
    `);
    expect(cls).toMatchObject({
      name: 'XA',
      tagName: 'x-a',
      superclass: {name: 'LitElement', specifier: 'lit'},
    });
  });

  test('from customElements.define in the same module', () => {
    const {classes} = extractModuleDocs(
      `
      class XB extends HTMLElement {}
      class Other {}
      if (!customElements.get('x-b')) window.customElements.define('x-b', XB);
    `,
      '/app/src/b.js'
    );
    expect(classes.map((c) => [c.name, c.tagName])).toEqual([
      ['XB', 'x-b'],
      ['Other', undefined],
    ]);
    expect(classes[0].superclass).toEqual({name: 'HTMLElement'});
  });

  test('a renamed and a default import keep the exported name', () => {
    const {classes} = extractModuleDocs(
      `
      import {Base as B} from './base.js';
      import D from './d.js';
      export class One extends B {}
      export default class extends D {}
    `,
      '/app/src/x.ts'
    );
    expect(classes[0].superclass).toEqual({
      name: 'Base',
      specifier: './base.js',
    });
    expect(classes[1]).toMatchObject({
      name: 'default',
      isDefaultExport: true,
      superclass: {name: 'default', specifier: './d.js'},
    });
  });

  test('mixin calls name the mixins, outermost first, and the base', () => {
    const cls = only(`
      import {SignalWatcher} from '@lit-labs/signals';
      import {Sized} from './sized.js';
      class X extends SignalWatcher(Sized(LitElement)) {}
    `);
    expect(cls.superclass).toEqual({name: 'LitElement'});
    expect(cls.mixins).toEqual([
      {name: 'SignalWatcher', specifier: '@lit-labs/signals'},
      {name: 'Sized', specifier: './sized.js'},
    ]);
  });

  test('a mixin over something other than a name leaves no superclass', () => {
    const cls = only(`class X extends Mixin(bases.Lit) {}`);
    expect(cls.superclass).toBeUndefined();
    expect(cls.mixins).toEqual([{name: 'Mixin'}]);
  });
});

describe('mixins', () => {
  const mixins = (code: string) =>
    extractModuleDocs(code, '/app/src/m.ts').mixins ?? [];

  test('an arrow returning a class expression documents its members', () => {
    const [sized] = mixins(`
      /** Gives a component a size. */
      export const Sized = (superClass) =>
        class extends superClass {
          /** How big it is. */
          @property() size = 'm';
          @state() private open = false;
        };
    `);
    expect(sized).toMatchObject({
      name: 'Sized',
      docs: {
        description: 'Gives a component a size.',
        properties: [{name: 'size', description: 'How big it is.'}],
      },
    });
    expect(sized!.docs.properties).toHaveLength(1);
  });

  test('a function returning a class declared in its body', () => {
    const [tone] = mixins(`
      export function Toned(superClass) {
        class TonedElement extends Sized(superClass) {
          @property() tone = 'neutral';
        }
        return TonedElement;
      }
    `);
    expect(tone).toMatchObject({
      name: 'Toned',
      mixins: [{name: 'Sized'}],
      docs: {properties: [{name: 'tone'}]},
    });
  });

  test('functions that return no class are not mixins', () => {
    expect(
      extractModuleDocs(
        `export const twice = (n) => n * 2; export function f() { return 1; }`,
        '/app/src/m.ts'
      ).mixins
    ).toBeUndefined();
  });
});

describe('class JSDoc', () => {
  const docs = only(`
    /**
     * A button that
     * presses.
     *
     * @summary Presses things.
     * @deprecated Use x-new.
     * @fires press - When pressed
     * @event {CustomEvent<{id: string}>} picked - With a detail
     * @fires bare
     * @slot - The label
     * @slot icon - An icon
     * @slot suffix Without a dash
     * @csspart base - The wrapper
     * @cssprop [--x-gap=4px] - The gap
     * @cssproperty --x-color - The color
     *   over two lines
     * @cssprop {<length>} --x-size
     * @cssstate pressed - While pressed
     */
    @customElement('x-button')
    export class XButton extends LitElement {}
  `).docs;

  test('description, summary and deprecation', () => {
    expect(docs.description).toBe('A button that\npresses.');
    expect(docs.summary).toBe('Presses things.');
    expect(docs.deprecated).toBe('Use x-new.');
  });

  test('events, with or without a type and a description', () => {
    expect(docs.events).toEqual([
      {name: 'press', description: 'When pressed'},
      {
        name: 'picked',
        type: 'CustomEvent<{id: string}>',
        description: 'With a detail',
      },
      {name: 'bare'},
    ]);
  });

  test('slots, the default one unnamed', () => {
    expect(docs.slots).toEqual([
      {name: '', description: 'The label'},
      {name: 'icon', description: 'An icon'},
      {name: 'suffix', description: 'Without a dash'},
    ]);
  });

  test('parts, CSS properties and states', () => {
    expect(docs.cssParts).toEqual([{name: 'base', description: 'The wrapper'}]);
    expect(docs.cssProperties).toEqual([
      {name: '--x-gap', default: '4px', description: 'The gap'},
      {name: '--x-color', description: 'The color\n  over two lines'},
      {name: '--x-size', type: '<length>'},
    ]);
    expect(docs.cssStates).toEqual([
      {name: 'pressed', description: 'While pressed'},
    ]);
  });

  test('a bare @deprecated, and a comment between decorator and class', () => {
    const cls = only(`
      @customElement('x-old')
      /** Old. */
      class XOld extends LitElement {}
    `);
    expect(cls.docs.description).toBe('Old.');
    const bare = only(`/**\n * @deprecated\n */\nclass XOld {}`);
    expect(bare.docs.deprecated).toBe(true);
  });

  test('a comment separated by code is not the class doc', () => {
    const cls = only(`/** Not mine. */\nconst a = 1;\nclass X {}`);
    expect(cls.docs.description).toBeUndefined();
  });
});

describe('members', () => {
  const docs = only(`
    @customElement('x-m')
    export class XM extends LitElement {
      /** The size. */
      @property({reflect: true}) size: 'small' | 'large' = 'small';
      /** @deprecated Use size. */
      @property({attribute: 'is-big', type: Boolean}) big = false;
      @property({attribute: false}) data: {a: number} | null = null;
      /** Plain field. */
      label = 'x';
      @state() private _open = false;
      @state() hidden = false;
      private secret = 1;
      protected guarded = 2;
      #mine = 3;
      static styles = css\`\`;
      /** @internal */
      wired = 1;
      /** Read only. */
      get value(): number { return 1; }
      set value(v: number) {}
      @property() set label2(v: string) {}
      accessor count: number = 0;
      method() {}
    }
  `).docs;

  test('only public instance fields and accessors', () => {
    expect(docs.properties.map((p) => p.name)).toEqual([
      'size',
      'big',
      'data',
      'label',
      'value',
      'label2',
      'count',
    ]);
  });

  test('types, defaults, descriptions and attributes', () => {
    const [size, big, data, label, value, label2, count] = docs.properties;
    expect(size).toEqual({
      name: 'size',
      description: 'The size.',
      type: "'small' | 'large'",
      default: "'small'",
      counterpart: 'size',
      reflects: true,
    });
    expect(big).toEqual({
      name: 'big',
      deprecated: 'Use size.',
      type: 'boolean',
      default: 'false',
      counterpart: 'is-big',
    });
    expect(data).toEqual({
      name: 'data',
      type: '{a: number} | null',
      default: 'null',
    });
    expect(label).toEqual({
      name: 'label',
      description: 'Plain field.',
      default: "'x'",
    });
    expect(value).toEqual({
      name: 'value',
      description: 'Read only.',
      type: 'number',
    });
    expect(label2).toEqual({
      name: 'label2',
      type: 'string',
      counterpart: 'label2',
    });
    expect(count).toEqual({name: 'count', type: 'number', default: '0'});
  });

  test('attributes mirror reactive properties', () => {
    expect(docs.attributes).toEqual([
      {
        name: 'size',
        description: 'The size.',
        type: "'small' | 'large'",
        default: "'small'",
        counterpart: 'size',
      },
      {
        name: 'is-big',
        deprecated: 'Use size.',
        type: 'boolean',
        default: 'false',
        counterpart: 'big',
      },
      {name: 'label2', type: 'string', counterpart: 'label2'},
    ]);
  });

  test('the default attribute lowercases the name', () => {
    const cls = only(`class X { @property() fullName = ''; }`);
    expect(cls.docs.attributes.map((a) => a.name)).toEqual(['fullname']);
  });
});

describe('JavaScript', () => {
  test('static properties and JSDoc types', () => {
    const cls = only(
      `
      /** A JS element. */
      export class XJs extends LitElement {
        static properties = {
          /** The name. */
          name: {type: String},
          open: {type: Boolean, attribute: 'is-open'},
          inner: {state: true},
          data: {attribute: false},
        };
        /** @type {number} */
        count = 0;
      }
      customElements.define('x-js', XJs);
    `,
      '/app/src/x-js.js'
    );
    expect(cls.tagName).toBe('x-js');
    expect(cls.docs.description).toBe('A JS element.');
    expect(cls.docs.properties).toEqual([
      {name: 'count', type: 'number', default: '0'},
      {
        name: 'name',
        description: 'The name.',
        type: 'string',
        counterpart: 'name',
      },
      {name: 'open', type: 'boolean', counterpart: 'is-open'},
      {name: 'data'},
    ]);
  });

  test('a field declared alongside static properties takes its options', () => {
    const cls = only(`
      class X extends LitElement {
        static get properties() { return {size: {attribute: 'sz'}}; }
        /** The size. */
        declare size: string;
      }
    `);
    expect(cls.docs.properties).toEqual([
      {
        name: 'size',
        description: 'The size.',
        type: 'string',
        counterpart: 'sz',
      },
    ]);
  });
});

describe('@attr, @prop, @default and @tag', () => {
  test('class tags add entries or complete the ones the code declares', () => {
    const cls = only(`
      /**
       * @tag x-tagged
       * @attr {'on' | 'off'} mode - Set by attributeChangedCallback.
       * @attribute size - Overridden: the code names it.
       * @prop {number} total - A property the code sets up by hand.
       * @property {string} label - Fills the missing description.
       */
      class X extends LitElement {
        @property() label;
        /** Own description. */
        @property() size = 'm';
      }
    `);
    expect(cls.tagName).toBe('x-tagged');
    expect(cls.docs.properties).toEqual([
      {
        name: 'label',
        description: 'Fills the missing description.',
        type: 'string',
        counterpart: 'label',
      },
      {
        name: 'size',
        description: 'Own description.',
        default: "'m'",
        counterpart: 'size',
      },
      {
        name: 'total',
        type: 'number',
        description: 'A property the code sets up by hand.',
      },
    ]);
    expect(
      cls.docs.attributes.map((a) => [a.name, a.description, a.type])
    ).toEqual([
      ['label', 'Fills the missing description.', 'string'],
      ['size', 'Own description.', undefined],
      ['mode', 'Set by attributeChangedCallback.', "'on' | 'off'"],
    ]);
  });

  test('@default gives a default where the code has none', () => {
    const cls = only(`
      class X extends LitElement {
        static properties = {
          /** @default 'auto' */
          mode: {type: String},
        };
        /** @default 3 */
        @property({type: Number}) count;
        /** @default 9 */
        @property() initialized = 1;
      }
    `);
    expect(cls.docs.properties.map((p) => [p.name, p.default])).toEqual([
      ['count', '3'],
      ['initialized', '1'],
      ['mode', "'auto'"],
    ]);
  });

  test('a registered tag wins over @tag', () => {
    const cls = only(`
      /** @tag x-doc */
      @customElement('x-real')
      class X extends LitElement {}
    `);
    expect(cls.tagName).toBe('x-real');
  });
});

describe('dispatched events', () => {
  test('events the class dispatches join the @fires ones', () => {
    const cls = only(`
      /** @fires change - Documented. */
      class X extends LitElement {
        pick() {
          this.dispatchEvent(new CustomEvent('pick', {detail: 1}));
          this.dispatchEvent(new Event('change'));
          this.dispatchEvent(new KeyboardEvent('keydown'));
          this.dispatchEvent(new CustomEvent('pick'));
          other.dispatchEvent(new CustomEvent('elsewhere'));
          this.dispatchEvent(event);
          this.dispatchEvent(new CustomEvent(name));
        }
      }
    `);
    expect(cls.docs.events).toEqual([
      {name: 'change', description: 'Documented.'},
      {name: 'pick', type: 'CustomEvent'},
      {name: 'keydown', type: 'KeyboardEvent'},
    ]);
  });
});

describe('constructor assignments', () => {
  test('names the class does not declare, with the value as default', () => {
    const cls = only(`
      class X extends Base {
        @property() size = 'm';
        private count = 0;
        constructor() {
          super();
          this.variant = 'neutral';
          this.size = 'l';
          this.count = 1;
          this.appearance = 'outlined';
          this.variant = 'brand';
          this.handlers[0] = null;
          this.total += 1;
          if (x) this.hidden = true;
        }
      }
    `);
    expect(cls.docs.assigned).toEqual([
      {name: 'variant', default: "'brand'"},
      {name: 'appearance', default: "'outlined'"},
    ]);
    // Not merged into the class's own properties until ancestry is known.
    expect(cls.docs.properties.map((p) => p.name)).toEqual(['size']);
  });
});

describe('reflects', () => {
  test('a reflecting property says so; its attribute does not', () => {
    const cls = only(`
      class X extends LitElement {
        static properties = {open: {type: Boolean, reflect: true}};
        @property({reflect: true, attribute: false}) data = null;
        @property({reflect: true}) size = 'm';
      }
    `);
    expect(
      cls.docs.properties.map((p) => [p.name, p.reflects ?? false])
    ).toEqual([
      ['data', false],
      ['size', true],
      ['open', true],
    ]);
    expect(cls.docs.attributes.map((a) => a.reflects)).toEqual([
      undefined,
      undefined,
    ]);
  });
});

describe('methods', () => {
  const methods = (code: string) => only(code).docs.methods;

  test('public instance methods; lifecycle and hidden ones left out', () => {
    expect(
      methods(`
        class X extends LitElement {
          /** Opens it. */
          open() {}
          close() {}
          render() { return html\`\`; }
          updated() {}
          connectedCallback() {}
          private hide() {}
          protected guard() {}
          #secret() {}
          static create() {}
          /** @internal */
          wire() {}
          get value() { return 1; }
        }
      `)?.map((m) => m.name)
    ).toEqual(['open', 'close']);
  });

  test('parameters and return type from TypeScript', () => {
    expect(
      methods(`
        class X extends LitElement {
          /**
           * Shows a message.
           * @param text - What to show.
           * @returns Whether it was shown.
           * @deprecated Use notify.
           */
          show(text: string, level = 'info', options?: {sticky: boolean}, ...rest: number[]): boolean {
            return true;
          }
        }
      `)
    ).toEqual([
      {
        name: 'show',
        description: 'Shows a message.',
        deprecated: 'Use notify.',
        parameters: [
          {name: 'text', type: 'string', description: 'What to show.'},
          {name: 'level', default: "'info'", optional: true},
          {name: 'options', type: '{sticky: boolean}', optional: true},
          {name: 'rest', type: 'number[]', rest: true},
        ],
        return: {type: 'boolean', description: 'Whether it was shown.'},
      },
    ]);
  });

  test('types from JSDoc in JavaScript', () => {
    expect(
      methods(
        `
        class X extends LitElement {
          /**
           * @param {string} id - The id.
           * @param {number} [count=1] - How many.
           * @returns {Promise<void>} Done.
           */
          load(id, count) {}
        }
      `
      )
    ).toEqual([
      {
        name: 'load',
        parameters: [
          {name: 'id', type: 'string', description: 'The id.'},
          {
            name: 'count',
            type: 'number',
            description: 'How many.',
            default: '1',
            optional: true,
          },
        ],
        return: {type: 'Promise<void>', description: 'Done.'},
      },
    ]);
  });

  test('none leaves the field off', () => {
    expect(only('class X { a = 1; }').docs).not.toHaveProperty('methods');
  });
});

describe('exports', () => {
  test('declarations, default and renamed exports of classes and mixins', () => {
    const {exports} = extractModuleDocs(
      `
      export class A extends LitElement {}
      class B extends LitElement {}
      class Hidden extends LitElement {}
      export const M = (base) => class extends base {};
      export function N(base) { return class extends base {}; }
      export {B as Bee};
      export default B;
      export const notAClass = 1;
      export {X} from './x.js';
    `,
      '/app/src/el.ts'
    );
    expect(exports).toEqual([
      {name: 'A', local: 'A'},
      {name: 'M', local: 'M'},
      {name: 'N', local: 'N'},
      {name: 'Bee', local: 'B'},
      {name: 'default', local: 'B'},
    ]);
  });

  test('an anonymous default class exports its stand-in name', () => {
    const {classes, exports} = extractModuleDocs(
      'export default class extends LitElement {}',
      '/app/src/el.ts'
    );
    expect(classes[0].name).toBe('default');
    expect(exports).toEqual([{name: 'default', local: 'default'}]);
  });

  test('a module exporting none leaves the field off', () => {
    expect(
      extractModuleDocs('class A {}', '/app/src/el.ts')
    ).not.toHaveProperty('exports');
  });
});

test('a module that does not parse documents nothing', () => {
  expect(extractModuleDocs('class {', '/app/src/broken.ts')).toEqual({
    classes: [],
  });
});

test('the id query is ignored when picking the language', () => {
  const {classes} = extractModuleDocs(
    'class X { a: number = 1 }',
    '/app/src/x.ts?v=123'
  );
  expect(classes[0].docs.properties).toEqual([
    {name: 'a', type: 'number', default: '1'},
  ]);
});

describe('@example', () => {
  const examples = (comment: string) =>
    only(`
      ${comment}
      export class XA extends LitElement {}
    `).docs.examples;

  test('keeps line breaks and indentation beyond the gutter', () => {
    expect(
      examples(`/**
       * A.
       *
       * @example
       * <x-a>
       *   <span>hi</span>
       * </x-a>
       */`)
    ).toEqual([{code: '<x-a>\n  <span>hi</span>\n</x-a>'}]);
  });

  test('reads several, and a leading caption', () => {
    expect(
      examples(`/**
       * @example <caption>Basic</caption>
       * <x-a></x-a>
       * @example const a = 1;
       *   a++;
       */`)
    ).toEqual([
      {caption: 'Basic', code: '<x-a></x-a>'},
      {code: 'const a = 1;\n  a++;'},
    ]);
  });

  test('a fence stays inside the example', () => {
    expect(
      examples(`/**
       * @example
       * \`\`\`html
       * <x-a></x-a>
       * \`\`\`
       */`)
    ).toEqual([{code: '```html\n<x-a></x-a>\n```'}]);
  });

  test('a decorator stays in the example; a tag after it still ends it', () => {
    const doc = only(`
      /**
       * @example
       * @customElement('x-a')
       * class XA extends LitElement {
       *   @property() size = 'm';
       * }
       * @slot - The content.
       */
      export class XA extends LitElement {}
    `).docs;
    expect(doc.examples).toEqual([
      {
        code: "@customElement('x-a')\nclass XA extends LitElement {\n  @property() size = 'm';\n}",
      },
    ]);
    expect(doc.slots).toEqual([{name: '', description: 'The content.'}]);
  });

  test('no tag starts inside a fenced example', () => {
    expect(
      examples(`/**
       * @example
       * \`\`\`ts
       * @state
       * \`\`\`
       */`)
    ).toEqual([{code: '```ts\n@state\n```'}]);
  });

  test('an empty one is dropped; none leaves the field off', () => {
    expect(examples(`/**\n * @example\n */`)).toBeUndefined();
    expect(examples(`/** A. */`)).toBeUndefined();
  });
});
