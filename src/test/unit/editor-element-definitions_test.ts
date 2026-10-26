import {expect, test} from 'vite-plus/test';
import {elementDefinitionProblems} from '../../lib/editor/element-definitions.js';

const problemsIn = (code: string, file = '/app/src/x.ts') =>
  elementDefinitionProblems({file, code}).map((p) => ({
    text: code.slice(p.start, p.end),
    message: p.message,
    fix: p.fix?.newText,
  }));

test('a decorated component without an entry, with a fix that adds it', () => {
  const code = `
    import {LitElement} from 'lit';
    @customElement('x-button')
    export class XButton extends LitElement {}
  `;
  expect(problemsIn(code)).toEqual([
    {
      text: "'x-button'",
      message:
        "`x-button` isn't in `HTMLElementTagNameMap`, so TypeScript and `lit-devtools check` don't know its type.",
      fix: "\ndeclare global {\n  interface HTMLElementTagNameMap {\n    'x-button': XButton;\n  }\n}\n",
    },
  ]);
  const fixed = code + problemsIn(code)[0].fix;
  expect(problemsIn(fixed)).toEqual([]);
});

test('customElements.define, with and without window, and an entry for one of them', () => {
  const code = `
    class XA extends HTMLElement {}
    customElements.define('x-a', XA);
    window.customElements.define('x-b', class extends HTMLElement {});
    declare global {
      interface HTMLElementTagNameMap { 'x-a': XA }
    }
  `;
  expect(problemsIn(code)).toEqual([
    {
      text: "'x-b'",
      message: expect.stringContaining('`x-b`'),
      fix: undefined,
    },
  ]);
});

test('JavaScript and declaration files are left alone', () => {
  const code = "customElements.define('x-a', XA);";
  expect(problemsIn(code, '/app/src/x.js')).toEqual([]);
  expect(problemsIn(code, '/app/src/x.d.ts')).toEqual([]);
});

test('tag names customElements.define refuses, in JavaScript too', () => {
  const code = `
    customElements.define('xbutton', A);
    customElements.define('X-button', B);
    customElements.define('font-face', C);
    customElements.define('x-ok', D);
  `;
  expect(
    elementDefinitionProblems({file: '/app/src/x.js', code}).map((p) => [
      p.rule,
      p.message,
    ])
  ).toEqual([
    [
      'invalid-name',
      '`xbutton` needs a hyphen, so `customElements.define` throws.',
    ],
    [
      'invalid-name',
      '`X-button` must start with a lowercase letter, so `customElements.define` throws.',
    ],
    [
      'invalid-name',
      '`font-face` is reserved by SVG and MathML, so `customElements.define` throws.',
    ],
  ]);
});
