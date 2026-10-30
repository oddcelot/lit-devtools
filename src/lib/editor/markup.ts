/**
 * Reads the elements and attributes in markup, and says what the cursor is on:
 * a tag name, an attribute name (with Lit's `.`, `@` or `?` prefix) or an
 * attribute value.
 *
 * Markup is an HTML file, or a template `findTemplates` found in a script. A
 * template's `${…}` holes are masked to the same length, so every offset here
 * is an offset into the document. The scanner forgives what a user has only
 * half typed: a tag runs until `>`, the next `<` or the end, and a quote until
 * its match or the end.
 */

import {
  type Dialect,
  type Hole,
  findDocumentRegions,
  findTemplates,
} from './templates.js';

/** Lit's binding prefix on an attribute name; `''` for a plain attribute. */
export type Binding = '' | '.' | '@' | '?';

export interface AttributeValue {
  /** Inside the quotes, when quoted. */
  start: number;
  end: number;
  quote: '"' | "'" | '';
  /** Holds a `${…}` hole, so its value is only known at runtime. */
  expression: boolean;
}

export interface MarkupAttribute {
  /** Without the binding prefix. */
  name: string;
  binding: Binding;
  /**
   * The prefix as written, when it isn't the binding itself: Solid's
   * `on:`, `prop:`, `attr:` and `bool:` in JSX.
   */
  prefix?: string;
  /** At the prefix, when there is one. */
  nameStart: number;
  nameEnd: number;
  value?: AttributeValue;
}

export interface MarkupElement {
  /** As written; empty while only `<` is typed. */
  tag: string;
  /** At the `<`. */
  start: number;
  nameEnd: number;
  /** Just past the `>`, or where the scanner stopped when it's unclosed. */
  end: number;
  closed: boolean;
  attributes: MarkupAttribute[];
  /** For `<script>`, `<style>`, `<textarea>` and `<title>`: the raw text. */
  content?: {start: number; end: number};
  /** Absent in a Lit template or an HTML file. */
  dialect?: Exclude<Dialect, 'lit'>;
}

/** A stretch of a document that holds markup. */
export interface MarkupRegion {
  start: number;
  end: number;
  holes: Hole[];
  /** Absent for a Lit template or an HTML file. */
  dialect?: Exclude<Dialect, 'lit'>;
}

/**
 * A script (`script`, or `jsx` for one that holds JSX), an HTML file, or an
 * Astro or MDX document.
 */
export type DocumentKind = 'html' | 'script' | 'jsx' | 'astro' | 'mdx';

/** Solid's attribute namespaces in JSX, and the binding each one is. */
const JSX_NAMESPACES: Record<string, Binding> = {
  'on:': '@',
  'prop:': '.',
  'attr:': '',
  'bool:': '?',
};

/** Where an attribute's name starts, after any binding prefix. */
export const nameStartOf = (attribute: MarkupAttribute): number =>
  attribute.nameStart + (attribute.prefix ?? attribute.binding).length;

export type CursorContext =
  | {
      kind: 'tag';
      element: MarkupElement;
      /** The tag name typed before the cursor. */
      prefix: string;
      /** The tag name's range, to replace on completion. */
      start: number;
      end: number;
    }
  | {
      kind: 'attribute';
      element: MarkupElement;
      binding: Binding;
      prefix: string;
      /** The name's range after the prefix; empty between attributes. */
      start: number;
      end: number;
    }
  | {
      kind: 'value';
      element: MarkupElement;
      attribute: MarkupAttribute;
      prefix: string;
      start: number;
      end: number;
    };

export interface MarkupOptions {
  /** Template tags to read in scripts; `html` and `svg` by default. */
  templateTags?: readonly string[];
}

