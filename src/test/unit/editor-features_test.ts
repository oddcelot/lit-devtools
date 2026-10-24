import {describe, expect, test} from 'vite-plus/test';
import type {ComponentDocs} from '../../types/component-docs.js';
import {
  type DocsSource,
  completionsAt,
  hoverAt,
  literalValues,
} from '../../lib/editor/features.js';

const button: ComponentDocs = {
  tagName: 'x-button',
  className: 'XButton',
  summary: "The form's submit button.",
  description:
    'A button. See {@link https://example.com the guide} and {@link XBase}.',
  properties: [
    {
      name: 'size',
      type: "'small' | 'large'",
      default: "'small'",
      counterpart: 'size',
      reflects: true,
    },
    {
      name: 'disabled',
      type: 'boolean',
      counterpart: 'disabled',
      inheritedFrom: 'XBase',
    },
    {
      name: 'data',
      type: 'Record<string, unknown>',
      description: 'Never an attribute.',
    },
  ],
  attributes: [
    {
      name: 'size',
      type: "'small' | 'large'",
      default: "'small'",
      counterpart: 'size',
      description: 'How big.',
    },
    {
      name: 'disabled',
      type: 'boolean',
      counterpart: 'disabled',
      inheritedFrom: 'XBase',
    },
    {name: 'old', deprecated: 'Use size.'},
  ],
  events: [{name: 'submit-start', description: 'Before sending.'}],
  slots: [{name: '', description: 'The label.'}, {name: 'icon'}],
  cssParts: [{name: 'base'}],
  cssProperties: [],
  cssStates: [],
  origin: {manifest: '', module: 'src/x-button.ts', source: true},
};

const source: DocsSource = {
  get: async (_file, tag) => (tag === 'x-button' ? button : null),
  tags: async () => ['x-button', 'x-other'],
};

/** Runs a feature at `‸` in a Lit template. */
const lit = (inner: string) => {
  const text = `html\`${inner}\``;
  return {
    file: '/app/src/a.ts',
    code: text.replace('‸', ''),
    kind: 'script' as const,
    offset: text.indexOf('‸'),
  };
};

const labels = async (inner: string) =>
  (await completionsAt(source, lit(inner))).map((item) => item.label);

describe('completionsAt', () => {
  test('tags, replacing the typed name', async () => {
    const request = lit('<x-b‸');
    const items = await completionsAt(source, request);
    expect(items.map((i) => i.label)).toEqual(['x-button', 'x-other']);
    expect(items[0]).toMatchObject({
      kind: 7,
      detail: "The form's submit button.",
      start: request.offset - 3,
      end: request.offset,
      newText: 'x-button',
    });
  });

  test('attributes, without the ones already written', async () => {
    expect(await labels('<x-button size="small" ‸>')).toEqual([
      'disabled',
      'old',
    ]);
  });

  test('properties after a dot', async () => {
    expect(await labels('<x-button .‸>')).toEqual(['size', 'disabled', 'data']);
  });

  test('events after an at sign', async () => {
    expect(await labels('<x-button @‸>')).toEqual(['submit-start']);
  });

  test('boolean attributes after a question mark', async () => {
    expect(await labels('<x-button ?‸>')).toEqual(['disabled']);
  });

  test('the values of a union of string literals', async () => {
    expect(await labels('<x-button size="‸">')).toEqual(['small', 'large']);
  });

  test('marks deprecated entries', async () => {
    const items = await completionsAt(source, lit('<x-button ‸>'));
    expect(items.find((i) => i.label === 'old')?.deprecated).toBe(true);
  });

  test('nothing for an undocumented element or outside a tag', async () => {
    expect(await labels('<x-unknown ‸>')).toEqual([]);
    expect(await labels('<x-button>text‸</x-button>')).toEqual([]);
  });
});

