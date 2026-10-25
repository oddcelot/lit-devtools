/// <reference types="node" />
import {mkdir, mkdtemp, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterAll, beforeAll, describe, expect, test} from 'vite-plus/test';
import {readLitPluginOptions} from '../../lib/component-docs/vite-resolver.js';

let dir: string;

beforeAll(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'lit-vite-resolver-')));
  // A stand-in for the project's own Vite, whose config loader says it ran.
  const tree: Record<string, string> = {
    'package.json': '{"name": "app", "type": "module"}',
    'vite.config.mjs': 'export default {};\n',
    'node_modules/vite/package.json':
      '{"name": "vite", "type": "module", "exports": {".": "./index.js"}}',
    'node_modules/vite/index.js':
      "export const loadConfigFromFile = async () => ({config: {plugins: [{name: 'lit-plugin-options', api: {options: {from: 'project'}}}]}});\n",
  };
  for (const [file, code] of Object.entries(tree)) {
    await mkdir(dirname(join(dir, file)), {recursive: true});
    await writeFile(join(dir, file), code);
  }
});

afterAll(() => rm(dir, {recursive: true, force: true}));

describe('readLitPluginOptions', () => {
  test("loads the config with the project's own Vite", async () => {
    expect(
      await readLitPluginOptions(dir, join(dir, 'vite.config.mjs'))
    ).toEqual({from: 'project'});
  });
});
