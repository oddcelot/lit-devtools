import {describe, expect, test} from 'vite-plus/test';
import {
  findTemplate,
  lineColumnOf,
  tagOffset,
} from '../../lib/devframe/template-text.js';

describe('findTemplate', () => {
  test('finds a literal by its strings, across bindings', () => {
    const text = 'x = html`<a>${one}</a><b>${two}</b>`;';
    expect(findTemplate(text, ['<a>', '</a><b>', '</b>'])).toEqual([9, 18, 31]);
  });

  test('steps over nested templates, objects and strings in a binding', () => {
    const text =
      "html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul><x ${{a: '}'}}></x>`";
    const strings = ['<ul>', '</ul><x ', '></x>'];
    const offsets = findTemplate(text, strings)!;
    expect(
      strings.map((s, i) => text.slice(offsets[i], offsets[i]! + s.length))
    ).toEqual(strings);
  });

  test('skips a literal that only starts the same', () => {
    const text = 'html`<p>${a}</p>`; html`<p>${a}</p><x-b></x-b>`';
    expect(findTemplate(text, ['<p>', '</p><x-b></x-b>'])).toEqual([24, 31]);
  });

  test('needs the closing backtick right after the last string', () => {
    expect(findTemplate('html`<p></p>!`', ['<p></p>'])).toBeUndefined();
  });

  test('handles a template that starts with a binding', () => {
    expect(
      findTemplate('`a` + html`${x}<y-z></y-z>`', ['', '<y-z></y-z>'])
    ).toEqual([11, 15]);
  });
});

describe('tagOffset', () => {
  test('counts the tag across strings, not a longer tag sharing its prefix', () => {
    const strings = ['<x-a></x-a><x-ab>', '</x-ab><x-a ', '></x-a>'];
    const offsets = [100, 200, 300];
    expect(tagOffset(offsets, strings, 'x-a', 0)).toBe(100);
    expect(tagOffset(offsets, strings, 'x-a', 1)).toBe(207);
    expect(tagOffset(offsets, strings, 'x-a', 2)).toBeUndefined();
  });
});

test('lineColumnOf counts 1-based lines and columns', () => {
  expect(lineColumnOf('ab\ncd\nef', 0)).toEqual({line: 1, column: 1});
  expect(lineColumnOf('ab\ncd\nef', 4)).toEqual({line: 2, column: 2});
});
