// After `astro build`, writes /.well-known/agent-skills/index.json, the
// Agent Skills Discovery index (v0.2.0), for every skill under
// public/.well-known/agent-skills/<name>/SKILL.md. Each entry carries the
// SHA-256 of the file as served, so the digest is computed from dist/ at
// build time rather than kept by hand. Run via `pnpm run build` in docs/.
import {createHash} from 'node:crypto';
import {readdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../dist/.well-known/agent-skills');
const site = 'https://vite-plugin-lit.oddsquad.dev';

const skills = [];
for (const entry of await readdir(root, {withFileTypes: true})) {
  if (!entry.isDirectory()) continue;
  const bytes = await readFile(join(root, entry.name, 'SKILL.md'));
  const description = bytes
    .toString('utf8')
    .match(/^description:\s*(.+)$/m)?.[1]
    .trim();
  if (!description) {
    throw new Error(`[agent-skills] ${entry.name}/SKILL.md has no description`);
  }
  skills.push({
    name: entry.name,
    type: 'skill-md',
    description,
    url: `${site}/.well-known/agent-skills/${entry.name}/SKILL.md`,
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  });
}

await writeFile(
  join(root, 'index.json'),
  `${JSON.stringify(
    {
      $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
      skills,
    },
    null,
    2
  )}\n`
);
console.log(`[agent-skills] indexed ${skills.length} skill(s)`);
