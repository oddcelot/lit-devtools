/// <reference types="node" />
import {mkdir, mkdtemp, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {projectFor} from '../../lib/editor/tsconfig-project.js';

let root: string;

const write = async (files: Record<string, string>) => {
  for (const [file, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), {recursive: true});
    await writeFile(join(root, file), text);
  }
};

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'lit-tsconfig-')));
});

afterAll(() => rm(root, {recursive: true, force: true}));

test('a solution-style tsconfig hands over to the config that includes the sources', async () => {
  await write({
    'vite/tsconfig.json': `{
      // Vite writes these with comments,
      "files": [],
      "references": [
        { "path": "./tsconfig.node.json" },
        { "path": "./tsconfig.app.json" }, /* and trailing commas */
      ],
    }`,
    'vite/tsconfig.app.json':
      '{"compilerOptions": {"strict": true}, "include": ["src"]}',
    'vite/tsconfig.node.json': '{"include": ["vite.config.ts"]}',
  });
  const dir = join(root, 'vite');
  expect(
    projectFor(dir, [join(dir, 'src/a.ts'), join(dir, 'src/b/c.ts')])
  ).toBe(join(dir, 'tsconfig.app.json'));
});

test('a reference to a folder means its tsconfig.json', async () => {
  await write({
    'mono/tsconfig.json': '{"files": [], "references": [{"path": "./web"}]}',
    'mono/web/tsconfig.json': '{"include": ["**/*.ts"]}',
  });
  const dir = join(root, 'mono');
  expect(projectFor(dir, [join(dir, 'web/x.ts')])).toBe(
    join(dir, 'web/tsconfig.json')
  );
});

test('a tsconfig that holds files itself is used as it is', async () => {
  await write({
    'plain/tsconfig.json':
      '{"include": ["src"], "references": [{"path": "./tsconfig.node.json"}]}',
  });
  const dir = join(root, 'plain');
  expect(projectFor(dir, [join(dir, 'src/a.ts')])).toBe(
    join(dir, 'tsconfig.json')
  );
  expect(projectFor(join(root, 'none'), [])).toBe(
    join(root, 'none/tsconfig.json')
  );
});
