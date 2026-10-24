/// <reference types="node" />
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterAll, beforeAll, describe, expect, test} from 'vite-plus/test';
import {createWorkspace} from '../../lib/editor/workspace.js';

let root: string;

/** A pnpm monorepo: two workspace packages, an app, and a published library. */
const files: Record<string, string> = {
  'package.json': '{"name": "mono", "private": true}',
  'pnpm-workspace.yaml':
    "packages:\n  - 'packages/*'\n  - apps/**\n  - '!apps/ignored'\n",
  'packages/base/package.json': JSON.stringify({
    name: '@mono/base',
    exports: {'.': {development: './src/index.ts', default: './dist/index.js'}},
  }),
  'packages/base/src/index.ts': `
    import {LitElement} from 'lit';
    import {property} from 'lit/decorators.js';
    export class Base extends LitElement {
      /** Turns it off. */
      @property({type: Boolean}) disabled = false;
    }
  `,
  'packages/ui/package.json': '{"name": "@mono/ui"}',
  'packages/ui/src/x-button.ts': `
    import {customElement, property} from 'lit/decorators.js';
    import {Base} from '@mono/base';
    /** A button. */
    @customElement('x-button')
    export class XButton extends Base {
      /** How big. */
      @property() size: 'small' | 'large' = 'small';
    }
  `,
  'apps/site/package.json': JSON.stringify({
    name: 'site',
    dependencies: {'fancy-lib': '1.0.0'},
  }),
  'apps/site/src/main.ts': "import '@mono/ui';\n",
  'apps/ignored/package.json': '{"name": "ignored"}',
  'apps/site/node_modules/fancy-lib/package.json': JSON.stringify({
    name: 'fancy-lib',
    customElements: 'custom-elements.json',
  }),
  'apps/site/node_modules/fancy-lib/custom-elements.json': JSON.stringify({
    schemaVersion: '2.1.0',
    modules: [
      {
        kind: 'javascript-module',
        path: 'fancy.js',
        declarations: [
          {
            kind: 'class',
            name: 'FancyCard',
            tagName: 'fancy-card',
            customElement: true,
            description: 'From a manifest.',
          },
        ],
      },
    ],
  }),
};

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'lit-workspace-')));
  for (const [file, code] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), {recursive: true});
    await writeFile(join(root, file), code);
  }
  // pnpm links workspace dependencies into the dependent's node_modules.
  await mkdir(join(root, 'packages/ui/node_modules/@mono'), {recursive: true});
  await symlink(
    join(root, 'packages/base'),
    join(root, 'packages/ui/node_modules/@mono/base'),
    'dir'
  );
});

afterAll(() => rm(root, {recursive: true, force: true}));

describe('createWorkspace', () => {
  test('reads every package and inherits across them', async () => {
    const workspace = await createWorkspace(
      join(root, 'apps/site/src/main.ts')
    );
    expect(workspace?.files).toBe(3);
    expect(workspace?.sourceTags()).toEqual(['x-button']);
    const button = await workspace?.get(
      join(root, 'apps/site/src/main.ts'),
      'x-button'
    );
    expect(button?.properties.map((p) => p.name)).toEqual(['size', 'disabled']);
  });

  test("falls back to the file's package's dependency manifests", async () => {
    const workspace = await createWorkspace(root);
    const fromSite = await workspace?.get(
      join(root, 'apps/site/src/main.ts'),
      'fancy-card'
    );
    expect(fromSite?.description).toBe('From a manifest.');
    // Another package doesn't depend on fancy-lib, so doesn't see it.
    const fromUi = await workspace?.get(
      join(root, 'packages/ui/src/x-button.ts'),
      'fancy-card'
    );
    expect(fromUi).toBeNull();
  });

  test('follows unsaved edits and deletes', async () => {
    const workspace = await createWorkspace(root);
    const file = join(root, 'packages/ui/src/x-chip.ts');
    await workspace?.update(
      file,
      `import {LitElement} from 'lit';
       import {customElement} from 'lit/decorators.js';
       /** Typed, not saved. */
       @customElement('x-chip')
       export class XChip extends LitElement {}`
    );
    expect((await workspace?.get(file, 'x-chip'))?.description).toBe(
      'Typed, not saved.'
    );
    workspace?.remove(file);
    expect(await workspace?.get(file, 'x-chip')).toBeNull();
  });

  test('ignores files outside the read folders', async () => {
    const workspace = await createWorkspace(root);
    const outside = join(root, 'packages/ui/stories/x-demo.ts');
    await workspace?.update(
      outside,
      "import {customElement} from 'lit/decorators.js';\n@customElement('x-demo') export class D extends HTMLElement {}"
    );
    expect(workspace?.sourceTags()).toEqual(['x-button']);
  });
});
