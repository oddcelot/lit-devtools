import {build, createServer} from 'vite';
import {afterAll, expect, test} from 'vite-plus/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import {litPlugin, type LitPluginOptions} from '../../index.js';
import {scanSources} from '../../lib/component-docs/scan.js';
import {manifestText} from '../../lib/component-docs/manifest-file.js';
import {fsp, joinPath, tmpRoot} from './utils.js';

const PACKAGE_ROOT = joinPath(import.meta.dirname, '../../..');

/**
 * The `manifest` option end to end: real `vite build` and dev-server runs
 * over a small library, each output read back from where it lands.
 */

const SOURCES: Record<string, string> = {
  'package.json': '{\n  "name": "x-lib",\n  "type": "module"\n}\n',
  'index.html':
    '<!doctype html>\n<html>\n<head><script type="module" src="/src/x-a.ts"></script></head>\n' +
    '<body><x-a></x-a></body>\n</html>\n',
  'src/base.ts': `
    import {LitElement} from 'lit';
    import {property} from 'lit/decorators.js';
    /** @slot - The content. */
    export class Base extends LitElement {
      /** The value. */
      @property() value = '';
    }
  `,
  'src/x-a.ts': `
    import {customElement, property} from 'lit/decorators.js';
    import {Base} from './base.js';
    /** @summary An element. */
    @customElement('x-a')
    export class XA extends Base {
      /** The label. */
      @property() label: string = 'hi';
    }
  `,
};

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(
    roots.map((root) => fsp.rm(root, {recursive: true, force: true}))
  );
});

const fixture = async (): Promise<string> => {
  const root = tmpRoot('manifest');
  roots.push(root);
  for (const [name, code] of Object.entries(SOURCES)) {
    await fsp.mkdir(joinPath(root, name, '..'), {recursive: true});
    await fsp.writeFile(joinPath(root, name), code);
  }
  return root;
};

const buildLib = async (
  root: string,
  manifest?: LitPluginOptions['manifest'],
  output: {preserveModules?: boolean} = {}
) => {
  await build({
    root,
    logLevel: 'silent',
    configFile: false,
    plugins: [litPlugin({manifest, timeline: false})],
    build: {
      lib: {entry: joinPath(root, 'src/x-a.ts'), formats: ['es']},
      rollupOptions: {
        external: [/^lit/],
        output: output.preserveModules
          ? {preserveModules: true, preserveModulesRoot: 'src'}
          : {},
      },
      minify: false,
    },
  });
  return fsp.readdir(joinPath(root, 'dist'));
};

const readJson = async (file: string) =>
  JSON.parse(await fsp.readFile(file, 'utf8')) as Record<string, unknown>;

interface Declaration {
  name: string;
  tagName?: string;
  members?: {name: string; inheritedFrom?: unknown}[];
  slots?: unknown[];
}

const declarations = (manifest: Record<string, unknown>) =>
  (manifest.modules as {path: string; declarations: Declaration[]}[]).map(
    (m) => [m.path, m.declarations.map((d) => d.name)]
  );

test('vite build emits the manifest beside the bundle', async () => {
  const root = await fixture();
  expect(await buildLib(root, true)).toContain('custom-elements.json');
  const manifest = await readJson(joinPath(root, 'dist/custom-elements.json'));
  expect(manifest.schemaVersion).toBe('2.1.0');
  // One bundle: both source modules are the file a consumer imports.
  expect(declarations(manifest)).toEqual([['dist/x-lib.js', ['Base', 'XA']]]);
  const [module] = manifest.modules as {
    declarations: Declaration[];
    exports: {kind: string; name: string}[];
  }[];
  const xa = module.declarations[1];
  expect(xa.tagName).toBe('x-a');
  expect(xa.members).toEqual([
    expect.objectContaining({name: 'label', type: {text: 'string'}}),
    expect.objectContaining({
      name: 'value',
      inheritedFrom: {name: 'Base', module: 'dist/x-lib.js'},
    }),
  ]);
  // The bundle exports XA; Base stays inside it.
  expect(module.exports.map((e) => [e.kind, e.name])).toEqual([
    ['js', 'XA'],
    ['custom-element-definition', 'x-a'],
  ]);
  // Nothing is written outside the build output.
  await expect(
    fsp.readFile(joinPath(root, 'custom-elements.json'))
  ).rejects.toThrow();
});

