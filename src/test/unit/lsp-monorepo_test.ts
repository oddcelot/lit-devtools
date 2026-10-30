/// <reference types="node" />
// The language server in a pnpm monorepo, over LSP: each package answers
// with its own settings, and a component of one package is known in another.
import {mkdtemp, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, test} from 'vite-plus/test';
import {at, createClient, linkRepoDeps, writeFiles} from '../lsp-client.js';

const config = (languageServer: object) =>
  JSON.stringify({languageServer}, null, 2);

const files: Record<string, string> = {
  'package.json': '{"name": "mono", "private": true}',
  'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
  // The design system: unknown elements are errors here.
  'packages/ui/package.json': '{"name": "@mono/ui"}',
  'packages/ui/lit-devtools.config.json': config({
    diagnostics: {'unknown-element': 'error'},
  }),
  'packages/ui/src/ui-button.ts': `
    import {LitElement} from 'lit';
    import {customElement, property} from 'lit/decorators.js';
    /** A button from the design system. */
    @customElement('ui-button')
    export class UiButton extends LitElement {
      /** How it looks. */
      @property() variant: 'plain' | 'loud' = 'plain';
    }
  `,
  // The app: reads lib/, not src/, has its own template tag, and leaves
  // unknown elements alone.
  'packages/app/package.json': JSON.stringify({
    name: '@mono/app',
    dependencies: {'@mono/ui': 'workspace:*'},
  }),
  'packages/app/lit-devtools.config.json': config({
    scan: ['lib'],
    templateTags: ['html', 'tpl'],
    diagnostics: {'unknown-element': 'off'},
  }),
  'packages/app/lib/app-shell.ts': `
    import {LitElement} from 'lit';
    import {customElement} from 'lit/decorators.js';
    /** The app's frame. */
    @customElement('app-shell')
    export class AppShell extends LitElement {}
  `,
  // Outside the app's read folders, so never indexed.
  'packages/app/src/app-hidden.ts': `
    import {LitElement} from 'lit';
    import {customElement} from 'lit/decorators.js';
    @customElement('app-hidden')
    export class AppHidden extends LitElement {}
  `,
};

let root: string;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'lit-lsp-mono-')));
  await writeFiles(root, files);
  await linkRepoDeps(root, ['lit']);
});

afterAll(() => rm(root, {recursive: true, force: true}));

describe('the language server in a pnpm monorepo', () => {
  const client = createClient();
  const uriOf = (file: string) => pathToFileURL(join(root, file)).href;
  const open = (file: string, text: string) =>
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri: uriOf(file),
        languageId: 'typescript',
        version: 1,
        text,
      },
    });
  const labels = async (file: string, source: string) => {
    const {text, position} = at(source);
    open(file, text);
    const items = await client.request<{label: string}[] | null>(
      'textDocument/completion',
      {textDocument: {uri: uriOf(file)}, position}
    );
    return (items ?? []).map((item) => item.label);
  };

  test('initializes at the workspace root', async () => {
    await client.request('initialize', {
      processId: null,
      rootUri: pathToFileURL(root).href,
      capabilities: {},
    });
    client.notify('initialized', {});
  });

  test('completes a sibling package’s component and its own, but not unread ones', async () => {
    const tags = await labels(
      'packages/app/lib/view.ts',
      "import {html} from 'lit';\nhtml`<‸`;\n"
    );
    expect(tags).toEqual(expect.arrayContaining(['ui-button', 'app-shell']));
    expect(tags).not.toContain('app-hidden');
  });

  test('completes attributes in a template tag only the app declares', async () => {
    const source = 'const tpl = String.raw;\ntpl`<ui-button ‸>`;\n';
    expect(await labels('packages/app/lib/tagged.ts', source)).toContain(
      'variant'
    );
    expect(await labels('packages/ui/src/tagged.ts', source)).not.toContain(
      'variant'
    );
  });

  test('hovers a sibling package’s component, named by its workspace path', async () => {
    const {text, position} = at(
      "import {html} from 'lit';\nhtml`<ui-but‸ton></ui-button>`;\n"
    );
    open('packages/app/lib/hover.ts', text);
    const hover = await client.request('textDocument/hover', {
      textDocument: {uri: uriOf('packages/app/lib/hover.ts')},
      position,
    });
    expect(hover.contents.value).toContain('**`<ui-button>`**');
    expect(hover.contents.value).toContain('A button from the design system.');
    expect(hover.contents.value).toContain('_`packages/ui/src/ui-button.ts`_');
  });

  test('reports each package’s problems at its own severities', async () => {
    const text =
      "import {html} from 'lit';\nhtml`<ui-nope></ui-nope><ui-button bogus></ui-button>`;\n";
    const problems = async (file: string) => {
      open(file, text);
      const published = await client.waitFor(
        (n) =>
          n.method === 'textDocument/publishDiagnostics' &&
          n.params.uri === uriOf(file) &&
          n.params.diagnostics.length > 0
      );
      return published.params.diagnostics.map(
        (d: {code: string; severity: number}) => [d.code, d.severity]
      );
    };
    // An error in the design system; off in the app. The unknown attribute
    // keeps its default, a warning, in both.
    expect(await problems('packages/ui/src/problems.ts')).toEqual([
      ['unknown-element', 1],
      ['unknown-attribute', 2],
    ]);
    expect(await problems('packages/app/lib/problems.ts')).toEqual([
      ['unknown-attribute', 2],
    ]);
  });
});
