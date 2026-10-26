import type {Plugin} from 'vite';
import {indexModule} from '../component-docs/index-module.js';
import type {SourceDocsIndex} from '../component-docs/source-index.js';
import type {OptionsContext} from './context.js';
import {isRuntimeModule} from './shared.js';

/**
 * Dev-only: reads the docs of the project's own components from each module
 * Vite transforms, other than the plugin's own runtime, and keeps them in
 * `index`, which the `componentDocs` node action asks before any manifest,
 * and the dev server's manifest is written from. Changes no code.
 *
 * It runs `pre`, and is registered before the source overlay's transform, so
 * it sees the author's TypeScript with its type annotations and decorators
 * intact. HMR re-runs the transform for an edited module, which replaces its
 * entry; a deleted file drops its entry.
 *
 * @param enabled Read per call; off while both DevTools and the dev
 *   server's manifest are.
 */
export const litComponentDocs = (
  ctx: OptionsContext,
  index: SourceDocsIndex,
  enabled: () => boolean
): Plugin => ({
  name: 'lit-component-docs',
  apply: 'serve',
  enforce: 'pre',
  async transform(code, id, transformOptions) {
    if (!enabled() || !ctx.shouldTransform(id, transformOptions)) return null;
    // The HMR indicator and the other elements the plugin puts on the page
    // aren't the project's components.
    if (isRuntimeModule(id)) return null;
    await indexModule(this, index, code, id);
    return null;
  },
  watchChange(id, change) {
    if (change.event === 'delete') index.delete(id);
  },
});
