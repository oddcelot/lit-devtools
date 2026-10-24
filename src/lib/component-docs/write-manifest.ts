/**
 * Writes the source-docs index out as a Custom Elements Manifest
 * (`custom-elements.json`, schema 2.1): one module per source file, each with
 * its classes and mixins, the names it exports, and a definition for each tag
 * it registers. The reverse of `manifest.ts`, which reads one back.
 *
 * A class lists the members it inherits from classes and mixins in the index,
 * marked `inheritedFrom`, the way `@custom-elements-manifest/analyzer` does,
 * so a reader needs no inheritance walk of its own. A superclass from a
 * package is named by the package, one declared nowhere (`HTMLElement`) as a
 * global. Types are the text written in the source; nothing is inferred.
 *
 * Pure: `path` decides how a module id is written, and the output is sorted
 * by it, so the same sources give the same file. Source modules that share a
 * path, such as two bundled into one chunk, are one module of the manifest.
 */

import type {DocEntry} from '../../types/component-docs.js';
import type {
  ClassDocs,
  ClassDocsBody,
  ClassRef,
  MixinDocs,
  ModuleReexport,
} from './extract.js';
import type {MethodDocs} from './methods.js';
import type {Ancestor, IndexedModule} from './source-index.js';

/** The schema version written. */
const SCHEMA_VERSION = '2.1.0';

interface Reference {
  name: string;
  package?: string;
  module?: string;
}

type Json = Record<string, unknown>;

export interface Manifest {
  schemaVersion: string;
  modules: Json[];
}

const isRelative = (specifier: string): boolean =>
  specifier.startsWith('.') || specifier.startsWith('/');

/** Copies the optional fields of `entry` that are set onto `target`. */
const described = (target: Json, entry: DocEntry): Json => {
  if (entry.description !== undefined) target.description = entry.description;
  if (entry.deprecated !== undefined) target.deprecated = entry.deprecated;
  return target;
};

const typed = (target: Json, entry: DocEntry): Json => {
  if (entry.type !== undefined) target.type = {text: entry.type};
  return target;
};

const defaulted = (target: Json, entry: DocEntry): Json => {
  if (entry.default !== undefined) target.default = entry.default;
  return target;
};

const field = (entry: DocEntry): Json => {
  const out = defaulted(
    typed(described({kind: 'field', name: entry.name}, entry), entry),
    entry
  );
  if (entry.counterpart !== undefined) out.attribute = entry.counterpart;
  if (entry.reflects) out.reflects = true;
  return out;
};

const method = (docs: MethodDocs): Json => {
  const out: Json = {kind: 'method', name: docs.name};
  if (docs.description !== undefined) out.description = docs.description;
  if (docs.deprecated !== undefined) out.deprecated = docs.deprecated;
  if (docs.parameters !== undefined)
    out.parameters = docs.parameters.map(({type, ...param}) =>
      type === undefined ? param : {...param, type: {text: type}}
    );
  if (docs.return !== undefined) {
    const {type, description} = docs.return;
    out.return = {
      ...(type !== undefined ? {type: {text: type}} : {}),
      ...(description !== undefined ? {description} : {}),
    };
  }
  return out;
};

const attribute = (entry: DocEntry): Json => {
  const out = defaulted(
    typed(described({name: entry.name}, entry), entry),
    entry
  );
  if (entry.counterpart !== undefined) out.fieldName = entry.counterpart;
  return out;
};

const event = (entry: DocEntry): Json =>
  typed(described({name: entry.name}, entry), entry);

const named = (entry: DocEntry): Json => described({name: entry.name}, entry);

const cssProperty = (entry: DocEntry): Json => {
  const out = defaulted(described({name: entry.name}, entry), entry);
  if (entry.type !== undefined) out.syntax = entry.type;
  return out;
};

type ListKey = Exclude<
  keyof ClassDocsBody,
  'summary' | 'description' | 'deprecated' | 'examples' | 'methods' | 'assigned'
>;

/** Each list of a body, its manifest key and how an entry is written. */
const LISTS: [ListKey, string, (e: DocEntry) => Json][] = [
  ['properties', 'members', field],
  ['attributes', 'attributes', attribute],
  ['events', 'events', event],
  ['slots', 'slots', named],
  ['cssParts', 'cssParts', named],
  ['cssProperties', 'cssProperties', cssProperty],
  ['cssStates', 'cssStates', named],
];

