/**
 * Puts named-slot content back where a web component expects it. Astro
 * hands a renderer each named slot as an HTML string, with the `slot`
 * attribute its children were written with taken off. A custom element
 * slots light DOM children by that attribute, so it goes back on: on every
 * top-level element that doesn't carry one, and on a `<span>` around
 * top-level text, which can't carry an attribute of its own.
 *
 * A scanner for the top level only, not a parser: it reads tags, comments
 * and raw-text elements well enough to skip each top-level element whole,
 * and leaves everything inside as written. Dependency-free, so the client
 * renderer uses it too.
 */

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/** Elements whose content is text up to their own end tag. */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

const TAG_NAME = /^<([a-zA-Z][^\s/>]*)/;

type Token =
  | {kind: 'text' | 'comment' | 'close'; end: number}
  | {
      kind: 'open';
      end: number;
      name: string;
      nameLength: number;
      empty: boolean;
    };

/** A tag up to its `>`, skipping any `>` inside a quoted value. */
const TAG = /^<[^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/;

/** The index just past the `>` that ends the tag starting at `from`. */
const endOfTag = (html: string, from: number): number => {
  const tag = TAG.exec(html.slice(from));
  return tag === null ? html.length : from + tag[0].length;
};

const indexAfter = (html: string, search: string, from: number): number => {
  const at = html.indexOf(search, from);
  return at === -1 ? html.length : at + search.length;
};

const openToken = (html: string, at: number, name: string): Token => {
  const end = endOfTag(html, at);
  const lower = name.toLowerCase();
  return {
    kind: 'open',
    end,
    name: lower,
    nameLength: name.length,
    empty: VOID.has(lower) || html.slice(at, end).endsWith('/>'),
  };
};

/** An opening tag, or text up to the next `<`. A `<` that opens no tag is text. */
const openOrText = (html: string, at: number): Token => {
  const name = TAG_NAME.exec(html.slice(at))?.[1];
  if (name !== undefined) return openToken(html, at, name);
  const lt = html.indexOf('<', at + 1);
  return {kind: 'text', end: lt === -1 ? html.length : lt};
};

/** The token starting at `at`. */
const nextToken = (html: string, at: number): Token => {
  if (html.startsWith('<!--', at)) {
    return {kind: 'comment', end: indexAfter(html, '-->', at + 4)};
  }
  if (html.startsWith('</', at))
    return {kind: 'close', end: endOfTag(html, at)};
  return openOrText(html, at);
};

type OpenToken = Token & {kind: 'open'};

/** Past the end tag of a raw-text element: its content is not markup. */
const rawTextEnd = (html: string, open: OpenToken): number => {
  const close = html.toLowerCase().indexOf(`</${open.name}`, open.end);
  return close === -1 ? html.length : endOfTag(html, close);
};

/** Past the end tag that closes children starting at `from`. */
const childrenEnd = (html: string, from: number): number => {
  let at = from;
  while (at < html.length) {
    const token = nextToken(html, at);
    if (token.kind === 'close') return token.end;
    at = token.kind === 'open' ? elementEnd(html, token) : token.end;
  }
  return html.length;
};

/** The index just past the element whose opening tag is `open`. */
const elementEnd = (html: string, open: OpenToken): number =>
  open.empty
    ? open.end
    : RAW_TEXT.has(open.name)
      ? rawTextEnd(html, open)
      : childrenEnd(html, open.end);

/** The top-level nodes of `html`, each element whole. */
function* topLevel(
  html: string
): Generator<{token: Token; chunk: string; start: number}> {
  let at = 0;
  while (at < html.length) {
    const token = nextToken(html, at);
    const end = token.kind === 'open' ? elementEnd(html, token) : token.end;
    yield {token, chunk: html.slice(at, end), start: at};
    at = end;
  }
}

/** `element` with `attribute` after its tag name, unless it has a slot. */
const withSlot = (
  element: string,
  open: OpenToken,
  attribute: string,
  start: number
): string => {
  const tag = element.slice(0, open.end - start);
  if (/\sslot\s*=/i.test(tag)) return element;
  const at = 1 + open.nameLength;
  return element.slice(0, at) + attribute + element.slice(at);
};

/** Text in a slotted `<span>`, unless it is only whitespace. */
const slottedText = (text: string, attribute: string): string =>
  text.trim() === '' ? text : `<span${attribute}>${text}</span>`;

/** Assigns every top-level node of `html` to the slot `name`. */
export const assignSlot = (html: string, name: string): string => {
  const value = name.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  const attribute = ` slot="${value}"`;
  let out = '';
  let text = '';
  for (const {token, chunk, start} of topLevel(html)) {
    if (token.kind === 'text') {
      text += chunk;
      continue;
    }
    out += slottedText(text, attribute);
    out +=
      token.kind === 'open' ? withSlot(chunk, token, attribute, start) : chunk;
    text = '';
  }
  return out + slottedText(text, attribute);
};
