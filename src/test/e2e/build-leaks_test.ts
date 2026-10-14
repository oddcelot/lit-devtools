import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {afterAll, describe, expect, test} from 'vite-plus/test';
import {fsp, joinPath, tmpRoot} from './utils.js';

/**
 * Nothing dev-only may reach a production bundle, whatever the config says.
 *
 * `build-entries_test.ts` checks which of this package's modules a default
 * `vite build` loads. This checks what comes out: one app, built under every
 * config that switches a dev feature on (options, `LIT_PLUGIN_*` env, the
 * development mode, a library build), scanned for the strings each dev
 * feature leaves in the code it serves. A serve-time transform of the same
 * app shows those strings are the ones dev really emits, so a clean scan
 * isn't vacuous.
 *
 * Dev switches must not change a build at all: every variant of one shape
 * emits the same files, byte for byte, as the default config.
 */

const exec = promisify(execFile);
const PACKAGE_ROOT = joinPath(import.meta.dirname, '../../..');

/** One component using every feature that has a dev-time transform. */
const SOURCES: Record<string, string> = {
  'package.json': '{"type": "module"}\n',
  'index.html':
    '<!doctype html>\n<html>\n<head><script type="module" src="/entry.js"></script></head>\n' +
    '<body><x-chip></x-chip></body>\n</html>\n',
  'sheet.css': '.chip {\n  background: rgb(59, 130, 246);\n}\n',
  'entry.js':
    `import {LitElement, css, html} from 'lit';\n` +
    `import sheet from './sheet.css?css-sheet';\n` +
    `import {addTimelineEvent} from 'virtual:lit-plugin/timeline';\n` +
    `export class XChip extends LitElement {\n` +
    `  static properties = {label: {type: String}};\n` +
    `  static styles = [sheet, css\`:host { color: rgb(255, 0, 0); }\`];\n` +
    `  #clicks = 0;\n` +
    `  render() {\n` +
    `    addTimelineEvent({layerId: 'x', time: 0, data: {}});\n` +
    `    return html\`<button @click=\${() => this.#clicks++}>\${this.label}</button>\`;\n` +
    `  }\n` +
    `}\n` +
    `customElements.define('x-chip', XChip);\n`,
};

/**
 * Strings only dev code carries: virtual ids, dev-server URLs, the runtime's
 * `Symbol.for` keys and globals, its elements and attributes.
 */
const DEV_MARKERS = [
  '@oddsquad/vite-plugin-lit',
  'lit-plugin:',
  'virtual:lit-plugin',
  'import.meta.hot',
  '/@id/',
  '/@fs/',
  '/@vite/',
  '/__lit',
  '/__devtools',
  '__LIT_DEVTOOLS',
  'lit-devtools-',
  'lit-source-overlay',
  'data-lit-source',
  'lit:timeline',
];

/** Every dev feature on, through options. */
const ALL_ON = {
  hmr: {
    reconnect: true,
    privateFields: true,
    childState: 'reuse',
    indicator: {count: true},
  },
  sourceOverlay: true,
  timeline: true,
  devtoolsWorkspace: true,
};

/** Every dev feature on, through `LIT_PLUGIN_*` in the app's `.env`. */
const ALL_ON_ENV = [
  'LIT_PLUGIN_HMR=true',
  'LIT_PLUGIN_HMR_RECONNECT=true',
  'LIT_PLUGIN_HMR_CHILD_STATE=reuse',
  'LIT_PLUGIN_HMR_INDICATOR=true',
  'LIT_PLUGIN_HMR_INDICATOR_COUNT=true',
  'LIT_PLUGIN_SOURCE_OVERLAY=true',
  'LIT_PLUGIN_TIMELINE=true',
].join('\n');

interface Variant {
  options?: object;
  /** Contents of the app's `.env`. */
  env?: string;
  mode?: 'production' | 'development';
  /** `vite build` with `build.lib` instead of the `index.html` app. */
  lib?: boolean;
}

/**
 * Runs in the child, so the build sees `NODE_ENV` and `process.env` the way a
 * real `vite build` does rather than the way Vitest sets them. With `serve`,
 * it starts a dev server instead and prints what it serves for the app.
 */
const RUN_SCRIPT = `
const [entry, root, json] = process.argv.slice(2);
const {options, mode, lib, serve} = JSON.parse(json);
const vite = await import('vite');
const plugins = [(await import(entry)).litPlugin(options)];
const config = {
  root,
  configFile: false,
  logLevel: 'silent',
  mode,
  plugins,
  build: {
    outDir: 'dist',
    rollupOptions: {external: [/^lit/]},
    ...(lib && {lib: {entry: 'entry.js', formats: ['es'], fileName: 'lib'}}),
  },
};
if (serve) {
  const server = await vite.createServer({
    ...config,
    server: {middlewareMode: true, ws: false},
  });
  const js = await server.transformRequest('/entry.js');
  const html = await server.transformIndexHtml(
    '/index.html',
    await (await import('node:fs/promises')).readFile(root + '/index.html', 'utf8')
  );
  await server.close();
  console.log(JSON.stringify({'entry.js': js.code, 'index.html': html}));
} else {
  await vite.build(config);
}
`;

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(
    roots.map((root) => fsp.rm(root, {recursive: true, force: true}))
  );
});

