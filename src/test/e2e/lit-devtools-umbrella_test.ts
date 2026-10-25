/// <reference types="node" />
import {execFile, spawn} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {promisify} from 'node:util';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';

/**
 * @oddsquad/lit-devtools as a project installs it: the four packages packed,
 * installed by pnpm into a project that lists only the umbrella. pnpm keeps
 * the members out of the project's `node_modules`, so anything that names
 * them from the project, as the Astro integration once named its own
 * renderer, fails here and nowhere else.
 */

const exec = promisify(execFile);
const REPO = join(import.meta.dirname, '../../..');
const TSC = join(REPO, 'packages/oxlint-plugin-lit/node_modules/.bin/tsc');
const MEMBERS = {
  '@oddsquad/vite-plugin-lit': REPO,
  '@oddsquad/lit-language-server': join(REPO, 'packages/lit-language-server'),
  '@oddsquad/oxlint-plugin-lit': join(REPO, 'packages/oxlint-plugin-lit'),
};
const UMBRELLA = join(REPO, 'packages/lit-devtools');

/**
 * Without `VP_VERSION`, which `vp test` sets: with it, the Oxlint Vite+ ships
 * leaves `oxlint.config.ts` to `vp lint`'s own config.
 */
const {VP_VERSION: _, ...ENV} = process.env;

let root: string;
let app: string;

const files = (tarballs: Record<string, string>): Record<string, string> => ({
  'package.json': JSON.stringify({
    name: 'umbrella-app',
    private: true,
    type: 'module',
    devDependencies: {
      '@oddsquad/lit-devtools': `file:${tarballs['@oddsquad/lit-devtools']}`,
      '@lit-labs/ssr': '^4.1.0',
      '@lit-labs/ssr-client': '^1.1.8',
      astro: '^7.3.5',
      lit: '^3.3.3',
      oxlint: '^1.85.0',
      vite: '^8.0.0',
    },
  }),
  // The members aren't published at these versions, so they come from the
  // tarballs too.
  'pnpm-workspace.yaml': [
    'overrides:',
    ...Object.keys(MEMBERS).map(
      (name) => `  "${name}": "file:${tarballs[name]}"`
    ),
    '',
  ].join('\n'),
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      module: 'nodenext',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: ['@oddsquad/lit-devtools/client'],
    },
    include: ['imports.ts'],
  }),
  'imports.ts': [
    "import {defineConfig} from '@oddsquad/lit-devtools';",
    "import {litPlugin} from '@oddsquad/lit-devtools/vite';",
    "import {litCss} from '@oddsquad/lit-devtools/build';",
    "import lit from '@oddsquad/lit-devtools/astro';",
    "import {unoSheet} from '@oddsquad/lit-devtools/uno';",
    "import {createLitDevtools} from '@oddsquad/lit-devtools/devframe';",
    "import litDevtools from '@oddsquad/lit-devtools/oxlint';",
    "import sheet from './x.css?css-sheet';",
    '',
    'export const all = [defineConfig, litPlugin, litCss, lit, unoSheet,',
    '  createLitDevtools, litDevtools.configs.recommended, sheet];',
    '',
  ].join('\n'),
  'index.html': [
    '<!doctype html>',
    '<script type="module" src="/src/x-hello.ts"></script>',
    '<x-hello></x-hello>',
    '',
  ].join('\n'),
  'src/x-hello.ts': [
    "import {LitElement, html} from 'lit';",
    'export class XHello extends LitElement {',
    '  render() {',
    '    return html`<p>hello</p>`;',
    '  }',
    '}',
    "customElements.define('x-hello', XHello);",
    '',
  ].join('\n'),
  'src/styles.ts': [
    "import {css} from 'lit';",
    'export const styles = css`:host { colo: red; }`;',
    '',
  ].join('\n'),
  'src/pages/index.astro': [
    '---',
    "import {XHello} from '../x-hello.ts';",
    '---',
    '<x-hello></x-hello>',
    '<XHello client:load />',
    '',
  ].join('\n'),
  'vite.config.ts': [
    "import {defineConfig} from 'vite';",
    "import {litPlugin} from '@oddsquad/lit-devtools/vite';",
    '',
    'export default defineConfig({plugins: [litPlugin()]});',
    '',
  ].join('\n'),
  'astro.config.mjs': [
    "import {defineConfig} from 'astro/config';",
    "import lit from '@oddsquad/lit-devtools/astro';",
    '',
    'export default defineConfig({integrations: [lit()]});',
    '',
  ].join('\n'),
  'oxlint.config.ts': [
    "import {defineConfig} from 'oxlint';",
    "import litDevtools from '@oddsquad/lit-devtools/oxlint';",
    '',
    'export default defineConfig({extends: [litDevtools.configs.recommended]});',
    '',
  ].join('\n'),
});

