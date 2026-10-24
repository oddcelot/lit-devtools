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
import {findWorkspace} from '../../lib/editor/workspace-packages.js';

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

describe('findWorkspace', () => {
  test('finds the root from a nested file and lists the packages', async () => {
    const layout = await findWorkspace(
      join(root, 'packages/ui/src/x-button.ts')
    );
    expect(layout?.root).toBe(root);
    expect(layout?.packages).toEqual([
      {dir: root, name: 'mono'},
      {dir: `${root}/apps/site`, name: 'site'},
      {dir: `${root}/packages/base`, name: '@mono/base'},
      {dir: `${root}/packages/ui`, name: '@mono/ui'},
    ]);
  });

  test('reads package.json workspaces', async () => {
    const npm = await realpath(await mkdtemp(join(tmpdir(), 'lit-npm-ws-')));
    await writeFile(
      join(npm, 'package.json'),
      '{"name": "npm-mono", "workspaces": {"packages": ["libs/*"]}}'
    );
    await mkdir(join(npm, 'libs/a'), {recursive: true});
    await writeFile(join(npm, 'libs/a/package.json'), '{"name": "a"}');
    const layout = await findWorkspace(join(npm, 'libs/a'));
    expect(layout?.packages.map((pkg) => pkg.name)).toEqual(['npm-mono', 'a']);
    await rm(npm, {recursive: true, force: true});
  });

  test('takes the nearest package alone outside a workspace', async () => {
    const solo = await realpath(await mkdtemp(join(tmpdir(), 'lit-solo-')));
    await writeFile(join(solo, 'package.json'), '{"name": "solo"}');
    expect(await findWorkspace(join(solo, 'src/a.ts'))).toEqual({
      root: solo,
      packages: [{dir: solo, name: 'solo'}],
    });
    await rm(solo, {recursive: true, force: true});
  });
});
