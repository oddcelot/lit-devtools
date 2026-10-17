import type {Plugin, ViteDevServer} from 'vite';
import {describe, expect, test, vi} from 'vite-plus/test';
import {lit, litDevtools} from '../../astro.js';
import {collectPageTags, injectPageTags} from '../../lib/astro/page-tags.js';

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

  test('adds the shadow root polyfill only when asked', () => {
    const args = setup('build');
    lit({shadowRootPolyfill: true}).hooks['astro:config:setup'](args);
    expect(args.injectScript).toHaveBeenCalledWith(
      'page',
      expect.stringContaining('@webcomponents/template-shadowroot')
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