const setUp = async (variant: Variant): Promise<string> => {
  const root = tmpRoot('build-leaks');
  roots.push(root);
  await fsp.mkdir(root, {recursive: true});
  for (const [name, code] of Object.entries(SOURCES)) {
    await fsp.writeFile(joinPath(root, name), code);
  }
  if (variant.env) await fsp.writeFile(joinPath(root, '.env'), variant.env);
  await fsp.writeFile(joinPath(root, 'run.mjs'), RUN_SCRIPT);
  return root;
};

const run = async (root: string, variant: Variant, serve: boolean) => {
  const mode = variant.mode ?? (serve ? 'development' : 'production');
  const {stdout} = await exec(
    process.execPath,
    [
      joinPath(root, 'run.mjs'),
      joinPath(PACKAGE_ROOT, 'index.js'),
      root,
      JSON.stringify({
        options: variant.options ?? {},
        mode,
        lib: variant.lib ?? false,
        serve,
      }),
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: mode === 'production' ? 'production' : 'development',
      },
    }
  );
  return stdout;
};

/** Every emitted file, by path under `dist/`. */
const build = async (variant: Variant): Promise<Record<string, string>> => {
  const root = await setUp(variant);
  await run(root, variant, false);
  const dist = joinPath(root, 'dist');
  const files: Record<string, string> = {};
  const entries = await fsp.readdir(dist, {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = joinPath(entry.parentPath, entry.name);
    files[file.slice(dist.length + 1)] = await fsp.readFile(file, 'utf8');
  }
  return {...files, [ROOT_KEY]: root};
};

/** Smuggles the fixture's root out with its files; never a real path. */
const ROOT_KEY = '\0root';

const leaksIn = (files: Record<string, string>): string[] => {
  const root = files[ROOT_KEY]!;
  // Absolute only: unminified chunks name their modules in relative
  // `//#region` comments, as any Rolldown build does.
  const markers = [...DEV_MARKERS, root];
  const leaks: string[] = [];
  for (const [file, code] of Object.entries(files)) {
    if (file === ROOT_KEY) continue;
    for (const marker of markers) {
      if (code.includes(marker)) leaks.push(`${file}: ${marker}`);
    }
  }
  return leaks;
};

/** The files with the fixture's own directory masked, to compare builds. */
const comparable = (files: Record<string, string>) => {
  const rel = files[ROOT_KEY]!.slice(PACKAGE_ROOT.length + 1);
  return Object.fromEntries(
    Object.entries(files)
      .filter(([file]) => file !== ROOT_KEY)
      .map(([file, code]) => [file, code.replaceAll(rel, '<root>')])
  );
};

const APP: Record<string, Variant> = {
  default: {},
  'all dev features on': {options: ALL_ON},
  'all dev features on via env': {env: ALL_ON_ENV},
  'all dev features off': {
    options: {
      hmr: false,
      sourceOverlay: false,
      timeline: false,
      devtoolsWorkspace: false,
    },
  },
  'development mode, all on': {options: ALL_ON, mode: 'development'},
  "cssSheetBuild 'inline'": {options: {cssSheetBuild: 'inline'}},
  "cssSheetBuild 'inline-raw'": {options: {cssSheetBuild: 'inline-raw'}},
};
const LIB: Record<string, Variant> = {
  default: {lib: true},
  'all dev features on': {options: ALL_ON, lib: true},
  'all dev features on via env': {env: ALL_ON_ENV, lib: true},
};

const appBuilds = Object.fromEntries(
  Object.entries(APP).map(([name, v]) => [name, build(v)])
);
const libBuilds = Object.fromEntries(
  Object.entries(LIB).map(([name, v]) => [name, build(v)])
);

describe.each([
  ['app', appBuilds],
  ['lib', libBuilds],
] as const)('%s build', (_, builds) => {
  test.each(Object.keys(builds))('%s: no dev-only code', async (name) => {
    expect(leaksIn(await builds[name]!)).toEqual([]);
  });
});

/** Variants that only flip dev switches, so must build like the default. */
const SAME_AS_DEFAULT = [
  ['app', 'all dev features on', appBuilds],
  ['app', 'all dev features on via env', appBuilds],
  ['app', 'all dev features off', appBuilds],
  ['lib', 'all dev features on', libBuilds],
  ['lib', 'all dev features on via env', libBuilds],
] as const;

test.each(SAME_AS_DEFAULT)(
  '%s build, %s: same output as the default',
  async (_, name, builds) => {
    const [variant, base] = await Promise.all([
      builds[name]!,
      builds['default']!,
    ]);
    expect(comparable(variant)).toEqual(comparable(base));
  }
);

test('the markers are what dev serves for the same app', async () => {
  const variant: Variant = {options: ALL_ON};
  const root = await setUp(variant);
  const served = JSON.parse(await run(root, variant, true)) as Record<
    string,
    string
  >;
  const all = Object.values(served).join('\n');
  // Each feature's footprint, so the scan above would catch it in a bundle.
  for (const marker of [
    '@oddsquad/vite-plugin-lit',
    'import.meta.hot',
    'lit-plugin:',
  ]) {
    expect(all).toContain(marker);
  }
});
