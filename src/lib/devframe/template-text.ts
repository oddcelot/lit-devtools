/**
 * Finds an `html` template literal in source text by its raw strings, and
 * one of its elements in it: how a page without the plugin gets a "Rendered
 * at" location (see `runtime/template-sites.ts`).
 *
 * A match is the strings in order, as one template literal: a backtick, the
 * first string, then for each binding a `${…}` expression and the next
 * string, then the closing backtick. Expressions are skipped by bracket depth,
 * stepping over strings, comments and nested template literals, so a
 * binding holding `html\`…\`` or an object literal does not end the match
 * early. Heuristic by nature: templates whose text a build rewrote (minified
 * template HTML) are not found, and two literals with the same text resolve
 * to the first.
 */

/** Index just past the quote that closes the string opening at `at`. */
const skipQuoted = (text: string, at: number): number => {
  const quote = text[at];
  let i = at + 1;
  while (i < text.length && text[i] !== quote) {
    i += text[i] === '\\' ? 2 : 1;
  }
  return i + 1;
};

/** Index just past the comment opening at `at`. */
const skipComment = (text: string, at: number): number => {
  if (text[at + 1] === '/') {
    const end = text.indexOf('\n', at);
    return end < 0 ? text.length : end;
  }
  const end = text.indexOf('*/', at + 2);
  return end < 0 ? text.length : end + 2;
};

/** Index just past the backtick that closes the template opening at `at`. */
const skipTemplate = (text: string, at: number): number => {
  let i = at + 1;
  while (i < text.length && text[i] !== '`') {
    if (text[i] === '\\') {
      i += 2;
    } else if (text.startsWith('${', i)) {
      i = skipExpression(text, i + 2) + 1;
    } else {
      i++;
    }
  }
  return i + 1;
};

/**
 * Index just past the string, template or comment opening at `at`;
 * `undefined` when none opens there.
 */
const skipLiteral = (text: string, at: number): number | undefined => {
  const c = text[at];
  if (c === '"' || c === "'") return skipQuoted(text, at);
  if (c === '`') return skipTemplate(text, at);
  if (c === '/' && (text[at + 1] === '/' || text[at + 1] === '*')) {
    return skipComment(text, at);
  }
  return undefined;
};

/**
 * Index of the `}` that closes a `${` expression whose body starts at
 * `at`; `text.length` when it never closes.
 */
const skipExpression = (text: string, at: number): number => {
  let depth = 0;
  let i = at;
  while (i < text.length) {
    const past = skipLiteral(text, i);
    if (past !== undefined) {
      i = past;
      continue;
    }
    if (text[i] === '}') {
      if (depth === 0) return i;
      depth--;
    } else if (text[i] === '{') {
      depth++;
    }
    i++;
  }
  return text.length;
};

/** Offsets of each string, when `strings` read as one literal from `start`. */
const matchAt = (
  text: string,
  start: number,
  strings: readonly string[]
): number[] | undefined => {
  const offsets = [start];
  let pos = start + strings[0]!.length;
  for (let i = 1; i < strings.length; i++) {
    if (!text.startsWith('${', pos)) return undefined;
    const close = skipExpression(text, pos + 2);
    if (close >= text.length || !text.startsWith(strings[i]!, close + 1)) {
      return undefined;
    }
    offsets.push(close + 1);
    pos = close + 1 + strings[i]!.length;
  }
  return text[pos] === '`' ? offsets : undefined;
};

/**
 * Where each of `strings` starts in `text`, for the first template literal
 * made of them; `undefined` when none is.
 */
export const findTemplate = (
  text: string,
  strings: readonly string[]
): number[] | undefined => {
  if (strings.length === 0) return undefined;
  // Anchored on the backtick, so an empty first string costs one probe per
  // template literal rather than one per character.
  const needle = '`' + strings[0];
  for (
    let at = text.indexOf(needle);
    at >= 0;
    at = text.indexOf(needle, at + 1)
  ) {
    const found = matchAt(text, at + 1, strings);
    if (found !== undefined) return found;
  }
  return undefined;
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Offset in `text` of the `<` opening the `index`th `<tag` in the template
 * whose strings start at `offsets`; `undefined` past the last one.
 */
export const tagOffset = (
  offsets: readonly number[],
  strings: readonly string[],
  tag: string,
  index: number
): number | undefined => {
  const open = new RegExp(`<${escapeRe(tag)}(?=[\\s/>]|$)`, 'gi');
  let seen = 0;
  for (const [i, piece] of strings.entries()) {
    for (const match of piece.matchAll(open)) {
      if (seen++ === index) return offsets[i]! + match.index;
    }
  }
  return undefined;
};

/** 1-based line and column of `offset` in `text`. */
export const lineColumnOf = (
  text: string,
  offset: number
): {line: number; column: number} => {
  let line = 1;
  let lineStart = 0;
  for (
    let nl = text.indexOf('\n');
    nl >= 0 && nl < offset;
    nl = text.indexOf('\n', nl + 1)
  ) {
    line++;
    lineStart = nl + 1;
  }
  return {line, column: offset - lineStart + 1};
};
