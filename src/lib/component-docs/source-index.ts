/**
 * The docs the dev server has read from the project's own source, one entry
 * per transformed module, joined into `ComponentDocs` on demand.
 *
 * Inheritance is resolved at read time rather than when a module is stored:
 * a base class may be transformed after its subclass, and an edit to it
 * should show in every subclass without re-reading them. A superclass is
 * followed while it is in the index (same module by name, another module
 * through the import id the plugin resolved) and the walk stops at the first
 * one that isn't, such as `LitElement`. A class's mixins come before its
 * superclass, outermost first, each followed the same way and stepped over
 * when it isn't in the index (`SignalWatcher` from a package). Members a
 * subclass redeclares win.
 */

import type {ComponentDocs, DocEntry} from '../../types/component-docs.js';
import type {
  ClassDocs,
  ClassDocsBody,
  ClassRef,
  MixinDocs,
  ModuleDocs,
} from './extract.js';

export interface SourceDocsIndex {
  /**
   * Stores a module's classes, replacing what it held before.
   *
   * @param superclassIds Each imported superclass or mixin specifier,
   *   resolved to a module id; specifiers that didn't resolve are left out.
   */
  set(
    id: string,
    module: ModuleDocs,
    superclassIds: ReadonlyMap<string, string>
  ): void;
  delete(id: string): void;
  get(tagName: string): ComponentDocs | undefined;
  /** Every stored module, for writing the index out as a manifest. */
  modules(): IndexedModule[];
  /**
   * Calls `listener` after each `set` and each `delete` that dropped a
   * module. Returns the function that unsubscribes it.
   */
  subscribe(listener: () => void): () => void;
}

/** A class or mixin another class inherits members from. */
export interface Ancestor {
  name: string;
  /** The module that declares it. */
  id: string;
  docs: ClassDocsBody;
}

export interface IndexedModule {
  /** The module id, without its query. */
  id: string;
  module: ModuleDocs;
  /**
   * The module a class or mixin named in this one is declared in: this one
   * for a local name, the resolved id for an import, `undefined` for an
   * import that didn't resolve.
   */
  moduleOf(ref: ClassRef): string | undefined;
  /**
   * What `cls`, declared in this module, inherits members from, in the order
   * its members are merged: its mixins outermost first, each followed by the
   * mixins it applies, then its superclass and that one's mixins, and so on
   * while they are in the index.
   */
  ancestorsOf(cls: ClassDocs): Ancestor[];
}

interface Entry {
  module: ModuleDocs;
  superclassIds: ReadonlyMap<string, string>;
}

interface Located {
  id: string;
  cls: ClassDocs;
}

/** A mixin found in the index, and the module it is declared in. */
interface LocatedMixin {
  id: string;
  mixin: MixinDocs;
}

type ListKey = Exclude<
  keyof ClassDocsBody,
  'summary' | 'description' | 'deprecated' | 'examples' | 'methods'
>;

const LISTS: ListKey[] = [
  'properties',
  'attributes',
  'events',
  'slots',
  'cssParts',
  'cssProperties',
  'cssStates',
];

const stripQuery = (id: string): string => id.split('?', 1)[0];

const findClass = (
  entry: Entry | undefined,
  name: string
): ClassDocs | undefined =>
  entry?.module.classes.find((cls) =>
    name === 'default' ? cls.isDefaultExport === true : cls.name === name
  );

/** Appends `inherited` entries `own` doesn't already name. */
const mergeList = (
  own: DocEntry[],
  inherited: DocEntry[],
  from: string
): DocEntry[] => {
  const names = new Set(own.map((entry) => entry.name));
  return [
    ...own,
    ...inherited
      .filter((entry) => !names.has(entry.name))
      .map((entry) => ({inheritedFrom: from, ...entry})),
  ];
};

/**
 * @param relative Turns a module id into the path the panel shows, relative
 *   to the Vite root.
 */
