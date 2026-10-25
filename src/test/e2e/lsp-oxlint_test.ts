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
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {promisify} from 'node:util';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';

/**
 * The language server's Oxlint plugin, built and loaded by its package
 * subpath the way a project would, in a real `vp lint` run: its rules wait
 * on a worker, so only a real run shows that they answer at all.
 */

const exec = promisify(execFile);
const REPO = join(import.meta.dirname, '../../..');
const SERVER = join(REPO, 'packages/lit-language-server');
const VP = join(REPO, 'node_modules/.bin/vp');

const files: Record<string, string> = {
  'package.json': '{"name": "app"}',
  '.oxlintrc.json': JSON.stringify({
    jsPlugins: ['@oddsquad/lit-language-server/oxlint'],
    rules: {'lit/event-type': 'error', 'lit/css': 'warn'},
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
    '    // oxlint-disable-next-line lit/event-type',
    '    return html`<x-button @pick=${(e: CustomEvent<{thing: string}>) => e}></x-button>`;',
    '  }',
    '}',
    '',
  ].join('\n'),
};

let root: string;

beforeAll(async () => {
  await exec(VP, ['pack'], {cwd: SERVER});
  root = await realpath(await mkdtemp(join(tmpdir(), 'lsp-oxlint-')));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), {recursive: true});
    await writeFile(join(root, path), content);
  }
  await mkdir(join(root, 'node_modules/@oddsquad'), {recursive: true});
  await symlink(
    SERVER,
    join(root, 'node_modules/@oddsquad/lit-language-server')
  );
});

afterAll(async () => {
  await rm(root, {recursive: true, force: true});
});

test('reports the server’s problems under its rules, and fails the run', async () => {
  const run = await exec(
    VP,
    ['lint', '-c', '.oxlintrc.json', '-f', 'json', 'src'],
    {
      cwd: root,
    }
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
  expect(
    diagnostics
      .map(({code, severity, filename, message}) => ({
        code,
        severity,
        filename,
        message,
      }))
      .sort((a, b) => a.code.localeCompare(b.code))
  ).toEqual([
    {
      code: 'lit(css)',
      severity: 'warning',
      filename: 'src/app.ts',
      message: "Unknown property: 'colo'",
    },
    {
      code: 'lit(event-type)',
      severity: 'error',
      filename: 'src/app.ts',
      message: expect.stringContaining('`detail.thing` is missing'),
    },
  ]);
});
