import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {afterAll, expect, test} from 'vite-plus/test';
import {fsp, joinPath, tmpRoot} from './utils.js';

/**
 * `entry-imports_test.ts` reads both entries' import graphs from source; this
 * runs the real thing. Each case is a `vite build` of the published JS (the
 * repo-root `index.js` and `build.js`, which `test:e2e` builds first) in a
 * fresh Node process that records every module of this package it loads. A
 * hook that `vite build` still called, or a shell that loaded its plugin too
 * early, would pull dev code into that list.
 *
 * The two entries also have to agree: `litCss()` is documented as a drop-in
 * for `litPlugin()` in a build config, so both emit the same chunk.
 */

const exec = promisify(execFile);
const PACKAGE_ROOT = joinPath(import.meta.dirname, '../../..');

// The published counterparts of the files `entry-imports_test.ts` pins.
const BUILD_MODULES = [
  'build.js',
  'lib/css-sheet-build.js',
  'lib/env.js',
  'lib/plugins/css-literals.js',
  'lib/plugins/css-queries.js',
  'lib/plugins/shared.js',
  'lib/plugins/timeline-virtual.js',
];
const MAIN_MODULES = [
  'index.js',
  'lib/confine.js',
  'lib/css-sheet-build.js',
  'lib/env.js',
  'lib/options.js',
  'lib/plugin.js',
  'lib/plugins/context.js',
  'lib/plugins/css-literals.js',
  'lib/plugins/css-queries.js',
  'lib/plugins/lazy.js',
  'lib/plugins/shared.js',
  'lib/plugins/timeline-virtual.js',
  'lib/runtime/source-overlay/editors.js',
  'lib/setting-definitions.js',
  'lib/source-locator.js',
];

/** Every build-time feature: a `?css-sheet` import, a `css` literal, the timeline. */
const SOURCES: Record<string, string> = {
  'package.json': '{"type": "module"}\n',
  'sheet.css': '.chip {\n  background: rgb(59, 130, 246);\n}\n',
  'entry.js':
    `import {LitElement, css, html} from 'lit';\n` +
    `import sheet from './sheet.css?css-sheet';\n` +
    `import {addTimelineEvent} from 'virtual:lit-plugin/timeline';\n` +
    `export class XChip extends LitElement {\n` +
    `  static styles = [sheet, css\`:host { color: rgb(255, 0, 0); }\`];\n` +
    `  render() { addTimelineEvent({layerId: 'x', time: 0, data: {}}); return html\`<slot></slot>\`; }\n` +
    `}\n`,
};

/**
 * Runs in the child: records loaded modules, builds, prints them as JSON.
 * Vite comes from the repo, so it resolves the same as in the other e2e tests.
 */
const BUILD_SCRIPT = `
import {registerHooks} from 'node:module';
const loaded = new Set();
registerHooks({
  load(url, context, next) {
    loaded.add(url);
    return next(url, context);
  },
});
const [entry, factory, root] = process.argv.slice(2);
const {build} = await import('vite');
const plugin = (await import(entry))[factory];
await build({
  root,
  configFile: false,
  logLevel: 'silent',
  plugins: [plugin()],
  build: {
    minify: false,
    rollupOptions: {external: [/^lit/]},
    lib: {entry: 'entry.js', formats: ['es'], fileName: 'lib'},
  },
});
console.log(JSON.stringify([...loaded]));
`;

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(
    roots.map((root) => fsp.rm(root, {recursive: true, force: true}))
  );
});

interface Built {
  /** This package's modules the build process loaded, repo-relative. */
  modules: string[];
  /** The emitted chunk, with the fixture's path replaced by `<root>`. */
  chunk: string;
}

const buildWith = async (
  entry: 'index.js' | 'build.js',
  factory: 'litPlugin' | 'litCss'
): Promise<Built> => {
  const root = tmpRoot(`build-entry-${factory}`);
  roots.push(root);
  await fsp.mkdir(root, {recursive: true});
  for (const [name, code] of Object.entries(SOURCES)) {
    await fsp.writeFile(joinPath(root, name), code);
  }
  const script = joinPath(root, 'run-build.mjs');
  await fsp.writeFile(script, BUILD_SCRIPT);

  const {stdout} = await exec(process.execPath, [
    script,
    joinPath(PACKAGE_ROOT, entry),
    factory,
    root,
  ]);
  const own = `file://${PACKAGE_ROOT}/`;
  const modules = (JSON.parse(stdout) as string[])
    .filter((url) => url.startsWith(own) && !url.includes('/node_modules/'))
    .map((url) => url.slice(own.length))
    .filter((rel) => !rel.startsWith('.e2e-tmp/'))
    .sort();

  const dist = joinPath(root, 'dist');
  const chunkName = (await fsp.readdir(dist)).find((f) => /\.m?js$/.test(f));
  if (chunkName === undefined) throw new Error('no JS chunk emitted');
  const chunk = await fsp.readFile(joinPath(dist, chunkName), 'utf8');
  // Region comments name the fixture's own directory; drop it to compare.
  const rel = root.slice(PACKAGE_ROOT.length + 1);
  return {
    modules,
    chunk: chunk.replaceAll(root, '<root>').replaceAll(rel, '<root>'),
  };
};

const builds = {
  main: buildWith('index.js', 'litPlugin'),
  buildOnly: buildWith('build.js', 'litCss'),
};

test('vite build with litPlugin() loads no dev-only module', async () => {
  const {modules} = await builds.main;
  expect(modules).toEqual(MAIN_MODULES);
});

test('vite build with litCss() loads only the build-time plugins', async () => {
  const {modules} = await builds.buildOnly;
  expect(modules).toEqual(BUILD_MODULES);
});

test('both entries emit the same chunk, with every build feature applied', async () => {
  const [main, buildOnly] = await Promise.all([builds.main, builds.buildOnly]);
  // The sheet became a constructed stylesheet, the timeline import the stub.
  expect(main.chunk).toContain('CSSStyleSheet');
  expect(main.chunk).toContain('rgb(59, 130, 246)');
  expect(main.chunk).not.toContain('virtual:lit-plugin/timeline');
  expect(main.chunk).not.toContain('lit:timeline');
  expect(buildOnly.chunk).toBe(main.chunk);
});
