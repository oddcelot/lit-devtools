import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {presetWind3, presetWind4} from 'unocss';
import type {Plugin, ResolvedConfig, ViteDevServer} from 'vite';
import {afterEach, beforeEach, describe, expect, test} from 'vite-plus/test';
import {unoSheet} from '../../lib/uno-sheet.js';

/**
 * `unoSheet()` against the real UnoCSS generator: a project in a temp dir,
 * with the plugin's hooks called the way Vite calls them.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'uno-sheet-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(
    join(root, 'src/card.ts'),
    "html`<div class='p-4 text-red-500'></div>`;\n"
  );
});

afterEach(() => {
  rmSync(root, {recursive: true, force: true});
});

type Hook = (this: unknown, ...args: never[]) => unknown;

/** Calls a plugin hook whether Vite would see it as a function or an object. */
const call = async (plugin: Plugin, name: keyof Plugin, ...args: unknown[]) => {
  const hook = plugin[name] as Hook | {handler: Hook} | undefined;
  const fn = typeof hook === 'function' ? hook : hook?.handler;
  return fn?.call({}, ...(args as never[]));
};

const start = async (options: {serve: boolean}) => {
  const plugin = unoSheet({
    config: {presets: [presetWind3({preflight: false})]},
    outFile: 'src/uno.css',
  });
  await call(plugin, 'configResolved', {root} as ResolvedConfig);
  if (options.serve) {
    await call(plugin, 'configureServer', {} as ViteDevServer);
  }
  await call(plugin, 'buildStart');
  return plugin;
};

const sheet = () => readFileSync(join(root, 'src/uno.css'), 'utf8');

describe('unoSheet', () => {
  test('writes the utilities found under src/ on start', async () => {
    await start({serve: false});
    expect(sheet()).toContain('.p-4');
    expect(sheet()).toContain('.text-red-500');
  });

  test('leaves the preflight reset out', async () => {
    const plugin = unoSheet({
      config: {presets: [presetWind3()]},
      outFile: 'src/uno.css',
    });
    await call(plugin, 'configResolved', {root} as ResolvedConfig);
    await call(plugin, 'buildStart');
    expect(sheet()).not.toContain('box-sizing');
  });

  test.each([false, true])(
    'emits wind4 theme variables only with preflights: %s',
    async (preflights) => {
      const plugin = unoSheet({
        config: {presets: [presetWind4({preflights: {reset: false}})]},
        outFile: 'src/uno.css',
        preflights,
      });
      await call(plugin, 'configResolved', {root} as ResolvedConfig);
      await call(plugin, 'buildStart');
      expect(sheet()).toContain('.p-4');
      expect(sheet().includes('--spacing:')).toBe(preflights);
      expect(sheet()).not.toContain('box-sizing');
    }
  );

  test('adds a class from an edited module in dev', async () => {
    const plugin = await start({serve: true});
    await call(
      plugin,
      'transform',
      "html`<p class='mt-2'></p>`;",
      join(root, 'src/card.ts')
    );
    expect(sheet()).toContain('.mt-2');
    expect(sheet()).toContain('.p-4');
  });

  test('does not regenerate during a build', async () => {
    const plugin = await start({serve: false});
    await call(
      plugin,
      'transform',
      "html`<p class='mt-2'></p>`;",
      join(root, 'src/card.ts')
    );
    expect(sheet()).not.toContain('.mt-2');
  });

  test('skips its own output and node_modules', async () => {
    const plugin = await start({serve: true});
    await call(plugin, 'transform', '.mt-2 {}', join(root, 'src/uno.css'));
    await call(
      plugin,
      'transform',
      "'mb-8'",
      join(root, 'node_modules/x/index.js')
    );
    expect(sheet()).not.toContain('.mt-2');
    expect(sheet()).not.toContain('.mb-8');
  });
});
