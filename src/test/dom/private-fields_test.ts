import {afterEach, expect, test} from 'vite-plus/test';
import {LitElement} from 'lit';
import {
  collectPrivateFields,
  privateKeyOf,
  privateValue,
} from '../../lib/runtime/inspector/private-fields.js';
import {
  collectDetails,
  expandPath,
} from '../../lib/runtime/inspector/collect.js';

/** The key the plugin's private-fields rewrite gives `#name` in `cls`. */
const key = (cls: string, name: string, file = '/src/my-el.ts') =>
  Symbol.for(`@oddsquad/vite-plugin-lit#private:${file}:${cls}#${name}`);

let counter = 0;

type Fields = Array<[PropertyKey, unknown]>;

/** Define fields as class fields do: own, writable, enumerable. */
const defineFields = (target: object, fields: Fields): void => {
  for (const [k, value] of fields) {
    Object.defineProperty(target, k, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
};

/**
 * A Lit element whose constructor defines `fields`, then `subFields` in a
 * subclass, as the rewritten `[sym] = value` class fields would.
 */
const elementWith = (
  fields: Fields,
  subFields: Fields = []
): LitElement & Record<PropertyKey, unknown> => {
  class Base extends LitElement {
    constructor() {
      super();
      defineFields(this, fields);
    }
  }
  class Sub extends Base {
    constructor() {
      super();
      defineFields(this, subFields);
    }
  }
  const tag = `x-private-${counter++}`;
  customElements.define(tag, Sub);
  return document.createElement(tag) as Sub & Record<PropertyKey, unknown>;
};

afterEach(() => {
  document.body.replaceChildren();
});

test('names a rewritten key by what follows the last #', () => {
  expect(privateKeyOf(key('MyEl', 'count'))).toEqual({
    name: 'count',
    classKey: 'MyEl',
  });
  expect(privateKeyOf(key('anonymous~1', 'x', '/a#b/c.ts'))).toEqual({
    name: 'x',
    classKey: 'anonymous~1',
  });
});

test('ignores other symbols', () => {
  expect(privateKeyOf(Symbol('count'))).toBeUndefined();
  expect(
    privateKeyOf(Symbol.for('@oddsquad/vite-plugin-lit#private'))
  ).toBeUndefined();
  expect(
    privateKeyOf(Symbol.for('@oddsquad/vite-plugin-lit#private:/a.ts:slot'))
  ).toBeUndefined();
  expect(privateKeyOf(Symbol())).toBeUndefined();
});

test('collects rewritten field values, skipping functions and accessors', () => {
  const getter = key('MyEl', 'computed');
  const el = elementWith([
    [key('MyEl', 'count'), 3],
    [key('MyEl', 'items'), ['a', 'b']],
    [key('MyEl', 'onClick'), () => {}],
    [Symbol('other'), 'not ours'],
    ['stringField', 'listed under Instance'],
  ]);
  Object.defineProperty(el, getter, {get: () => 1});
  expect(collectPrivateFields(el)).toEqual([
    {name: 'count', value: '3', type: 'number'},
    {name: 'items', value: '["a", "b"]', type: 'Array(2)', expandable: true},
  ]);
  expect(privateValue(el, 'items')?.value).toEqual(['a', 'b']);
  expect(privateValue(el, 'onClick')).toBeUndefined();
  expect(privateValue(el, 'computed')).toBeUndefined();
});

test('tells apart a #name declared by a class and its subclass', () => {
  const el = elementWith([[key('Base', 'x'), 1]], [[key('Sub', 'x'), 2]]);
  expect(collectPrivateFields(el).map((f) => [f.name, f.value])).toEqual([
    ['x', '1'],
    ['x (Sub)', '2'],
  ]);
});

test('details carry private fields only when there are some', () => {
  const stokes = key('LitFlame', 'stokes');
  const a = elementWith([[stokes, 0]]);
  const b = elementWith([]);
  document.body.append(a, b);
  expect(collectDetails(a).privateFields).toEqual([
    {name: 'stokes', value: '0', type: 'number'},
  ]);
  expect(collectDetails(b).privateFields).toBeUndefined();
  a[stokes] = 2;
  expect(collectDetails(a).privateFields?.[0]?.value).toBe('2');
});

test('a private field expands through its own path section', () => {
  const el = elementWith([[key('MyEl', 'cfg'), {theme: 'dark'}]]);
  expect(
    expandPath(el, {section: 'private', name: 'cfg', keys: []})?.children.map(
      (c) => [c.label, c.value]
    )
  ).toEqual([['theme', '"dark"']]);
  expect(
    expandPath(el, {section: 'private', name: 'missing', keys: []})
  ).toBeNull();
});
