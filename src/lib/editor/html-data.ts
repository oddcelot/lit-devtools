/**
 * Standard HTML elements as component docs, from data in VS Code's custom
 * data format (`@vscode/web-custom-data`, which the language server bundles):
 * each element with its own attributes, and what every element accepts, the
 * global attributes and the DOM events (the `on…` handler attributes, named
 * as `@` bindings name them, typed by the interface the browser dispatches).
 *
 * The data comes in as an argument, so this module doesn't carry it.
 */

import type {ComponentDocs, DocEntry} from '../../types/component-docs.js';
import {DOM_EVENT_TYPES} from './dom-events.js';

type Description = string | {kind?: string; value: string};

interface Reference {
  name: string;
  url: string;
}

interface AttributeData {
  name: string;
  description?: Description;
  valueSet?: string;
  values?: {name: string}[];
  references?: Reference[];
}

/** The parts of VS Code's HTML custom data (version 1.1) read here. */
export interface HtmlData {
  tags?: {
    name: string;
    description?: Description;
    attributes?: AttributeData[];
    references?: Reference[];
  }[];
  globalAttributes?: AttributeData[];
  valueSets?: {name: string; values: {name: string}[]}[];
}

export interface HtmlDocs {
  get(tagName: string): ComponentDocs | null;
  tags(): string[];
  /** What every element accepts. */
  globals: {attributes: DocEntry[]; events: DocEntry[]};
}

const textOf = (
  description: Description | undefined,
  references: Reference[] = []
): string | undefined => {
  const text =
    typeof description === 'string' ? description : description?.value;
  const links = references.map(({name, url}) => `[${name}](${url})`);
  const parts = [text, links.join(' · ')].filter(Boolean);
  return parts.length > 0 ? parts.join('\n\n') : undefined;
};

/** `v` is the data's set for a boolean attribute; others list the values. */
const typeOf = (
  attribute: AttributeData,
  sets: Map<string, string[]>
): string | undefined => {
  if (attribute.valueSet === 'v') return 'boolean';
  const values =
    attribute.values?.map((value) => value.name) ??
    (attribute.valueSet ? sets.get(attribute.valueSet) : undefined);
  return values && values.length > 0
    ? values.map((value) => `'${value}'`).join(' | ')
    : undefined;
};

const entryOf = (
  attribute: AttributeData,
  sets: Map<string, string[]>,
  name = attribute.name
): DocEntry => {
  const description = textOf(attribute.description, attribute.references);
  const type = typeOf(attribute, sets);
  return {
    name,
    ...(description ? {description} : {}),
    ...(type ? {type} : {}),
  };
};

const docsOf = (
  tag: NonNullable<HtmlData['tags']>[number],
  sets: Map<string, string[]>
): ComponentDocs => {
  const description = textOf(tag.description, tag.references);
  return {
    tagName: tag.name,
    className: '',
    ...(description ? {description} : {}),
    properties: [],
    attributes: (tag.attributes ?? []).map((a) => entryOf(a, sets)),
    events: [],
    slots: [],
    cssParts: [],
    cssProperties: [],
    cssStates: [],
    origin: {manifest: '', module: ''},
  };
};

export const createHtmlDocs = (data: HtmlData): HtmlDocs => {
  const sets = new Map(
    (data.valueSets ?? []).map((set) => [
      set.name,
      set.values.map((value) => value.name),
    ])
  );
  const tags = new Map(
    (data.tags ?? []).map((tag) => [tag.name, docsOf(tag, sets)])
  );
  const globals = data.globalAttributes ?? [];
  const isHandler = (attribute: AttributeData) =>
    attribute.name.startsWith('on');
  return {
    get: (tagName) => tags.get(tagName) ?? null,
    tags: () => [...tags.keys()],
    globals: {
      attributes: globals
        .filter((a) => !isHandler(a))
        .map((a) => entryOf(a, sets)),
      // Typed by the interface the browser dispatches, `Event` when unlisted.
      events: globals.filter(isHandler).map((a) => ({
        ...entryOf(a, sets, a.name.slice(2)),
        type: DOM_EVENT_TYPES[a.name.slice(2)] ?? 'Event',
      })),
    },
  };
};
