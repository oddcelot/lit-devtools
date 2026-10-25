/// <reference types="node" />
import {mkdir, mkdtemp, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {
  type Checker,
  createChecker,
} from '../../../packages/lit-language-server/src/check.js';

const app = [
  "import {LitElement, html, css} from 'lit';",
  'export class App extends LitElement {',
  '  static styles = css`:host { colo: red; }`;',
  '  render() {',
  '    return html`<x-button @pick=${(e: CustomEvent<{thing: string}>) => e}></x-button>`;',
  '  }',
  '}',
  '',
].join('\n');

const files: Record<string, string> = {
  'package.json': '{"name": "app"}',
  'src/x-button.ts': `
    import {LitElement} from 'lit';
    import {customElement} from 'lit/decorators.js';
    @customElement('x-button')
    export class XButton extends LitElement {
      pick() {
        this.dispatchEvent(new CustomEvent('pick', {detail: {at: 1}}));
      }
    }
  `,
  'src/app.ts': app,
};

let root: string;
let checker: Checker;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'lsp-check-')));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), {recursive: true});
    await writeFile(join(root, path), content);
  }
  checker = createChecker();
});

afterAll(async () => {
  await checker.close();
  await rm(root, {recursive: true, force: true});
});

test('reports a file’s problems by rule, at offsets into the given text', async () => {
  const problems = await checker.check(join(root, 'src/app.ts'), app);
  const handler = app.indexOf('(e: CustomEvent');
  const colo = app.indexOf('colo');
  expect(problems).toEqual([
    {
      rule: 'event-type',
      start: handler,
      end: handler + '(e: CustomEvent<{thing: string}>) => e'.length,
      message: expect.stringContaining('`detail.thing` is missing'),
    },
    {
      rule: 'css',
      start: colo,
      end: colo + 'colo'.length,
      message: "Unknown property: 'colo'",
    },
  ]);
});

test('reports nothing outside a workspace', async () => {
  expect(await checker.check('/nowhere/app.ts', app)).toEqual([]);
});
