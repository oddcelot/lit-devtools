/**
 * Names in a Lit template that nothing defines, and values a component's
 * attribute doesn't take:
 *
 * - `unknown-element`: a tag that isn't HTML, SVG or a component the file
 *   can use (from source or a dependency's manifest).
 * - `unknown-attribute`: an attribute, plain or `?`, the element doesn't
 *   have. `data-*`, `aria-*` and namespaced names always pass.
 * - `unknown-binding`: a `.property` a component doesn't have, nor every
 *   HTML element (`.hidden`, `.textContent`). Standard elements' own
 *   properties aren't in the HTML data, so only components are read, and
 *   `@event`s aren't reported: any element hears the events that bubble
 *   to it, from code the server can't read.
 * - `invalid-value`: a component's attribute written with a value outside
 *   its type, `size="huge"` where `size` is `'small' | 'large'`.
 * - `unknown-slot`: a child's `slot="…"` its parent component doesn't
 *   declare, read only when the component declares slots at all.
 *
 * Only Lit templates are read, where HTML and SVG are known too. What the
 * settings' `ignoreTags` and `ignoreAttributes` match is never reported.
 */

import type {Problem} from './diagnostics.js';
import {DOM_EVENT_TYPES} from './dom-events.js';
import {HTML_ELEMENT_PROPERTIES} from './dom-properties.js';
import {
  type DocsSource,
  type FeatureRequest,
  bindingNames,
  bindingTypeOf,
  literalValues,
} from './features.js';
import {
  type MarkupAttribute,
  type MarkupElement,
  type MarkupRegion,
  markupRegions,
  scanMarkup,
} from './markup.js';
import {elementParents} from './markup-tree.js';

type Request = Omit<FeatureRequest, 'offset'>;

/** A matcher for names, `*` standing for any run of characters. */
const matcherOf = (patterns: readonly string[] = []) => {
  const res = patterns.map(
    (pattern) =>
      new RegExp(
        `^${pattern
          .split('*')
          .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*')}$`,
        'i'
      )
  );
  return (name: string) => res.some((re) => re.test(name));
};

/** How many single-character edits turn `a` into `b`. */
const distance = (a: string, b: string): number => {
  let row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + cost);
    }
    row = next;
  }
  return row[b.length];
};

