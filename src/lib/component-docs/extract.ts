/**
 * Reads a component's docs straight from its source, for the project's own
 * elements that have no Custom Elements Manifest. The dev server runs this
 * over each module it transforms; the result is per class, with the
 * superclass left unresolved, and `source-index.ts` joins classes across
 * modules into `ComponentDocs`.
 *
 * Mixins are read too: a top-level function that returns a class documents
 * that class's members under the function's name, and a class's `extends
 * A(B(Base))` names the mixins and the base for the index to follow.
 *
 * What it reads, in the analyzer's vocabulary: the tag from
 * `@customElement('x-y')` or `customElements.define('x-y', Class)`, the
 * class's JSDoc (`@summary`, `@deprecated`, `@fires`/`@event`, `@slot`,
 * `@csspart`, `@cssprop`/`@cssproperty`, `@cssstate`, `@example`), and its public
 * instance fields and accessors with their JSDoc, declared type, initializer
 * and attribute (from `@property()` or `static properties`). Internal
 * reactive state (`@state()`, `state: true`) and private, protected, `#`
 * and static members are not API and are left out.
 *
 * Never throws: a module that doesn't parse documents nothing.
 */

import {parseAst} from 'vite';
import {langOf} from '../call-sites.js';
import type {ComponentDocs, DocEntry} from '../../types/component-docs.js';
import {
  type Node,
  child,
  docOf,
  findDecorator,
  nameOf,
  nodes,
  put,
  stringLiteral,
  walk,
} from './ast.js';
import {
  type JsDoc,
  cssPropertyEntry,
  deprecationOf,
  examplesOf,
  namedEntry,
  tagText,
} from './jsdoc.js';
import {attributesOf, propertiesOf} from './members.js';
import {type MethodDocs, methodsOf} from './methods.js';

/**
 * `ComponentDocs` without what the index fills in, plus the public methods,
 * which only the manifest lists.
 */
export type ClassDocsBody = Omit<
  ComponentDocs,
  'tagName' | 'className' | 'origin'
> & {methods?: MethodDocs[]};

export interface ClassDocs {
  name: string;
  /** Set when the module registers the class as a custom element. */
  tagName?: string;
  /** `true` for `export default class`. */
  isDefaultExport?: boolean;
  /**
   * The class it extends, when that is an identifier, also as the innermost
   * argument of mixin calls (`extends Sized(Base)` extends `Base`).
   */
  superclass?: ClassRef;
  /**
   * The mixins it is built from, outermost first: `extends A(B(Base))` is
   * `[A, B]`. Only mixins called by name are listed.
   */
  mixins?: ClassRef[];
  docs: ClassDocsBody;
}

/**
 * Names a class or mixin as the module that declares it exports it: `name`
 * is that export's name (`default` for a default import), `specifier` the
 * import source when it is imported.
 */
export interface ClassRef {
  name: string;
  specifier?: string;
}

/**
 * A mixin the module declares at its top level: a function that returns a
 * class, read like one. `mixins` lists the mixins its class applies to the
 * function's argument in turn.
 */
export interface MixinDocs {
  name: string;
  isDefaultExport?: true;
  mixins?: ClassRef[];
  docs: ClassDocsBody;
}

/**
 * A class or mixin the module exports: `name` is what importers ask for
 * (`default` for the default export), `local` the declaration's name in the
 * module (`default` for an anonymous `export default class`).
 */
export interface ModuleExport {
  name: string;
  local: string;
}

export interface ModuleDocs {
  classes: ClassDocs[];
  /** Absent when the module declares none. */
  mixins?: MixinDocs[];
  /** The classes and mixins above it exports; absent when it exports none. */
  exports?: ModuleExport[];
}

// --- imports and registrations ---------------------------------------------

interface Imported {
  name: string;
  specifier: string;
}

