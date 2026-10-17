/* @ts-self-types="./astro.d.ts" */
/**
 * The plugin as an Astro integration. Astro runs on Vite, so this adds
 * `litPlugin()` to Astro's Vite config, with the timeline and its panel on,
 * registers Astro's renderer for Lit (`lib/astro/server.ts` and
 * `client.ts`), and puts the panel in Astro's dev toolbar, which takes the
 * place of the Vite DevTools dock there:
 *
 * ```js
 * // astro.config.mjs
 * import lit from '@oddsquad/vite-plugin-lit/astro';
 *
 * export default defineConfig({integrations: [lit()]});
 * ```
 *
 * `litDevtools()` leaves the renderer out, for a site that keeps another. Astro renders pages without Vite's
 * `transformIndexHtml`, so in dev the integration adds the plugin's page
 * runtime to each page itself (`lib/astro/page-tags.ts`). It imports nothing from `astro`: the
 * hook arguments are declared below as the slices it uses.
 *
 * @module
 */
import {fileURLToPath} from 'node:url';
import type {AddressInfo} from 'node:net';
import type {Plugin, ViteDevServer} from 'vite';
import {LIT_LOGO_SVG} from './lib/devframe/icon.js';
import {
  STANDALONE_PANEL_BASE,
  clientAuthDisabled,
} from './lib/devframe/standalone-panel.js';
import {
  ASTRO_TOOLBAR_APP_ID,
  type AstroToolbarAuth,
} from './lib/astro/toolbar-protocol.js';
import {pageTagsMiddleware} from './lib/astro/page-tags.js';
import {type LitPluginOptions, litPlugin} from './lib/plugin.js';

export interface LitAstroOptions extends LitPluginOptions {
  /**
   * Render Lit components on the server and hydrate them, as Astro's
   * renderer for Lit. Needs `@lit-labs/ssr` and `@lit-labs/ssr-client`.
   * Turn it off to keep another Lit renderer and take only HMR and the
   * DevTools ({@link litDevtools} does that). Defaults to `true`.
   */
  render?: boolean;
  /**
   * Load a polyfill for declarative shadow DOM in browsers without it, from
   * `@webcomponents/template-shadowroot`, which you then install. Every
   * current browser parses it natively. Defaults to `false`.
   */
  shadowRootPolyfill?: boolean;
  /**
   * Put the Lit panel in Astro's dev toolbar. Needs the panel, so it does
   * nothing with `timeline: false`. Defaults to `true`.
   */
  toolbar?: boolean;
}

interface AstroLogger {
  info(message: string): void;
}

/** The slices of Astro's integration hook arguments this integration uses. */
interface ConfigSetup {
  command: 'dev' | 'build' | 'preview' | 'sync';
  updateConfig: (config: {
    vite: {plugins?: Plugin[]; optimizeDeps?: {include: string[]}};
  }) => unknown;
  addRenderer: (renderer: {
    name: string;
    serverEntrypoint: string;
    clientEntrypoint: string;
  }) => void;
  injectScript: (stage: 'page' | 'before-hydration', content: string) => void;
  addDevToolbarApp: (app: {
    id: string;
    name: string;
    icon: string;
    entrypoint: string;
  }) => void;
}

interface ServerSetup {
  server: ViteDevServer;
  toolbar: {
    send(event: string, payload: unknown): void;
    on(event: string, callback: (payload: unknown) => void): void;
  };
}

interface ServerStart {
  address: AddressInfo;
  logger: AstroLogger;
}

export interface LitAstroIntegration {
  name: string;
  hooks: {
    'astro:config:setup': (options: ConfigSetup) => void;
    'astro:server:setup': (options: ServerSetup) => void;
    'astro:server:start': (options: ServerStart) => void;
  };
}

const TOOLBAR_ENTRY = fileURLToPath(
  new URL('./lib/astro/toolbar-app.js', import.meta.url)
);

/** Lit's hydrate support, which must load before LitElement does. */
const HYDRATE_SUPPORT = '@lit-labs/ssr-client/lit-element-hydrate-support.js';

