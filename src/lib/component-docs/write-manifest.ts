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
 * by it, so the same sources give the same file.
 */

import type {DocEntry} from '../../types/component-docs.js';
import type {ClassDocs, ClassDocsBody, ClassRef, MixinDocs} from './extract.js';
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
  'summary' | 'description' | 'deprecated' | 'examples' | 'methods'
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

const heading = (docs: ClassDocsBody): Json => {
  const out: Json = {};
  if (docs.summary !== undefined) out.summary = docs.summary;
  if (docs.description !== undefined) out.description = docs.description;
  if (docs.deprecated !== undefined) out.deprecated = docs.deprecated;
  return out;
};

/**
 * @param path Turns a module id into the manifest's module path, e.g. relative
 *   to the project root.
 */
export const writeManifest = (
  modules: readonly IndexedModule[],
  path: (id: string) => string
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
    if (id === undefined) return {name: ref.name};
    return {name: declaredName(id, ref.name), module: path(id)};
  };

  const inherited = (ancestors: Ancestor[]) =>
    ancestors.map((a) => ({
      from: {name: a.name, module: path(a.id)},
      docs: a.docs,
    }));

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

  const moduleEntry = (at: IndexedModule): Json => {
    const modulePath = path(at.id);
    const {classes, mixins = [], exports = []} = at.module;
    const declaration = (name: string) => ({name, module: modulePath});
    return {
      kind: 'javascript-module',
      path: modulePath,
      declarations: [
        ...classes.map((cls) => classDeclaration(at, cls)),
        ...mixins.map((mixin) => mixinDeclaration(at, mixin)),
      ],
      exports: [
        ...exports.map((e) => ({
          kind: 'js',
          name: e.name,
          declaration: declaration(e.local),
        })),
        ...classes.flatMap((cls) =>
          cls.tagName === undefined
            ? []
            : [
                {
                  kind: 'custom-element-definition',
                  name: cls.tagName,
                  declaration: declaration(cls.name),
                },
              ]
        ),
      ],
    };
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    modules: [...modules]
      .sort((a, b) => (path(a.id) < path(b.id) ? -1 : 1))
      .map(moduleEntry),
  };
};