/** Local binding to where it was imported from. */
const importsOf = (program: Node): Map<string, Imported> => {
  const imports = new Map<string, Imported>();
  for (const statement of nodes(program.body)) {
    if (statement.type !== 'ImportDeclaration') continue;
    const specifier = stringLiteral(child(statement, 'source'));
    if (specifier === undefined) continue;
    for (const spec of nodes(statement.specifiers)) {
      const local = nameOf(child(spec, 'local'));
      const imported =
        spec.type === 'ImportSpecifier'
          ? nameOf(child(spec, 'imported'))
          : 'default';
      if (local !== undefined && imported !== undefined)
        imports.set(local, {name: imported, specifier});
    }
  }
  return imports;
};

/** `customElements.define` / `window.customElements.define`. */
const isDefineCallee = (callee: Node | undefined): boolean => {
  if (callee?.type !== 'MemberExpression') return false;
  if (nameOf(child(callee, 'property')) !== 'define') return false;
  const object = child(callee, 'object');
  return (
    nameOf(object) === 'customElements' ||
    nameOf(child(object, 'property')) === 'customElements'
  );
};

/** Class name to tag, from `customElements.define('x-y', XY)` calls. */
const definedTags = (program: Node): Map<string, string> => {
  const tags = new Map<string, string>();
  for (const node of walk(program)) {
    if (node.type !== 'CallExpression') continue;
    if (!isDefineCallee(child(node, 'callee'))) continue;
    const [tag, cls] = nodes(node.arguments);
    const tagName = stringLiteral(tag);
    const className = cls?.type === 'Identifier' ? nameOf(cls) : undefined;
    if (tagName !== undefined && className !== undefined)
      tags.set(className, tagName);
  }
  return tags;
};

// --- classes ---------------------------------------------------------------

const taggedEntries = (
  doc: JsDoc | undefined,
  tags: string[],
  read: (text: string) => DocEntry = namedEntry
): DocEntry[] =>
  (doc?.tags ?? [])
    .filter((t) => tags.includes(t.tag))
    .map((t) => read(t.text));

/** `new CustomEvent('name', …)` (or any `…Event`): the event's name and class. */
const constructedEvent = (
  node: Node | undefined
): {name: string; type: string} | undefined => {
  if (node?.type !== 'NewExpression') return undefined;
  const type = nameOf(child(node, 'callee'));
  const name = stringLiteral(nodes(node.arguments)[0]);
  return type?.endsWith('Event') && name !== undefined
    ? {name, type}
    : undefined;
};

/** Whether `node` is a `this.dispatchEvent(…)` call. */
const isThisDispatch = (node: Node): boolean => {
  if (node.type !== 'CallExpression') return false;
  const callee = child(node, 'callee');
  return (
    callee?.type === 'MemberExpression' &&
    child(callee, 'object')?.type === 'ThisExpression' &&
    nameOf(child(callee, 'property')) === 'dispatchEvent'
  );
};

/**
 * The events the class dispatches itself, `this.dispatchEvent(new
 * CustomEvent('name'))`, that no `@fires` tag names. An event built
 * elsewhere and passed in by variable isn't seen.
 */
const dispatchedEvents = (cls: Node, documented: DocEntry[]): DocEntry[] => {
  const names = new Set(documented.map((entry) => entry.name));
  const found: DocEntry[] = [];
  for (const node of walk(child(cls, 'body'))) {
    if (!isThisDispatch(node)) continue;
    const event = constructedEvent(nodes(node.arguments)[0]);
    if (event === undefined || names.has(event.name)) continue;
    names.add(event.name);
    found.push(event);
  }
  return found;
};

const bodyOf = (code: string, cls: Node, doc: JsDoc | undefined) => {
  const fired = taggedEntries(doc, ['fires', 'event']);
  const properties = propertiesOf(code, cls);
  const docs: ClassDocsBody = {
    properties,
    attributes: attributesOf(properties),
    events: [...fired, ...dispatchedEvents(cls, fired)],
    slots: taggedEntries(doc, ['slot']),
    cssParts: taggedEntries(doc, ['csspart']),
    cssProperties: taggedEntries(
      doc,
      ['cssprop', 'cssproperty'],
      cssPropertyEntry
    ),
    cssStates: taggedEntries(doc, ['cssstate']),
  };
  put(docs, 'summary', tagText(doc, 'summary'));
  put(docs, 'description', doc?.description);
  put(docs, 'deprecated', deprecationOf(doc));
  const examples = examplesOf(doc);
  if (examples.length > 0) docs.examples = examples;
  const methods = methodsOf(code, cls);
  if (methods.length > 0) docs.methods = methods;
  return docs;
};

