import {expect, test} from 'vite-plus/test';
import {templateSyntaxProblems} from '../../lib/editor/template-syntax.js';

const problemsIn = (template: string) => {
  const code = `html\`${template}\`;`;
  return templateSyntaxProblems({
    file: '/app/src/a.ts',
    code,
    kind: 'script',
  }).map((p) => [p.rule, code.slice(p.start, p.end), p.message]);
};

test('a component never closed, or closed with />', () => {
  expect(
    problemsIn('<x-a><x-b></x-b><x-c/><p>text<li>item</x-a><x-d>')
  ).toEqual([
    ['unclosed-tag', 'x-d', '`<x-d>` is never closed: add `</x-d>`.'],
    [
      'unclosed-tag',
      'x-c',
      'HTML reads `<x-c />` as an open tag, so what follows becomes its children: close it with `</x-c>`.',
    ],
  ]);
});

test('a closing tag inside an expression closes nothing here', () => {
  expect(problemsIn('<x-a>${html`<x-b></x-b>`}</x-a><x-c>${"</x-c>"}')).toEqual(
    [['unclosed-tag', 'x-c', '`<x-c>` is never closed: add `</x-c>`.']]
  );
});

test('bindings without an expression, stray characters, and Polymer syntax', () => {
  expect(
    problemsIn(
      '<input .value="x" ?disabled @click="go" .ok=${v} title=${t}" href="${base}/" src=${a}/ name$="n">'
    )
  ).toEqual([
    [
      'binding-syntax',
      '.value',
      '`.value` sets a property, so its value is an expression: `.value=${…}`.',
    ],
    [
      'binding-syntax',
      '?disabled',
      '`?disabled` sets a boolean attribute, so its value is an expression: `?disabled=${…}`.',
    ],
    [
      'binding-syntax',
      '@click',
      '`@click` sets a listener, so its value is an expression: `@click=${…}`.',
    ],
    [
      'binding-syntax',
      '${t}"',
      'A stray `"` sits next to the expression, which makes `title` a string.',
    ],
    [
      'binding-syntax',
      '${a}/',
      'A stray `/` sits next to the expression, which makes `src` a string.',
    ],
    [
      'binding-syntax',
      'name$',
      "`name$=` is Polymer's syntax; Lit sets the attribute with `name=${…}`.",
    ],
  ]);
});