test('with preserveModules each source module is its own file', async () => {
  const root = await fixture();
  const emitted = await buildLib(root, true, {preserveModules: true});
  const manifest = await readJson(joinPath(root, 'dist/custom-elements.json'));
  const modules = manifest.modules as {
    path: string;
    declarations: Declaration[];
    exports: {kind: string; name: string}[];
  }[];
  // Lib mode names the files; each module names the one it became.
  expect(modules.map((m) => m.declarations.map((d) => d.name))).toEqual([
    ['XA'],
    ['Base'],
  ]);
  for (const module of modules)
    expect(emitted).toContain(module.path.replace('dist/', ''));
  expect(modules[1].exports.map((e) => [e.kind, e.name])).toEqual([
    ['js', 'Base'],
  ]);
});

test('a module tree-shaken out of the bundle is left out', async () => {
  const root = await fixture();
  await fsp.writeFile(
    joinPath(root, 'src/unused.ts'),
    `import {LitElement} from 'lit';\nexport class Unused extends LitElement {}\n`
  );
  const xa = joinPath(root, 'src/x-a.ts');
  await fsp.writeFile(
    xa,
    `import './unused.js';\n${await fsp.readFile(xa, 'utf8')}`
  );
  await buildLib(root, true);
  const manifest = await readJson(joinPath(root, 'dist/custom-elements.json'));
  expect(declarations(manifest)).toEqual([['dist/x-lib.js', ['Base', 'XA']]]);
});

test('a build without the option emits none', async () => {
  const root = await fixture();
  expect(await buildLib(root)).not.toContain('custom-elements.json');
});

test('write keeps a file in the project and points package.json at it', async () => {
  const root = await fixture();
  const emitted = await buildLib(root, {
    build: false,
    write: 'docs/elements.json',
  });
  expect(emitted).not.toContain('custom-elements.json');
  const manifest = await readJson(joinPath(root, 'docs/elements.json'));
  expect(declarations(manifest)).toEqual([['dist/x-lib.js', ['Base', 'XA']]]);
  const pkg = await readJson(joinPath(root, 'package.json'));
  expect(pkg).toEqual({
    name: 'x-lib',
    type: 'module',
    customElements: 'docs/elements.json',
  });
});

test('a customElements field already set is left alone', async () => {
  const root = await fixture();
  await fsp.writeFile(
    joinPath(root, 'package.json'),
    '{"type": "module", "customElements": "dist/custom-elements.json"}\n'
  );
  await buildLib(root, {write: true});
  expect((await readJson(joinPath(root, 'package.json'))).customElements).toBe(
    'dist/custom-elements.json'
  );
  await fsp.readFile(joinPath(root, 'custom-elements.json'));
});

