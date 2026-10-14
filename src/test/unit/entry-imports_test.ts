import {readFileSync} from 'node:fs';
import {dirname, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {init, parse} from 'es-module-lexer';
import {describe, expect, test} from 'vite-plus/test';
import {litCss} from '../../build.js';

/**
 * Neither entry may load dev-only code into a production build. These tests
 * walk each entry's import graph from source, skipping type-only imports
 * (erased from the published JS), and pin both ends: which of our files it
 * reaches, and which packages.
 *
 * `vite-plugin-lit/build` is walked through dynamic imports too: nothing in
 * it may load dev code at all. The main entry is walked through static
 * imports only: its dev-only plugins are lazy shells whose `import()`s run in
 * a `config` hook that `vite build` never calls.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const BUILD_FILES = [
  'build.ts',
  'lib/css-sheet-build.ts',
  'lib/env.ts',
  'lib/plugins/css-literals.ts',
  'lib/plugins/css-queries.ts',
  'lib/plugins/shared.ts',
  'lib/plugins/timeline-virtual.ts',
];

// `lightningcss` is the consumer's own (Vite's CSS transformer), imported
// only when they configured it.
const BUILD_PACKAGES = ['lightningcss', 'magic-string', 'vite'];

const importGraph = async (entry: string, {dynamic}: {dynamic: boolean}) => {
  await init();
  const files = new Set<string>();
  const packages = new Set<string>();
  const visit = async (file: string): Promise<void> => {
    if (files.has(file)) return;
    files.add(file);
    const [imports] = parse(readFileSync(file, 'utf8'));
    for (const entry of imports) {
      if (entry.type === 'import-meta') continue;
      if (entry.type === 'dynamic' && !dynamic) continue;
      const typeOnly =
        entry.type === 'dynamic' ? entry.probablyTypeOnly : entry.typeOnly;
      if (typeOnly) continue;
      // A computed `import(x)` could load anything; keep the graph checkable.
      const specifier = entry.specifier ?? '<computed import>';
      if (specifier.startsWith('.')) {
        await visit(resolve(dirname(file), specifier.replace(/\.js$/, '.ts')));
      } else if (!specifier.startsWith('node:')) {
        packages.add(specifier);
      }
    }
  };
  await visit(resolve(SRC, entry));
  return {
    files: [...files].map((f) => relative(SRC, f)).sort(),
    packages: [...packages].sort(),
  };
};

describe('vite-plugin-lit/build', () => {
  test('imports only the build-time plugins and their helpers', async () => {
    const {files, packages} = await importGraph('build.ts', {dynamic: true});
    expect(files).toEqual(BUILD_FILES);
    expect(packages).toEqual(BUILD_PACKAGES);
  });

  test('registers no dev-server or DevTools hooks', () => {
    for (const plugin of litCss()) {
      expect(plugin.apply, plugin.name).toBeUndefined();
      expect(plugin, plugin.name).not.toHaveProperty('configureServer');
      expect(plugin, plugin.name).not.toHaveProperty('handleHotUpdate');
      expect(plugin, plugin.name).not.toHaveProperty('devtools');
    }
  });
});

describe('vite-plugin-lit', () => {
  test('loads no dev-only code until the dev server starts', async () => {
    const {files, packages} = await importGraph('index.ts', {dynamic: false});
    expect(files).toEqual([
      'index.ts',
      'lib/confine.ts',
      'lib/css-sheet-build.ts',
      'lib/env.ts',
      'lib/options.ts',
      'lib/plugin.ts',
      'lib/plugins/context.ts',
      'lib/plugins/css-literals.ts',
      'lib/plugins/css-queries.ts',
      'lib/plugins/lazy.ts',
      'lib/plugins/shared.ts',
      'lib/plugins/timeline-virtual.ts',
      // Data tables the options are validated against.
      'lib/runtime/source-overlay/editors.ts',
      'lib/setting-definitions.ts',
      'lib/source-locator.ts',
    ]);
    expect(packages).toEqual(['magic-string', 'vite']);
  });
});
