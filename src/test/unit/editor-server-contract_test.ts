/// <reference types="node" />
import {readFileSync} from 'node:fs';
import {expect, test} from 'vite-plus/test';

/**
 * What the editor extensions rely on to start the language server: a
 * published Zed or VS Code extension finds the server by these names and
 * paths in whatever server version a project or npm gives it. Changing one
 * breaks every installed extension, so it needs a new extension release, or
 * a major-version pin, before the server ships it (AGENTS.md).
 */

const read = (path: string): string =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const binOf = (path: string, command: string): string => {
  const pkg = JSON.parse(read(path)) as {
    name: string;
    bin: Record<string, string>;
  };
  return `${pkg.name} ${pkg.bin[command]!.replace(/^\.\//, '')}`;
};

const SERVER = binOf(
  'packages/lit-language-server/package.json',
  'lit-language-server'
);
const UMBRELLA = binOf(
  'packages/lit-devtools/package.json',
  'lit-language-server'
);

test('the packages start the server where the editors look for it', () => {
  expect(SERVER).toBe('@oddsquad/lit-language-server dist/bin.mjs');
  expect(UMBRELLA).toBe('@oddsquad/lit-devtools bin/lit-language-server.mjs');
});

test('the Zed extension looks there', () => {
  const rust = read('packages/zed/src/lib.rs');
  const constant = (name: string) =>
    new RegExp(`const ${name}: &str = "([^"]+)";`).exec(rust)?.[1];
  expect(`${constant('PACKAGE')} ${constant('BIN')}`).toBe(SERVER);
  expect(`${constant('UMBRELLA')} ${constant('UMBRELLA_BIN')}`).toBe(UMBRELLA);
  // It starts the server with --stdio.
  expect(rust).toContain('"--stdio"');
});

test('the VS Code extension looks there', () => {
  const lookup = read('packages/vscode/src/find-server.ts');
  const pkg = (name: string) =>
    new RegExp(
      `const ${name}: ServerPackage = \\{\\s*name: '([^']+)',\\s*bin: '([^']+)',`
    )
      .exec(lookup)
      ?.slice(1)
      .join(' ');
  expect(pkg('SERVER')).toBe(SERVER);
  expect(pkg('UMBRELLA')).toBe(UMBRELLA);
});
