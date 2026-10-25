/// <reference types="node" />
import {execFile} from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {promisify} from 'node:util';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';

/**
 * @oddsquad/oxlint-plugin-lit, built and set up the way a project
 * would: an `oxlint.config.ts` that extends its recommended config, run by
 * the Oxlint that Vite+ ships, which a project would install as `oxlint`. Its
 * rules wait on a worker, so only a real run shows that they answer at all.
 */

const exec = promisify(execFile);
const REPO = join(import.meta.dirname, '../../..');
const PLUGIN = join(REPO, 'packages/oxlint-plugin-lit');
const TSC = join(PLUGIN, 'node_modules/.bin/tsc');

const resolveOxlint = async (): Promise<string> => {
  const vitePlus = await realpath(
    join(REPO, 'node_modules/vite-plus/package.json')
  );
  return dirname(createRequire(vitePlus).resolve('oxlint/package.json'));
};

const files: Record<string, string> = {
  'package.json': '{"name": "app", "type": "module"}',
  'oxlint.config.ts': [
    "import {defineConfig} from 'oxlint';",
    "import litDevtools from '@oddsquad/oxlint-plugin-lit';",
    '',
    'export default defineConfig({',
    '  extends: [litDevtools.configs.recommended],',
    "  rules: {'lit-devtools/css': 'off'},",
    '});',
    '',
  ].join('\n'),
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      module: 'nodenext',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    },
    include: ['oxlint.config.ts'],
  }),
  'src/x-button.ts': `
    import {LitElement} from 'lit';
    import {customElement} from 'lit/decorators.js';
    @customElement('x-button')
    export class XButton extends LitElement {
      pick() {
        this.dispatchEvent(new CustomEvent('pick', {detail: {at: 1}}));
      }
    }
  `,
  'src/app.ts': [
    "import {LitElement, html, css} from 'lit';",
    'export class App extends LitElement {',
    '  static styles = css`:host { colo: red; }`;',
    '  render() {',
    '    return html`<x-button @pick=${(e: CustomEvent<{thing: string}>) => e}></x-button>`;',
    '  }',
    '}',
    '',
  ].join('\n'),
  'src/quiet.ts': [
    "import {LitElement, html} from 'lit';",
    'export class Quiet extends LitElement {',
    '  render() {',
    '    // oxlint-disable-next-line lit-devtools/event-type',
    '    return html`<x-button @pick=${(e: CustomEvent<{thing: string}>) => e}></x-button>`;',
    '  }',
    '}',
    '',
  ].join('\n'),
};

/**
 * The environment without `VP_VERSION`, which `vp test` sets: with it, the
 * Oxlint Vite+ ships leaves `oxlint.config.ts` to `vp lint`'s own config.
 */
const {VP_VERSION: _, ...OUTSIDE_VP} = process.env;

let root: string;
let oxlint: string;

beforeAll(async () => {
  await exec('pnpm', ['run', 'build'], {cwd: PLUGIN});
  root = await realpath(await mkdtemp(join(tmpdir(), 'oxlint-plugin-')));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), {recursive: true});
    await writeFile(join(root, path), content);
  }
  await mkdir(join(root, 'node_modules/@oddsquad'), {recursive: true});
  await symlink(PLUGIN, join(root, 'node_modules/@oddsquad/oxlint-plugin-lit'));
  oxlint = await resolveOxlint();
  await symlink(oxlint, join(root, 'node_modules/oxlint'));
}, 120_000);

afterAll(async () => {
  await rm(root, {recursive: true, force: true});
});

test('the config type-checks against the published types', async () => {
  await expect(exec(TSC, ['-p', root])).resolves.toBeDefined();
});

test('reports the server’s problems under its rules, and fails the run', async () => {
  const run = await exec(
    process.execPath,
    [join(oxlint, 'bin/oxlint'), '-f', 'json', 'src'],
    {cwd: root, env: OUTSIDE_VP}
  ).then(
    () => ({failed: false, stdout: ''}),
    (error: {stdout: string}) => ({failed: true, stdout: error.stdout})
  );
  expect(run.failed).toBe(true);
  const {diagnostics} = JSON.parse(
    run.stdout.slice(run.stdout.indexOf('{'))
  ) as {
    diagnostics: {
      code: string;
      severity: string;
      filename: string;
      message: string;
    }[];
  };
  // `lit-devtools/css` is turned off over the recommended config, and quiet.ts
  // disables its line.
  expect(
    diagnostics.map(({code, severity, filename, message}) => ({
      code,
      severity,
      filename,
      message,
    }))
  ).toEqual([
    {
      code: 'lit-devtools(event-type)',
      severity: 'error',
      filename: 'src/app.ts',
      message: expect.stringContaining('`detail.thing` is missing'),
    },
  ]);
});