/**
 * What the renderer's pages load first: Lit's hydrate support, then
 * `lib/astro/boot.ts`. The support is imported here, not by the boot
 * module, so it resolves from the project, as the project's own Lit does:
 * from the plugin's directory it can find a second copy of Lit.
 */
const BOOT = `import '${HYDRATE_SUPPORT}';
import '@oddsquad/vite-plugin-lit/astro/boot';`;

// Only where the browser can't parse declarative shadow roots itself.
const SHADOW_ROOT_POLYFILL = `
if (!Object.hasOwn(HTMLTemplateElement.prototype, 'shadowRootMode')) {
  import('@webcomponents/template-shadowroot/template-shadowroot.js').then(
    ({hydrateShadowRoots}) => hydrateShadowRoots(document.body)
  );
}`;

/**
 * Lit in Astro: renders Lit components on the server and hydrates them,
 * hot-patches them in dev, and puts the Lit panel in the dev toolbar.
 */
export const lit = (options: LitAstroOptions = {}): LitAstroIntegration => {
  const {
    render = true,
    shadowRootPolyfill = false,
    toolbar = true,
    ...pluginOptions
  } = options;
  const timeline = pluginOptions.timeline ?? true;
  const withToolbar = toolbar && timeline;
  const plugins = litPlugin({...pluginOptions, timeline});
  return {
    name: '@oddsquad/vite-plugin-lit/astro',
    hooks: {
      'astro:config:setup': ({
        command,
        updateConfig,
        addRenderer,
        injectScript,
        addDevToolbarApp,
      }) => {
        updateConfig({vite: {plugins}});
        if (render) {
          // Pre-bundled with the project's Lit from the start, rather than
          // found on the first page load, which reloads the page.
          updateConfig({vite: {optimizeDeps: {include: [HYDRATE_SUPPORT]}}});
          addRenderer({
            name: '@oddsquad/vite-plugin-lit',
            serverEntrypoint: '@oddsquad/vite-plugin-lit/astro/server',
            clientEntrypoint: '@oddsquad/vite-plugin-lit/astro/client',
          });
          // Both: a page without islands loads only `page` scripts, and an
          // island may hydrate before them.
          injectScript('page', BOOT);
          injectScript('before-hydration', BOOT);
          if (shadowRootPolyfill) injectScript('page', SHADOW_ROOT_POLYFILL);
        }
        if (command !== 'dev' || !withToolbar) return;
        addDevToolbarApp({
          id: ASTRO_TOOLBAR_APP_ID,
          name: 'Lit DevTools',
          icon: LIT_LOGO_SVG,
          entrypoint: TOOLBAR_ENTRY,
        });
      },
      'astro:server:setup': ({server, toolbar: messages}) => {
        server.middlewares.use(pageTagsMiddleware(plugins, server));
        if (!withToolbar) return;
        messages.on(`${ASTRO_TOOLBAR_APP_ID}:auth-request`, () => {
          const auth: AstroToolbarAuth = {
            required: !clientAuthDisabled(server),
          };
          messages.send(`${ASTRO_TOOLBAR_APP_ID}:auth`, auth);
        });
      },
      // Astro prints its own banner rather than Vite's URLs, which is where
      // the plugin adds the panel's.
      'astro:server:start': ({address, logger}) => {
        if (!timeline) return;
        logger.info(
          `Lit DevTools: http://localhost:${address.port}${STANDALONE_PANEL_BASE}`
        );
      },
    },
  };
};

/**
 * HMR and the Lit panel, without the renderer: for a site that keeps
 * another Lit renderer, such as `@awesome.me/astro-lit`.
 */
export const litDevtools = (
  options: Omit<LitAstroOptions, 'render' | 'shadowRootPolyfill'> = {}
): LitAstroIntegration => lit({...options, render: false});

/** For Astro's container API: the renderer, as `renderers` takes it. */
export const getContainerRenderer = (): {
  name: string;
  serverEntrypoint: string;
} => ({
  name: '@oddsquad/vite-plugin-lit',
  serverEntrypoint: '@oddsquad/vite-plugin-lit/astro/server',
});

export default lit;
