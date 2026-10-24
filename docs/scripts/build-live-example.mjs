/**
 * Builds the live demo of examples/<name>/ with the example's own Vite and
 * vite.config.ts, for the entries src/lib/live-examples.ts marks
 * `{build: 'own-config'}`:
 *
 *   node scripts/build-live-example.mjs <name> <outDir>
 *
 * src/lib/live-examples-own-build.mjs runs it, in a process of its own: the
 * docs load their config through Vite's module runner, which is closed by
 * the time the build is done, and the example's Vite is not the docs' one.
 *
 * The build is the example's, with these changes:
 *
 * - the entry is the module its index.html runs, built as
 *   `_live/live-example.js`; the demo page imports it behind the page
 *   runtime, as it imports the docs-bundled examples
 *   (src/pages/live-panel/examples/[name]/demo.astro);
 * - `liveDemoDevLit()` resolves the example's Lit to the development build,
 *   so the Timeline's render lanes fill;
 * - its public/ files are left to `liveExamplesPublic` in astro.config.mjs;
 * - `base` is the demo page's URL, and everything goes under `_live/`.
 */
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {liveDemoDevLit} from '../src/lib/live-demo-dev-lit.mjs';

const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));

const [name, outDir] = process.argv.slice(2);
if (!name || !outDir || !/^[\w-]+$/.test(name)) {
  console.error('usage: build-live-example.mjs <name> <outDir>');
  process.exit(1);
}
const dir = join(EXAMPLES, name);

/** The module the example's index.html runs, from its root. */
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const src = html.match(
  /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']\/([^"']+)["']/i
)?.[1];
if (src === undefined) {
  throw new Error(`examples/${name}/index.html runs no module script`);
}
const entry = join(dir, src);

// The Vite the example's config was written for.
const vite = createRequire(join(dir, 'package.json')).resolve('vite');
const {build} = await import(pathToFileURL(vite).href);

await build({
  configFile: join(dir, 'vite.config.ts'),
  root: dir,
  base: `/live-panel/examples/${name}/demo/`,
  logLevel: 'warn',
  publicDir: false,
  plugins: [liveDemoDevLit()],
  build: {
    outDir: resolve(outDir),
    emptyOutDir: false,
    assetsDir: '_live',
    rolldownOptions: {
      input: {'live-example': entry},
      output: {entryFileNames: '_live/[name].js'},
    },
  },
});
