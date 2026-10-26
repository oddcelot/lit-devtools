/// <reference types="node" />
import {execFile} from 'node:child_process';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {beforeAll, expect, test} from 'vite-plus/test';
import {DIAGNOSTIC_RULES} from '../../lib/editor/config.js';

/**
 * examples/checks shows every check the language server makes, one mistake
 * each in src/mistakes/. Its own `npm run lint` and `npm run check` are run
 * here as a reader would run them, so a rule added without an example there,
 * or an example that stops being reported, fails this test.
 */

const exec = promisify(execFile);
const REPO = join(import.meta.dirname, '../../..');
const EXAMPLE = join(REPO, 'examples/checks');
const BIN = join(EXAMPLE, 'node_modules/.bin');

/**
 * The environment without `VP_VERSION`, which `vp test` sets: with it, the
 * Oxlint Vite+ ships leaves `oxlint.config.ts` to `vp lint`'s own config.
 */
const {VP_VERSION: _, ...OUTSIDE_VP} = process.env;

/** Runs a command that fails when it reports problems, and keeps its output. */
const run = (file: string, args: string[]) =>
  exec(file, args, {cwd: EXAMPLE, env: OUTSIDE_VP}).then(
    ({stdout}) => ({failed: false, stdout}),
    (error: {stdout: string}) => ({failed: true, stdout: error.stdout})
  );

beforeAll(async () => {
  // `pnpm run test:e2e` builds the plugin; the Oxlint rules build apart.
  await exec('pnpm', ['run', 'build'], {
    cwd: join(REPO, 'packages/oxlint-plugin-lit'),
  });
}, 120_000);

test('npm run lint reports every rule, and only in src/mistakes', async () => {
  const lint = await run(join(BIN, 'oxlint'), ['-f', 'json', 'src']);
  expect(lint.failed).toBe(true);
  const {diagnostics} = JSON.parse(
    lint.stdout.slice(lint.stdout.indexOf('{'))
  ) as {diagnostics: {code: string; filename: string}[]};

  const rules = new Set(
    diagnostics.map(({code}) => /^lit-devtools\((.+)\)$/.exec(code)?.[1])
  );
  expect(rules).toEqual(new Set(DIAGNOSTIC_RULES));

  expect(new Set(diagnostics.map(({filename}) => filename))).toEqual(
    new Set([
      'src/mistakes/bindings.ts',
      'src/mistakes/declarations.ts',
      'src/mistakes/imports.ts',
      'src/mistakes/names.ts',
      'src/mistakes/styles.ts',
      'src/mistakes/syntax.ts',
    ])
  );
}, 60_000);

test('npm run check finds the binding only TypeScript can read', async () => {
  const check = await run(join(BIN, 'lit-devtools'), ['check']);
  expect(check.failed).toBe(true);
  expect(check.stdout).toContain(
    'src/mistakes/bindings.ts:27:25  `.size` takes `"large" | "small"`, but this is `string`.'
  );
  // The same binding in ignored.ts carries `lit-ignore-next-line`.
  expect(check.stdout).not.toContain('ignored.ts');
}, 60_000);
