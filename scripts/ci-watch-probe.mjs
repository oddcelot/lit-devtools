// CI experiment for vpl-fs9x: does fs.watch deliver events under .e2e-tmp?
import {mkdirSync, watch, writeFileSync} from 'node:fs';
import {join} from 'node:path';
const dir = join(
  process.cwd(),
  '.e2e-tmp',
  `watch-probe-${process.pid}`,
  'src'
);
mkdirSync(dir, {recursive: true});
const seen = [];
const watcher = watch(dir, (event, file) => seen.push(`${event} ${file}`));
await new Promise((r) => setTimeout(r, 500));
writeFileSync(join(dir, 'x.ts'), 'export {};\n');
await new Promise((r) => setTimeout(r, 1500));
watcher.close();
console.log(`fs.watch events under ${dir}: ${JSON.stringify(seen)}`);
