import {describe, expect, test} from 'vite-plus/test';
import {
  added,
  asStored,
  enabledUrls,
  entriesFor,
  moved,
  removed,
  toStored,
  toggled,
} from '../../../extension/src/manifest-list.js';

const A = 'https://site.test/a.json';
const B = 'https://site.test/b.json';
const L = 'https://site.test/linked.json';

describe('entriesFor', () => {
  test('puts links the list never held first, switched on and marked', () => {
    expect(entriesFor([{url: A, enabled: true}], [L])).toEqual([
      {url: L, enabled: true, linked: true},
      {url: A, enabled: true, linked: false},
    ]);
  });

  test('keeps where the user moved and switched a link', () => {
    const stored = [
      {url: A, enabled: true},
      {url: L, enabled: false, linked: true as const},
    ];
    expect(entriesFor(stored, [L])).toEqual([
      {url: A, enabled: true, linked: false},
      {url: L, enabled: false, linked: true},
    ]);
  });

  test('drops a stored link the page no longer has', () => {
    expect(entriesFor([{url: L, enabled: true, linked: true}], [])).toEqual([]);
  });
});

test('toStored marks links and keeps ones another page of the site has', () => {
  const other = {
    url: 'https://site.test/other.json',
    enabled: true,
    linked: true as const,
  };
  const entries = entriesFor([other, {url: A, enabled: true}], [L]);
  expect(toStored(entries, [other])).toEqual([
    {url: L, enabled: true, linked: true},
    {url: A, enabled: true},
    other,
  ]);
});

describe('changes', () => {
  const list = entriesFor(
    [
      {url: A, enabled: true},
      {url: B, enabled: true},
    ],
    [L]
  );

  test('add appends switched on, once', () => {
    expect(added(list, 'https://site.test/c.json').at(-1)).toEqual({
      url: 'https://site.test/c.json',
      enabled: true,
      linked: false,
    });
    expect(added(list, A)).toEqual(list);
  });

  test('remove takes off what the user added, never a link', () => {
    expect(removed(list, A).map((e) => e.url)).toEqual([L, B]);
    expect(removed(list, L)).toEqual(list);
  });

  test('toggle switches one; only switched-on ones are read, in order', () => {
    expect(enabledUrls(toggled(list, L, false))).toEqual([A, B]);
  });

  test('move swaps with a neighbour and stops at the ends', () => {
    expect(moved(list, B, -1).map((e) => e.url)).toEqual([L, B, A]);
    expect(moved(list, L, -1)).toEqual(list);
    expect(moved(list, B, 1)).toEqual(list);
  });
});

test('asStored reads what earlier builds stored', () => {
  expect(asStored(A)).toEqual([{url: A, enabled: true}]);
  expect(asStored([A, {url: B, enabled: false}, 3, null])).toEqual([
    {url: A, enabled: true},
    {url: B, enabled: false},
  ]);
  expect(asStored(undefined)).toEqual([]);
});
