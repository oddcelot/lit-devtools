/**
 * Renders component docs prose: the description of a component, a property,
 * an event. Doc comments and manifests write it as markdown with JSDoc inline
 * tags, hard-wrapped at the comment's width, so printing it raw breaks
 * sentences mid-line and shows the markup.
 *
 * Only the part of markdown a doc comment uses is read: paragraphs, one level
 * of lists, fenced code, headings, and the inline code, emphasis and link
 * forms, plus `{@link}`. Output is built as Lit templates, never as HTML, so
 * third-party manifest text cannot inject markup. Only `http:` and `https:`
 * URLs become links.
 */
import {html, type TemplateResult} from 'lit';

/** Wraps each run of text as it is rendered, for the row filter's `<mark>`. */
export type Mark = (text: string) => unknown;

const identity: Mark = (text) => text;

// --- inline ----------------------------------------------------------------

export type Inline =
  | {kind: 'text' | 'code'; text: string}
  | {kind: 'strong' | 'em'; children: Inline[]}
  | {kind: 'link'; href: string; children: Inline[]};

interface Match {
  nodes: Inline[];
  /** Where reading continues. */
  end: number;
}

type Matcher = (src: string, i: number) => Match | undefined;

const text = (value: string): Inline => ({kind: 'text', text: value});

/** The href for a link target, or undefined unless it is an http(s) URL. */
const safeHref = (target: string): string | undefined => {
  try {
    const url = new URL(target);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

/** `re` (sticky) matched at `i`. */
const at = (re: RegExp, src: string, i: number): RegExpExecArray | null => {
  re.lastIndex = i;
  return re.exec(src);
};

/** The children, as a link when `target` is a safe URL and as-is when not. */
const linked = (target: string, children: Inline[]): Inline[] => {
  const href = safeHref(target);
  return href === undefined ? children : [{kind: 'link', href, children}];
};

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!<>~|]/;

const escape: Matcher = (src, i) =>
  ESCAPABLE.test(src[i + 1] ?? '')
    ? {nodes: [text(src[i + 1]!)], end: i + 2}
    : undefined;

/** `` `code` ``, closed by a backtick run as long as the one that opened it. */
const codeSpan: Matcher = (src, i) => {
  let n = 1;
  while (src[i + n] === '`') n++;
  const fence = '`'.repeat(n);
  let end = src.indexOf(fence, i + n);
  while (end !== -1 && (src[end - 1] === '`' || src[end + n] === '`')) {
    end = src.indexOf(fence, end + 1);
  }
  const code = end === -1 ? '' : src.slice(i + n, end).trim();
  return code === ''
    ? {nodes: [text(fence)], end: i + n}
    : {nodes: [{kind: 'code', text: code}], end: end + n};
};

const JSDOC_TAG = /\{@(link|linkcode|linkplain)\s+([^}]*)\}/y;
const TARGET_AND_TEXT = /^([^\s|]+)(?:\s*\|\s*|\s+)?([\s\S]*)$/;

/**
 * `{@link target}`, `{@link target|text}`, `{@link target text}`; `linkcode`
 * sets the label as code, `linkplain` as text. A target that is not a URL is
 * a symbol: it shows as code, or as its text when given.
 */
const jsdocTag: Matcher = (src, i) => {
  const tag = at(JSDOC_TAG, src, i);
  const parts = TARGET_AND_TEXT.exec(tag?.[2]?.trim() ?? '');
  if (tag === null || parts === null) return undefined;
  const [, target, label] = parts as unknown as [string, string, string];
  const asCode =
    tag[1] === 'linkcode' ||
    (tag[1] === 'link' && label === '' && safeHref(target) === undefined);
  const shown: Inline = {
    kind: asCode ? 'code' : 'text',
    text: label === '' ? target : label,
  };
  return {nodes: linked(target, [shown]), end: i + tag[0].length};
};

