import {describe, expect, test} from 'vite-plus/test';
import {
  decodeProperties,
  encodeProperties,
  splitProps,
} from '../../lib/astro/props.js';
import {
  missingPeers,
  missingPeersMessage,
  pluginPath,
} from '../../lib/astro/peers.js';
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
  test('writes plain data as plain JSON', () => {
    const {json, dropped} = encodeProperties({
      tags: ['a', {b: [1, null]}],
      count: 2,
    });
    expect(json).toBe('{"tags":["a",{"b":[1,null]}],"count":2}');
    expect(dropped).toEqual([]);
  });

  test('tags what JSON alone loses, as Astro tags island props', () => {
    const {json} = encodeProperties({tags: ['a'], when: new Date(0)});
    expect(JSON.parse(json)).toEqual([
      0,
      {
        tags: [1, [[0, 'a']]],
        when: [3, '1970-01-01T00:00:00.000Z'],
      },
    ]);
  });

  test('leaves out and names functions, symbols, class instances and cycles', () => {
    const cycle: Record<string, unknown> = {};
    cycle['self'] = cycle;
    const {json, dropped} = encodeProperties({
      keep: 1,
      onClick: () => {},
      key: Symbol('k'),
      point: new (class Point {})(),
      nested: [{deep: () => {}}],
      cycle,
    });
    expect(JSON.parse(json)).toEqual({keep: 1});
    expect(dropped).toEqual(['onClick', 'key', 'point', 'nested', 'cycle']);
  });
});

describe('decodeProperties', () => {
  const roundTrip = (properties: Record<string, unknown>) =>
    decodeProperties(encodeProperties(properties).json);

  test('brings back every type an island carries', () => {
    const properties = {
      when: new Date(0),
      map: new Map<unknown, unknown>([
        ['a', new Date(0)],
        [1, {b: new Set([1n])}],
      ]),
      url: new URL('https://lit.dev/'),
      big: 10n,
      bytes: new Uint8Array([1, 2]),
      words: new Uint16Array([3]),
      longs: new Uint32Array([4]),
      far: [Infinity, -Infinity],
      missing: undefined,
      plain: {list: [null, 'x', true]},
    };
    expect(roundTrip(properties)).toEqual(properties);
  });

  test('keeps the source of a RegExp, not its flags, as Astro does', () => {
    expect(roundTrip({pattern: /a+b/gi})).toEqual({pattern: /a+b/});
  });

  test("reads plain JSON as it is, and an island's empty marker as nothing", () => {
    expect(decodeProperties('{"tags":["a"]}')).toEqual({tags: ['a']});
    expect(decodeProperties('')).toEqual({});
  });

  test('makes own keys of what would be prototype keys', () => {
    const decoded = decodeProperties(
      '[0,{"data":[0,{"__proto__":[0,{"polluted":[0,true]}]}]}]'
    );
    expect(({} as {polluted?: boolean}).polluted).toBeUndefined();
    expect(Object.keys(decoded['data'] as object)).toEqual(['__proto__']);
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

describe('missingPeers', () => {
  const installed =
    (...paths: string[]) =>
    (path: string) =>
      paths.includes(path);

  test('finds a peer in the root or a directory above it', () => {
    const exists = installed(
      '/repo/site/node_modules/@lit-labs/ssr/package.json',
      '/repo/node_modules/@lit-labs/ssr-client/package.json'
    );
    expect(missingPeers('/repo/site', exists)).toEqual([]);
  });

  test('names each peer it cannot find', () => {
    const exists = installed('/node_modules/@lit-labs/ssr/package.json');
    expect(missingPeers('/repo/site', exists)).toEqual([
      '@lit-labs/ssr-client',
    ]);
    expect(missingPeersMessage(['@lit-labs/ssr-client'])).toContain(
      'npm install @lit-labs/ssr-client'
    );
  });
});

describe('pluginPath', () => {
  const installed =
    (...names: string[]) =>
    (path: string) =>
      names.some((name) => path === `/repo/node_modules/${name}/package.json`);

  test('names the plugin when the project installs it', () => {
    expect(pluginPath('/repo', installed('@oddsquad/vite-plugin-lit'))).toBe(
      '@oddsquad/vite-plugin-lit'
    );
    expect(
      pluginPath(
        '/repo',
        installed('@oddsquad/vite-plugin-lit', '@oddsquad/lit-devtools')
      )
    ).toBe('@oddsquad/vite-plugin-lit');
  });

  test('goes through @oddsquad/lit-devtools when only it is installed', () => {
    expect(pluginPath('/repo', installed('@oddsquad/lit-devtools'))).toBe(
      '@oddsquad/lit-devtools > @oddsquad/vite-plugin-lit'
    );
  });
});
