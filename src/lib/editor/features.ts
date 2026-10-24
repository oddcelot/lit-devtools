/**
 * The language server's answers, before any protocol: completion items and
 * hover text for the cursor, from the cursor context and the components'
 * docs. Shapes follow LSP's, with document offsets instead of positions, so
 * the server only maps offsets and passes these on.
 */

import type {ComponentDocs, DocEntry} from '../../types/component-docs.js';
import {
  type EventHandler,
  memberAccessAt,
  membersOf,
  eventHandlers,
} from './handlers.js';
import {
  type Binding,
  type CursorContext,
  type DocumentKind,
  type MarkupElement,
  contextAt,
} from './markup.js';

/** LSP's `CompletionItemKind` values used here. */
const COMPLETION_KIND = {
  class: 7,
  property: 10,
  value: 12,
  event: 23,
} as const;

export interface Completion {
  label: string;
  kind: number;
  detail?: string;
  /** Markdown. */
  documentation?: string;
  deprecated?: boolean;
  /** Keeps the order the items come in: own entries before shared ones. */
  sortText?: string;
  /** The text replaced, as document offsets. */
  start: number;
  end: number;
  newText: string;
}

export interface Hover {
  /** Markdown. */
  markdown: string;
  start: number;
  end: number;
}

/** Where the docs come from: a `Workspace`, or anything shaped like it. */
export interface DocsSource {
  get(file: string, tagName: string): Promise<ComponentDocs | null>;
  tags(file: string): Promise<string[]>;
  /** What every element accepts: global attributes and DOM events. */
  globals?(): {attributes: DocEntry[]; events: DocEntry[]};
}

export interface FeatureRequest {
  file: string;
  code: string;
  kind: DocumentKind;
  offset: number;
  templateTags?: readonly string[];
}

// --- markdown --------------------------------------------------------------

/**
 * Doc prose as markdown: `{@link X}`, `{@link url text}` and `{@link X |
 * text}` become code or links, and the indent JSDoc leaves on a wrapped
 * tag's continuation lines goes, outside fenced code, so four spaces of it
 * never turn a sentence into a code block.
 */
const links = (text: string): string =>
  text
    .split(/(```[\s\S]*?```)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\n[ \t]+/g, '\n')))
    .join('')
    .replace(
      /\{@link(?:code|plain)?\s+([^}\s|]+)(?:\s*\|\s*|\s+)?([^}]*)\}/g,
      (_, target: string, label: string) => {
        const shown = label.trim() || target;
        return /^https?:\/\//.test(target)
          ? `[${shown}](${target})`
          : `\`${shown}\``;
      }
    );

const deprecation = (value: boolean | string | undefined): string[] =>
  value === undefined || value === false
    ? []
    : [`**Deprecated**${typeof value === 'string' ? `: ${links(value)}` : ''}`];

const code = (text: string): string => `\`${text.replace(/`/g, "'")}\``;

/** One line of a list in the component's hover. */
const entryLine = (entry: DocEntry, prefix = ''): string => {
  const name = entry.name === '' ? '(default)' : code(`${prefix}${entry.name}`);
  const type = entry.type ? `: ${code(entry.type)}` : '';
  const description = entry.description
    ? ` — ${links(entry.description).split('\n')[0]}`
    : '';
  return `- ${name}${type}${description}`;
};

const section = (
  title: string,
  entries: DocEntry[],
  prefix?: string
): string[] =>
  entries.length === 0
    ? []
    : [`**${title}**`, ...entries.map((entry) => entryLine(entry, prefix))];

/** Where the docs were read: a source module, or a package's manifest. */
const originLine = (docs: ComponentDocs): string => {
  const {origin} = docs;
  if (origin.source) return `_${code(origin.module)}_`;
  return origin.package ? `_From ${code(origin.package)}_` : '';
};

