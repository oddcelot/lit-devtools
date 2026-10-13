import type {Plugin} from 'vite';
import {afterEach, describe, expect, test, vi} from 'vite-plus/test';
import {litPlugin} from '../../lib/plugin.js';
import {type LazyPluginShape, lazyServePlugin} from '../../lib/plugins/lazy.js';

type Hook = (...args: unknown[]) => unknown;

const SHAPE: LazyPluginShape = {
  name: 'lit-test',
  enforce: 'pre',
  hooks: {transform: {}, transformIndexHtml: {order: 'pre'}},
};

const realPlugin = (overrides: Partial<Plugin> = {}): Plugin => ({
  name: 'lit-test',
  apply: 'serve',
  enforce: 'pre',
  transform: (code: string) => `${code}!`,
  transformIndexHtml: {order: 'pre', handler: () => [{tag: 'x'}]},
  ...overrides,
});

const configOf = (plugin: Plugin) =>
  (plugin.config as Hook)({}, {command: 'serve', mode: 'development'});

describe('lazyServePlugin', () => {
  test('carries what Vite reads before loading: name, apply, enforce, order', () => {
    const shell = lazyServePlugin(SHAPE, async () => realPlugin());
    expect(shell.name).toBe('lit-test');
    expect(shell.apply).toBe('serve');
    expect(shell.enforce).toBe('pre');
    expect(shell.transformIndexHtml).toMatchObject({order: 'pre'});
    expect(shell).not.toHaveProperty('resolveId');
  });

  test('loads nothing until a hook runs, then loads once in config', async () => {
    const load = vi.fn(async () => realPlugin());
    const shell = lazyServePlugin(SHAPE, load);
    expect(load).not.toHaveBeenCalled();
    await configOf(shell);
    await configOf(shell);
    expect(load).toHaveBeenCalledOnce();
  });

  test('forwards hooks synchronously once loaded', async () => {
    const shell = lazyServePlugin(SHAPE, async () => realPlugin());
    await configOf(shell);
    expect((shell.transform as Hook).call({}, 'a', '/a.ts')).toBe('a!');
    const html = shell.transformIndexHtml as {handler: Hook};
    expect(html.handler.call({}, '', {})).toEqual([{tag: 'x'}]);
  });

  test('a hook called before config loads the plugin first', async () => {
    const shell = lazyServePlugin(SHAPE, async () => realPlugin());
    await expect(
      (shell.transform as Hook).call({}, 'a', '/a.ts')
    ).resolves.toBe('a!');
  });

  test('passes the plugin context through as `this`', async () => {
    const shell = lazyServePlugin(
      {name: 'lit-test', hooks: {load: {}}},
      async () =>
        ({
          name: 'lit-test',
          load(this: {tag: string}) {
            return this.tag;
          },
        }) as unknown as Plugin
    );
    await configOf(shell);
    expect((shell.load as Hook).call({tag: 'ctx'}, '/a.ts')).toBe('ctx');
  });

  test('forwards the devtools setup hook', async () => {
    const setup = vi.fn();
    const shell = lazyServePlugin(
      {name: 'lit-test', hooks: {}, devtools: {capabilities: {dev: true}}},
      async () =>
        ({
          name: 'lit-test',
          devtools: {capabilities: {dev: true}, setup},
        }) as Plugin
    );
    const devtools = (shell as {devtools: {capabilities: unknown; setup: Hook}})
      .devtools;
    expect(devtools.capabilities).toEqual({dev: true});
    await devtools.setup('hub');
    expect(setup).toHaveBeenCalledWith('hub');
  });

  describe('rejects a real plugin that drifted from its shape', () => {
    test.each([
      [
        'an undeclared hook',
        {configureServer: () => {}},
        /configureServer is not declared/,
      ],
      [
        'a missing declared hook',
        {transform: undefined},
        /transform is missing/,
      ],
      ['a different order', {transformIndexHtml: () => []}, /different order/],
      ['a different enforce', {enforce: 'post'}, /enforce is post/],
      ['a different name', {name: 'other'}, /named other/],
      [
        'a hook option the shell drops',
        {transformIndexHtml: {order: 'pre', filter: {}, handler: () => []}},
        /transformIndexHtml sets filter, which the shell drops/,
      ],
    ] as const)('%s', async (_, overrides, message) => {
      const shell = lazyServePlugin(SHAPE, async () =>
        realPlugin(overrides as Partial<Plugin>)
      );
      await expect(configOf(shell)).rejects.toThrow(message);
    });

    test('different devtools capabilities', async () => {
      const shell = lazyServePlugin(
        {name: 'lit-test', hooks: {}, devtools: {capabilities: {dev: true}}},
        async () =>
          ({
            name: 'lit-test',
            devtools: {capabilities: {dev: false}, setup: () => {}},
          }) as Plugin
      );
      await expect(configOf(shell)).rejects.toThrow(/capabilities differ/);
    });
  });
});

describe('litPlugin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("every lazy plugin's shape matches the plugin it loads", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugins = litPlugin({timeline: true, sourceOverlay: true});
    const lazy = plugins.filter((p) => p.apply === 'serve');
    expect(lazy.map((p) => p.name)).toEqual([
      'lit-private-fields',
      'lit-component-docs',
      'lit-source-overlay',
      'lit-plugin',
      'lit-devtools-workspace',
      'lit-manifest-links',
      'devframe:lit',
    ]);
    for (const plugin of lazy) await configOf(plugin);
  });
});
