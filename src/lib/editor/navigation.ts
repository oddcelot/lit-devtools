/**
 * Go to implementation and find references, before any protocol: from a tag,
 * attribute, property or event in a template to where the component's source
 * declares it, and to every template that uses it. Spans are document
 * offsets, as in `features.ts`.
 *
 * Only components read from source have a declaration to go to; one from a
 * dependency's manifest has none, though its uses are still found.
 */

import type {ComponentDocs} from '../../types/component-docs.js';
import {
  type Node,
  child,
  nameOf,
  nodes,
  stringLiteral,
  walk,
} from '../component-docs/ast.js';
import {parseModule} from '../component-docs/parse.js';
import {
  type Binding,
  type CursorContext,
  type DocumentKind,
  type MarkupAttribute,
  type MarkupElement,
  type MarkupRegion,
  contextAt,
  markupRegions,
  nameStartOf,
  scanMarkup,
} from './markup.js';
import type {FeatureRequest} from './features.js';

/** A stretch of a file. */
export interface Span {
  file: string;
  start: number;
  end: number;
}

/** A class, or a mixin, and the module that declares it. */
export interface ClassLocation {
  file: string;
  name: string;
}

export interface NavigationSource {
  get(file: string, tagName: string): Promise<ComponentDocs | null>;
  /**
   * The class that declares `tagName`, then those it inherits from, nearest
   * first; empty when the component isn't read from source.
   */
  declarationsOf(tagName: string): ClassLocation[];
  /** The files whose markup can use a component: scripts and HTML files. */
  files(): Promise<string[]>;
  /** A file's text: its open buffer, else the file on disk. */
  readText(file: string): Promise<string | undefined>;
  /** The template tags read in `file`; `html` and `svg` by default. */
  templateTagsOf(file: string): readonly string[] | undefined;
}

/** What a name in a template refers to on its component. */
type Target =
  | {kind: 'tag'; tag: string}
  | {kind: 'member'; tag: string; property: string; attribute?: string}
  | {kind: 'attribute'; tag: string; attribute: string}
  | {kind: 'event'; tag: string; event: string};

/** What kind of document a file is, from its extension. */
export const kindOfFile = (file: string): DocumentKind => {
  const ext = /\.(\w+)$/.exec(file)?.[1];
  if (ext === 'html' || ext === 'astro' || ext === 'mdx') return ext;
  return ext === 'jsx' || ext === 'tsx' ? 'jsx' : 'script';
};

/**
 * What a binding names: an attribute and its property are one member, so
 * `.open` and `open` find each other.
 */
/**
 * What a plain prop names in JSX or Astro: a property, else an attribute,
 * else in JSX an `on<event>`.
 */
const propTarget = (
  docs: ComponentDocs | null,
  tag: string,
  name: string,
  dialect: 'jsx' | 'astro'
): Target => {
  const property = docs?.properties.find((entry) => entry.name === name);
  if (property)
    return {
      kind: 'member',
      tag,
      property: name,
      attribute: property.counterpart,
    };
  const event = name.startsWith('on') ? name.slice(2) : undefined;
  if (dialect === 'jsx' && docs?.events.some((entry) => entry.name === event))
    return {kind: 'event', tag, event: event!};
  return targetOf(docs, tag, '', name);
};

const targetOf = (
  docs: ComponentDocs | null,
  tag: string,
  binding: Binding,
  name: string,
  dialect?: 'jsx' | 'astro'
): Target => {
  if (dialect && binding === '') return propTarget(docs, tag, name, dialect);
  if (binding === '@') return {kind: 'event', tag, event: name};
  if (binding === '.') {
    const property = docs?.properties.find((entry) => entry.name === name);
    return {
      kind: 'member',
      tag,
      property: name,
      attribute: property?.counterpart,
    };
  }
  const attribute = docs?.attributes.find((entry) => entry.name === name);
  return attribute?.counterpart
    ? {kind: 'member', tag, property: attribute.counterpart, attribute: name}
    : {kind: 'attribute', tag, attribute: name};
};

