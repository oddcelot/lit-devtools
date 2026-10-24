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
    // The tags each file can use follow the same rule.
    expect(await workspace?.tags(join(root, 'apps/site/src/main.ts'))).toEqual([
      'x-button',
      'fancy-card',
    ]);
    expect(
      await workspace?.tags(join(root, 'packages/ui/src/x-button.ts'))
    ).toEqual(['x-button']);
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

describe('settings', () => {
  let mono: string;

  beforeAll(async () => {
    mono = await realpath(await mkdtemp(join(tmpdir(), 'lit-ws-settings-')));
    const tree: Record<string, string> = {
      'package.json': '{"name": "mono", "workspaces": ["packages/*"]}',
      // Reads lib, not src, and sets a rule with a mistake in it.
      'packages/kit/package.json': '{"name": "kit"}',
      'packages/kit/lit-devtools.config.json': JSON.stringify({
        languageServer: {
          scan: ['lib'],
          diagnostics: {'unknown-element': 'loud'},
        },
      }),
      'packages/kit/lib/x-kit.ts':
        "import {customElement} from 'lit/decorators.js';\n@customElement('x-kit') export class XKit extends HTMLElement {}\n",
      'packages/kit/src/x-skipped.ts':
        "import {customElement} from 'lit/decorators.js';\n@customElement('x-skipped') export class S extends HTMLElement {}\n",
      // Imports its base through an alias only its Vite config knows.
      'packages/app/package.json': '{"name": "app", "type": "module"}',
      'packages/app/vite.config.mjs':
        "export default {resolve: {alias: {'#base': new URL('./src/shared/base.ts', import.meta.url).pathname}}};\n",
      'packages/app/src/shared/base.ts':
        "import {LitElement} from 'lit';\nimport {property} from 'lit/decorators.js';\nexport class Base extends LitElement {\n  /** Through the alias. */\n  @property() tone = '';\n}\n",
      'packages/app/src/x-app.ts':
        "import {customElement} from 'lit/decorators.js';\nimport {Base} from '#base';\n@customElement('x-app') export class XApp extends Base {}\n",
    };
    for (const [file, code] of Object.entries(tree)) {
      await mkdir(dirname(join(mono, file)), {recursive: true});
      await writeFile(join(mono, file), code);
    }
  });

  afterAll(() => rm(mono, {recursive: true, force: true}));

  test("reads each package's folders and reports its problems", async () => {
    const workspace = await createWorkspace(mono);
    expect(workspace?.sourceTags()).toEqual(['x-app', 'x-kit']);
    const kitFile = join(mono, 'packages/kit/lib/x-kit.ts');
    expect(workspace?.configOf(kitFile)?.scan).toEqual(['lib']);
    expect(workspace?.problems()).toEqual([
      {
        file: join(mono, 'packages/kit/lit-devtools.config.json'),
        message:
          '`unknown-element` should be one of error, warning, info, hint, off.',
      },
    ]);
    expect(workspace?.watched()).toEqual([
      join(mono, 'packages/app/vite.config.mjs'),
      join(mono, 'packages/kit/lit-devtools.config.json'),
    ]);
    await workspace?.close();
  });

  test("resolves through a package's Vite config, so its aliases apply", async () => {
    const withVite = await createWorkspace(mono);
    const app = join(mono, 'packages/app/src/x-app.ts');
    expect((await withVite?.get(app, 'x-app'))?.properties).toMatchObject([
      {name: 'tone', description: 'Through the alias.'},
    ]);
    await withVite?.close();
    // Node's resolution doesn't know the alias.
    const without = await createWorkspace(mono, {viteResolution: false});
    expect((await without?.get(app, 'x-app'))?.properties).toEqual([]);
  });
});
