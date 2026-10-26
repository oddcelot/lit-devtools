import {expect, test} from 'vite-plus/test';
import {propertyDefinitionProblems} from '../../lib/editor/property-definitions.js';

const problemsIn = (body: string, file = '/app/src/x.ts') => {
  const code = `class X extends LitElement {\n${body}\n}`;
  return propertyDefinitionProblems({file, code}).map((p) => [
    p.rule,
    code.slice(p.start, p.end),
    p.message,
  ]);
};

test('attribute names HTML cannot write or match', () => {
  expect(
    problemsIn(`
      @property({attribute: 'max value'}) a = '';
      @property({attribute: 'maxValue'}) b = '';
      @property({attribute: 'max-value'}) c = '';
    `)
  ).toEqual([
    [
      'invalid-name',
      "'max value'",
      "`max value` isn't an attribute name HTML can write.",
    ],
    [
      'invalid-name',
      "'maxValue'",
      'HTML lowercases attribute names, so `maxValue` arrives as `maxvalue` and never sets the property: write it in lowercase.',
    ],
  ]);
});

test('a type option that does not fit, or none where one is needed', () => {
  expect(
    problemsIn(`
      @property() count: number = 0;
      @property({type: Number}) size: 'small' | 'large' = 'small';
      @property() items: string[] = [];
      @property({type: Boolean}) open?: boolean;
      @property({attribute: false}) data: Record<string, unknown> = {};
      @property({converter: toDate}) when: number = 0;
      @property() label: string | undefined;
      @property() other: Thing;
      @state() private n: number = 0;
      @property() max = 1;
      @property() name = 'x';
    `).map(([rule, text, message]) => [rule, text, message])
  ).toEqual([
    [
      'property-type',
      'count',
      '`count` is a number, but without `type: Number` Lit reads its attribute as a string: add `type: Number`.',
    ],
    [
      'property-type',
      'size',
      "`type: Number` reads the attribute as a number, but `size` is `'small' | 'large'`.",
    ],
    [
      'property-type',
      'items',
      '`items` is an array, but without `type: Array` Lit reads its attribute as a string: add `type: Array`, or `attribute: false` if it has no attribute.',
    ],
    [
      'property-type',
      'max',
      '`max` is a number, but without `type: Number` Lit reads its attribute as a string: add `type: Number`.',
    ],
  ]);
});

test('@property on private state, @state on a public field', () => {
  expect(
    problemsIn(`
      @property({type: Number}) private secret = 0;
      @property() #hidden = '';
      @state() open = false;
      @state() protected shown = false;
      @state() private ok = false;
    `).map(([rule, text]) => [rule, text])
  ).toEqual([
    ['property-visibility', '@property({type: Number})'],
    ['property-visibility', '@property()'],
    ['property-visibility', '@state()'],
  ]);
  expect(problemsIn('@state() open = false;', '/app/src/x.js')).toEqual([]);
});

test('a field that replaces an element method or Lit member', () => {
  expect(
    problemsIn(
      `
      @state() after;
      @property({attribute: false}) update = 1;
      @property() remove = '';
      @property({type: Boolean}) hidden = false;
      @state() elapsed;
    `,
      '/app/src/x.js'
    ).map(([rule, text, message]) => [rule, text, message])
  ).toEqual([
    [
      'shadowed-member',
      'after',
      'This field replaces `after()`, a method every element has: give it another name.',
    ],
    [
      'shadowed-member',
      'update',
      "This field replaces Lit's own `update`, which it relies on to update the element: give it another name.",
    ],
    [
      'shadowed-member',
      'remove',
      'This field replaces `remove()`, a method every element has: give it another name.',
    ],
  ]);
});