/** The target under the cursor, or undefined off a tag or binding name. */
const targetAt = async (
  source: NavigationSource,
  request: FeatureRequest
): Promise<{target: Target; context: CursorContext} | undefined> => {
  const {file, code, kind, offset, templateTags} = request;
  const context = contextAt(code, kind, offset, {templateTags});
  if (!context || context.kind === 'value') return undefined;
  const tag = context.element.tag;
  if (context.kind === 'tag') return {target: {kind: 'tag', tag}, context};
  const name = code.slice(context.start, context.end);
  if (!name) return undefined;
  const docs = await source.get(file, tag);
  const {binding, element} = context;
  return {target: targetOf(docs, tag, binding, name, element.dialect), context};
};

// --- declarations -----------------------------------------------------------

const CLASS_TYPES = new Set(['ClassDeclaration', 'ClassExpression']);

const isClassNamed = (node: Node, name: string): boolean =>
  CLASS_TYPES.has(node.type) && nameOf(child(node, 'id')) === name;

/** Whether `node` declares the function or variable `name`, or is the default export. */
const declares = (node: Node, name: string): boolean =>
  name === 'default'
    ? node.type === 'ExportDefaultDeclaration'
    : (node.type === 'FunctionDeclaration' ||
        node.type === 'VariableDeclarator') &&
      nameOf(child(node, 'id')) === name;

/**
 * The class `name` in a module: a class of that name, else the class a
 * function of that name returns (a mixin), else the default export's.
 */
const findClass = (program: Node, name: string): Node | undefined => {
  const all = [...walk(program)];
  const named = all.find((node) => isClassNamed(node, name));
  if (named) return named;
  const holder = all.find((node) => declares(node, name));
  return holder && [...walk(holder)].find((node) => CLASS_TYPES.has(node.type));
};

/** A class's name, or its `class` keyword when it has none. */
const classSpan = (cls: Node): {start: number; end: number} => {
  const id = child(cls, 'id');
  return id
    ? {start: id.start, end: id.end}
    : {start: cls.start, end: cls.start + 5};
};

const MEMBER_TYPES = new Set([
  'PropertyDefinition',
  'AccessorProperty',
  'MethodDefinition',
]);

/** A string literal's text, inside its quotes. */
const inQuotes = (node: Node) => ({start: node.start + 1, end: node.end - 1});

/** The instance field or accessor `property`, or its `static properties` entry. */
const findProperty = (cls: Node, property: string) => {
  const members = nodes(child(cls, 'body')?.body);
  const field = members.find(
    (member) =>
      MEMBER_TYPES.has(member.type) &&
      member.static !== true &&
      nameOf(child(member, 'key')) === property
  );
  if (field) return child(field, 'key');
  const statics = members.find(
    (member) =>
      member.static === true && nameOf(child(member, 'key')) === 'properties'
  );
  for (const node of walk(statics)) {
    if (node.type === 'Property' && nameOf(child(node, 'key')) === property)
      return child(node, 'key');
  }
  return undefined;
};

/** `attribute` in the class's `observedAttributes`. */
const findObserved = (cls: Node, attribute: string) => {
  const observed = nodes(child(cls, 'body')?.body).find(
    (member) =>
      member.static === true &&
      nameOf(child(member, 'key')) === 'observedAttributes'
  );
  for (const node of walk(observed)) {
    if (stringLiteral(node) === attribute) return inQuotes(node);
  }
  return undefined;
};

/** The name of a `new …Event('event')` the class builds. */
const findEvent = (cls: Node, event: string) => {
  for (const node of walk(child(cls, 'body'))) {
    if (node.type !== 'NewExpression') continue;
    if (!nameOf(child(node, 'callee'))?.endsWith('Event')) continue;
    const [nameArg] = nodes(node.arguments);
    if (stringLiteral(nameArg) === event) return inQuotes(nameArg!);
  }
  return undefined;
};

/** Where `cls` declares what `target` names, if it does. */
const findIn = (cls: Node, target: Target) => {
  if (target.kind === 'tag') return classSpan(cls);
  if (target.kind === 'event') return findEvent(cls, target.event);
  if (target.kind === 'attribute') return findObserved(cls, target.attribute);
  const key = findProperty(cls, target.property);
  if (key) return key.type === 'Literal' ? inQuotes(key) : key;
  return target.attribute ? findObserved(cls, target.attribute) : undefined;
};

/**
 * Where the component's source declares `target`: the class for a tag, else
 * the nearest class in its chain that declares the member or fires the
 * event, else the component's class.
 */
