// Packages the extension once per platform, each with that platform's
// native bindings: `node scripts/package.mjs [target…]`, the machine's own
// target by default, `all` for every one. Run after `pnpm run build`.

import {execFileSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TARGETS, stageServer} from './stage-server.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const vsce = join(root, 'node_modules/.bin/vsce');

const args = process.argv.slice(2);
const targets = args[0] === 'all' ? Object.keys(TARGETS) : args;

for (const target of targets.length > 0 ? targets : [undefined]) {
  const staged = stageServer(target);
  const out = join(root, `lit-${staged}.vsix`);
  execFileSync(
    vsce,
    ['package', '--no-dependencies', '--target', staged, '--out', out],
    {cwd: root, stdio: 'inherit'}
  );
}
