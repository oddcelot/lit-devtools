/// <reference types="node" />
import {mkdir, mkdtemp, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {createWorkspace} from '../../lib/editor/workspace.js';

const manifestOf = (tagName: string, attribute: string) => ({
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: `${tagName}.js`,
      declarations: [
        {
          kind: 'class',
          name: 'X',
          customElement: true,
          tagName,
          attributes: [{name: attribute}],
        },
      ],
    },
  ],
});

const remote = `data:application/json,${encodeURIComponent(
  JSON.stringify(manifestOf('lit-remote', 'far'))
)}`;

let root: string;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'lit-manifests-')));
  const files: Record<string, string> = {
    'package.json': '{"name": "app"}',
    'lit-devtools.config.json': JSON.stringify({
      languageServer: {
        manifests: [
          'vendor/virtualizer.json',
          remote,
          'http://127.0.0.1:9/no.json',
        ],
      },
    }),
    'vendor/virtualizer.json': JSON.stringify(
      manifestOf('lit-virtualizer', 'scroller')
    ),
    'src/app.ts': 'export {};\n',
  };
  for (const [file, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), {recursive: true});
    await writeFile(join(root, file), text);
  }
});

afterAll(() => rm(root, {recursive: true, force: true}));

test('reads the manifests the settings list, local and remote', async () => {
  const workspace = (await createWorkspace(root))!;
  try {
    const file = join(root, 'src/app.ts');
    const local = await workspace.get(file, 'lit-virtualizer');
    expect(local?.attributes.map((a) => a.name)).toEqual(['scroller']);
    expect(local?.origin.manifest).toBe('vendor/virtualizer.json');
    const fetched = await workspace.get(file, 'lit-remote');
    expect(fetched?.attributes.map((a) => a.name)).toEqual(['far']);
    expect(await workspace.tags(file)).toEqual(
      expect.arrayContaining(['lit-virtualizer', 'lit-remote'])
    );
    expect(workspace.problems()).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(
          "The manifest http://127.0.0.1:9/no.json couldn't be read"
        ),
      }),
    ]);
  } finally {
    await workspace.close();
  }
});
