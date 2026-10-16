import type {Plugin} from 'vite';
import type {SourceDocsIndex} from './component-docs/source-index.js';
import {
  type LitPluginOptions,
  configuredEditor,
  toFeatureSettings,
} from './options.js';
import {createOptionsContext} from './plugins/context.js';
import {litCssQueries} from './plugins/css-queries.js';
import {litTimelineVirtual} from './plugins/timeline-virtual.js';
import {litCssLiterals} from './plugins/css-literals.js';
import {lazyServePlugin} from './plugins/lazy.js';

export {litCssQueries} from './plugins/css-queries.js';
export {litTimelineVirtual} from './plugins/timeline-virtual.js';
export type {LitPluginOptions} from './options.js';
export {resolveOptions} from './options.js';

/**
 * Vite plugin set providing HMR, CSS helpers, and Lightning CSS processing
 * for Lit projects.
 */
export const litPlugin = (options: LitPluginOptions = {}): Plugin[] => {
  // Explicit options first, env vars second, defaults last. The context
  // resolves against the loaded env in its `config` hook; every hook below
  // reads `ctx.get()` at call time.
  const ctx = createOptionsContext(options);
  // Every feature plugin is registered unconditionally and gates itself on
  // `ctx.get()` inside its hooks: env is only loaded in the context's `config`
  // hook, after this array is built, so nothing can be chosen from options
  // here. The context's plugin goes first so it resolves before the others.
  //
  // The dev-only plugins are lazy shells: their code, and the DevTools panel's,
  // is imported in their `config` hook, which `vite build` never calls. Each
  // shell declares the hooks its plugin defines and checks them on load.
  //
  // The project's own components, documented from source as Vite transforms
  // them; read by the devframe's `componentDocs` action. Shared by the
  // component-docs and devframe plugins, so loaded once for both.
  let sourceDocs: Promise<SourceDocsIndex> | undefined;
  const loadSourceDocs = () =>
    (sourceDocs ??= import('./component-docs/source-index.js').then((m) =>
      m.createSourceDocsIndex((id) => ctx.locator().toWire(id))
    ));
  const devtools = options.timeline !== false;
  const plugins: Plugin[] = [
    ctx.plugin,
    litCssQueries(() => ctx.get().cssSheetBuild),
    litTimelineVirtual(() => ctx.get().timeline),
    litCssLiterals(),
    lazyServePlugin({name: 'lit-private-fields', hooks: {transform: {}}}, () =>
      import('./plugins/private-fields.js').then((m) => m.litPrivateFields(ctx))
    ),
    // Before the source overlay, which rewrites the code it has to read.
    ...(devtools
      ? [
          lazyServePlugin(
            {
              name: 'lit-component-docs',
              enforce: 'pre',
              hooks: {transform: {}, watchChange: {}},
            },
            async () =>
              (await import('./plugins/component-docs.js')).litComponentDocs(
                ctx,
                await loadSourceDocs(),
                () => ctx.get().timeline
              )
          ),
        ]
      : []),
    lazyServePlugin(
      {
        name: 'lit-source-overlay',
        enforce: 'pre',
        hooks: {
          configureServer: {},
          transform: {},
          transformIndexHtml: {order: 'pre'},
        },
      },
      () =>
        import('./plugins/source-overlay.js').then((m) =>
          m.litSourceOverlay(ctx)
        )
    ),
    lazyServePlugin(
      {
        name: 'lit-plugin',
        hooks: {
          config: {},
          configureServer: {},
          resolveId: {},
          load: {},
          transform: {},
          transformIndexHtml: {},
        },
      },
      () => import('./plugins/hmr.js').then((m) => m.litHmr(ctx))
    ),
    lazyServePlugin(
      {name: 'lit-devtools-workspace', hooks: {configureServer: {}}},
      () =>
        import('./plugins/devtools-workspace.js').then((m) =>
          m.litDevtoolsWorkspace(ctx)
        )
    ),
    lazyServePlugin(
      {
        name: 'lit-manifest-links',
        hooks: {configResolved: {}, transformIndexHtml: {}},
      },
      () =>
        import('./plugins/manifest-links.js').then((m) =>
          m.litManifestLinks(ctx)
        )
    ),
  ];
  // The one construction-time decision. An explicit `timeline: false` is final
  // (env can't override it), so it keeps the devframe plugin out of Vite
  // DevTools entirely. Anything else may still be switched on by env in the
  // context's `config` hook (83bf4f5), so the plugin is included and its
  // `setup()` skips mounting while `enabled()` stays false.
  if (devtools) {
    plugins.push(
      lazyServePlugin(
        {
          name: 'devframe:lit',
          hooks: {configureServer: {}},
          devtools: {capabilities: {dev: true, build: false}},
        },
        async () => {
          const [{createLitDevframePlugin}, {PACKAGE_VERSION}, docs] =
            await Promise.all([
              import('./devframe/vite.js'),
              import('./devframe/paths.js'),
              loadSourceDocs(),
            ]);
          return createLitDevframePlugin({
            version: PACKAGE_VERSION,
            enabled: () => ctx.get().timeline,
            features: () => toFeatureSettings(ctx.get()),
            configuredEditor: () => configuredEditor(ctx.get()),
            sourceLocator: () => ctx.locator(),
            sourceDocs: () => docs,
          });
        }
      )
    );
  }
  return plugins;
};