/**
 * What `cls` extends: through any mixin calls (`A(B(Base))`) to the class
 * at the bottom, with the mixins called by name on the way.
 */
const heritageOf = (
  cls: Node,
  imports: Map<string, Imported>
): Pick<ClassDocs, 'superclass' | 'mixins'> => {
  const ref = (local: string): ClassRef => imports.get(local) ?? {name: local};
  const mixins: ClassRef[] = [];
  let node = child(cls, 'superClass');
  while (node?.type === 'CallExpression') {
    const callee = child(node, 'callee');
    if (callee?.type === 'Identifier') mixins.push(ref(nameOf(callee)!));
    node = nodes(node.arguments)[0];
  }
  const heritage: Pick<ClassDocs, 'superclass' | 'mixins'> = {};
  if (node?.type === 'Identifier') heritage.superclass = ref(nameOf(node)!);
  if (mixins.length > 0) heritage.mixins = mixins;
  return heritage;
};

interface ClassSite {
  cls: Node;
  wrapper?: Node;
}

/** Top-level class declarations, with the `export` around them. */
const classSites = (program: Node): ClassSite[] =>
  nodes(program.body).flatMap((statement): ClassSite[] => {
    if (statement.type === 'ClassDeclaration') return [{cls: statement}];
    const declaration = child(statement, 'declaration');
    if (
      statement.type.startsWith('Export') &&
      declaration?.type === 'ClassDeclaration'
    )
      return [{cls: declaration, wrapper: statement}];
    return [];
  });

const classDocs = (
  code: string,
  site: ClassSite,
  context: {imports: Map<string, Imported>; defined: Map<string, string>}
): ClassDocs | undefined => {
  const {cls, wrapper} = site;
  const isDefault = wrapper?.type === 'ExportDefaultDeclaration';
  const name = nameOf(child(cls, 'id')) ?? (isDefault ? 'default' : undefined);
  if (name === undefined) return undefined;
  const result: ClassDocs = {
    name,
    docs: bodyOf(code, cls, docOf(code, cls, wrapper)),
  };
  put(
    result,
    'tagName',
    stringLiteral(findDecorator(cls, 'customElement')?.args[0]) ??
      context.defined.get(name)
  );
  if (isDefault) result.isDefaultExport = true;
  Object.assign(result, heritageOf(cls, context.imports));
  return result;
};

// --- mixins ----------------------------------------------------------------

interface MixinSite {
  name: string;
  fn: Node;
  /** The statement whose doc comment documents the mixin. */
  declaration: Node;
  wrapper?: Node;
}

const FUNCTIONS = ['ArrowFunctionExpression', 'FunctionExpression'];

/** Top-level `function M(…)` and `const M = (…) => …`, with their `export`. */
const functionSites = (program: Node): MixinSite[] =>
  nodes(program.body).flatMap((statement): MixinSite[] => {
    const exported = statement.type.startsWith('Export');
    const declaration = exported ? child(statement, 'declaration') : statement;
    const wrapper = exported ? statement : undefined;
    if (declaration?.type === 'FunctionDeclaration') {
      const name =
        nameOf(child(declaration, 'id')) ??
        (statement.type === 'ExportDefaultDeclaration' ? 'default' : undefined);
      return name === undefined
        ? []
        : [{name, fn: declaration, declaration, wrapper}];
    }
    if (declaration?.type !== 'VariableDeclaration') return [];
    return nodes(declaration.declarations).flatMap((d): MixinSite[] => {
      const init = child(d, 'init');
      const name = nameOf(child(d, 'id'));
      return init !== undefined && FUNCTIONS.includes(init.type) && name
        ? [{name, fn: init, declaration, wrapper}]
        : [];
    });
  });

