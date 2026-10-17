import {describe, expect, test} from 'vite-plus/test';
import {encodeProperties, splitProps} from '../../lib/astro/props.js';
import {assignSlot} from '../../lib/astro/slots.js';

/**
 * The Astro renderer's pure halves: how props split into attributes and
 * properties, what JSON carries to the browser, and how named-slot HTML
 * gets its `slot` attribute back.
 */

const ctor = {
  elementProperties: new Map<string, {attribute?: boolean | string}>([
    ['start', {}],
    ['fooBar', {attribute: 'foo-bar'}],
    ['camelCase', {}],
    ['tags', {attribute: false}],
  ]),
  prototype: {field: 1},
};

describe('splitProps', () => {
  test('serializes primitives as attributes, as Lit reads them back', () => {
    expect(
      splitProps(ctor, {
        start: 3,
        open: true,
        hidden: false,
        id: 'a',
        gone: null,
      })
    ).toEqual({
      attributes: {start: '3', open: '', id: 'a'},
      properties: {},
    });
  });

  test("names a property's attribute when given the property name", () => {
    expect(splitProps(ctor, {fooBar: 'x', camelCase: 'y'}).attributes).toEqual({
      'foo-bar': 'x',
      camelcase: 'y',
    });
    expect(splitProps(ctor, {'foo-bar': 'x'}).attributes).toEqual({
      'foo-bar': 'x',
    });
  });

  test('sets objects, attribute-less properties and class fields as properties', () => {
    expect(
      splitProps(ctor, {tags: ['a'], data: {b: 1}, field: 2, start: [1]})
    ).toEqual({
      attributes: {},
      properties: {tags: ['a'], data: {b: 1}, field: 2, start: [1]},
    });
  });
});

describe('encodeProperties', () => {
  test('keeps plain data and names what JSON cannot carry', () => {
    const {json, dropped} = encodeProperties({
      tags: ['a', {b: [1, null]}],
      onClick: () => {},
      when: new Date(0),
    });
    expect(JSON.parse(json)).toEqual({tags: ['a', {b: [1, null]}]});
    expect(dropped).toEqual(['onClick', 'when']);
  });
});

describe('assignSlot', () => {
  test('puts the slot on top-level elements and wraps top-level text', () => {
    expect(assignSlot('<h2>A</h2> hi <p class="x">B</p>', 'title')).toBe(
      '<h2 slot="title">A</h2><span slot="title"> hi </span><p slot="title" class="x">B</p>'
    );
  });

  test('leaves nested elements, own slots, whitespace and comments alone', () => {
    expect(
      assignSlot(
        '\n<div slot="other"><b>x</b></div>\n<!-- c --><ul><li>y</li></ul>',
        's'
      )
    ).toBe(
      '\n<div slot="other"><b>x</b></div>\n<!-- c --><ul slot="s"><li>y</li></ul>'
    );
  });

  test('copes with void and self-closing tags, quoted > and raw text', () => {
    expect(
      assignSlot(
        '<img src="a>b"><br/><script>if (a<b) x("<p>")</script><i>z</i>',
        's'
      )
    ).toBe(
      '<img slot="s" src="a>b"><br slot="s"/><script slot="s">if (a<b) x("<p>")</script><i slot="s">z</i>'
    );
  });
});