test('the dev server serves, links and writes the modules it has transformed', async () => {
  const root = await fixture();
  const server = await createServer({
    root,
    logLevel: 'silent',
    configFile: false,
    server: {port: 0, strictPort: false, ws: false},
    plugins: [litPlugin({manifest: {write: true}, timeline: false})],
  });
  try {
    await server.listen();
    const html = await server.transformIndexHtml('/', SOURCES['index.html']);
    expect(html).toContain(
      '<link rel="custom-elements-manifest" href="/custom-elements.json">'
    );
    await server.transformRequest('/src/x-a.ts');
    await server.transformRequest('/src/base.ts');
    const address = server.httpServer!.address() as {port: number};
    const response = await fetch(
      `http://localhost:${address.port}/custom-elements.json`
    );
    expect(response.headers.get('content-type')).toBe('application/json');
    const served = (await response.json()) as Record<string, unknown>;
    expect(declarations(served)).toEqual([
      ['src/base.ts', ['Base']],
      ['src/x-a.ts', ['XA']],
    ]);
    const file = joinPath(root, 'custom-elements.json');
    await expect
      .poll(async () => fsp.readFile(file, 'utf8').catch(() => ''), {
        timeout: 5000,
      })
      .toBe(`${JSON.stringify(served, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

test('a written copy at the endpoint URL is linked once', async () => {
  const root = await fixture();
  await fsp.writeFile(
    joinPath(root, 'package.json'),
    '{"type": "module", "customElements": "custom-elements.json"}\n'
  );
  await fsp.writeFile(
    joinPath(root, 'custom-elements.json'),
    '{"schemaVersion": "2.1.0", "modules": []}\n'
  );
  const server = await createServer({
    root,
    logLevel: 'silent',
    configFile: false,
    server: {middlewareMode: true, ws: false},
    plugins: [litPlugin({manifest: {write: true}, timeline: true})],
  });
  try {
    const html = await server.transformIndexHtml('/', SOURCES['index.html']);
    expect(html.match(/rel="custom-elements-manifest"[^>]*/g)).toEqual([
      'rel="custom-elements-manifest" href="/custom-elements.json"',
    ]);
  } finally {
    await server.close();
  }
});

/** The fixture with its base behind a `vite.config` alias and a stray file outside `src`. */
const aliasedFixture = async (): Promise<string> => {
  const root = await fixture();
  await fsp.writeFile(
    joinPath(root, 'vite.config.mjs'),
    `export default {resolve: {alias: {'@base': '/src/base.ts'}}};\n`
  );
  const xa = joinPath(root, 'src/x-a.ts');
  await fsp.writeFile(
    xa,
    (await fsp.readFile(xa, 'utf8')).replace("'./base.js'", "'@base'")
  );
  await fsp.writeFile(joinPath(root, 'other.ts'), 'export class Other {}\n');
  await fsp.writeFile(joinPath(root, 'src/types.d.ts'), 'declare class D {}\n');
  return root;
};

test('scanning reads every script under the folders, through the config', async () => {
  const root = await aliasedFixture();
  const {index, files} = await scanSources({root, dirs: ['src']});
  expect(files).toBe(2);
  const manifest = JSON.parse(manifestText(index, root)) as Record<
    string,
    unknown
  >;
  expect(declarations(manifest)).toEqual([
    ['src/base.ts', ['Base']],
    ['src/x-a.ts', ['XA']],
  ]);
  const xa = (manifest.modules as {declarations: Declaration[]}[])[1]
    .declarations[0];
  expect(xa.members?.map((m) => m.name)).toEqual(['label', 'value']);
});

test('without the config the alias does not resolve, and inheritance stops', async () => {
  const root = await aliasedFixture();
  const {index} = await scanSources({root, dirs: ['src'], configFile: false});
  const manifest = JSON.parse(manifestText(index, root)) as Record<
    string,
    unknown
  >;
  const xa = (manifest.modules as {declarations: Declaration[]}[])[1]
    .declarations[0];
  expect(xa.members?.map((m) => m.name)).toEqual(['label']);
});

test('lit-devtools manifest writes the file', async () => {
  const root = await aliasedFixture();
  const exec = promisify(execFile);
  const {stdout} = await exec(process.execPath, [
    joinPath(PACKAGE_ROOT, 'bin.mjs'),
    'manifest',
    root,
    '--src',
    'src',
    '--src',
    '.',
    '--out',
    'elements.json',
  ]);
  expect(stdout).toContain('wrote elements.json');
  const manifest = await readJson(joinPath(root, 'elements.json'));
  expect(declarations(manifest).map(([path]) => path)).toEqual([
    'other.ts',
    'src/base.ts',
    'src/x-a.ts',
  ]);
  expect((await readJson(joinPath(root, 'package.json'))).customElements).toBe(
    'elements.json'
  );
});

/** A dev server over `root`, listening, with the manifest it serves. */
const devServer = async (
  root: string,
  manifest: LitPluginOptions['manifest']
) => {
  const server = await createServer({
    root,
    logLevel: 'silent',
    configFile: false,
    server: {port: 0, strictPort: false, ws: false},
    plugins: [litPlugin({manifest, timeline: false})],
  });
  await server.listen();
  const {port} = server.httpServer!.address() as {port: number};
  const served = async () =>
    declarations(
      (await (
        await fetch(`http://localhost:${port}/custom-elements.json`)
      ).json()) as Record<string, unknown>
    );
  return {server, served};
};

