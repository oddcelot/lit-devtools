import type {Plugin} from 'vite';
import {extractModuleDocs} from '../component-docs/extract.js';
import type {SourceDocsIndex} from '../component-docs/source-index.js';
import type {OptionsContext} from './context.js';

/**
 * Reads the docs of module `id` into `index`, replacing what it held, or
 * drops it from the index when it declares no class or mixin. `context`
 * resolves the imported superclasses and mixins, so the index can follow
 * them to the module that declares them.
 */
/** What `indexModule` resolves imports with: a plugin context, or anything shaped like its `resolve`. */
export interface ImportResolver {
  resolve(
    specifier: string,
    importer: string
  ): Promise<{id: string; external?: boolean | 'absolute' | 'relative'} | null>;
}

export const indexModule = async (
  context: ImportResolver,
  index: SourceDocsIndex,
  code: string,
  id: string
): Promise<void> => {
  // Only a module with a class, or one that exports, can document anything.
  const module =
    code.includes('class') || code.includes('export')
      ? extractModuleDocs(code, id)
      : {classes: []};
  const documents =
    module.classes.length > 0 ||
    module.mixins !== undefined ||
    module.reexports !== undefined;
  if (!documents) {
    index.delete(id);
    return;
  }
  // Only imported superclasses and mixins, and re-exported modules, need
  // resolving; the index follows the resolved id to the module that
  // declares them.
  const specifiers = new Set(
    [
      ...module.classes.flatMap((cls) => [
        cls.superclass,
        ...(cls.mixins ?? []),
      ]),
      ...(module.mixins ?? []).flatMap((mixin) => mixin.mixins ?? []),
      ...(module.reexports ?? []),
    ].flatMap((ref) => ref?.specifier ?? [])
  );
  const superclassIds = new Map<string, string>();
  for (const specifier of specifiers) {
    const resolved = await context.resolve(specifier, id);
    if (resolved !== null && resolved.external !== true)
      superclassIds.set(specifier, resolved.id);
  }
  index.set(id, module, superclassIds);
};

/**
 * Dev-only: reads the docs of the project's own components from each module
 * Vite transforms and keeps them in `index`, which the `componentDocs` node
 * action asks before any manifest, and the dev server's manifest is written
 * from. Changes no code.
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
    await indexModule(this, index, code, id);
    return null;
  },
  watchChange(id, change) {
    if (change.event === 'delete') index.delete(id);
  },
});