const MD_LINK =
  /\[((?:\\.|[^\]\\])*)\]\(\s*((?:[^()\s]|\([^()\s]*\))*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/y;

/** `[text](url)`. */
const mdLink: Matcher = (src, i) => {
  const link = at(MD_LINK, src, i);
  if (link === null) return undefined;
  const children = parseInline(link[1] ?? '');
  return {nodes: linked(link[2] ?? '', children), end: i + link[0].length};
};

const AUTOLINK = /<(https?:\/\/[^\s<>]+)>/y;

/** `<https://…>`. */
const autolink: Matcher = (src, i) => {
  const link = at(AUTOLINK, src, i);
  const url = link?.[1];
  if (link === null || url === undefined) return undefined;
  return {
    nodes: linked(url, [text(url)]),
    end: i + link[0].length,
  };
};

/** Whether the `_` pair closing at `end` is at a word edge. */
const closesAtEdge = (src: string, end: number, delim: string): boolean =>
  delim[0] !== '_' || !/\w/.test(src[end + delim.length] ?? '');

/** The index of the delimiter that closes an emphasis opened at `from`. */
const emphasisEnd = (src: string, from: number, delim: string): number => {
  const c = delim[0]!;
  for (
    let end = src.indexOf(delim, from + 1);
    end !== -1;
    end = src.indexOf(delim, end + 1)
  ) {
    const single = delim.length === 1;
    if (/\s/.test(src[end - 1]!)) continue;
    if (single && (src[end - 1] === c || src[end + 1] === c)) continue;
    if (closesAtEdge(src, end, delim)) return end;
  }
  return -1;
};

/**
 * `*em*`, `**strong**`, and the underscore forms. An underscore inside a word
 * (`snake_case_name`) is not emphasis, and neither is a `*` ringed by spaces.
 */
const emphasis: Matcher = (src, i) => {
  const c = src[i]!;
  const delim = src[i + 1] === c ? c + c : c;
  const next = src[i + delim.length];
  if (next === undefined || /\s/.test(next)) return undefined;
  if (c === '_' && i > 0 && /\w/.test(src[i - 1]!)) return undefined;
  const end = emphasisEnd(src, i + delim.length, delim);
  if (end === -1) return undefined;
  const children = parseInline(src.slice(i + delim.length, end));
  return {
    nodes: [{kind: delim.length === 2 ? 'strong' : 'em', children}],
    end: end + delim.length,
  };
};

const MATCHERS = new Map<string, Matcher>([
  ['\\', escape],
  ['`', codeSpan],
  ['{', jsdocTag],
  ['[', mdLink],
  ['<', autolink],
  ['*', emphasis],
  ['_', emphasis],
]);

/** One line of prose as inline nodes. */
export const parseInline = (src: string): Inline[] => {
  const nodes: Inline[] = [];
  let run = '';
  const flush = () => {
    if (run !== '') nodes.push(text(run));
    run = '';
  };
  let i = 0;
  while (i < src.length) {
    const match = MATCHERS.get(src[i]!)?.(src, i);
    if (match === undefined) {
      run += src[i++];
      continue;
    }
    for (const node of match.nodes) {
      if (node.kind === 'text') run += node.text;
      else {
        flush();
        nodes.push(node);
      }
    }
    i = match.end;
  }
  flush();
  return nodes;
};

// --- blocks ----------------------------------------------------------------

export type Block =
  | {kind: 'p' | 'heading'; text: string}
  | {kind: 'list'; ordered: boolean; start: number; items: string[]}
  | {kind: 'code'; text: string};

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;

/** Reads a fenced block from `lines[start]`; returns the closing line's index. */
const readFence = (
  lines: string[],
  start: number,
  marker: string,
  blocks: Block[]
): number => {
  const close = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`);
  const body: string[] = [];
  let i = start + 1;
  for (; i < lines.length && !close.test(lines[i]!); i++) body.push(lines[i]!);
  blocks.push({kind: 'code', text: body.join('\n')});
  return i;
};

/** A list item line, added to the open list or starting a new one. */
const addItem = (
  blocks: Block[],
  open: Block | undefined,
  marker: string,
  item: string
): Block => {
  const ordered = /\d/.test(marker);
  if (open?.kind === 'list' && open.ordered === ordered) {
    open.items.push(item);
    return open;
  }
  const list: Block = {
    kind: 'list',
    ordered,
    start: ordered ? Number.parseInt(marker, 10) : 1,
    items: [item],
  };
  blocks.push(list);
  return list;
};

/** Joins a line onto the open paragraph or onto the open list's last item. */
const continueBlock = (open: Block, line: string): void => {
  if (open.kind === 'list') open.items[open.items.length - 1] += ` ${line}`;
  else if (open.kind === 'p') open.text += ` ${line}`;
};

/** One non-fence line; returns the paragraph or list still open after it. */
const addLine = (
  blocks: Block[],
  open: Block | undefined,
  line: string
): Block | undefined => {
  if (line.trim() === '') return undefined;
  const heading = HEADING.exec(line);
  if (heading !== null) {
    blocks.push({kind: 'heading', text: heading[1]!});
    return undefined;
  }
  const item = ITEM.exec(line);
  // An indented marker inside a list is a second level; it joins its parent.
  if (item !== null && !(open?.kind === 'list' && item[1]!.length >= 2)) {
    return addItem(blocks, open, item[2]!, item[3]!);
  }
  if (open !== undefined) {
    continueBlock(open, line.trim());
    return open;
  }
  const paragraph: Block = {kind: 'p', text: line.trim()};
  blocks.push(paragraph);
  return paragraph;
};

export const parseBlocks = (source: string): Block[] => {
  const lines = source.split(/\r?\n/);
  const blocks: Block[] = [];
  let open: Block | undefined;
  for (let i = 0; i < lines.length; i++) {
    const fence = FENCE.exec(lines[i]!);
    if (fence === null) {
      open = addLine(blocks, open, lines[i]!);
    } else {
      open = undefined;
      i = readFence(lines, i, fence[1]!, blocks);
    }
  }
  return blocks;
};

// --- rendering -------------------------------------------------------------

const renderInline = (nodes: Inline[], mark: Mark): TemplateResult[] =>
  nodes.map((n) => {
    switch (n.kind) {
      case 'text':
        return html`${mark(n.text)}`;
      case 'code':
        return html`<code>${mark(n.text)}</code>`;
      case 'strong':
        return html`<strong>${renderInline(n.children, mark)}</strong>`;
      case 'em':
        return html`<em>${renderInline(n.children, mark)}</em>`;
      case 'link':
        return html`<a href=${n.href} target="_blank" rel="noopener noreferrer"
          >${renderInline(n.children, mark)}</a
        >`;
    }
  });

const renderItems = (items: string[], mark: Mark): TemplateResult[] =>
  items.map((i) => html`<li>${renderInline(parseInline(i), mark)}</li>`);

const renderBlock = (block: Block, mark: Mark): TemplateResult => {
  switch (block.kind) {
    case 'p':
      return html`<p>${renderInline(parseInline(block.text), mark)}</p>`;
    case 'heading':
      return html`<p>
        <strong>${renderInline(parseInline(block.text), mark)}</strong>
      </p>`;
    case 'list':
      return block.ordered
        ? html`<ol start=${block.start}>
            ${renderItems(block.items, mark)}
          </ol>`
        : html`<ul>
            ${renderItems(block.items, mark)}
          </ul>`;
    case 'code':
      return html`<pre><code>${mark(block.text)}</code></pre>`;
  }
};

/**
 * Doc prose as block elements (`p`, `ul`, `ol`, `pre`). `mark` wraps every
 * run of text, code included, so a filter's highlight reaches inside the
 * markup; it sees text with the markup already removed.
 */
export const renderDocText = (
  source: string,
  mark: Mark = identity
): TemplateResult =>
  html`${parseBlocks(source).map((b) => renderBlock(b, mark))}`;

/**
 * Doc prose for a table cell: a lone paragraph renders as bare inline
 * content, so it adds no block margins; anything longer renders as blocks.
 */
export const renderDocInline = (
  source: string,
  mark: Mark = identity
): TemplateResult => {
  const blocks = parseBlocks(source);
  const [only] = blocks;
  return blocks.length === 1 && only?.kind === 'p'
    ? html`${renderInline(parseInline(only.text), mark)}`
    : renderDocText(source, mark);
};

// --- plain text ------------------------------------------------------------

const inlineText = (nodes: Inline[]): string =>
  nodes
    .map((n) => ('children' in n ? inlineText(n.children) : n.text))
    .join('');

const blockText = (block: Block): string => {
  switch (block.kind) {
    case 'list':
      return block.items
        .map(
          (item, i) =>
            `${block.ordered ? `${block.start + i}.` : '-'} ${inlineText(parseInline(item))}`
        )
        .join('\n');
    case 'code':
      return block.text;
    default:
      return inlineText(parseInline(block.text));
  }
};

/**
 * What a reader sees of `source`, without the markup: soft breaks joined,
 * link text kept, `{@link X}` as `X`. For tooltips and for matching the
 * row filter against what is on screen.
 */
export const docPlainText = (source: string): string =>
  parseBlocks(source).map(blockText).join('\n\n');