/** The hover over a tag name: what the component is and its API at a glance. */
const componentMarkdown = (docs: ComponentDocs): string => {
  const head = `**${code(`<${docs.tagName}>`)}**${docs.summary ? ` — ${links(docs.summary)}` : ''}`;
  // Properties that have an attribute are already listed under it.
  const propertyOnly = docs.properties.filter(
    (property) => property.counterpart === undefined
  );
  return [
    [head],
    deprecation(docs.deprecated),
    docs.description ? [links(docs.description)] : [],
    section('Attributes', docs.attributes),
    section('Properties', propertyOnly, '.'),
    section('Events', docs.events, '@'),
    section('Slots', docs.slots),
    section('CSS parts', docs.cssParts),
    section('CSS properties', docs.cssProperties),
    [originLine(docs)],
  ]
    .map((lines) => lines.filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
};

const WHAT: Record<Binding, string> = {
  '': 'attribute',
  '?': 'boolean attribute',
  '.': 'property',
  '@': 'event',
};

/**
 * An entry's type for its hover. An event's is what its listener receives:
 * the event class, and a `CustomEvent`'s `detail` on its own.
 */
const typeFacts = (type: string | undefined, binding: Binding): string[] => {
  if (!type) return [];
  if (binding !== '@') return [`Type ${code(type)}`];
  const generic = /^(\w+)<([\s\S]+)>$/.exec(type);
  if (!generic) return [`Event ${code(type)}`];
  const [, eventClass, detail] = generic;
  return [`Event ${code(eventClass)}`, `${code('detail')} ${code(detail)}`];
};

/** The hover over one attribute, property or event. */
const entryMarkdown = (
  entry: DocEntry,
  binding: Binding,
  headline: string
): string => {
  const facts = [
    ...typeFacts(entry.type, binding),
    entry.default ? `Default ${code(entry.default)}` : '',
    entry.reflects ? 'Reflects to its attribute' : '',
    entry.counterpart
      ? `${binding === '.' ? 'Attribute' : 'Property'} ${code(entry.counterpart)}`
      : '',
    entry.inheritedFrom ? `From ${code(entry.inheritedFrom)}` : '',
  ].filter(Boolean);
  return [
    `**${code(`${binding}${entry.name}`)}** ${headline}`,
    ...deprecation(entry.deprecated),
    entry.description ? links(entry.description) : '',
    facts.join(' · '),
  ]
    .filter(Boolean)
    .join('\n\n');
};

// --- lookups ---------------------------------------------------------------

const isBoolean = (entry: DocEntry): boolean =>
  /\bboolean\b/.test(entry.type ?? '');

/** The entries a binding prefix names: attributes, properties or events. */
const entriesFor = (docs: ComponentDocs, binding: Binding): DocEntry[] => {
  if (binding === '.') return docs.properties;
  if (binding === '@') return docs.events;
  if (binding === '?') return docs.attributes.filter(isBoolean);
  return docs.attributes;
};

/** An entry an element accepts, and the hover's words for whose it is. */
interface Candidate {
  entry: DocEntry;
  headline: string;
}

/**
 * The custom events the components `file` can use fire, other than
 * `except`'s own: they bubble, so any element can listen for them.
 */
const bubblingEvents = async (
  source: DocsSource,
  file: string,
  except: string
): Promise<Candidate[]> => {
  const tags = (await source.tags(file)).filter((tag) => tag !== except);
  const docs = await Promise.all(tags.map((tag) => source.get(file, tag)));
  const byName = new Map<string, {entry: DocEntry; firedBy: string[]}>();
  for (const component of docs) {
    for (const entry of component?.events ?? []) {
      const seen = byName.get(entry.name);
      if (seen) seen.firedBy.push(component!.tagName);
      else byName.set(entry.name, {entry, firedBy: [component!.tagName]});
    }
  }
  return [...byName.values()].map(({entry, firedBy}) => ({
    entry,
    headline: `event fired by ${firedBy.map((tag) => code(`<${tag}>`)).join(', ')}`,
  }));
};

/** What every element accepts under a binding prefix. */
const sharedCandidates = async (
  source: DocsSource,
  file: string,
  tagName: string,
  binding: Binding
): Promise<Candidate[]> => {
  const globals = source.globals?.() ?? {attributes: [], events: []};
  const as = (headline: string) => (entry: DocEntry) => ({entry, headline});
  if (binding === '@') {
    return [
      ...(await bubblingEvents(source, file, tagName)),
      ...globals.events.map(as('DOM event')),
    ];
  }
  if (binding === '?') {
    return globals.attributes.filter(isBoolean).map(as('global attribute'));
  }
  return binding === '' ? globals.attributes.map(as('global attribute')) : [];
};

/** Everything `tagName` accepts under a binding prefix: its own entries first, each name once. */
const candidatesFor = async (
  source: DocsSource,
  file: string,
  tagName: string,
  binding: Binding
): Promise<Candidate[]> => {
  const docs = await source.get(file, tagName);
  const own = docs
    ? entriesFor(docs, binding).map((entry) => ({
        entry,
        headline: `${WHAT[binding]} of ${code(`<${docs.tagName}>`)}`,
      }))
    : [];
  const all = [
    ...own,
    ...(await sharedCandidates(source, file, tagName, binding)),
  ];
  const seen = new Set<string>();
  return all.filter(({entry}) => !seen.has(entry.name) && seen.add(entry.name));
};

const KIND_OF: Record<Binding, number> = {
  '': COMPLETION_KIND.property,
  '?': COMPLETION_KIND.property,
  '.': COMPLETION_KIND.property,
  '@': COMPLETION_KIND.event,
};

/** The string literals of a union type: `'a' | "b"` gives `a`, `b`. */
export const literalValues = (type: string | undefined): string[] =>
  (type ?? '')
    .split('|')
    .map((part) => part.trim())
    .flatMap((part) => {
      const match = /^(['"])(.*)\1$/.exec(part);
      return match ? [match[2]] : [];
    });

const firstLine = (text: string | undefined): string | undefined =>
  text ? links(text).split('\n')[0] : undefined;

/** The names already written on the element, other than the one at the cursor. */
const writtenNames = (
  element: MarkupElement,
  context: CursorContext
): Set<string> =>
  new Set(
    element.attributes
      .filter((attribute) => attribute.nameEnd !== context.end)
      .map((attribute) => `${attribute.binding}${attribute.name}`)
  );

const order = (index: number): string => String(index).padStart(5, '0');

// --- completion ------------------------------------------------------------

const tagCompletion = (
  tag: string,
  docs: ComponentDocs | null,
  context: Extract<CursorContext, {kind: 'tag'}>
): Completion => {
  const item: Completion = {
    label: tag,
    kind: COMPLETION_KIND.class,
    start: context.start,
    end: context.end,
    newText: tag,
  };
  if (!docs) return item;
  const detail = firstLine(docs.summary ?? docs.description);
  return {
    ...item,
    ...(detail ? {detail} : {}),
    documentation: componentMarkdown(docs),
    ...(docs.deprecated ? {deprecated: true} : {}),
  };
};

const tagCompletions = async (
  source: DocsSource,
  file: string,
  context: Extract<CursorContext, {kind: 'tag'}>
): Promise<Completion[]> => {
  const tags = await source.tags(file);
  const docs = await Promise.all(tags.map((tag) => source.get(file, tag)));
  return tags.map((tag, i) => ({
    ...tagCompletion(tag, docs[i], context),
    sortText: order(i),
  }));
};

const attributeCompletions = async (
  source: DocsSource,
  file: string,
  context: Extract<CursorContext, {kind: 'attribute'}>
): Promise<Completion[]> => {
  const {binding, element} = context;
  const written = writtenNames(element, context);
  const candidates = await candidatesFor(source, file, element.tag, binding);
  return candidates
    .filter(({entry}) => !written.has(`${binding}${entry.name}`))
    .map(({entry, headline}, i) => ({
      label: entry.name,
      kind: KIND_OF[binding],
      ...(entry.type ? {detail: entry.type} : {}),
      documentation: entryMarkdown(entry, binding, headline),
      ...(entry.deprecated ? {deprecated: true} : {}),
      sortText: order(i),
      start: context.start,
      end: context.end,
      newText: entry.name,
    }));
};

const valueCompletions = async (
  source: DocsSource,
  file: string,
  context: Extract<CursorContext, {kind: 'value'}>
): Promise<Completion[]> => {
  const {attribute, element} = context;
  const candidates = await candidatesFor(
    source,
    file,
    element.tag,
    attribute.binding
  );
  const found = candidates.find(({entry}) => entry.name === attribute.name);
  return literalValues(found?.entry.type).map((value) => ({
    label: value,
    kind: COMPLETION_KIND.value,
    start: context.start,
    end: context.end,
    newText: value,
  }));
};

/** The type of the event a handler's attribute names, when it's known. */
const handlerType = async (
  source: DocsSource,
  file: string,
  handler: EventHandler
): Promise<string | undefined> => {
  const {element, attribute} = handler;
  const candidates = await candidatesFor(source, file, element.tag, '@');
  return candidates.find(({entry}) => entry.name === attribute.name)?.entry
    .type;
};

/** `ev.` and `ev.detail.` in an inline handler, from the event's type. */
const memberCompletions = async (
  source: DocsSource,
  request: FeatureRequest
): Promise<Completion[]> => {
  const {file, code: text, kind, offset, templateTags} = request;
  const access = memberAccessAt(text, kind, offset, {templateTags});
  if (!access) return [];
  const type = await handlerType(source, file, access.handler);
  if (!type) return [];
  return membersOf(type, access.path).map((member, i) => ({
    label: member.name,
    kind: COMPLETION_KIND.property,
    detail: member.type,
    sortText: order(i),
    start: access.start,
    end: access.end,
    newText: member.name,
  }));
};

/** An untyped inline handler, the type its event has, and the edit that writes it. */
export interface HandlerType {
  handler: EventHandler;
  type: string;
  edit: {start: number; end: number; newText: string};
}

/**
 * The inline handlers whose parameter has no type but whose event has one:
 * for an inlay hint showing it, and a code action writing it in.
 */
export const handlerTypes = async (
  source: DocsSource,
  request: Omit<FeatureRequest, 'offset'>
): Promise<HandlerType[]> => {
  const {file, code: text, kind, templateTags} = request;
  const untyped = eventHandlers(text, kind, {templateTags}).filter(
    (handler) => !handler.param.typed
  );
  const typed = await Promise.all(
    untyped.map(async (handler) => {
      const type = await handlerType(source, file, handler);
      if (!type) return [];
      const {name, start, end, parenthesized} = handler.param;
      const newText = parenthesized ? `${name}: ${type}` : `(${name}: ${type})`;
      return [{handler, type, edit: {start, end, newText}}];
    })
  );
  return typed.flat();
};

/** The completion items for the cursor, or none outside a start tag. */
export const completionsAt = async (
  source: DocsSource,
  request: FeatureRequest
): Promise<Completion[]> => {
  const {file, code: text, kind, offset, templateTags} = request;
  const context = contextAt(text, kind, offset, {templateTags});
  if (!context) return memberCompletions(source, request);
  if (context.kind === 'tag') return tagCompletions(source, file, context);
  return context.kind === 'attribute'
    ? attributeCompletions(source, file, context)
    : valueCompletions(source, file, context);
};

// --- hover -----------------------------------------------------------------

/** The hover for the cursor: on a tag name, or on an attribute, property or event name. */
export const hoverAt = async (
  source: DocsSource,
  request: FeatureRequest
): Promise<Hover | undefined> => {
  const {file, code: text, kind, offset, templateTags} = request;
  const context = contextAt(text, kind, offset, {templateTags});
  if (!context || context.kind === 'value') return undefined;
  const {start, end} = context;
  if (context.kind === 'tag') {
    const docs = await source.get(file, context.element.tag);
    return docs ? {markdown: componentMarkdown(docs), start, end} : undefined;
  }
  const name = text.slice(start, end);
  const candidates = await candidatesFor(
    source,
    file,
    context.element.tag,
    context.binding
  );
  const found = candidates.find(({entry}) => entry.name === name);
  return found
    ? {
        markdown: entryMarkdown(found.entry, context.binding, found.headline),
        start,
        end,
      }
    : undefined;
};
