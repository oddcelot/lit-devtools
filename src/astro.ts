/* @ts-self-types="./astro.d.ts" */
/**
 * The plugin as an Astro integration. Astro runs on Vite, so this adds
 * `litPlugin()` to Astro's Vite config, with the timeline and its panel on,
 * and puts the panel in Astro's dev toolbar, which takes the place of the
 * Vite DevTools dock there:
 *
 * ```js
 * // astro.config.mjs
 * import lit from '@awesome.me/astro-lit';
 * import litDevtools from '@oddsquad/vite-plugin-lit/astro';
 *
 * export default defineConfig({integrations: [lit(), litDevtools()]});
 * ```
 *
 * Server rendering stays with a Lit renderer such as `@awesome.me/astro-lit`;
 * this only brings HMR and the DevTools. Astro renders pages without Vite's
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
  updateConfig: (config: {vite: {plugins: Plugin[]}}) => unknown;
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

export const litDevtools = (
  options: LitAstroOptions = {}
): LitAstroIntegration => {
  const {toolbar = true, ...pluginOptions} = options;
  const timeline = pluginOptions.timeline ?? true;
  const withToolbar = toolbar && timeline;
  const plugins = litPlugin({...pluginOptions, timeline});
  return {
    name: '@oddsquad/vite-plugin-lit/astro',
    hooks: {
      'astro:config:setup': ({command, updateConfig, addDevToolbarApp}) => {
        updateConfig({vite: {plugins}});
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

export default litDevtools;
