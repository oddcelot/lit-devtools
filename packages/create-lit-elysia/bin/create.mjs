#!/usr/bin/env node
/**
 * Starts a Lit app on Elysia 2: `pnpm create lit-elysia my-app`, with
 * `--adapter node|bun|cloudflare` for where its build runs.
 */
import {existsSync, realpathSync} from 'node:fs';
import {cp, readdir, readFile, rename, writeFile} from 'node:fs/promises';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const TEMPLATE = fileURLToPath(new URL('../template/', import.meta.url));

/** @type {readonly ('node' | 'bun' | 'cloudflare')[]} */
export const ADAPTERS = ['node', 'bun', 'cloudflare'];

/** This package's version, which the app's @oddsquad/lit-elysia matches. */
const ownVersion = async () =>
  /** @type {{version: string}} */ (
    JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    )
  ).version;

/** A package name from a folder's: lowercase, dashes for the rest. */
const nameOf = (dir) =>
  path
    .basename(path.resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'lit-elysia-app';

const SCRIPTS = {
  node: {start: 'node dist/server/index.js'},
  bun: {start: 'bun dist/server/index.js'},
  cloudflare: {preview: 'wrangler dev', deploy: 'wrangler deploy'},
};

const packageJson = (name, adapter, version) => ({
  name,
  private: true,
  type: 'module',
  scripts: {dev: 'vite', build: 'vite build', ...SCRIPTS[adapter]},
  dependencies: {
    '@oddsquad/lit-elysia': `^${version}`,
    elysia: '2.0.0-rc.4',
    lit: '^3.3.3',
    typebox: '^1.3.0',
  },
  devDependencies: {
    typescript: '^5.9.3',
    vite: '^8.3.2',
    ...(adapter === 'cloudflare' && {wrangler: '^4.0.0'}),
  },
});

const wranglerJson = (name) => ({
  name,
  main: 'dist/server/entry.js',
  compatibility_date: '2026-11-01',
  // request.signal aborts when the client leaves (the default from 2026-11-17).
  compatibility_flags: ['nodejs_compat', 'enable_request_signal'],
  assets: {directory: 'dist/client'},
});

/**
 * Writes a new app into `dir`, which must be missing or empty.
 *
 * @param {string} dir
 * @param {{adapter?: 'node' | 'bun' | 'cloudflare', name?: string, version?: string}} [options]
 */
export const create = async (dir, options = {}) => {
  const adapter = options.adapter ?? 'node';
  if (!ADAPTERS.includes(adapter)) {
    throw new Error(`No adapter named ${adapter}: use ${ADAPTERS.join(', ')}.`);
  }
  if (existsSync(dir) && (await readdir(dir)).length) {
    throw new Error(`${dir} isn't empty.`);
  }
  const name = options.name ?? nameOf(dir);
  const version = options.version ?? (await ownVersion());
  await cp(TEMPLATE, dir, {recursive: true});
  // npm leaves .gitignore out of packages, so the template's has another name.
  await rename(path.join(dir, '_gitignore'), path.join(dir, '.gitignore'));
  for (const file of ['vite.config.ts', 'src/server.ts']) {
    const target = path.join(dir, file);
    const code = await readFile(target, 'utf8');
    await writeFile(
      target,
      // The template is a working app for Node: only the choices change.
      code
        .replace("adapter: 'node'", `adapter: '${adapter}'`)
        .replaceAll('%NAME%', name)
    );
  }
  const write = (file, value) =>
    writeFile(path.join(dir, file), `${JSON.stringify(value, null, 2)}\n`);
  await write('package.json', packageJson(name, adapter, version));
  if (adapter === 'cloudflare')
    await write('wrangler.json', wranglerJson(name));
  return {name, adapter};
};

/** The package manager that ran this, for the next steps it prints. */
const manager = () =>
  (process.env['npm_config_user_agent'] ?? 'npm').split('/')[0] ?? 'npm';

const main = async () => {
  const {values, positionals} = parseArgs({
    allowPositionals: true,
    options: {
      adapter: {type: 'string', short: 'a'},
      help: {type: 'boolean', short: 'h'},
    },
  });
  if (values.help) {
    console.log('create-lit-elysia [dir] [--adapter node|bun|cloudflare]');
    return;
  }
  const dir = positionals[0] ?? 'lit-elysia-app';
  const adapter = /** @type {'node' | 'bun' | 'cloudflare' | undefined} */ (
    values.adapter
  );
  const {name} = await create(dir, {adapter});
  const run = manager();
  console.log(
    `\nCreated ${name} in ${dir}.\n\n  cd ${dir}\n  ${run} install\n  ${run} run dev\n`
  );
};

const invoked = process.argv[1] && realpathSync(process.argv[1]);
if (invoked === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
