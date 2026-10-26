/// <reference types="node" />
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {docsSourceFor} from '../../../packages/lit-language-server/src/documents.js';
import {missingImportProblems} from '../../lib/editor/missing-imports.js';
import {createWorkspace} from '../../lib/editor/workspace.js';

const component = (tag: string, name: string) => `
  import {LitElement} from 'lit';
  import {customElement} from 'lit/decorators.js';
  @customElement('${tag}')
  export class ${name} extends LitElement {}
`;

const manifest = (tag: string) =>
  JSON.stringify({
    schemaVersion: '1.0.0',
    modules: [
      {
        kind: 'javascript-module',
        path: 'thing.js',
        declarations: [
          {kind: 'class', name: 'T', customElement: true, tagName: tag},
        ],
      },
    ],
  });

const APP = [
  "import {html} from 'lit';",
  "import './lib/re-export.js';",
  "import 'fake-lib/thing.js';",
  '',
  'export const view = () => html`',
  '  <x-a></x-a><x-b></x-b><x-c></x-c>',
  '  <fake-thing></fake-thing><other-thing></other-thing>`;',
  '',
].join('\n');

let root: string;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'lit-imports-')));
  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      name: 'app',
      dependencies: {'fake-lib': '*', 'other-lib': '*'},
    }),
    'lit-devtools.config.json': JSON.stringify({
      languageServer: {entries: ['src/main.ts']},
    }),
    'src/x-a.ts': component('x-a', 'XA'),
    'src/x-b.ts': component('x-b', 'XB'),
    'src/x-c.ts': component('x-c', 'XC'),
    'src/lib/re-export.ts': "import '../x-b.js';\n",
    'src/main.ts': "import './x-c.js';\n",
    'src/app.ts': APP,
    'node_modules/fake-lib/package.json':
      '{"name": "fake-lib", "customElements": "custom-elements.json"}',
    'node_modules/fake-lib/custom-elements.json': manifest('fake-thing'),
    'node_modules/other-lib/package.json':
      '{"name": "other-lib", "customElements": "custom-elements.json"}',
    'node_modules/other-lib/custom-elements.json': manifest('other-thing'),
  };
  for (const [file, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), {recursive: true});
    await writeFile(join(root, file), text);
  }
});

afterAll(() => rm(root, {recursive: true, force: true}));

test('components the file uses but its imports and the entries never reach', async () => {
  const workspace = (await createWorkspace(root, {viteResolution: false}))!;
  try {
    const file = join(root, 'src/app.ts');
    const problems = await missingImportProblems(
      docsSourceFor(workspace, 'script'),
      {file, code: APP, kind: 'script'}
    );
    expect(
      problems.map((p) => [
        APP.slice(p.start, p.end),
        p.message,
        p.fix?.newText,
      ])
    ).toEqual([
      [
        'x-a',
        "`<x-a>` is defined in `x-a.ts`, which this file doesn't import.",
        "import './x-a.js';\n",
      ],
      [
        'other-thing',
        "`<other-thing>` is defined in `other-lib`, which this file doesn't import.",
        undefined,
      ],
    ]);
    // After the last import.
    expect(problems[0].fix?.start).toBe(APP.indexOf('\n\nexport') + 1);
  } finally {
    await workspace.close();
  }
});

test('reads a module again once it changes on disk', async () => {
  const workspace = (await createWorkspace(root, {viteResolution: false}))!;
  const reexport = join(root, 'src/lib/re-export.ts');
  try {
    const file = join(root, 'src/app.ts');
    const missing = async () =>
      (
        await missingImportProblems(docsSourceFor(workspace, 'script'), {
          file,
          code: APP,
          kind: 'script',
        })
      ).map((p) => APP.slice(p.start, p.end));
    expect(await missing()).toEqual(['x-a', 'other-thing']);
    await writeFile(reexport, '// no imports now\n');
    const later = new Date(Date.now() + 5000);
    await utimes(reexport, later, later);
    expect(await missing()).toEqual(['x-a', 'x-b', 'other-thing']);
  } finally {
    await writeFile(reexport, "import '../x-b.js';\n");
    await workspace.close();
  }
});
