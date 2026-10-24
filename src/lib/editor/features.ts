/**
 * The language server's answers, before any protocol: completion items and
 * hover text for the cursor, from the cursor context and the components'
 * docs. Shapes follow LSP's, with document offsets instead of positions, so
 * the server only maps offsets and passes these on.
 */

import type {ComponentDocs, DocEntry} from '../../types/component-docs.js';
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
  sourceTags(): string[];
}

export interface FeatureRequest {
  file: string;
  code: string;
  kind: DocumentKind;
  offset: number;
  templateTags?: readonly string[];
}

// --- markdown --------------------------------------------------------------

/** `{@link X}`, `{@link url text}` and `{@link X | text}` as markdown. */
const links = (text: string): string =>
  text.replace(
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

/** The hover over one attribute, property or event. */
const entryMarkdown = (
  docs: ComponentDocs,
  entry: DocEntry,
  binding: Binding
): string => {
  const facts = [
    entry.type ? `Type ${code(entry.type)}` : '',
    entry.default ? `Default ${code(entry.default)}` : '',
    entry.reflects ? 'Reflects to its attribute' : '',
    entry.counterpart
      ? `${binding === '.' ? 'Attribute' : 'Property'} ${code(entry.counterpart)}`
      : '',
    entry.inheritedFrom ? `From ${code(entry.inheritedFrom)}` : '',
  ].filter(Boolean);
  return [
    `**${code(`${binding}${entry.name}`)}** ${WHAT[binding]} of ${code(`<${docs.tagName}>`)}`,
    ...deprecation(entry.deprecated),
    entry.description ? links(entry.description) : '',
    facts.join(' · '),
  ]
    .filter(Boolean)
    .join('\n\n');
};

// --- lookups ---------------------------------------------------------------

/** The entries a binding prefix names: attributes, properties or events. */
const entriesFor = (docs: ComponentDocs, binding: Binding): DocEntry[] => {
  if (binding === '.') return docs.properties;
  if (binding === '@') return docs.events;
  if (binding === '?') {
    return docs.attributes.filter((entry) =>
      /\bboolean\b/.test(entry.type ?? '')
    );
  }
  return docs.attributes;
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
  const tags = source.sourceTags();
  const docs = await Promise.all(tags.map((tag) => source.get(file, tag)));
  return tags.map((tag, i) => tagCompletion(tag, docs[i], context));
};

const attributeCompletions = (
  docs: ComponentDocs,
  context: Extract<CursorContext, {kind: 'attribute'}>
): Completion[] => {
  const written = writtenNames(context.element, context);
  return entriesFor(docs, context.binding)
    .filter((entry) => !written.has(`${context.binding}${entry.name}`))
    .map((entry) => ({
      label: entry.name,
      kind: KIND_OF[context.binding],
      ...(entry.type ? {detail: entry.type} : {}),
      documentation: entryMarkdown(docs, entry, context.binding),
      ...(entry.deprecated ? {deprecated: true} : {}),
      start: context.start,
      end: context.end,
      newText: entry.name,
    }));
};

const valueCompletions = (
  docs: ComponentDocs,
  context: Extract<CursorContext, {kind: 'value'}>
): Completion[] => {
  const {attribute} = context;
  const entry = entriesFor(docs, attribute.binding).find(
    (candidate) => candidate.name === attribute.name
  );
  return literalValues(entry?.type).map((value) => ({
    label: value,
    kind: COMPLETION_KIND.value,
    start: context.start,
    end: context.end,
    newText: value,
  }));
};

/** The completion items for the cursor, or none outside a start tag. */
export const completionsAt = async (
  source: DocsSource,
  request: FeatureRequest
): Promise<Completion[]> => {
  const {file, code: text, kind, offset, templateTags} = request;
  const context = contextAt(text, kind, offset, {templateTags});
  if (!context) return [];
  if (context.kind === 'tag') return tagCompletions(source, file, context);
  const docs = await source.get(file, context.element.tag);
  if (!docs) return [];
  return context.kind === 'attribute'
    ? attributeCompletions(docs, context)
    : valueCompletions(docs, context);
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
  const docs = await source.get(file, context.element.tag);
  if (!docs) return undefined;
  if (context.kind === 'tag') {
    return {
      markdown: componentMarkdown(docs),
      start: context.start,
      end: context.end,
    };
  }
  const name = text.slice(context.start, context.end);
  const entry = entriesFor(docs, context.binding).find((e) => e.name === name);
  return entry
    ? {
        markdown: entryMarkdown(docs, entry, context.binding),
        start: context.start,
        end: context.end,
      }
    : undefined;
};