export const createSourceDocsIndex = (
  relative: (id: string) => string
): SourceDocsIndex => {
  const modules = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };

  /** The module `ref`, written in module `from`, points at. */
  const moduleOf = (from: string, ref: ClassRef): string | undefined => {
    const resolved =
      ref.specifier === undefined
        ? from
        : modules.get(from)?.superclassIds.get(ref.specifier);
    return resolved === undefined ? undefined : stripQuery(resolved);
  };

  const superclassOf = (at: Located): Located | undefined => {
    const superclass = at.cls.superclass;
    if (superclass === undefined) return undefined;
    const id = moduleOf(at.id, superclass);
    if (id === undefined) return undefined;
    const cls = findClass(modules.get(id), superclass.name);
    return cls === undefined ? undefined : {id, cls};
  };

  const mixinOf = (from: string, ref: ClassRef): LocatedMixin | undefined => {
    const id = moduleOf(from, ref);
    if (id === undefined) return undefined;
    const mixin = modules
      .get(id)
      ?.module.mixins?.find((m) =>
        ref.name === 'default'
          ? m.isDefaultExport === true
          : m.name === ref.name
      );
    return mixin === undefined ? undefined : {id, mixin};
  };

  /**
   * The mixins `refs` (written in module `from`) apply, outermost first, each
   * followed by the mixins it applies in turn. `seen` ends a cycle.
   */
  const mixinsOf = (
    from: string,
    refs: readonly ClassRef[] | undefined,
    seen: Set<string>
  ): LocatedMixin[] =>
    (refs ?? []).flatMap((ref) => {
      const at = mixinOf(from, ref);
      if (at === undefined) return [];
      const key = `${at.id}#mixin:${at.mixin.name}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [at, ...mixinsOf(at.id, at.mixin.mixins, seen)];
    });

  const ancestorsOf = (start: Located): Ancestor[] => {
    const ancestors: Ancestor[] = [];
    const seen = new Set([`${start.id}#${start.cls.name}`]);
    for (let at: Located | undefined = start; at !== undefined;) {
      for (const {id, mixin} of mixinsOf(at.id, at.cls.mixins, seen))
        ancestors.push({name: mixin.name, id, docs: mixin.docs});
      at = superclassOf(at);
      if (at === undefined) break;
      const key = `${at.id}#${at.cls.name}`;
      if (seen.has(key)) break;
      seen.add(key);
      ancestors.push({name: at.cls.name, id: at.id, docs: at.cls.docs});
    }
    return ancestors;
  };

  const locate = (tagName: string): Located | undefined => {
    for (const [id, entry] of modules) {
      const cls = entry.module.classes.find((c) => c.tagName === tagName);
      if (cls !== undefined) return {id, cls};
    }
    return undefined;
  };

  const docsFor = (tagName: string, start: Located): ComponentDocs => {
    // Methods are for the manifest; the panel's docs have no place for them.
    const {methods: _, ...body} = structuredClone(start.cls.docs);
    const docs: ComponentDocs = {
      ...body,
      tagName,
      className: start.cls.name,
      origin: {manifest: '', module: relative(start.id), source: true},
    };
    for (const ancestor of ancestorsOf(start))
      for (const list of LISTS)
        docs[list] = mergeList(docs[list], ancestor.docs[list], ancestor.name);
    return docs;
  };

  return {
    set(id, module, superclassIds) {
      modules.set(stripQuery(id), {module, superclassIds});
      changed();
    },
    delete(id) {
      if (modules.delete(stripQuery(id))) changed();
    },
    get(tagName) {
      const start = locate(tagName);
      return start === undefined ? undefined : docsFor(tagName, start);
    },
    modules() {
      return [...modules].map(([id, entry]) => ({
        id,
        module: entry.module,
        moduleOf: (ref) => moduleOf(id, ref),
        ancestorsOf: (cls) => ancestorsOf({id, cls}),
      }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
