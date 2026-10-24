/**
 * Finds and reads the `/** … *\/` comment that documents a declaration, in
 * the tag vocabulary the Custom Elements Manifest analyzer reads (`@fires`,
 * `@slot`, `@csspart`, `@cssprop`, `@cssstate`, `@summary`, `@deprecated`,
 * `@example`).
 *
 * The parsed tree carries no comments, so the comment is found by looking back
 * from the declaration's first character (its first decorator, or the
 * `export` that wraps it). Only whitespace may sit between the two, which is
 * also what makes a comment a doc comment rather than a stray one above.
 */

import type {DocEntry, DocExample} from '../../types/component-docs.js';

interface JsDocTag {
  tag: string;
  /** The text after the tag name, continuation lines joined with `\n`. */
  text: string;
}

export interface JsDoc {
  /** The text before the first tag. */
  description?: string;
  tags: JsDocTag[];
}

/** The body of the doc comment that ends right before `position`, if one does. */
const docCommentBefore = (
  code: string,
  position: number
): string | undefined => {
  let end = position;
  while (end > 0 && /\s/.test(code[end - 1])) end--;
  if (!code.startsWith('*/', end - 2)) return undefined;
  const start = code.lastIndexOf('/*', end - 3);
  if (start === -1 || code[start + 2] !== '*') return undefined;
  return code.slice(start + 3, end - 2);
};

/** The comment's lines with the leading ` * ` gutter removed. */
const linesOf = (body: string): string[] =>
  body.split(/\r?\n/).map((line) => line.replace(/^\s*\*? ?/, ''));

const trimmed = (value: string): string | undefined => {
  const result = value.trim();
  return result === '' ? undefined : result;
};

/** The body of a doc comment that starts at `position`, past whitespace. */
const docCommentAfter = (code: string, position: number): string | undefined =>
  /^\s*\/\*\*(?!\/)([\s\S]*?)\*\//.exec(code.slice(position))?.[1];

const FENCE = /^\s*(```|~~~)/;

/**
 * The tag `line` opens, if it opens one. An `@example` holds code, where
 * `@customElement('x')` or `@property()` is a decorator, not a tag: there a
 * tag name must be followed by a space or nothing, and none starts inside a
 * fence.
 */
const tagAt = (
  line: string,
  current: JsDocTag | undefined
): RegExpExecArray | null => {
  if (current?.tag !== 'example') return /^@([\w-]+)\s?(.*)$/.exec(line);
  const fences = current.text.split('\n').filter((l) => FENCE.test(l));
  if (fences.length % 2 === 1) return null;
  return /^@([\w-]+)(?:\s(.*))?$/.exec(line);
};

/** Splits a comment body into its description and its block tags. */
const parseJsDoc = (body: string): JsDoc => {
  const description: string[] = [];
  const tags: JsDocTag[] = [];
  for (const line of linesOf(body)) {
    const tag = tagAt(line.trim(), tags.at(-1));
    if (tag !== null) tags.push({tag: tag[1], text: tag[2] ?? ''});
    else if (tags.length > 0) tags[tags.length - 1].text += `\n${line}`;
    else description.push(line);
  }
  const doc: JsDoc = {tags};
  const text = trimmed(description.join('\n'));
  if (text !== undefined) doc.description = text;
  return doc;
};

/** The comment ending right before `position`, parsed. */
export const jsDocBefore = (
  code: string,
  position: number
): JsDoc | undefined => {
  const body = docCommentBefore(code, position);
  return body === undefined ? undefined : parseJsDoc(body);
};

/** The comment starting right after `position` (past a decorator), parsed. */
export const jsDocAfter = (
  code: string,
  position: number
): JsDoc | undefined => {
  const body = docCommentAfter(code, position);
  return body === undefined ? undefined : parseJsDoc(body);
};

/** `true` for a bare `@deprecated`, else its reason; `undefined` without one. */
export const deprecationOf = (
  doc: JsDoc | undefined
): boolean | string | undefined => {
  const tag = doc?.tags.find((t) => t.tag === 'deprecated');
  if (tag === undefined) return undefined;
  return trimmed(tag.text) ?? true;
};

/** The first `@tag`'s text, trimmed. */
export const tagText = (
  doc: JsDoc | undefined,
  name: string
): string | undefined => {
  const tag = doc?.tags.find((t) => t.tag === name);
  return tag === undefined ? undefined : trimmed(tag.text);
};

/** `text` without its common leading indentation. */
const dedent = (text: string): string => {
  const lines = text.split('\n');
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => /^[ \t]*/.exec(line)![0].length);
  const common = Math.min(...indents);
  return lines.map((line) => line.slice(common)).join('\n');
};

/** An `@example` tag's text: its code, and a leading `<caption>` if any. */
const exampleOf = (text: string): DocExample | undefined => {
  const caption = /^\s*<caption>([\s\S]*?)<\/caption>/.exec(text);
  // Only blank lines go from the top: the code's own indentation stays.
  const code = text
    .slice(caption?.[0].length ?? 0)
    .replace(/^(?:[ \t]*\n)+/, '')
    .trimEnd();
  if (code.trim() === '') return undefined;
  const example: DocExample = {code: dedent(code)};
  const label = trimmed(caption?.[1] ?? '');
  if (label !== undefined) example.caption = label;
  return example;
};

/** Every `@example` tag, in order, with line breaks and indentation kept. */
export const examplesOf = (doc: JsDoc | undefined): DocExample[] =>
  (doc?.tags ?? [])
    .filter((t) => t.tag === 'example')
    .flatMap((t) => exampleOf(t.text) ?? []);

/** A leading `{Type}`, which may nest braces (`{CustomEvent<{a: 1}>}`). */
const leadingType = (text: string): {type?: string; rest: string} => {
  if (!text.startsWith('{')) return {rest: text};
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) {
      return {type: trimmed(text.slice(1, i)), rest: text.slice(i + 1).trim()};
    }
  }
  return {rest: text};
};

/** Drops the ` - ` between a name and its description, when there is one. */
const afterSeparator = (text: string): string | undefined =>
  trimmed(text.replace(/^\s*-(?=\s|$)/, ''));

/** `{Type} description`, as a `@returns` tag has it, both optional. */
export const typedText = (
  text: string
): {type?: string; description?: string} => {
  const {type, rest} = leadingType(text.trim());
  const result: {type?: string; description?: string} = {};
  const description = afterSeparator(rest);
  if (type !== undefined) result.type = type;
  if (description !== undefined) result.description = description;
  return result;
};

/**
 * `{Type} name - description`, with the type and the dash both optional. A
 * missing name (`@slot - The content`) is the empty name of a default slot.
 */
export const namedEntry = (text: string): DocEntry => {
  const {type, rest} = leadingType(text.trim());
  const match = /^(\S*)([\s\S]*)$/.exec(rest)!;
  const unnamed = match[1] === '-' || match[1] === '';
  const entry: DocEntry = {name: unnamed ? '' : match[1]};
  const description = afterSeparator(unnamed ? rest : match[2]);
  if (description !== undefined) entry.description = description;
  if (type !== undefined) entry.type = type;
  return entry;
};

/** `@cssprop [--name=default] - description`, or `--name - description`. */
export const cssPropertyEntry = (text: string): DocEntry => {
  const entry = namedEntry(text);
  const optional = /^\[([^=\]]+)(?:=([^\]]*))?\]$/.exec(entry.name);
  if (optional === null) return entry;
  entry.name = optional[1];
  const value = trimmed(optional[2] ?? '');
  if (value !== undefined) entry.default = value;
  return entry;
};
