import {expect, test} from 'vite-plus/test';
import type {ComponentDocs} from '../../types/component-docs.js';
import {bindingLiteralProblems} from '../../lib/editor/binding-literals.js';
import type {DocsSource} from '../../lib/editor/features.js';

const button: ComponentDocs = {
  tagName: 'x-button',
  className: 'XButton',
  properties: [
    {name: 'size', type: "'small' | 'large'"},
    {name: 'count', type: 'number'},
    {name: 'label', type: 'string | undefined'},
    {name: 'data', type: 'Record<string, unknown>'},
  ],
  attributes: [],
  events: [],
  slots: [],
  cssParts: [],
  cssProperties: [],
  cssStates: [],
  origin: {manifest: '', module: 'src/x-button.ts', source: true},
};

const source: DocsSource = {
  get: async (_file, tag) => (tag === 'x-button' ? button : null),
  tags: async () => ['x-button'],
};

const problemsIn = async (template: string) => {
  const code = `html\`${template}\`;`;
  const problems = await bindingLiteralProblems(source, {
    file: '/app/src/app.ts',
    code,
    kind: 'script',
  });
  return problems.map((p) => [code.slice(p.start, p.end), p.message]);
};

test('a property literal outside its type', async () => {
  expect(
    await problemsIn(
      `<x-button .size=\${'huge'} .count=\${'3'} .label=\${undefined}></x-button>`
    )
  ).toEqual([
    [
      "'huge'",
      "`.size` takes `'small' | 'large'`, but `'huge'` isn't one of `'small'`, `'large'`.",
    ],
    ["'3'", "`.count` takes `number`, but it's a string."],
  ]);
});

test('nothing for literals that fit, or types it cannot read', async () => {
  expect(
    await problemsIn(
      `<x-button .size=\${'small'} .count=\${-1} .data=\${'x'} .other=\${1} .size=\${big}></x-button>`
    )
  ).toEqual([]);
});

test('boolean, attribute and event bindings', async () => {
  expect(
    await problemsIn(
      `<div ?hidden=\${'no'} title=\${true} lang=\${null} data-x=\${{a: 1}} @click=\${1} @keyup=\${() => go()} ?inert=\${false} id=\${'a'}></div>`
    )
  ).toEqual([
    ["'no'", '`?hidden` takes a boolean, not a string.'],
    [
      'true',
      '`title` is set to the text `true` or `false`; write `?title` to add or remove it.',
    ],
    [
      'null',
      '`null` sets `lang` to an empty value; bind `nothing` to leave it out.',
    ],
    [
      '{a: 1}',
      '`data-x` is set to an object as text; write `.data-x` to set the property.',
    ],
    ['1', '`@click` takes a function, not a number.'],
  ]);
});

test('a value that mixes text and a hole is a string, so it is left alone', async () => {
  expect(await problemsIn(`<div title="a \${true}"></div>`)).toEqual([]);
});
