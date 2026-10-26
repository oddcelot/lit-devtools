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
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {checkPackages} from '../../lib/editor/check-packages.js';
import {createWorkspace} from '../../lib/editor/workspace.js';

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'es2022',
    module: 'esnext',
    moduleResolution: 'bundler',
    lib: ['es2022', 'DOM'],
    experimentalDecorators: true,
    useDefineForClassFields: false,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  },
  include: ['src'],
});

const component = (tag: string, bound: string) => `
  import {LitElement, html} from 'lit';
  import {customElement, property} from 'lit/decorators.js';
  @customElement('${tag}')
  export class C extends LitElement {
    @property({type: Number}) count = 0;
    render() {
      return html\`<${tag} .count=\${${bound}}></${tag}>\`;
    }
  }
  declare global {
    interface HTMLElementTagNameMap { '${tag}': C }
  }
`;

let root: string;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'lit-mono-')));
  const files: Record<string, string> = {
    'package.json': '{"name": "mono", "private": true}',
    'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
    'packages/a/package.json': '{"name": "a"}',
    'packages/a/tsconfig.json': TSCONFIG,
    'packages/a/src/x-a.ts': component('x-a', "'one'"),
    'packages/b/package.json': '{"name": "b"}',
    'packages/b/tsconfig.json': TSCONFIG,
    'packages/b/src/x-b.ts': component('x-b', '1'),
    'packages/b/lit-devtools.config.json': '{}',
  };
  for (const [file, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), {recursive: true});
    await writeFile(join(root, file), text);
  }
  const repo = decodeURIComponent(
    new URL('../../..', import.meta.url).pathname
  );
  await mkdir(join(root, 'node_modules'));
  for (const dep of ['lit', 'typescript']) {
    await symlink(
      join(repo, 'node_modules', dep),
      join(root, 'node_modules', dep)
    );
  }
});

afterAll(() => rm(root, {recursive: true, force: true}));

const summary = (checks: Awaited<ReturnType<typeof checkPackages>>) =>
  checks.map(({dir, result}) => ({
    dir: dir.slice(root.length) || '/',
    checked: result?.checked,
    problems: result?.problems.map((p) => p.message),
  }));

test('from the root, every package; from a package, that one', async () => {
  const workspace = (await createWorkspace(root, {viteResolution: false}))!;
  try {
    expect(summary(await checkPackages(workspace, root))).toEqual([
      {dir: '/', checked: 0, problems: []},
      {
        dir: '/packages/a',
        checked: 1,
        problems: ['`.count` takes `number`, but this is `string`.'],
      },
      {dir: '/packages/b', checked: 1, problems: []},
    ]);
    expect(
      summary(await checkPackages(workspace, join(root, 'packages/b')))
    ).toEqual([{dir: '/packages/b', checked: 1, problems: []}]);
  } finally {
    await workspace.close();
  }
}, 120_000);