const HOLE = '';
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const NAME_END = /[\s/>"'=<]/;

const mask = (code: string, region: MarkupRegion): string => {
  let text = '';
  let at = region.start;
  for (const hole of region.holes) {
    const end = Math.min(hole.end, region.end);
    text += code.slice(at, hole.start) + HOLE.repeat(end - hole.start);
    at = end;
  }
  return text + code.slice(at, region.end);
};

class Scanner {
  readonly elements: MarkupElement[] = [];
  private readonly text: string;
  private readonly base: number;
  private readonly dialect: MarkupRegion['dialect'];

  constructor(code: string, region: MarkupRegion) {
    this.text = mask(code, region);
    this.base = region.start;
    this.dialect = region.dialect;
  }

  /** An attribute's binding and the prefix that writes it. */
  private bindingOf(raw: string): {binding: Binding; prefix: string} {
    if (this.dialect === undefined) {
      const binding = '.@?'.includes(raw[0]) ? (raw[0] as Binding) : '';
      return {binding, prefix: binding};
    }
    if (this.dialect === 'jsx') {
      const prefix = /^(?:on|prop|attr|bool):/.exec(raw)?.[0];
      if (prefix) return {binding: JSX_NAMESPACES[prefix], prefix};
    }
    return {binding: '', prefix: ''};
  }

  run(): MarkupElement[] {
    let i = 0;
    for (;;) {
      const lt = this.text.indexOf('<', i);
      if (lt === -1) return this.elements;
      i = this.afterAngle(lt);
    }
  }

  /** Reads what starts at a `<` and returns where to look for the next one. */
  private afterAngle(lt: number): number {
    const next = this.text[lt + 1];
    if (next === '!') return this.skipComment(lt);
    if (next === '/') return this.skipPast('>', lt);
    // A letter starts a tag; so does a line break or the end, where the user
    // has typed only `<`. `a < b` in text starts none.
    if (next !== undefined && !/[A-Za-z\r\n]/.test(next)) return lt + 1;
    const element = this.element(lt);
    this.elements.push(element);
    return this.skipRawText(element);
  }

  private element(lt: number): MarkupElement {
    let j = this.nameEnd(lt + 1);
    const element: MarkupElement = {
      tag: this.text.slice(lt + 1, j),
      start: this.base + lt,
      nameEnd: this.base + j,
      end: this.base + this.text.length,
      closed: false,
      attributes: [],
      ...(this.dialect ? {dialect: this.dialect} : {}),
    };
    for (;;) {
      j = this.skipSpace(j);
      const char = this.text[j];
      if (char === undefined || char === '<') {
        element.end = this.base + j;
        return element;
      }
      if (char === '>') {
        element.end = this.base + j + 1;
        element.closed = true;
        return element;
      }
      j = this.attribute(j, element);
    }
  }

  /** Reads one attribute into `element` and returns where it ends. */
  private attribute(j: number, element: MarkupElement): number {
    const nameStart = j;
    const nameEnd = Math.max(this.nameEnd(j), j + 1);
    const raw = this.text.slice(nameStart, nameEnd);
    const {binding, prefix} = this.bindingOf(raw);
    const {value, end} = this.value(nameEnd);
    if (/^[^\s>"'=<]/.test(raw) && !raw.includes(HOLE)) {
      element.attributes.push({
        name: raw.slice(prefix.length),
        binding,
        ...(prefix !== binding ? {prefix} : {}),
        nameStart: this.base + nameStart,
        nameEnd: this.base + nameEnd,
        ...(value ? {value} : {}),
      });
    }
    return end;
  }

  private value(nameEnd: number): {value?: AttributeValue; end: number} {
    let k = this.skipSpace(nameEnd);
    if (this.text[k] !== '=') return {end: nameEnd};
    k = this.skipSpace(k + 1);
    const quote = this.text[k];
    if (quote === '"' || quote === "'") {
      const close = this.text.indexOf(quote, k + 1);
      const end = close === -1 ? this.text.length : close;
      return {value: this.valueAt(k + 1, end, quote), end: end + 1};
    }
    let end = k;
    while (end < this.text.length && !/[\s><]/.test(this.text[end])) end++;
    return {value: this.valueAt(k, end, ''), end};
  }

  private valueAt(
    start: number,
    end: number,
    quote: AttributeValue['quote']
  ): AttributeValue {
    return {
      start: this.base + start,
      end: this.base + end,
      quote,
      expression: this.text.slice(start, end).includes(HOLE),
    };
  }

  private skipRawText(element: MarkupElement): number {
    const local = element.end - this.base;
    if (!element.closed || !RAW_TEXT.has(element.tag.toLowerCase())) {
      return local;
    }
    const close = this.text
      .toLowerCase()
      .indexOf(`</${element.tag.toLowerCase()}`, local);
    const end = close === -1 ? this.text.length : close;
    element.content = {start: this.base + local, end: this.base + end};
    return end;
  }

  private skipComment(lt: number): number {
    if (this.text.startsWith('<!--', lt)) {
      const close = this.text.indexOf('-->', lt + 4);
      return close === -1 ? this.text.length : close + 3;
    }
    return this.skipPast('>', lt);
  }

  private skipPast(char: string, from: number): number {
    const at = this.text.indexOf(char, from);
    return at === -1 ? this.text.length : at + 1;
  }

  private nameEnd(from: number): number {
    let j = from;
    while (j < this.text.length && !NAME_END.test(this.text[j])) j++;
    return j;
  }

  private skipSpace(from: number): number {
    let j = from;
    while (j < this.text.length && /[\s/]/.test(this.text[j])) j++;
    return j;
  }
}

/** The elements in one markup region, in source order. */
export const scanMarkup = (
  code: string,
  region: MarkupRegion
): MarkupElement[] => new Scanner(code, region).run();

/**
 * The markup regions of a document: the templates of a script, or an HTML
 * file and the templates in its inline scripts.
 */
export const markupRegions = (
  code: string,
  kind: DocumentKind,
  options: MarkupOptions = {}
): MarkupRegion[] => {
  const tags = options.templateTags;
  if (kind === 'script') return findTemplates(code, tags);
  if (kind === 'jsx') return findTemplates(code, tags, {jsx: true});
  if (kind === 'mdx') return findDocumentRegions(code, 'mdx', tags);
  if (kind === 'astro') {
    const regions = findDocumentRegions(code, 'astro', tags);
    const body = regions.find((region) => region.end === code.length);
    return [...regions, ...(body ? inlineScripts(code, body, tags) : [])];
  }
  const page = {start: 0, end: code.length, holes: []};
  return [page, ...inlineScripts(code, page, tags)];
};

/**
 * The `<script>` elements of an HTML file, or of an Astro file's body: not
 * its frontmatter, which runs on the server.
 */
export const pageScripts = (
  code: string,
  kind: 'html' | 'astro'
): MarkupElement[] => {
  const page =
    kind === 'html'
      ? {start: 0, end: code.length, holes: []}
      : findDocumentRegions(code, 'astro').find(
          (region) => region.end === code.length
        );
  return page
    ? scanMarkup(code, page).filter(
        (element) => element.tag.toLowerCase() === 'script'
      )
    : [];
};

/** The templates in a page's inline `<script>` elements. */
const inlineScripts = (
  code: string,
  page: MarkupRegion,
  tags: readonly string[] | undefined
): MarkupRegion[] =>
  scanMarkup(code, page).flatMap((element) =>
    element.tag.toLowerCase() === 'script' && element.content
      ? shift(
          findTemplates(
            code.slice(element.content.start, element.content.end),
            tags
          ),
          element.content.start
        )
      : []
  );

const shift = (regions: MarkupRegion[], by: number): MarkupRegion[] =>
  regions.map((region) => ({
    start: region.start + by,
    end: region.end + by,
    holes: region.holes.map((hole) => ({
      start: hole.start + by,
      end: hole.end + by,
    })),
  }));

const inHole = (region: MarkupRegion, offset: number): boolean =>
  region.holes.some((hole) => hole.start < offset && offset < hole.end);

/** The innermost region the offset is markup in, outside any hole. */
const regionAt = (
  regions: MarkupRegion[],
  offset: number
): MarkupRegion | undefined =>
  regions
    .filter((r) => r.start <= offset && offset <= r.end && !inHole(r, offset))
    .sort((a, b) => b.start - a.start)[0];

const elementAt = (
  elements: MarkupElement[],
  offset: number
): MarkupElement | undefined =>
  elements.find(
    (e) => e.start < offset && offset <= e.end - (e.closed ? 1 : 0)
  );

/** What the cursor at `offset` is on inside one element's start tag. */
const contextInElement = (
  code: string,
  element: MarkupElement,
  offset: number
): CursorContext | undefined => {
  if (offset <= element.nameEnd) {
    const start = element.start + 1;
    const prefix = code.slice(start, offset);
    return {kind: 'tag', element, prefix, start, end: element.nameEnd};
  }
  for (const attribute of element.attributes) {
    const {binding, nameEnd, value} = attribute;
    const start = nameStartOf(attribute);
    if (start <= offset && offset <= nameEnd) {
      const prefix = code.slice(start, offset);
      return {kind: 'attribute', element, binding, prefix, start, end: nameEnd};
    }
    if (value && value.start <= offset && offset <= value.end) {
      if (value.expression) return undefined;
      const prefix = code.slice(value.start, offset);
      const {start: vStart, end} = value;
      return {kind: 'value', element, attribute, prefix, start: vStart, end};
    }
  }
  return {
    kind: 'attribute',
    element,
    binding: '',
    prefix: '',
    start: offset,
    end: offset,
  };
};

/**
 * What the cursor at `offset` is on, or undefined when it's outside any start
 * tag: in text, a closing tag, a comment, or a `${…}` hole.
 */
export const contextAt = (
  code: string,
  kind: DocumentKind,
  offset: number,
  options: MarkupOptions = {}
): CursorContext | undefined => {
  const region = regionAt(markupRegions(code, kind, options), offset);
  if (!region) return undefined;
  const element = elementAt(scanMarkup(code, region), offset);
  return element && contextInElement(code, element, offset);
};
