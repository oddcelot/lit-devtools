/**
 * Fails the build when a JSR entry point can't name its types. JSR links a
 * JavaScript module to its declarations only through a
 * `/* @ts-self-types="./x.d.ts" *\/` line at the top of the file; without
 * one it warns `unsupported-javascript-entrypoint`, and JSR users get no
 * types for that export. The compiler drops the line when the statement it
 * leads is a type-only import, so this checks the built files, after `tsc`.
 */

import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const {exports} = JSON.parse(readFileSync(join(root, 'jsr.json'), 'utf8'));
const PRAGMA = /^\/\* @ts-self-types="(\.\/[^"]+\.d\.ts)" \*\//;

const problems = [];
for (const [name, target] of Object.entries(exports)) {
  const file = join(root, target);
  const first = readFileSync(file, 'utf8').split('\n', 1)[0];
  const types = PRAGMA.exec(first)?.[1];
  if (types === undefined) {
    problems.push(`${name}: ${target} does not start with @ts-self-types`);
  } else if (!existsSync(join(dirname(file), types))) {
    problems.push(`${name}: ${target} names ${types}, which is missing`);
  }
}

if (problems.length > 0) {
  console.error(
    `JSR entry points without their types:\n  ${problems.join('\n  ')}`
  );
  process.exit(1);
}
