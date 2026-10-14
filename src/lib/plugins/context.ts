import type {Plugin} from 'vite';
import {loadPluginEnv} from '../env.js';
import {
  type LitPluginOptions,
  type ResolvedOptions,
  resolveOptions,
} from '../options.js';
import {
  type SourceLocator,
  createSourceLocator,
  sourceRootsOf,
} from '../source-locator.js';
import {JS_FILE_RE} from './shared.js';

/**
 * The one place plugin options are resolved. Feature plugins hold a reference
 * to it, read {@link OptionsContext.get} inside their hooks, and gate
 * themselves on the result, so no plugin is chosen from options at
 * construction time (env is only loaded once Vite hands over the mode).
 */
export interface OptionsContext {
  /**
   * Always-applied, `enforce: 'pre'` plugin that loads the env and resolves
   * the options in its `config` hook, and builds the source locator in
   * `configResolved`. Register it first.
   */
  readonly plugin: Plugin;
  /**
   * The resolved options. Before the `config` hook has run this is a pass
   * against an empty env (explicit options and defaults only), which covers
   * a plugin driven without Vite.
   */
  get(): ResolvedOptions;
  /**
   * Source paths over Vite's root and `server.fs.allow`. Before
   * `configResolved` it has no roots: paths pass through unchanged and
   * nothing resolves.
   */
  locator(): SourceLocator;
  /**
   * The guard every source transform shares: not an SSR pass, not a virtual
   * or encoded-virtual id, not under `node_modules`, and either a JS/TS file
   * or an inline script extracted from HTML (`?html-proxy`).
   */
  shouldTransform(id: string, transformOptions?: {ssr?: boolean}): boolean;
}

const SKIPPED_ID = /^\0|__x00__|lit-plugin:|[\\/]node_modules[\\/]/;

export const createOptionsContext = (
  options: LitPluginOptions
): OptionsContext => {
  let resolved: ResolvedOptions | undefined;
  let locator = createSourceLocator([]);

  const plugin: Plugin = {
    name: 'lit-plugin-options',
    enforce: 'pre',
    config(viteConfig, {mode}) {
      resolved = resolveOptions(options, loadPluginEnv(viteConfig, mode));
    },
    configResolved(config) {
      locator = createSourceLocator(sourceRootsOf(config));
    },
  };

  return {
    plugin,
    get: () => (resolved ??= resolveOptions(options, {})),
    locator: () => locator,
    shouldTransform(id, transformOptions) {
      if (transformOptions?.ssr) return false;
      if (SKIPPED_ID.test(id)) return false;
      const query = id.indexOf('?');
      const file = query === -1 ? id : id.slice(0, query);
      return (
        JS_FILE_RE.test(file) ||
        (query !== -1 && id.slice(query).includes('html-proxy'))
      );
    },
  };
};