/**
 * The class a function returns: its expression body, or what a top-level
 * `return` in its body hands back, a class expression or a class declared in
 * the body by name.
 */
const returnedClass = (fn: Node): Node | undefined => {
  const body = child(fn, 'body');
  if (body?.type === 'ClassExpression') return body;
  if (body?.type !== 'BlockStatement') return undefined;
  const statements = nodes(body.body);
  for (const statement of statements) {
    if (statement.type !== 'ReturnStatement') continue;
    const value = child(statement, 'argument');
    if (value?.type === 'ClassExpression') return value;
    if (value?.type !== 'Identifier') continue;
    const name = nameOf(value);
    return statements.find(
      (s) => s.type === 'ClassDeclaration' && nameOf(child(s, 'id')) === name
    );
  }
  return undefined;
};

const mixinDocs = (
  code: string,
  site: MixinSite,
  imports: Map<string, Imported>
): MixinDocs | undefined => {
  const cls = returnedClass(site.fn);
  if (cls === undefined) return undefined;
  const doc = docOf(code, site.declaration, site.wrapper) ?? docOf(code, cls);
  const result: MixinDocs = {name: site.name, docs: bodyOf(code, cls, doc)};
  if (site.wrapper?.type === 'ExportDefaultDeclaration')
    result.isDefaultExport = true;
  put(result, 'mixins', heritageOf(cls, imports).mixins);
  return result;
};

// --- exports ---------------------------------------------------------------

/** The names a top-level `export` statement binds, as export to local. */
const exportedBindings = (statement: Node): ModuleExport[] => {
  const declaration = child(statement, 'declaration');
  if (statement.type === 'ExportDefaultDeclaration') {
    const local =
      declaration?.type === 'Identifier'
        ? nameOf(declaration)
        : (nameOf(child(declaration, 'id')) ?? 'default');
    return local === undefined ? [] : [{name: 'default', local}];
  }
  if (statement.type !== 'ExportNamedDeclaration') return [];
  // `export {A} from './a.js'` re-exports another module's declaration.
  if (child(statement, 'source') !== undefined) return [];
  if (declaration?.type === 'VariableDeclaration')
    return nodes(declaration.declarations).flatMap((d) => {
      const name = nameOf(child(d, 'id'));
      return name === undefined ? [] : [{name, local: name}];
    });
  const declared = nameOf(child(declaration, 'id'));
  if (declared !== undefined) return [{name: declared, local: declared}];
  return nodes(statement.specifiers).flatMap((spec) => {
    const local = nameOf(child(spec, 'local'));
    const name = nameOf(child(spec, 'exported'));
    return local === undefined || name === undefined ? [] : [{name, local}];
  });
};

/** The exports of `program` that name one of `declared`. */
const exportsOf = (program: Node, declared: Set<string>): ModuleExport[] =>
  nodes(program.body)
    .flatMap(exportedBindings)
    .filter((binding) => declared.has(binding.local));

/**
 * The classes `code` declares at its top level, with their docs. `id` is the
 * module's id; its extension picks the parser's language.
 */
export const extractModuleDocs = (code: string, id: string): ModuleDocs => {
  const [file] = id.split('?', 1);
  let program: Node;
  try {
    program = parseAst(
      code,
      {sourceType: 'module', lang: langOf(file)},
      file
    ) as unknown as Node;
  } catch {
    return {classes: []};
  }
  const context = {
    imports: importsOf(program),
    defined: definedTags(program),
  };
  const mixins = functionSites(program).flatMap((site) => {
    const docs = mixinDocs(code, site, context.imports);
    return docs === undefined ? [] : [docs];
  });
  const classes = classSites(program).flatMap((site) => {
    const docs = classDocs(code, site, context);
    return docs === undefined ? [] : [docs];
  });
  const exports = exportsOf(
    program,
    new Set([...classes, ...mixins].map((declaration) => declaration.name))
  );
  return {
    classes,
    ...(mixins.length > 0 ? {mixins} : {}),
    ...(exports.length > 0 ? {exports} : {}),
  };
};
