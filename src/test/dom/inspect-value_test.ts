import {expect, test} from 'vite-plus/test';
import {expandPath} from '../../lib/runtime/inspector/collect.js';
import {collectExtras} from '../../lib/runtime/inspector/extras.js';
import {
  childrenOf,
  isExpandable,
  MAX_CHILDREN,
  stepInto,
  writeInto,
} from '../../lib/runtime/inspector/inspect-value.js';

let counter = 0;

const host = (
  declared: string[] = []
): HTMLElement & Record<string, unknown> => {
  const tag = `x-expand-${counter++}`;
  class El extends HTMLElement {
    static elementProperties = new Map(declared.map((k) => [k, {}]));
    hasUpdated = false;
    isUpdatePending = false;
    requestUpdate() {}
  }
  customElements.define(tag, El);
  return document.createElement(tag) as HTMLElement & Record<string, unknown>;
};

const labels = (value: unknown) =>
  childrenOf(value).children.map(
    (c) =>
      `${c.label}${c.entry ? ' =>' : ':'} ${c.value}${c.expandable ? ' +' : ''}`
  );

test('only containers with something in them expand', () => {
  expect(isExpandable({a: 1})).toBe(true);
  expect(isExpandable([0])).toBe(true);
  expect(isExpandable(new Map([[1, 2]]))).toBe(true);
  expect(isExpandable(new Uint8Array(2))).toBe(true);
  for (const value of [
    {},
    [],
    new Set(),
    'text',
    42,
    null,
    () => 1,
    new Date(0),
    /x/,
    document.createElement('div'),
    new DataView(new ArrayBuffer(4)),
  ]) {
    expect(isExpandable(value)).toBe(false);
  }
});

test('lists object keys, array indices and collection entries', () => {
  expect(labels({id: 1, user: {name: 'Ada'}})).toEqual([
    'id: 1',
    'user: {name: "Ada"} +',
  ]);
  expect(labels(['a', [1]])).toEqual(['0: "a"', '1: [1] +']);
  expect(labels(new Map<unknown, unknown>([['k', {x: 1}]]))).toEqual([
    '"k" => {x: 1} +',
  ]);
  expect(labels(new Set(['s']))).toEqual(['0: "s"']);
});

test('caps a level and counts the rest', () => {
  const {children, more} = childrenOf(
    Array.from({length: MAX_CHILDREN + 5}, (_, i) => i)
  );
  expect(children).toHaveLength(MAX_CHILDREN);
  expect(more).toBe(5);
});

test('a throwing getter lists as a placeholder, not a failure', () => {
  const value = {
    get bad(): never {
      throw new Error('no');
    },
    ok: 1,
  };
  expect(labels(value)).toEqual(['bad: [getter threw]', 'ok: 1']);
});

test('steps into keys and positions as childrenOf numbered them', () => {
  const map = new Map([['a', {deep: true}]]);
  expect(stepInto(map, 0)).toEqual({value: {deep: true}});
  expect(stepInto(new Set(['x', 'y']), 1)).toEqual({value: 'y'});
  expect(stepInto([1, 2], 1)).toEqual({value: 2});
  expect(stepInto({a: 1}, 'a')).toEqual({value: 1});
});

test('a step that no longer fits the value does not resolve', () => {
  expect(stepInto([1], 3)).toBeUndefined();
  expect(stepInto([1], '0')).toBeUndefined();
  expect(stepInto({a: 1}, 0)).toBeUndefined();
  expect(stepInto({a: 1}, 'toString')).toBeUndefined();
  expect(stepInto(new Map(), 0)).toBeUndefined();
  expect(stepInto('text', 'length')).toBeUndefined();
});

test('expands a reactive property down a path', () => {
  const el = host(['config']);
  el['config'] = {theme: {mode: 'dark', accents: ['red']}};
  expect(
    expandPath(el, {
      section: 'prop',
      name: 'config',
      keys: ['theme'],
    })?.children.map((c) => c.label)
  ).toEqual(['mode', 'accents']);
  expect(
    expandPath(el, {
      section: 'prop',
      name: 'config',
      keys: ['theme', 'accents'],
    })?.children.map((c) => c.value)
  ).toEqual(['"red"']);
});

test('only declared properties are reachable', () => {
  const el = host(['config']);
  el['secret'] = {token: 'x'};
  expect(
    expandPath(el, {section: 'prop', name: 'secret', keys: []})
  ).toBeNull();
});

