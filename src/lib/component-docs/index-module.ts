/**
 * Reads one module into a source-docs index, resolving the imports the index
 * follows. Shared by the dev server, the build, the `lit-devtools manifest`
 * command and the language server, so nothing here may need Vite.
 */

import {extractModuleDocs} from './extract.js';
import type {SourceDocsIndex} from './source-index.js';

/** What `indexModule` resolves imports with: a plugin context, or anything shaped like its `resolve`. */
export interface ImportResolver {
  resolve(
    specifier: string,
    importer: string
  ): Promise<{id: string; external?: boolean | 'absolute' | 'relative'} | null>;
}

/**
 * Reads the docs of module `id` into `index`, replacing what it held, or
 * drops it from the index when it declares no class or mixin. `context`
 * resolves the imported superclasses and mixins, so the index can follow
 * them to the module that declares them.
 */
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
