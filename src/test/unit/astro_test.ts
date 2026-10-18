import type {Plugin, ViteDevServer} from 'vite';
import {describe, expect, test, vi} from 'vite-plus/test';
import {lit, litDevtools} from '../../astro.js';
import {
  collectPageTags,
  injectPageTags,
  stampIslandUrls,
} from '../../lib/astro/page-tags.js';

/**
 * The Astro integration: what it registers in each command, and the page
 * tags it adds in place of Vite's `transformIndexHtml`, which Astro pages
 * never go through.
 */

const setup = (command: 'dev' | 'build') => {
  const updateConfig = vi.fn();
  const addDevToolbarApp = vi.fn();
  const addRenderer = vi.fn();
  const injectScript = vi.fn();
  // The repo root, where the renderer's peers are installed.
  const config = {root: new URL('../../../', import.meta.url)};
  return {
    command,
    config,
    updateConfig,
    addDevToolbarApp,
    addRenderer,
    injectScript,
  };
};

describe('lit()', () => {
  test('registers the renderer and loads its page script before islands', () => {
    const args = setup('build');
    lit().hooks['astro:config:setup'](args);
    expect(args.addRenderer).toHaveBeenCalledWith({
      name: 'lit',
      serverEntrypoint: '@oddsquad/vite-plugin-lit/astro/server',
      clientEntrypoint: '@oddsquad/vite-plugin-lit/astro/client',
    });
    const stages = args.injectScript.mock.calls.map(([stage]) => stage);
    expect(stages).toEqual(['page', 'before-hydration']);
    // Hydrate support first, so LitElement finds it when it loads.
    expect(args.injectScript.mock.calls[0]![1]).toMatch(
      /^import '@lit-labs\/ssr-client\/lit-element-hydrate-support\.js';/
    );
  });

  test('attaches shadow roots before the boot script only when asked', () => {
    const scripts = (options: {shadowRootPolyfill?: boolean}) => {
      const args = setup('build');
      lit(options).hooks['astro:config:setup'](args);
      return args.injectScript.mock.calls.map(([, code]) => code);
    };
    for (const code of scripts({shadowRootPolyfill: true})) {
      expect(code).toMatch(
        /\/astro\/polyfill';\nimport '@oddsquad\/vite-plugin-lit\/astro\/boot';$/
      );
    }
    for (const code of scripts({})) expect(code).not.toContain('polyfill');
  });
});

describe('pre-bundling', () => {
  const includes = (args: ReturnType<typeof setup>) =>
    args.updateConfig.mock.calls.flatMap(
      ([config]) => config.vite.optimizeDeps?.include ?? []
    );

  test("pre-bundles the page runtime's dependency in dev", () => {
    const dev = setup('dev');
    lit().hooks['astro:config:setup'](dev);
    expect(includes(dev)).toContain(
      '@oddsquad/vite-plugin-lit > devframe/in-page-channel'
    );
    const build = setup('build');
    lit().hooks['astro:config:setup'](build);
    expect(includes(build)).not.toContain(
      '@oddsquad/vite-plugin-lit > devframe/in-page-channel'
    );
    const quiet = setup('dev');
    lit({timeline: false}).hooks['astro:config:setup'](quiet);
    expect(includes(quiet)).not.toContain(
      '@oddsquad/vite-plugin-lit > devframe/in-page-channel'
    );
  });
});

describe('litDevtools()', () => {
  test('adds the plugin with the timeline on, and the toolbar app in dev', () => {
    const args = setup('dev');
    litDevtools().hooks['astro:config:setup'](args);
    const plugins = args.updateConfig.mock.calls[0]![0].vite.plugins;
    expect(plugins.map((p: Plugin) => p.name)).toContain('devframe:lit');
    expect(args.addDevToolbarApp).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'lit-devtools',
        entrypoint: expect.stringMatching(/lib\/astro\/toolbar-app\.js$/),
      })
    );
  });

  test('leaves the renderer to another integration', () => {
    const args = setup('dev');
    litDevtools().hooks['astro:config:setup'](args);
    expect(args.addRenderer).not.toHaveBeenCalled();
    expect(args.injectScript).not.toHaveBeenCalled();
  });

  test('adds no toolbar app to a build', () => {
    const args = setup('build');
    litDevtools().hooks['astro:config:setup'](args);
    expect(args.updateConfig).toHaveBeenCalledOnce();
    expect(args.addDevToolbarApp).not.toHaveBeenCalled();
  });

  test('adds no toolbar app without the panel, or when told not to', () => {
    for (const options of [{timeline: false}, {toolbar: false}]) {
      const args = setup('dev');
      litDevtools(options).hooks['astro:config:setup'](args);
      expect(args.addDevToolbarApp).not.toHaveBeenCalled();
    }
  });
});

describe('page tags', () => {
  const page =
    '<!DOCTYPE html><html><head><title>x</title></head><body><h1>x</h1></body></html>';

  test('go where their injectTo says', () => {
    const out = injectPageTags(page, [
      {
        tag: 'script',
        attrs: {type: 'module', src: '/a.js'},
        injectTo: 'head-prepend',
      },
      {tag: 'link', attrs: {rel: 'x', href: '/m.json'}, injectTo: 'head'},
      {
        tag: 'lit-devtools-hmr-indicator',
        attrs: {count: true},
        children: '',
        injectTo: 'body',
      },
    ]);
    expect(out).toBe(
      '<!DOCTYPE html><html><head><script type="module" src="/a.js"></script>' +
        '<title>x</title><link rel="x" href="/m.json"></head>' +
        '<body><h1>x</h1><lit-devtools-hmr-indicator count></lit-devtools-hmr-indicator></body></html>'
    );
  });

  test("come from the plugins' hooks in order, ignoring rewritten HTML", async () => {
    const plugins = [
      {
        name: 'normal',
        transformIndexHtml: () => [{tag: 'b', injectTo: 'body' as const}],
      },
      {
        name: 'pre',
        transformIndexHtml: {
          order: 'pre' as const,
          handler: () => ({
            html: 'rewritten',
            tags: [{tag: 'a', injectTo: 'body' as const}],
          }),
        },
      },
      {name: 'none', transformIndexHtml: () => undefined},
    ] as Plugin[];
    const tags = await collectPageTags(plugins, page, {
      path: '/',
      filename: '/',
      server: {} as ViteDevServer,
    });
    expect(tags.map((t) => t.tag)).toEqual(['a', 'b']);
  });
});

describe('island URLs', () => {
  const island = (url: string, client = 'load') =>
    `<astro-island uid="1" component-url="${url}" component-export="X" renderer-url="/r.js" client="${client}"></astro-island>`;
  const updated: Record<string, number> = {'/src/x.ts': 42, '/src/q.ts?a=1': 7};
  const lastUpdate = async (url: string) => updated[url];

  test('carry the timestamp of a module that was hot-updated', async () => {
    const out = await stampIslandUrls(
      island('/src/x.ts') + island('/src/x.ts', 'only') + island('/src/y.ts'),
      lastUpdate
    );
    expect(out).toBe(
      island('/src/x.ts?t=42') +
        island('/src/x.ts?t=42', 'only') +
        island('/src/y.ts')
    );
  });

  test('put the timestamp first in a query, as Vite does', async () => {
    expect(await stampIslandUrls(island('/src/q.ts?a=1'), lastUpdate)).toBe(
      island('/src/q.ts?t=7&a=1')
    );
  });

  test('stay plain when the graph does not know the module', async () => {
    const html = island('/src/x.ts');
    expect(
      await stampIslandUrls(html, () => Promise.reject(new Error('gone')))
    ).toBe(html);
  });
});