test('the dev server lists what src holds before any page loads it', async () => {
  const root = await fixture();
  const {server, served} = await devServer(root, true);
  try {
    await expect.poll(served, {timeout: 5000}).toEqual([
      ['src/base.ts', ['Base']],
      ['src/x-a.ts', ['XA']],
    ]);
    // What the watcher reports, for the message when the file isn't seen.
    const events: string[] = [];
    server.watcher.on('all', (event, file) => {
      if (file.includes(root))
        events.push(`${event} ${file.slice(root.length)}`);
    });
    server.watcher.on('error', (error) =>
      events.push(`error ${String(error)}`)
    );
    server.watcher.on('raw', (event, file, details) =>
      events.push(
        `raw ${event} ${String(file)} ${JSON.stringify(details).slice(0, 120)}`
      )
    );
    // Inherited members resolve through the dev server's own resolver.
    await fsp.writeFile(
      joinPath(root, 'src/x-b.ts'),
      `import {Base} from './base.js';\nexport class XB extends Base {}\ncustomElements.define('x-b', XB);\n`
    );
    await expect
      .poll(served, {timeout: 5000})
      .toContainEqual(['src/x-b.ts', ['XB']])
      .catch((error: Error) => {
        const watched = Object.keys(server.watcher.getWatched()).filter((dir) =>
          dir.includes(root)
        );
        const limits = ['max_user_watches', 'max_user_instances'].map(
          (name) => {
            try {
              return `${name}=${readFileSync(`/proc/sys/fs/inotify/${name}`, 'utf8').trim()}`;
            } catch {
              return `${name}=?`;
            }
          }
        );
        const watcher = server.watcher as unknown as {
          options?: Record<string, unknown>;
          _isIgnored?: (path: string) => boolean;
        };
        const options = JSON.stringify(watcher.options, (_, value: unknown) =>
          typeof value === 'function'
            ? `fn:${String(value).slice(0, 80)}`
            : value
        );
        const ignored = watcher._isIgnored?.(joinPath(root, 'src/x-b.ts'));
        error.message += `\nwatcher events: ${JSON.stringify(events)}\nwatched: ${JSON.stringify(watched)}\ninotify: ${limits.join(' ')}\ncacheDir: ${server.config.cacheDir}\nwatch config: ${JSON.stringify(server.config.server.watch)}\nchokidar options: ${options}\nx-b ignored: ${String(ignored)}`;
        throw error;
      });
    await fsp.rm(joinPath(root, 'src/base.ts'));
    await expect.poll(served, {timeout: 5000}).toEqual([
      ['src/x-a.ts', ['XA']],
      ['src/x-b.ts', ['XB']],
    ]);
  } finally {
    await server.close();
  }
});

test('scan: false lists only what pages load', async () => {
  const root = await fixture();
  const {server, served} = await devServer(root, {scan: false});
  try {
    expect(await served()).toEqual([]);
    await server.transformRequest('/src/base.ts');
    expect(await served()).toEqual([['src/base.ts', ['Base']]]);
  } finally {
    await server.close();
  }
});

