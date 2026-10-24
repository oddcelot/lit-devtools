import {afterEach, expect, test, vi} from 'vite-plus/test';
import {LitElement, html} from 'lit';
import {
  collectPrivateFields,
  privateKeyOf,
  privateValue,
  setPrivateField,
} from '../../lib/runtime/inspector/private-fields.js';
import {
  collectDetails,
  collectOverrides,
  expandPath,
  setProp,
} from '../../lib/runtime/inspector/collect.js';
import {
  clearOverrides,
  removeOverride,
  toggleOverride,
} from '../../lib/runtime/inspector/prop-overrides.js';

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
  clearOverrides();
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
    {
      name: 'count',
      key: key('MyEl', 'count').description,
      value: '3',
      type: 'number',
      editable: 'number',
    },
    {
      name: 'items',
      key: key('MyEl', 'items').description,
      value: '["a", "b"]',
      type: 'Array(2)',
      expandable: true,
    },
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
    {
      name: 'stokes',
      key: stokes.description,
      value: '0',
      type: 'number',
      editable: 'number',
    },
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

/** A rendered Lit element with a rewritten `#stokes = 0`, showing it. */
const flame = async () => {
  const stokes = key('LitFlame', 'stokes');
  class Flame extends LitElement {
    [stokes] = 0;
    override render() {
      return html`stoked ${this[stokes]}×`;
    }
  }
  const tag = `x-private-${counter++}`;
  customElements.define(tag, Flame);
  const el = document.createElement(tag) as Flame;
  document.body.append(el);
  await el.updateComplete;
  const shown = () =>
    (el.shadowRoot?.textContent ?? '').replace(/<!--.*?-->/g, '').trim();
  return {el, stokes, field: stokes.description!, shown};
};

test('set-prop writes a #private field by its key and re-renders', async () => {
  const {el, stokes, field, shown} = await flame();
  const update = vi.spyOn(el, 'requestUpdate');
  expect(setProp(el, field, 5)).toBe(true);
  // Lit does not watch the field, so the write asks for the update itself,
  // naming nothing.
  expect(update).toHaveBeenCalledWith();
  await el.updateComplete;
  expect(shown()).toBe('stoked 5×');
  expect(el[stokes]).toBe(5);
  expect(collectPrivateFields(el)).toEqual([
    {
      name: 'stokes',
      key: field,
      value: '5',
      type: 'number',
      editable: 'number',
      override: {value: '5', enabled: true, intrinsic: '0'},
    },
  ]);
  expect(collectOverrides().entries).toEqual([
    {
      id: expect.any(Number),
      tagName: el.localName,
      name: field,
      value: '5',
      enabled: true,
    },
  ]);
});

test("the class's own writes land under the override, and revert brings them back", async () => {
  const {el, stokes, field, shown} = await flame();
  setPrivateField(el, field, 5);
  el[stokes] = 1;
  el.requestUpdate();
  await el.updateComplete;
  expect(shown()).toBe('stoked 5×');
  expect(collectPrivateFields(el)[0]?.override?.intrinsic).toBe('1');

  toggleOverride(el, field, false);
  await el.updateComplete;
  expect(shown()).toBe('stoked 1×');

  expect(removeOverride(el, field)).toBe(true);
  await el.updateComplete;
  expect(shown()).toBe('stoked 1×');
  // A plain data field again, as the class made it.
  expect(Object.getOwnPropertyDescriptor(el, stokes)).toMatchObject({
    value: 1,
    writable: true,
  });
  expect(collectPrivateFields(el)[0]?.override).toBeUndefined();
});

test('a subclass #x and its base class #x are written apart', () => {
  const base = key('Base', 'x');
  const sub = key('Sub', 'x');
  const el = elementWith([[base, 1]], [[sub, 2]]);
  expect(collectPrivateFields(el).map((f) => f.key)).toEqual([
    base.description,
    sub.description,
  ]);
  expect(setPrivateField(el, sub.description!, 20)).toBe(true);
  expect(el[base]).toBe(1);
  expect(el[sub]).toBe(20);
  expect(collectPrivateFields(el).map((f) => [f.name, f.value])).toEqual([
    ['x', '1'],
    ['x (Sub)', '20'],
  ]);
});

test('writes only an own primitive field, with a value of its type', () => {
  const getter = key('MyEl', 'computed');
  const el = elementWith([
    [key('MyEl', 'count'), 3],
    [key('MyEl', 'label'), 'a'],
    [key('MyEl', 'items'), ['a']],
    [key('MyEl', 'unset'), null],
  ]);
  Object.defineProperty(el, getter, {get: () => 1, configurable: true});
  const name = (n: string) => key('MyEl', n).description!;
  // Never a field the element does not hold: a write cannot add one.
  expect(setPrivateField(el, name('missing'), 1)).toBe(false);
  expect(Object.getOwnPropertySymbols(el)).not.toContain(
    key('MyEl', 'missing')
  );
  expect(setPrivateField(el, name('computed'), 2)).toBe(false);
  expect(setPrivateField(el, name('items'), 'b')).toBe(false);
  expect(setPrivateField(el, name('unset'), 'b')).toBe(false);
  expect(setPrivateField(el, name('count'), '4')).toBe(false);
  expect(setPrivateField(el, name('count'), Number.NaN)).toBe(false);
  expect(setPrivateField(el, name('label'), 'b')).toBe(true);
  // Not one of the rewrite's keys, or a leaf inside a field.
  expect(setPrivateField(el, 'count', 4)).toBe(false);
  expect(
    setPrivateField(el, '@oddsquad/vite-plugin-lit#private:/a.ts:slot', 4)
  ).toBe(false);
  expect(setProp(el, name('count'), 4, ['x'])).toBe(false);
  expect(el[key('MyEl', 'count')]).toBe(3);
});