describe('hoverAt', () => {
  test("a tag name shows the component's API", async () => {
    const hover = await hoverAt(source, lit('<x-but‸ton></x-button>'));
    expect(hover?.markdown).toBe(
      [
        "**`<x-button>`** — The form's submit button.",
        'A button. See [the guide](https://example.com) and `XBase`.',
        "**Attributes**\n- `size`: `'small' | 'large'` — How big.\n- `disabled`: `boolean`\n- `old`",
        '**Properties**\n- `.data`: `Record<string, unknown>` — Never an attribute.',
        '**Events**\n- `@submit-start` — Before sending.',
        '**Slots**\n- (default) — The label.\n- `icon`',
        '**CSS parts**\n- `base`',
        '_`src/x-button.ts`_',
      ].join('\n\n')
    );
  });

  test('an attribute shows its type, default and counterpart', async () => {
    const request = lit('<x-button si‸ze="large">');
    const hover = await hoverAt(source, request);
    expect(hover).toEqual({
      markdown:
        "**`size`** attribute of `<x-button>`\n\nHow big.\n\nType `'small' | 'large'` · Default `'small'` · Property `size`",
      start: request.offset - 2,
      end: request.offset + 2,
    });
  });

  test('a property binding and an inherited one', async () => {
    const hover = await hoverAt(source, lit('<x-button .dis‸abled=${x}>'));
    expect(hover?.markdown).toBe(
      '**`.disabled`** property of `<x-button>`\n\nType `boolean` · Attribute `disabled` · From `XBase`'
    );
  });

  test('a deprecated attribute says so', async () => {
    const hover = await hoverAt(source, lit('<x-button o‸ld>'));
    expect(hover?.markdown).toContain('**Deprecated**: Use size.');
  });

  test('nothing on an unknown name or in a value', async () => {
    expect(await hoverAt(source, lit('<x-button bog‸us>'))).toBeUndefined();
    expect(
      await hoverAt(source, lit('<x-button size="la‸rge">'))
    ).toBeUndefined();
  });
});

test('literalValues reads string literals only', () => {
  expect(literalValues(`'a' | "b" | number | undefined`)).toEqual(['a', 'b']);
  expect(literalValues(undefined)).toEqual([]);
});

describe('with native elements, globals and bubbling events', () => {
  const card: ComponentDocs = {
    ...button,
    tagName: 'x-card',
    className: 'XCard',
    attributes: [],
    properties: [],
    events: [{name: 'add-to-cart', description: 'Adds it.'}],
  };
  const div: ComponentDocs = {
    ...button,
    tagName: 'div',
    className: '',
    summary: undefined,
    description: 'A division.',
    attributes: [],
    properties: [],
    events: [],
    slots: [],
    cssParts: [],
    origin: {manifest: '', module: ''},
  };
  const all: Record<string, ComponentDocs> = {
    'x-button': button,
    'x-card': card,
    div,
  };
  const full: DocsSource = {
    get: async (_file, tag) => all[tag] ?? null,
    tags: async () => ['x-button', 'x-card', 'div'],
    globals: () => ({
      attributes: [{name: 'id'}, {name: 'hidden', type: 'boolean'}],
      events: [{name: 'click', description: 'A click.'}],
    }),
  };
  const labelsIn = async (inner: string) =>
    (await completionsAt(full, lit(inner))).map((item) => item.label);

  test('own attributes, then global ones', async () => {
    expect(await labelsIn('<x-button ‸>')).toEqual([
      'size',
      'disabled',
      'old',
      'id',
      'hidden',
    ]);
    expect(await labelsIn('<x-button ?‸>')).toEqual(['disabled', 'hidden']);
  });

  test('own events, then events other components fire, then DOM events', async () => {
    expect(await labelsIn('<x-button @‸>')).toEqual([
      'submit-start',
      'add-to-cart',
      'click',
    ]);
    expect(await labelsIn('<main @‸>')).toEqual([
      'submit-start',
      'add-to-cart',
      'click',
    ]);
  });

  test('keeps that order for the editor', async () => {
    const items = await completionsAt(full, lit('<x-button @‸>'));
    expect(items.map((item) => item.sortText)).toEqual([
      '00000',
      '00001',
      '00002',
    ]);
  });

  test('hovers an event by the components that fire it', async () => {
    const hover = await hoverAt(full, lit('<main @add-to-c‸art=${f}>'));
    expect(hover?.markdown).toBe(
      '**`@add-to-cart`** event fired by `<x-card>`\n\nAdds it.'
    );
  });

  test('hovers a global attribute and a DOM event', async () => {
    expect((await hoverAt(full, lit('<div i‸d="a">')))?.markdown).toBe(
      '**`id`** global attribute'
    );
    expect((await hoverAt(full, lit('<div @cli‸ck=${f}>')))?.markdown).toBe(
      '**`@click`** DOM event\n\nA click.'
    );
  });

  test('hovers a native element', async () => {
    expect((await hoverAt(full, lit('<d‸iv>')))?.markdown).toBe(
      '**`<div>`**\n\nA division.'
    );
  });
});
