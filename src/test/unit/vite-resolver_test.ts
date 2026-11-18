/// <reference types="node" />
import {existsSync} from 'node:fs';
import {mkdir, mkdtemp, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterAll, describe, expect, test} from 'vite-plus/test';
import {
  createViteResolver,
  readLitPluginOptions,
} from '../../lib/component-docs/vite-resolver.js';

/** A project in a temporary directory, made of `tree`'s files. */
const project = async (tree: Record<string, string>): Promise<string> => {
  const dir = await realpath(
    await mkdtemp(join(tmpdir(), 'lit-vite-resolver-'))
  );
  for (const [file, code] of Object.entries(tree)) {
    await mkdir(dirname(join(dir, file)), {recursive: true});
    await writeFile(join(dir, file), code);
  }
  return dir;
};

const dirs: string[] = [];

afterAll(() =>
  Promise.all(dirs.map((dir) => rm(dir, {recursive: true, force: true})))
);

describe('readLitPluginOptions', () => {
  test("loads the config with the project's own Vite", async () => {
    // A stand-in for the project's own Vite, whose config loader says it ran.
    const dir = await project({
      'package.json': '{"name": "app", "type": "module"}',
      'vite.config.mjs': 'export default {};\n',
      'node_modules/vite/package.json':
        '{"name": "vite", "type": "module", "exports": {".": "./index.js"}}',
      'node_modules/vite/index.js':
        "export const loadConfigFromFile = async () => ({config: {plugins: [{name: 'lit-plugin-options', api: {options: {from: 'project'}}}]}});\n",
    });
    dirs.push(dir);
    expect(
      await readLitPluginOptions(dir, join(dir, 'vite.config.mjs'))
    ).toEqual({from: 'project'});
  });
});

describe('createViteResolver', () => {
  test("resolves through the project's plugins and starts nothing of theirs", async () => {
    // The plugin does what a runtime plugin does: it asks for a pre-bundled
    // dependency and starts work in its server hook.
    const dir = await project({
      'package.json': '{"name": "app", "type": "module"}',
      'vite.config.mjs': `import {writeFileSync} from 'node:fs';
export default {
  plugins: [
    {
      name: 'project-runtime',
      config: () => ({optimizeDeps: {include: ['dep']}}),
      configureServer: (server) =>
        writeFileSync(server.config.root + '/server-hook-ran', ''),
      resolveId: (id) => (id === 'virtual:routes' ? '\\0routes' : undefined),
    },
  ],
};
`,
      'node_modules/dep/package.json':
        '{"name": "dep", "type": "module", "exports": {".": "./index.js"}}',
      'node_modules/dep/index.js': 'export default 1;\n',
    });
    dirs.push(dir);
    const vite = await createViteResolver(dir, join(dir, 'vite.config.mjs'));
    if (!vite) throw new Error('The project has a Vite config.');
    const importer = join(dir, 'main.js');
    const resolved = await Promise.all(
      ['dep', 'virtual:routes'].map((id) => vite.resolver.resolve(id, importer))
    );
    await vite.close();
    expect(resolved.map((result) => result?.id)).toEqual([
      join(dir, 'node_modules/dep/index.js'),
      '\0routes',
    ]);
    expect(existsSync(join(dir, 'server-hook-ran'))).toBe(false);
    expect(existsSync(join(dir, 'node_modules/.vite'))).toBe(false);
  });
});