interface Inherited {
  from: Reference;
  docs: ClassDocsBody;
}

/** `own` written, then each ancestor's entries it doesn't redeclare, marked as inherited. */
const merged = <T extends {name: string}>(
  own: readonly T[],
  inherited: readonly [Reference, readonly T[]][],
  write: (entry: T) => Json
): Json[] => {
  const names = new Set(own.map((entry) => entry.name));
  const written = own.map(write);
  for (const [from, entries] of inherited)
    for (const entry of entries) {
      if (names.has(entry.name)) continue;
      names.add(entry.name);
      written.push({...write(entry), inheritedFrom: from});
    }
  return written;
};

/**
 * Written fields with the constructor's assignments: each re-defaults the
 * field it names, own or inherited, or is added as a field of the class.
 */
const applyAssignedFields = (
  fields: Json[],
  assigned: readonly DocEntry[] | undefined
): Json[] => {
  const result = [...fields];
  for (const entry of assigned ?? []) {
    const at = result.findIndex((f) => f.name === entry.name);
    if (at === -1) result.push(field(entry));
    else result[at] = {...result[at], default: entry.default};
  }
  return result;
};

/** A body's lists as manifest keys, own entries first, then inherited ones it doesn't redeclare. */
const lists = (docs: ClassDocsBody, ancestors: Inherited[]): Json => {
  const out: Json = {};
  for (const [key, manifestKey, write] of LISTS) {
    const written = merged(
      docs[key],
      ancestors.map((a) => [a.from, a.docs[key]]),
      write
    );
    if (written.length > 0) out[manifestKey] = written;
  }
  const fields = applyAssignedFields(
    (out.members as Json[] | undefined) ?? [],
    docs.assigned
  );
  if (fields.length > 0) out.members = fields;
  // Methods share `members` with the fields, after them.
  const methods = merged(
    docs.methods ?? [],
    ancestors.map((a) => [a.from, a.docs.methods ?? []]),
    method
  );
  if (methods.length > 0)
    out.members = [...((out.members as Json[] | undefined) ?? []), ...methods];
  return out;
};

