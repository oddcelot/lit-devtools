// Copies the bundled server's two native dependencies, oxc-parser and
// oxc-resolver, into dist/server/node_modules with the binding for one
// platform: `--target <vscode-target>` (as `vsce package --target` names
// it), the machine's own by default. A binding that isn't installed here is
// fetched from npm.

import {execFileSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

/** VS Code's platform targets, by the suffix napi-rs gives each binding. */
export const TARGETS = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'linux-arm64': 'linux-arm64-gnu',
  'linux-armhf': 'linux-arm-gnueabihf',
  'linux-x64': 'linux-x64-gnu',
  'alpine-arm64': 'linux-arm64-musl',
  'alpine-x64': 'linux-x64-musl',
  'win32-arm64': 'win32-arm64-msvc',
  'win32-x64': 'win32-x64-msvc',
};

const PACKAGES = ['oxc-parser', 'oxc-resolver'];

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const serverRequire = createRequire(
  join(root, '../lit-language-server/package.json')
);

/** The machine's own target. */
const hostTarget = () =>
  `${process.platform}-${process.arch === 'arm' ? 'armhf' : process.arch}`;

/** A package's folder, resolved from `require`. */
const packageDir = (require, name) =>
  dirname(require.resolve(`${name}/package.json`));

/** Unpacks `name@version` from npm into `dest`. */
const fetchPackage = (name, version, dest) => {
  const tmp = mkdtempSync(join(tmpdir(), 'lit-vscode-'));
  try {
    const file = execFileSync(
      'npm',
      ['pack', `${name}@${version}`, '--silent'],
      {cwd: tmp, encoding: 'utf8'}
    ).trim();
    execFileSync('tar', ['-xzf', file], {cwd: tmp});
    cpSync(join(tmp, 'package'), dest, {recursive: true});
  } finally {
    rmSync(tmp, {recursive: true, force: true});
  }
};

export const stageServer = (target = hostTarget()) => {
  const suffix = TARGETS[target];
  if (!suffix) throw new Error(`No binding for the target ${target}.`);
  const modules = join(root, 'dist/server/node_modules');
  rmSync(modules, {recursive: true, force: true});
  for (const name of PACKAGES) {
    const dir = packageDir(serverRequire, name);
    cpSync(dir, join(modules, name), {recursive: true, dereference: true});
    const {version} = JSON.parse(readFileSync(join(dir, 'package.json')));
    const scope = name.replace('oxc-', '@oxc-');
    const binding = `${scope}/binding-${suffix}`;
    const dest = join(modules, binding);
    mkdirSync(dirname(dest), {recursive: true});
    try {
      const local = packageDir(
        createRequire(join(dir, 'package.json')),
        binding
      );
      cpSync(local, dest, {recursive: true, dereference: true});
    } catch {
      fetchPackage(binding, version, dest);
    }
  }
  return target;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {target: {type: 'string'}}});
  console.log(`Staged the server for ${stageServer(values.target)}.`);
}
