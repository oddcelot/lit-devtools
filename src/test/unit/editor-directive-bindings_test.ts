import {expect, test} from 'vite-plus/test';
import {directiveBindingProblems} from '../../lib/editor/directive-bindings.js';

const problemsIn = (template: string) => {
  const code = [
    "import {classMap} from 'lit/directives/class-map.js';",
    "import {styleMap} from 'lit/directives/style-map.js';",
    "import {ifDefined} from 'lit/directives/if-defined.js';",
    "import {live as l} from 'lit/directives/live.js';",
    "import {ref} from 'lit/directives/ref.js';",
    "import {repeat} from 'lit/directives/repeat.js';",
    "import {myDirective} from './directives/mine.js';",
    `html\`${template}\`;`,
  ].join('\n');
  return directiveBindingProblems({
    file: '/app/src/a.ts',
    code,
    kind: 'script',
  }).map((p) => [code.slice(p.start, p.end), p.message]);
};

test('directives where Lit can apply them pass', () => {
  expect(
    problemsIn(
      '<div class=${classMap(c)} style=${styleMap(s)} title=${ifDefined(t)} ${ref(r)}><input .value=${l(v)} ?x=${myDirective()}>${repeat(i, k, f)}</div>'
    )
  ).toEqual([]);
});

test('directives where Lit cannot apply them', () => {
  expect(
    problemsIn(
      '<div id=${classMap(c)} .style=${styleMap(s)} .title=${ifDefined(t)} @click=${l(v)} data-r=${ref(r)} items=${repeat(i, f)}></div>'
    )
  ).toEqual([
    ['classMap(c)', '`classMap` only works as the value of `class`, not `id`.'],
    [
      'styleMap(s)',
      '`styleMap` only works as the value of `style`, not `.style`.',
    ],
    [
      'ifDefined(t)',
      '`ifDefined` is for attributes; `.title` takes `undefined` as it is.',
    ],
    [
      'l(v)',
      "`live` compares a value with the element's, which a listener doesn't have.",
    ],
    [
      'ref(r)',
      '`ref` goes on the element itself, `<div ${ref(…)}>`, not in `data-r`.',
    ],
    [
      'repeat(i, f)',
      '`repeat` renders children, so it goes between tags, not in `items`.',
    ],
  ]);
});
