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
import {afterAll, beforeAll, describe, expect, test, vi} from 'vite-plus/test';
import {createNodeResolver} from '../../lib/component-docs/node-resolver.js';
import {scanSources} from '../../lib/component-docs/scan.js';

// A scan of a project without a Vite config must not load Vite.
vi.mock('vite', () => {
  throw new Error('vite was imported');
});

let root: string;

const files: Record<string, string> = {
  'package.json': '{"name": "app", "type": "module"}',
  'tsconfig.json': JSON.stringify({
    compilerOptions: {baseUrl: '.', paths: {'@ui/*': ['src/ui/*']}},
  }),
  'src/ui/base.ts': `
    import {LitElement} from 'lit';
    import {property} from 'lit/decorators.js';
    export class Base extends LitElement {
      /** Turns it off. */
      @property({type: Boolean}) disabled = false;
    }
  `,
  'src/x-card.ts': `
    import {customElement} from 'lit/decorators.js';
    import {Base} from '@ui/base.js';
    /** A card. */
    @customElement('x-card')
    export class XCard extends Base {}
  `,
  'src/x-link.ts': `
    import {customElement} from 'lit/decorators.js';
    import {Shared} from 'shared';
    @customElement('x-link')
    export class XLink extends Shared {}
  `,
  // A workspace package, linked into node_modules as pnpm does.
  'packages/shared/package.json': JSON.stringify({
    name: 'shared',
    exports: {
      '.': {development: './src/index.ts', default: './dist/index.js'},
    },
  }),
  'packages/shared/src/index.ts': `
    import {LitElement} from 'lit';
    import {property} from 'lit/decorators.js';
    export class Shared extends LitElement {
      /** Where it goes. */
      @property() href = '';
    }
  `,
};

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'lit-node-scan-')));
  for (const [file, code] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), {recursive: true});
    await writeFile(join(root, file), code);
  }
  await mkdir(join(root, 'node_modules'), {recursive: true});
  await symlink(
    join(root, 'packages/shared'),
    join(root, 'node_modules/shared'),
    'dir'
  );
});

afterAll(() => rm(root, {recursive: true, force: true}));

describe('createNodeResolver', () => {
  const resolve = (specifier: string, from = 'src/x-card.ts') =>
    createNodeResolver().resolve(specifier, join(root, from));

  test('follows tsconfig paths and a .js specifier to the .ts source', async () => {
    expect(await resolve('@ui/base.js')).toEqual({
      id: join(root, 'src/ui/base.ts'),
    });
  });

  test('takes the development condition and the real path of a link', async () => {
    expect(await resolve('shared', 'src/x-link.ts')).toEqual({
      id: join(root, 'packages/shared/src/index.ts'),
    });
  });

  test('marks a Node builtin external', async () => {
    expect(await resolve('node:fs')).toEqual({id: 'node:fs', external: true});
  });

  test('gives null for what it cannot find', async () => {
    expect(await resolve('./missing.js')).toBeNull();
  });
});

describe('scanSources without a Vite config', () => {
  test('reads inherited docs through aliases and workspace links', async () => {
    // The linked package's source is scanned too, under its real path, which
    // is where the resolver sends `shared`.
    const {index, files: read} = await scanSources({
      root,
      dirs: ['src', 'node_modules/shared/src'],
    });
    expect(read).toBe(4);
    const card = index.get('x-card');
    expect(card?.properties).toMatchObject([
      {name: 'disabled', description: 'Turns it off.'},
    ]);
    const link = index.get('x-link');
    expect(link?.properties).toMatchObject([
      {name: 'href', description: 'Where it goes.'},
    ]);
  });
});
