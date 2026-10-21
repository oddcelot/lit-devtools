/**
 * `bun run build`: one executable, `dist/guestbook`, with the server, Lit's
 * SSR and the client bundle inside. Copy it anywhere and run it; it needs
 * neither Bun nor `node_modules` there.
 *
 * 1. Bun bundles the client into `dist/public`, with hashed names.
 * 2. A generated entry imports each of those files `with {type: 'file'}`,
 *    which makes the compiler embed them, and hands their paths to
 *    `start()` in `src/prod.ts`.
 * 3. Bun compiles that entry.
 *
 * `package.json` runs this with `NODE_ENV=production`: Bun resolves Lit's
 * `development` export condition otherwise, and the page would log Lit's
 * dev-mode warning.
 */

import {rm, writeFile} from 'node:fs/promises';
import {basename} from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = `${root}dist`;

const check = (result: Bun.BuildOutput, what: string) => {
  if (!result.success) throw new AggregateError(result.logs, `${what} failed`);
  return result;
};

await rm(dist, {recursive: true, force: true});

const client = check(
  await Bun.build({
    entrypoints: [`${root}src/client/entry.ts`],
    outdir: `${dist}/public`,
    target: 'browser',
    naming: '[name]-[hash].[ext]',
    minify: true,
    sourcemap: 'linked',
  }),
  'Client build'
);

const names = client.outputs.map((output) => basename(output.path));
const entry = basename(
  client.outputs.find((output) => output.kind === 'entry-point')!.path
);

const main = `${dist}/main.ts`;
await writeFile(
  main,
  `import {start} from ${JSON.stringify(`${root}src/prod.ts`)};
${names
  .map(
    (name, i) =>
      `import file${i} from ${JSON.stringify(`./public/${name}`)} with {type: 'file'};`
  )
  .join('\n')}

start({
  entry: ${JSON.stringify(entry)},
  files: {${names.map((name, i) => `${JSON.stringify(name)}: file${i}`).join(', ')}},
});
`
);

check(
  await Bun.build({
    entrypoints: [main],
    compile: {outfile: `${dist}/guestbook`},
    minify: true,
    sourcemap: 'linked',
  }),
  'Server build'
);
await rm(main);

console.log(`dist/guestbook, with ${names.join(', ')}`);