const declarationOf = async (
  source: NavigationSource,
  target: Target
): Promise<Span | undefined> => {
  let component: Span | undefined;
  for (const location of source.declarationsOf(target.tag)) {
    const code = await source.readText(location.file);
    if (code === undefined) continue;
    let program: Node;
    try {
      program = parseModule(code, location.file);
    } catch {
      continue;
    }
    const cls = findClass(program, location.name);
    if (!cls) continue;
    component ??= {file: location.file, ...classSpan(cls)};
    const found = findIn(cls, target);
    if (found) return {file: location.file, start: found.start, end: found.end};
  }
  return component;
};

/** Where the tag, attribute, property or event under the cursor is declared. */
export const implementationAt = async (
  source: NavigationSource,
  request: FeatureRequest
): Promise<Span[]> => {
  const at = await targetAt(source, request);
  const found = at && (await declarationOf(source, at.target));
  return found ? [found] : [];
};

// --- references -------------------------------------------------------------

/** Every `</tag` in a region, at the tag name, outside its holes. */
const closingTags = (code: string, region: MarkupRegion, tag: string) => {
  const spans: {start: number; end: number}[] = [];
  const text = code.slice(region.start, region.end);
  const lower = tag.toLowerCase();
  let at = text.toLowerCase().indexOf(`</${lower}`);
  while (at !== -1) {
    const start = region.start + at + 2;
    const end = start + tag.length;
    const next = code[end];
    const inHole = region.holes.some((h) => h.start <= start && start < h.end);
    if (!inHole && (next === undefined || /[\s>]/.test(next)))
      spans.push({start, end});
    at = text.toLowerCase().indexOf(`</${lower}`, at + 2);
  }
  return spans;
};

/** Whether a binding on an element names `target`. */
const names = (
  target: Target,
  {binding, name}: MarkupAttribute,
  dialect: MarkupElement['dialect']
): boolean => {
  if (dialect && binding === '') return namesAsProp(target, name, dialect);
  if (target.kind === 'event') return binding === '@' && name === target.event;
  if (binding === '@') return false;
  if (target.kind === 'attribute')
    return binding !== '.' && name === target.attribute;
  if (target.kind !== 'member') return false;
  return binding === '.' ? name === target.property : name === target.attribute;
};

/** Whether a plain prop in JSX or Astro names `target`. */
const namesAsProp = (
  target: Target,
  name: string,
  dialect: 'jsx' | 'astro'
): boolean => {
  if (target.kind === 'event')
    return dialect === 'jsx' && name === `on${target.event}`;
  if (target.kind === 'attribute') return name === target.attribute;
  return (
    target.kind === 'member' &&
    (name === target.property || name === target.attribute)
  );
};

/** The uses of `target` on one element: its tag name, or its bindings that name it. */
const elementUses = (element: MarkupElement, target: Target) => {
  if (element.tag.toLowerCase() !== target.tag.toLowerCase()) return [];
  if (target.kind === 'tag')
    return [{start: element.start + 1, end: element.nameEnd}];
  return element.attributes
    .filter((attribute) => names(target, attribute, element.dialect))
    .map((attribute) => ({
      start: nameStartOf(attribute),
      end: attribute.nameEnd,
    }));
};

/** The uses of `target` in one file. */
const usesIn = (
  file: string,
  code: string,
  target: Target,
  templateTags: readonly string[] | undefined
): Span[] =>
  markupRegions(code, kindOfFile(file), {templateTags})
    .flatMap((region) => [
      ...scanMarkup(code, region).flatMap((element) =>
        elementUses(element, target)
      ),
      ...(target.kind === 'tag' ? closingTags(code, region, target.tag) : []),
    ])
    .map((span) => ({file, ...span}));

/**
 * Every use of the tag, attribute, property or event under the cursor in the
 * workspace's templates and HTML files, and its declaration when asked.
 */
export const referencesAt = async (
  source: NavigationSource,
  request: FeatureRequest,
  includeDeclaration: boolean
): Promise<Span[]> => {
  const at = await targetAt(source, request);
  if (!at) return [];
  const spans: Span[] = [];
  if (includeDeclaration) {
    const declaration = await declarationOf(source, at.target);
    if (declaration) spans.push(declaration);
  }
  const files = new Set([request.file, ...(await source.files())]);
  for (const file of files) {
    const code =
      file === request.file ? request.code : await source.readText(file);
    if (code === undefined) continue;
    spans.push(...usesIn(file, code, at.target, source.templateTagsOf(file)));
  }
  return spans;
};