/** Exports without repeats: a barrel bundled with what it re-exports names it twice. */
const unique = (exports: Json[]): Json[] => {
  const seen = new Set<string>();
  return exports.filter((e) => {
    const key = `${String(e.kind)}:${String(e.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const heading = (docs: ClassDocsBody): Json => {
  const out: Json = {};
  if (docs.summary !== undefined) out.summary = docs.summary;
  if (docs.description !== undefined) out.description = docs.description;
  if (docs.deprecated !== undefined) out.deprecated = docs.deprecated;
  return out;
};

export interface ManifestPaths {
  /**
   * Turns a module id into the manifest's module path, e.g. relative to the
   * project root; `undefined` leaves the module out, and a reference to it
   * names no module.
   */
  path: (id: string) => string | undefined;
  /**
   * Whether the file `path` gives for module `id` exports `name`. Unset, every
   * export the source declares is kept.
   */
  exported?: (id: string, name: string) => boolean;
}

export const writeManifest = (
  modules: readonly IndexedModule[],
  {path, exported = () => true}: ManifestPaths
): Manifest => {
  const byId = new Map(modules.map((m) => [m.id, m]));

  /** The declared name behind an exported one (`default`) in module `id`. */
  const declaredName = (id: string, exported: string): string =>
    byId.get(id)?.module.exports?.find((e) => e.name === exported)?.local ??
    exported;

  const declares = (at: IndexedModule, name: string): boolean =>
    at.module.classes.some((c) => c.name === name) ||
    (at.module.mixins ?? []).some((m) => m.name === name);

  const reference = (at: IndexedModule, ref: ClassRef): Reference => {
    if (ref.specifier !== undefined && !isRelative(ref.specifier))
      return {name: ref.name, package: ref.specifier};
    if (ref.specifier === undefined && !declares(at, ref.name))
      return {name: ref.name, package: 'global:'};
    const id = at.moduleOf(ref);
    return located(
      id === undefined ? ref.name : declaredName(id, ref.name),
      id
    );
  };

  /** `name`, with the path of module `id` when it has one. */
  const located = (name: string, id: string | undefined): Reference => {
    const module = id === undefined ? undefined : path(id);
    return module === undefined ? {name} : {name, module};
  };

  const inherited = (ancestors: Ancestor[]) =>
    ancestors.map((a) => ({from: located(a.name, a.id), docs: a.docs}));

  const classDeclaration = (at: IndexedModule, cls: ClassDocs): Json => {
    const out: Json = {kind: 'class', name: cls.name, ...heading(cls.docs)};
    if (cls.tagName !== undefined) {
      out.customElement = true;
      out.tagName = cls.tagName;
    }
    if (cls.superclass !== undefined)
      out.superclass = reference(at, cls.superclass);
    if (cls.mixins !== undefined)
      out.mixins = cls.mixins.map((ref) => reference(at, ref));
    return {...out, ...lists(cls.docs, inherited(at.ancestorsOf(cls)))};
  };

  const mixinDeclaration = (at: IndexedModule, mixin: MixinDocs): Json => {
    const out: Json = {kind: 'mixin', name: mixin.name, ...heading(mixin.docs)};
    if (mixin.mixins !== undefined)
      out.mixins = mixin.mixins.map((ref) => reference(at, ref));
    return {...out, ...lists(mixin.docs, [])};
  };

  const declarationsOf = (at: IndexedModule): Json[] => [
    ...at.module.classes.map((cls) => classDeclaration(at, cls)),
    ...(at.module.mixins ?? []).map((mixin) => mixinDeclaration(at, mixin)),
  ];

  interface Resolved {
    name: string;
    declaration: {name: string; module: string};
  }

  /** One re-export of `at`, followed to the declarations it names. */
  const followed = (
    at: IndexedModule,
    reexport: ModuleReexport,
    seen: Set<string>
  ): Resolved[] => {
    const id = at.moduleOf({name: '', specifier: reexport.specifier});
    const target = id === undefined ? undefined : byId.get(id);
    if (target === undefined) return [];
    const exports = resolvedExports(target, seen);
    if (reexport.name === undefined)
      return exports.filter((e) => e.name !== 'default');
    const match = exports.find((e) => e.name === reexport.local);
    return match === undefined ? [] : [{...match, name: reexport.name}];
  };

  /**
   * Every class and mixin `at` exports, its own and those it re-exports,
   * each with the module that declares it. `seen` ends an export cycle.
   */
  const resolvedExports = (
    at: IndexedModule,
    seen = new Set<string>()
  ): Resolved[] => {
    if (seen.has(at.id)) return [];
    seen.add(at.id);
    const modulePath = path(at.id);
    const own: Resolved[] =
      modulePath === undefined
        ? []
        : (at.module.exports ?? []).map((e) => ({
            name: e.name,
            declaration: {name: e.local, module: modulePath},
          }));
    const names = new Set(own.map((e) => e.name));
    const result = [...own];
    for (const reexport of at.module.reexports ?? [])
      for (const e of followed(at, reexport, seen)) {
        if (names.has(e.name)) continue;
        names.add(e.name);
        result.push(e);
      }
    return result;
  };

  const exportsOf = (at: IndexedModule, modulePath: string): Json[] => [
    ...resolvedExports(at)
      .filter((e) => exported(at.id, e.name))
      .map((e) => ({kind: 'js', ...e})),
    ...at.module.classes.flatMap((cls) =>
      cls.tagName === undefined
        ? []
        : [
            {
              kind: 'custom-element-definition',
              name: cls.tagName,
              declaration: {name: cls.name, module: modulePath},
            },
          ]
    ),
  ];

  const byPath = new Map<string, IndexedModule[]>();
  for (const at of modules) {
    const modulePath = path(at.id);
    if (modulePath === undefined) continue;
    byPath.set(modulePath, [...(byPath.get(modulePath) ?? []), at]);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    modules: [...byPath]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([modulePath, sources]) => {
        // Bundled together, in a stable order whatever order they were read.
        const ordered = [...sources].sort((a, b) => (a.id < b.id ? -1 : 1));
        return {
          kind: 'javascript-module',
          path: modulePath,
          declarations: ordered.flatMap(declarationsOf),
          exports: unique(ordered.flatMap((at) => exportsOf(at, modulePath))),
        };
      })
      // A module that only re-exports names no class or mixin is noise.
      .filter((m) => m.declarations.length > 0 || m.exports.length > 0),
  };
};