/** ` Did you mean …?` for the nearest of `names`, when one is close. */
const suggestion = (
  name: string,
  names: Iterable<string>,
  show: (name: string) => string
): string => {
  let best: string | undefined;
  // A typo, not a different name: two edits at most, fewer in a short one.
  let bestDistance = Math.min(2, Math.max(1, Math.floor(name.length / 4)));
  for (const candidate of names) {
    const d = distance(name.toLowerCase(), candidate.toLowerCase());
    if (d > 0 && d <= bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best ? ` Did you mean ${show(best)}?` : '';
};

/** A name written by an expression or half typed, which nothing can be said of. */
const unreadable = (name: string) => !name || /[${}]/.test(name);

/**
 * Attributes no data lists but every element takes: `data-*`, `aria-*`,
 * namespaced ones and `xmlns`, and Lit SSR's `defer-hydration`.
 */
const ALWAYS_ATTRIBUTE = /^(data-|aria-)|:|^xmlns$|^defer-hydration$/i;

/**
 * Props JSX passes React or Preact, not the element: `key`, `ref`,
 * `className` and the like.
 */
const FRAMEWORK_PROPS = new Set(
  [
    'key',
    'ref',
    'children',
    'className',
    'dangerouslySetInnerHTML',
    'suppressHydrationWarning',
    'suppressContentEditableWarning',
  ].map((name) => name.toLowerCase())
);

interface Context {
  source: DocsSource;
  request: Request;
  ignoreTag: (tag: string) => boolean;
  ignoreAttribute: (name: string) => boolean;
  tags: Set<string>;
  /** HTML's global attributes, lowercased, where the docs source doesn't add them. */
  globals: Set<string>;
}

/**
 * Whether only custom elements are read: outside a Lit template in a
 * script, HTML and SVG aren't known, and the editor's own support for the
 * language has them.
 */
const customOnly = (request: Request, element: MarkupElement): boolean =>
  request.kind !== 'script' || element.dialect !== undefined;

/** A prop the element takes without declaring it: a global attribute, a framework's, a DOM event's handler. */
const takenAnyway = (
  context: Context,
  element: MarkupElement,
  name: string
) => {
  const lower = name.toLowerCase();
  if (context.globals.has(lower) || FRAMEWORK_PROPS.has(lower)) return true;
  return (
    element.dialect === 'jsx' &&
    /^on[a-z]/i.test(name) &&
    lower.slice(2) in DOM_EVENT_TYPES
  );
};

const elementProblem = (
  {tags}: Context,
  element: MarkupElement
): Problem | undefined => {
  if (tags.has(element.tag.toLowerCase())) return undefined;
  const customTags = [...tags].filter((tag) => tag.includes('-'));
  return {
    rule: 'unknown-element',
    start: element.start + 1,
    end: element.nameEnd,
    message: `\`<${element.tag}>\` isn't HTML, SVG or a component this file can use.${suggestion(element.tag, customTags, (tag) => `\`<${tag}>\``)}`,
  };
};

const attributeProblem = async (
  context: Context,
  element: MarkupElement,
  attribute: MarkupAttribute
): Promise<Problem | undefined> => {
  const {name, binding} = attribute;
  if (ALWAYS_ATTRIBUTE.test(name) || context.ignoreAttribute(name))
    return undefined;
  if (takenAnyway(context, element, name)) return undefined;
  const {source, request} = context;
  const names = await bindingNames(source, request.file, element, '');
  if (names.some((known) => known.toLowerCase() === name.toLowerCase()))
    return undefined;
  return {
    rule: 'unknown-attribute',
    start: attribute.nameStart,
    end: attribute.nameEnd,
    message: `\`<${element.tag}>\` has no attribute \`${name}\`.${suggestion(name, names, (n) => `\`${binding}${n}\``)}`,
  };
};

const propertyProblem = async (
  context: Context,
  element: MarkupElement,
  attribute: MarkupAttribute
): Promise<Problem | undefined> => {
  const {name} = attribute;
  if (!element.tag.includes('-')) return undefined;
  if (HTML_ELEMENT_PROPERTIES.has(name) || context.ignoreAttribute(name))
    return undefined;
  const {source, request} = context;
  const names = await bindingNames(source, request.file, element, '.');
  if (names.includes(name)) return undefined;
  return {
    rule: 'unknown-binding',
    start: attribute.nameStart,
    end: attribute.nameEnd,
    message: `\`<${element.tag}>\` has no property \`.${name}\`.${suggestion(name, names, (n) => `\`.${n}\``)}`,
  };
};

/** Why a written value isn't one of the attribute type's string literals or a number. */
const valueMismatch = (value: string, type: string): string | undefined => {
  const parts = type.split('|').map((part) => part.trim());
  const strings = literalValues(type);
  if (parts.length === 1 && parts[0] === 'number') {
    return value.trim() === '' || Number.isNaN(Number(value))
      ? 'a number'
      : undefined;
  }
  const typed = parts.filter((p) => p !== 'undefined' && p !== 'null');
  if (strings.length === 0 || strings.length !== typed.length) return undefined;
  return strings.includes(value)
    ? undefined
    : `one of ${strings.map((s) => `\`${s}\``).join(', ')}`;
};

const valueProblem = async (
  {source, request}: Context,
  element: MarkupElement,
  attribute: MarkupAttribute
): Promise<Problem | undefined> => {
  const {value, name} = attribute;
  if (!value || value.expression || !element.tag.includes('-'))
    return undefined;
  const type = await bindingTypeOf(source, request.file, element.tag, '', name);
  const text = request.code.slice(value.start, value.end);
  const wanted = type && valueMismatch(text, type);
  if (!wanted) return undefined;
  return {
    rule: 'invalid-value',
    start: value.start,
    end: value.end,
    message: `\`${name}\` takes ${wanted}, not \`${text}\`.`,
  };
};

