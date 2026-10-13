import {readFileSync} from 'node:fs';
import {dirname, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {init, parse} from 'es-module-lexer';
import {describe, expect, test} from 'vite-plus/test';
import {litCss} from '../../build.js';

/**
 * `vite-plugin-lit/build` exists so a production build never imports dev-only
 * code. These tests walk its static and dynamic import graph from source,
 * skipping type-only imports (erased from the published JS), and pin both
 * ends: which of our files it reaches, and which packages.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const ALLOWED_FILES = [
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
const ALLOWED_PACKAGES = ['lightningcss', 'magic-string', 'vite'];

const importGraph = async () => {
  await init();
  const files = new Set<string>();
  const packages = new Set<string>();
  const visit = async (file: string): Promise<void> => {
    if (files.has(file)) return;
    files.add(file);
    const [imports] = parse(readFileSync(file, 'utf8'));
    for (const entry of imports) {
      if (entry.type === 'import-meta') continue;
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
  await visit(resolve(SRC, 'build.ts'));
  return {
    files: [...files].map((f) => relative(SRC, f)).sort(),
    packages: [...packages].sort(),
  };
};

describe('vite-plugin-lit/build', () => {
  test('imports only the build-time plugins and their helpers', async () => {
    const {files, packages} = await importGraph();
    expect(files).toEqual(ALLOWED_FILES);
    expect(packages).toEqual(ALLOWED_PACKAGES);
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
