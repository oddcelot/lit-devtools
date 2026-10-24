import {describe, expect, test} from 'vite-plus/test';
import {objectMembers, typeMismatch} from '../../lib/editor/type-text.js';

const sent = 'CustomEvent<{id: string; name: string; price: number}>';

describe('typeMismatch', () => {
  test('a key the handler expects that the event lacks', () => {
    expect(typeMismatch(sent, 'CustomEvent<{thing: string}>')).toBe(
      '`detail.thing` is missing'
    );
  });

  test('a primitive where another is expected, also nested', () => {
    expect(typeMismatch(sent, 'CustomEvent<{id: number}>')).toBe(
      '`detail.id` is `string`, not `number`'
    );
    expect(typeMismatch('CustomEvent<string>', 'CustomEvent<number>')).toBe(
      '`detail` is `string`, not `number`'
    );
    expect(
      typeMismatch(
        'CustomEvent<{item: {qty: string}}>',
        'CustomEvent<{item: {qty: number}}>'
      )
    ).toBe('`detail.item.qty` is `string`, not `number`');
    expect(
      typeMismatch('CustomEvent<string>', 'CustomEvent<{id: string}>')
    ).toBe('`detail` is `string`, not an object');
  });

  test.each([
    ['fewer keys than sent', 'CustomEvent<{id: string}>'],
    ['an optional key not sent', 'CustomEvent<{id: string; thing?: string}>'],
    [
      'the same type, spaced differently',
      'CustomEvent<{ id: string;name: string; price: number }>',
    ],
    ['a named type', 'CustomEvent<Item>'],
    ['a plain Event', 'Event'],
    ['any', 'any'],
    ['a union', 'CustomEvent<{id: string | number}>'],
  ])('nothing for %s', (_, expected) => {
    expect(typeMismatch(sent, expected)).toBeUndefined();
  });

  test('nothing when the event type is unreadable', () => {
    expect(
      typeMismatch('CustomEvent<Item>', 'CustomEvent<{id: string}>')
    ).toBeUndefined();
    expect(
      typeMismatch('MouseEvent', 'CustomEvent<{id: string}>')
    ).toBeUndefined();
  });
});

test('objectMembers reads optional keys and function types', () => {
  expect(
    objectMembers('{a?: number; run: () => void; b: Map<string, number>}')
  ).toEqual([
    {name: 'a', type: 'number', optional: true},
    {name: 'run', type: '() => void'},
    {name: 'b', type: 'Map<string, number>'},
  ]);
});