const attributeProblems = (
  context: Context,
  element: MarkupElement,
  attribute: MarkupAttribute
): Promise<Problem | undefined>[] => {
  if (unreadable(attribute.name)) return [];
  switch (attribute.binding) {
    case '.':
      return [propertyProblem(context, element, attribute)];
    case '@':
      return [];
    case '?':
      return [attributeProblem(context, element, attribute)];
    default:
      return [
        attributeProblem(context, element, attribute),
        valueProblem(context, element, attribute),
      ];
  }
};

const problemsOf = async (
  context: Context,
  element: MarkupElement
): Promise<Problem[]> => {
  if (unreadable(element.tag) || context.ignoreTag(element.tag)) return [];
  if (customOnly(context.request, element) && !element.tag.includes('-'))
    return [];
  const unknown = elementProblem(context, element);
  if (unknown) return [unknown];
  const found = await Promise.all(
    element.attributes.flatMap((attribute) =>
      attributeProblems(context, element, attribute)
    )
  );
  return found.filter((problem) => problem !== undefined);
};

/** A static `slot="…"` value on an element. */
const slotValueOf = (element: MarkupElement) => {
  const value = element.attributes.find(
    (attribute) => attribute.name === 'slot' && attribute.binding === ''
  )?.value;
  return value && !value.expression ? value : undefined;
};

/** The nearest slot name, else the component's named slots. */
const slotHint = (name: string, names: string[]): string => {
  const named = names.filter(Boolean);
  const listed = named.map((n) => `\`${n}\``).join(', ');
  return (
    suggestion(name, named, (n) => `\`${n}\``) ||
    (named.length > 0
      ? ` Its slots: ${listed}.`
      : ' It has only the default slot.')
  );
};

/** A `slot="…"` its parent component doesn't declare, when it declares any. */
const slotProblem = async (
  {source, request, ignoreTag}: Context,
  element: MarkupElement,
  parent: MarkupElement | undefined
): Promise<Problem | undefined> => {
  const value = slotValueOf(element);
  if (!value || !parent?.tag.includes('-') || ignoreTag(parent.tag))
    return undefined;
  const docs = await source.get(request.file, parent.tag);
  const names = (docs?.slots ?? []).map((entry) => entry.name);
  const name = request.code.slice(value.start, value.end);
  if (names.length === 0 || names.includes(name)) return undefined;
  return {
    rule: 'unknown-slot',
    start: value.start,
    end: value.end,
    message: `\`<${parent.tag}>\` has no slot \`${name}\`.${slotHint(name, names)}`,
  };
};

const slotProblems = async (
  context: Context,
  regions: MarkupRegion[]
): Promise<Problem[]> => {
  const found = await Promise.all(
    regions.flatMap((region) =>
      elementParents(context.request.code, region).map(({element, parent}) =>
        slotProblem(context, element, parent)
      )
    )
  );
  return found.filter((problem) => problem !== undefined);
};

/**
 * Tags the document defines itself, as an Astro component's or a page's
 * `<script>` does, which the workspace doesn't read components from.
 */
const definedHere = (code: string): string[] =>
  [
    ...code.matchAll(
      /(?:customElements\.define|@customElement)\(\s*['"]([a-z][\w.-]*-[\w.-]*)['"]/g
    ),
  ].map((match) => match[1]);

/** The unknown names and invalid values in a document's Lit templates. */
export const unknownNameProblems = async (
  source: DocsSource,
  request: Request
): Promise<Problem[]> => {
  if (request.kind === 'html' && !request.code.includes('-')) return [];
  const regions = markupRegions(request.code, request.kind, {
    templateTags: request.templateTags,
  });
  if (regions.length === 0) return [];
  const context: Context = {
    source,
    request,
    ignoreTag: matcherOf(request.ignoreTags),
    ignoreAttribute: matcherOf(request.ignoreAttributes),
    tags: new Set([
      ...(await source.tags(request.file)).map((tag) => tag.toLowerCase()),
      ...definedHere(request.code),
    ]),
    globals: new Set(
      (source.globalAttributes?.() ?? []).map((name) => name.toLowerCase())
    ),
  };
  const elements = regions.flatMap((region) =>
    scanMarkup(request.code, region)
  );
  const problems = await Promise.all(
    elements.map((element) => problemsOf(context, element))
  );
  return [...problems.flat(), ...(await slotProblems(context, regions))];
};