test('a path that stops resolving answers null', () => {
  const el = host(['config']);
  el['config'] = {theme: 'plain'};
  expect(
    expandPath(el, {section: 'prop', name: 'config', keys: ['theme', 'mode']})
  ).toBeNull();
});

test('expands a plain field listed among the extras', () => {
  const el = host();
  el['cache'] = new Map([['a', 1]]);
  expect(collectExtras(el)).toEqual([
    expect.objectContaining({name: 'cache', expandable: true}),
  ]);
  expect(
    expandPath(el, {section: 'extra', name: 'cache', keys: []})?.children
  ).toEqual([
    {
      label: '"a"',
      key: 0,
      entry: true,
      value: '1',
      type: 'number',
      expandable: false,
      editable: 'number',
    },
  ]);
});

const editables = (value: unknown) =>
  childrenOf(value).children.map((c) => c.editable);

test('leaves are marked editable by the type they hold, where a slot exists', () => {
  expect(editables({s: 'a', n: 1, b: true, o: {}, u: undefined})).toEqual([
    'string',
    'number',
    'boolean',
    undefined,
    undefined,
  ]);
  expect(editables(['a', 2])).toEqual(['string', 'number']);
  expect(editables(new Uint8Array(2))).toEqual(['number', 'number']);
  expect(
    editables(
      new Map<unknown, unknown>([
        ['k', 'v'],
        ['j', {}],
      ])
    )
  ).toEqual(['string', undefined]);
  // A Set member has no slot to write.
  expect(editables(new Set(['a', 1]))).toEqual([undefined, undefined]);
});

test('a getter that throws is not editable', () => {
  const value = {
    get boom(): string {
      throw new Error('no');
    },
  };
  expect(childrenOf(value).children).toEqual([
    expect.objectContaining({type: 'error'}),
  ]);
  expect(editables(value)).toEqual([undefined]);
});

test('writeInto assigns in place and keeps identity', () => {
  const obj = {a: 'x', n: 1};
  expect(writeInto(obj, 'a', 'y')).toBe(true);
  expect(writeInto(obj, 'n', 2)).toBe(true);
  expect(obj).toEqual({a: 'y', n: 2});

  const arr = [1, 2];
  expect(writeInto(arr, 1, 9)).toBe(true);
  expect(arr).toEqual([1, 9]);

  const typed = new Uint8Array(2);
  expect(writeInto(typed, 1, 7)).toBe(true);
  expect([...typed]).toEqual([0, 7]);

  const map = new Map<unknown, unknown>([
    ['a', 1],
    [{k: 1}, 2],
  ]);
  expect(writeInto(map, 1, 5)).toBe(true);
  expect([...map.values()]).toEqual([1, 5]);
  expect(map.size).toBe(2);
});

test('writeInto refuses what is not a same-type write to a real slot', () => {
  const set = new Set(['a']);
  expect(writeInto(set, 0, 'b')).toBe(false);
  expect([...set]).toEqual(['a']);
  const obj = {a: 'x', o: {}};
  expect(writeInto(obj, 'a', 1)).toBe(false);
  expect(writeInto(obj, 'o', 'text')).toBe(false);
  expect(writeInto(obj, 'missing', 'y')).toBe(false);
  expect(writeInto([1], 0, 'one')).toBe(false);
  expect(writeInto([1], 3, 2)).toBe(false);
  expect(writeInto([1], 'length', 2)).toBe(false);
  expect(writeInto(new Map([['a', 1]]), 4, 2)).toBe(false);
  expect(writeInto(new Map([['a', 1]]), 0, 'x')).toBe(false);
  expect(writeInto(obj, 'a', 'y' as never) && obj.a).toBe('y');
  expect(writeInto('text', 0, 'x')).toBe(false);
  expect(obj.o).toEqual({});
});

test('writeInto refuses NaN, Infinity and a frozen container', () => {
  const arr = [1];
  expect(writeInto(arr, 0, Number.NaN)).toBe(false);
  expect(writeInto(arr, 0, Infinity)).toBe(false);
  expect(arr).toEqual([1]);
  const frozen = Object.freeze({a: 1});
  expect(writeInto(frozen, 'a', 2)).toBe(false);
  expect(frozen.a).toBe(1);
  expect(writeInto(Object.freeze([1]), 0, 2)).toBe(false);
});