/** The fixture, reached through a symlink, as macOS `/tmp` or a linked workspace is. */
const linkedFixture = async (): Promise<string> => {
  const real = await fixture();
  const link = `${real}-link`;
  await fsp.symlink(real, link, 'dir');
  roots.push(link);
  return link;
};

const inheritedValue = (manifest: Record<string, unknown>) => {
  const xa = (manifest.modules as {declarations: Declaration[]}[])
    .flatMap((m) => m.declarations)
    .find((d) => d.tagName === 'x-a');
  return xa?.members?.find((m) => m.name === 'value')?.inheritedFrom;
};

test('through a symlinked root, paths and inheritance hold', async () => {
  const root = await linkedFixture();
  const {index} = await scanSources({root, dirs: ['src']});
  const scanned = JSON.parse(manifestText(index, root)) as Record<
    string,
    unknown
  >;
  expect(declarations(scanned)).toEqual([
    ['src/base.ts', ['Base']],
    ['src/x-a.ts', ['XA']],
  ]);
  expect(inheritedValue(scanned)).toEqual({
    name: 'Base',
    module: 'src/base.ts',
  });

  await buildLib(root, true);
  const built = await readJson(joinPath(root, 'dist/custom-elements.json'));
  expect(inheritedValue(built)).toEqual({
    name: 'Base',
    module: 'dist/x-lib.js',
  });

  const {server, served} = await devServer(root, true);
  try {
    await expect.poll(served, {timeout: 5000}).toEqual([
      ['src/base.ts', ['Base']],
      ['src/x-a.ts', ['XA']],
    ]);
    // A page's transform and the scan land on the same entry.
    await server.transformRequest('/src/x-a.ts');
    expect(await served()).toHaveLength(2);
    await fsp.rm(joinPath(root, 'src/base.ts'));
    await expect
      .poll(served, {timeout: 5000})
      .toEqual([['src/x-a.ts', ['XA']]]);
  } finally {
    await server.close();
  }
});

test('a barrel entry exports the classes it re-exports', async () => {
  const root = await fixture();
  await fsp.writeFile(
    joinPath(root, 'src/index.ts'),
    `export * from './x-a.js';\nexport {Base as Root} from './base.js';\n`
  );
  await build({
    root,
    logLevel: 'silent',
    configFile: false,
    plugins: [litPlugin({manifest: true, timeline: false})],
    build: {
      lib: {entry: joinPath(root, 'src/index.ts'), formats: ['es']},
      rollupOptions: {external: [/^lit/]},
      minify: false,
    },
  });
  const built = await readJson(joinPath(root, 'dist/custom-elements.json'));
  const [module] = built.modules as {
    path: string;
    exports: {kind: string; name: string; declaration: {name: string}}[];
  }[];
  expect(module.path).toBe('dist/x-lib.js');
  // The barrel's re-export of XA and XA's own export are one; sources go
  // by path, so the barrel's come first.
  expect(
    module.exports.map((e) => [e.kind, e.name, e.declaration.name])
  ).toEqual([
    ['js', 'XA', 'XA'],
    ['js', 'Root', 'Base'],
    ['custom-element-definition', 'x-a', 'XA'],
  ]);

  const {index} = await scanSources({root, dirs: ['src']});
  const scanned = JSON.parse(manifestText(index, root)) as {
    modules: {path: string; exports: {name: string; declaration: unknown}[]}[];
  };
  expect(
    scanned.modules.find((m) => m.path === 'src/index.ts')?.exports
  ).toEqual([
    {kind: 'js', name: 'XA', declaration: {name: 'XA', module: 'src/x-a.ts'}},
    {
      kind: 'js',
      name: 'Root',
      declaration: {name: 'Base', module: 'src/base.ts'},
    },
  ]);
});
