import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import * as path from 'node:path';
import {afterEach, expect, test} from 'vite-plus/test';
import {create} from '../bin/create.mjs';

const made: string[] = [];
const fresh = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'create-pyrelia-'));
  made.push(dir);
  return path.join(dir, 'My App');
};
afterEach(async () => {
  for (const dir of made.splice(0))
    await rm(dir, {recursive: true, force: true});
});

const json = async (file: string) =>
  JSON.parse(await readFile(file, 'utf8')) as Record<string, any>;

test('a new app has the template, its name, and the node adapter by default', async () => {
  const dir = await fresh();
  expect(await create(dir, {version: '1.2.3'})).toEqual({
    name: 'my-app',
    adapter: 'node',
  });
  const pkg = await json(path.join(dir, 'package.json'));
  expect(pkg['name']).toBe('my-app');
  expect(pkg['dependencies']['@oddsquad/pyrelia']).toBe('^1.2.3');
  expect(pkg['scripts']).toEqual({
    dev: 'vite',
    build: 'vite build',
    start: 'node dist/server/index.js',
  });
  expect(await readFile(path.join(dir, 'vite.config.ts'), 'utf8')).toContain(
    "adapter: 'node'"
  );
  expect(await readFile(path.join(dir, 'src/server.ts'), 'utf8')).toContain(
    "name: 'my-app'"
  );
  const files = await readdir(dir, {recursive: true});
  expect(files).toContain('.gitignore');
  expect(files).not.toContain('_gitignore');
  expect(files).not.toContain('wrangler.json');
  for (const file of files) {
    if (/\.(ts|html|json)$/.test(file)) {
      expect(await readFile(path.join(dir, file), 'utf8')).not.toMatch(
        /%[A-Z]+%/
      );
    }
  }
});

test('the cloudflare adapter adds a wrangler config and its scripts', async () => {
  const dir = await fresh();
  await create(dir, {adapter: 'cloudflare', version: '1.2.3'});
  const pkg = await json(path.join(dir, 'package.json'));
  expect(pkg['scripts']['deploy']).toBe('wrangler deploy');
  expect(pkg['devDependencies']['wrangler']).toBeDefined();
  expect(await readFile(path.join(dir, 'vite.config.ts'), 'utf8')).toContain(
    "adapter: 'cloudflare'"
  );
  expect(await json(path.join(dir, 'wrangler.json'))).toMatchObject({
    main: 'dist/server/entry.js',
    assets: {directory: 'dist/client'},
  });
});

test('it refuses an unknown adapter, and a folder that has files', async () => {
  const dir = await fresh();
  // @ts-expect-error: not an adapter
  await expect(create(dir, {adapter: 'deno'})).rejects.toThrow(
    'No adapter named deno'
  );
  await create(dir, {version: '1.2.3'});
  await expect(create(dir, {version: '1.2.3'})).rejects.toThrow("isn't empty");
});
