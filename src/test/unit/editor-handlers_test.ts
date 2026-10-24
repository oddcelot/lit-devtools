import {describe, expect, test} from 'vite-plus/test';
import {
  eventHandlers,
  memberAccessAt,
  membersOf,
} from '../../lib/editor/handlers.js';

const params = (inner: string) => {
  const code = `html\`<x-a ${inner}></x-a>\``;
  return eventHandlers(code, 'script').map(({param}) => ({
    ...param,
    text: code.slice(param.start, param.end),
  }));
};

describe('eventHandlers', () => {
  test.each([
    ['@go=${(ev) => f(ev)}', {name: 'ev', typed: false, parenthesized: true}],
    ['@go=${ev => f(ev)}', {name: 'ev', typed: false, parenthesized: false}],
    [
      '@go=${async (e, x) => f(e)}',
      {name: 'e', typed: false, parenthesized: true},
    ],
    [
      '@go=${function (ev) { f(ev); }}',
      {name: 'ev', typed: false, parenthesized: true},
    ],
    [
      '@go=${(ev: Event) => f(ev)}',
      {name: 'ev', typed: true, parenthesized: true},
    ],
  ])('reads the parameter of %s', (inner, expected) => {
    expect(params(inner)).toMatchObject([{...expected, text: expected.name}]);
  });

  test.each([
    ['a method reference', '@go=${this.#onGo}'],
    ['a call', '@go=${handle()}'],
    ['a plain attribute', 'title=${(ev) => ev}'],
  ])('finds no inline handler in %s', (_, inner) => {
    expect(params(inner)).toEqual([]);
  });
});

describe('memberAccessAt', () => {
  const access = (inner: string) => {
    const text = `html\`<x-a ${inner}></x-a>\``;
    const offset = text.indexOf('‸');
    const code = text.replace('‸', '');
    const found = memberAccessAt(code, 'script', offset);
    return (
      found && {
        path: found.path,
        prefix: found.prefix,
        replaces: code.slice(found.start, found.end),
      }
    );
  };

  test('the event itself, its detail, and a name being typed', () => {
    expect(access('@go=${(ev) => ev.‸}')).toEqual({
      path: [],
      prefix: '',
      replaces: '',
    });
    expect(access('@go=${(ev) => ev.detail.‸}')).toEqual({
      path: ['detail'],
      prefix: '',
      replaces: '',
    });
    expect(access('@go=${(ev) => ev.detail.na‸me}')).toEqual({
      path: ['detail'],
      prefix: 'na',
      replaces: 'name',
    });
  });

  test('nothing for another variable, a typed parameter or outside handlers', () => {
    expect(access('@go=${(ev) => other.‸}')).toBeUndefined();
    expect(access('@go=${(ev: Event) => ev.‸}')).toBeUndefined();
    expect(access('.data=${ev.‸}')).toBeUndefined();
  });
});

describe('membersOf', () => {
  const type =
    'CustomEvent<{id: string; item: {name: string; tags?: string[]}; at: number}>';
  const names = (path: string[]) =>
    membersOf(type, path).map((m) => `${m.name}: ${m.type}`);

  test("a CustomEvent's detail first, then what every event has", () => {
    expect(names([]).slice(0, 3)).toEqual([
      'detail: {id: string; item: {name: string; tags?: string[]}; at: number}',
      'type: string',
      'target: EventTarget | null',
    ]);
  });

  test('the keys of the detail, and of a shape inside it', () => {
    expect(names(['detail'])).toEqual([
      'id: string',
      'item: {name: string; tags?: string[]}',
      'at: number',
    ]);
    expect(names(['detail', 'item'])).toEqual([
      'name: string',
      'tags: string[]',
    ]);
  });

  test('no detail on another event, no keys on a named type', () => {
    expect(membersOf('MouseEvent', []).map((m) => m.name)).not.toContain(
      'detail'
    );
    expect(membersOf('CustomEvent<Item>', ['detail'])).toEqual([]);
  });
});
