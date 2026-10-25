// Prints one version's section of a changelog, without its heading, for use
// as GitHub Release notes. The plugin's CHANGELOG.md by default; a tag such
// as `lit-language-server-v0.1.1` names its version after the last `v`:
//
//   node scripts/release-notes.mjs 0.3.0 > notes.md
//   node scripts/release-notes.mjs lit-language-server-v0.1.1 \
//     packages/lit-language-server/CHANGELOG.md > notes.md
//
// Exits non-zero when the section is missing or empty, so a release can't go
// out with the changelog entry forgotten.

import {readFileSync} from 'node:fs';

const version = process.argv[2]?.replace(/^(?:.*-)?v(?=\d)/, '');
const changelog = process.argv[3] ?? 'CHANGELOG.md';
if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version> [changelog]');
  process.exit(1);
}

const lines = readFileSync(
  new URL(`../${changelog}`, import.meta.url),
  'utf8'
).split('\n');
// Headings read `## 0.3.0 — 2026-09-17`.
const start = lines.findIndex(
  (line) => line === `## ${version}` || line.startsWith(`## ${version} `)
);
if (start === -1) {
  console.error(`[release-notes] no "## ${version}" section in ${changelog}`);
  process.exit(1);
}
let end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
if (end === -1) end = lines.length;

const body = lines
  .slice(start + 1, end)
  .join('\n')
  .trim();
if (body === '') {
  console.error(`[release-notes] the ${version} section is empty`);
  process.exit(1);
}
process.stdout.write(body + '\n');
