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

  test('locates a component and its base class, and lists the files to search', async () => {
    const workspace = await createWorkspace(mono);
    expect(workspace?.declarationsOf('x-app')).toEqual([
      {file: join(mono, 'packages/app/src/x-app.ts'), name: 'XApp'},
      {file: join(mono, 'packages/app/src/shared/base.ts'), name: 'Base'},
    ]);
    expect(workspace?.declarationsOf('x-nope')).toEqual([]);
    expect(await workspace?.markupFiles()).toEqual(
      expect.arrayContaining([join(mono, 'packages/kit/lib/x-kit.ts')])
    );
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

describe('pages', () => {
  let site: string;

  /** An Astro component that defines the element it renders. */
  const embed = (tag: string, name: string) => `---
const {src} = Astro.props;
---
<${tag} src={src}></${tag}>
<script>
  /** Runs a demo. */
  class ${name} extends HTMLElement {
    declare src: string;
  }
  customElements.define('${tag}', ${name});
</script>
`;

  beforeAll(async () => {
    site = await realpath(await mkdtemp(join(tmpdir(), 'lit-ws-pages-')));
    const tree: Record<string, string> = {
      'package.json': '{"name": "site"}',
      'src/components/Embed.astro': embed('live-demo', 'LiveDemo'),
      // Runs as written, so it defines its element all the same.
      'src/components/Inline.astro':
        "<script is:inline>\n  class InlineDemo extends HTMLElement {}\n  customElements.define('inline-demo', InlineDemo);\n</script>\n",
      // Loads a file, or holds data: nothing to read.
      'src/components/Skipped.astro':
        '<script src="/x.js">class Ignored extends HTMLElement {}\ncustomElements.define(\'src-demo\', Ignored);</script>\n<script type="application/json">{"class": 1}</script>\n',
      'index.html':
        '<!doctype html>\n<page-demo></page-demo>\n<script type="module">\n  class PageDemo extends HTMLElement {}\n  customElements.define(\'page-demo\', PageDemo);\n</script>\n',
    };
    for (const [file, code] of Object.entries(tree)) {
      await mkdir(dirname(join(site, file)), {recursive: true});
      await writeFile(join(site, file), code);
    }
  });

  afterAll(() => rm(site, {recursive: true, force: true}));

  test('reads the components HTML and Astro pages define in their scripts', async () => {
    const workspace = await createWorkspace(site);
    expect(workspace?.sourceTags()).toEqual([
      'inline-demo',
      'live-demo',
      'page-demo',
    ]);
    const file = join(site, 'src/components/Embed.astro');
    expect(workspace?.declarationsOf('live-demo')).toEqual([
      {file, name: 'LiveDemo'},
    ]);
    const docs = await workspace?.get(join(site, 'src/x.ts'), 'live-demo');
    expect(docs?.description).toBe('Runs a demo.');
    expect(docs?.origin.module).toBe('src/components/Embed.astro');
    // A page that defines a component is listed once.
    const files = (await workspace?.markupFiles()) ?? [];
    expect(files.filter((f) => f === file)).toHaveLength(1);
    await workspace?.close();
  });

  test("follows a page's unsaved edits and deletes", async () => {
    const workspace = await createWorkspace(site);
    const file = join(site, 'src/components/Chip.astro');
    await workspace?.update(file, embed('x-chip', 'XChip'));
    expect(workspace?.declarationsOf('x-chip')).toEqual([
      {file, name: 'XChip'},
    ]);
    await workspace?.update(file, '<x-chip></x-chip>\n');
    expect(workspace?.sourceTags()).not.toContain('x-chip');
    await workspace?.update(file, embed('x-chip', 'XChip'));
    workspace?.remove(file);
    expect(workspace?.sourceTags()).not.toContain('x-chip');
    // An HTML page outside the read folders and the package's root isn't read.
    await workspace?.update(
      join(site, 'public/demo.html'),
      "<script>class FarDemo extends HTMLElement {}\ncustomElements.define('far-demo', FarDemo);</script>"
    );
    expect(workspace?.sourceTags()).not.toContain('far-demo');
    await workspace?.close();
  });
});