/** Runs a command in the app, its output whether it fails or not. */
const run = (file: string, args: string[]) =>
  exec(file, args, {cwd: app, env: ENV}).then(
    ({stdout}) => ({ok: true, stdout}),
    (error: {stdout: string; stderr: string}) => ({
      ok: false,
      stdout: `${error.stdout}${error.stderr}`,
    })
  );

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lit-devtools-umbrella-'));
  app = join(root, 'app');
  for (const dir of Object.values(MEMBERS).slice(1)) {
    await exec('pnpm', ['run', 'build'], {cwd: dir});
  }
  const tarballs: Record<string, string> = {};
  for (const [name, dir] of [
    ...Object.entries(MEMBERS),
    ['@oddsquad/lit-devtools', UMBRELLA] as const,
  ]) {
    tarballs[name] = join(root, `${name.split('/')[1]}.tgz`);
    await exec('pnpm', ['pack', '--out', tarballs[name]], {cwd: dir});
  }
  for (const [path, content] of Object.entries(files(tarballs))) {
    await mkdir(dirname(join(app, path)), {recursive: true});
    await writeFile(join(app, path), content);
  }
  await exec('pnpm', ['install', '--prefer-offline'], {cwd: app, env: ENV});
}, 300_000);

afterAll(async () => {
  await rm(root, {recursive: true, force: true});
});

test('pnpm keeps the members out of the project', async () => {
  const {stdout} = await run('ls', ['node_modules/@oddsquad']);
  expect(stdout.trim().split('\n')).toEqual(['lit-devtools']);
});

test('every export type-checks', async () => {
  const result = await run(TSC, ['-p', '.']);
  expect(result).toEqual({ok: true, stdout: ''});
});

test('vite builds with the plugin', async () => {
  const result = await run('node_modules/.bin/vite', ['build']);
  expect(result.ok, result.stdout).toBe(true);
});

test('astro renders on the server and bundles the island', async () => {
  const result = await run('node_modules/.bin/astro', ['build']);
  expect(result.ok, result.stdout).toBe(true);
  const html = await readFile(join(app, 'dist/index.html'), 'utf8');
  expect(html.match(/shadowrootmode="open"/g)).toHaveLength(2);
  expect(html).toMatch(/renderer-url="\/_astro\/client\.[\w-]+\.js"/);
});

test('oxlint runs the rules from /oxlint', async () => {
  const result = await run('node_modules/.bin/oxlint', ['-f', 'json', 'src']);
  const {diagnostics} = JSON.parse(
    result.stdout.slice(result.stdout.indexOf('{'))
  ) as {diagnostics: {code: string; filename: string}[]};
  expect(diagnostics.map(({code, filename}) => ({code, filename}))).toEqual([
    {code: 'lit-devtools(css)', filename: 'src/styles.ts'},
  ]);
});

test('the lit-language-server command answers initialize', async () => {
  const server = spawn('node_modules/.bin/lit-language-server', ['--stdio'], {
    cwd: app,
  });
  const message = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {processId: null, rootUri: null, capabilities: {}},
  });
  server.stdin.write(
    `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`
  );
  let output = '';
  await new Promise<void>((resolve) => {
    server.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('"capabilities"')) resolve();
    });
  });
  server.kill();
  expect(output).toContain('"id":1');
});

test('the lit-devtools command runs the plugin’s', async () => {
  // Without the optional `cac` it says so, which is the plugin's own
  // command answering.
  const result = await run('node_modules/.bin/lit-devtools', ['--help']);
  expect(result.stdout).toContain('[lit-devtools]');
});
