/**
 * Finds the markup in a script: `html` and `svg` tagged template literals,
 * with the `${…}` holes inside each, and JSX elements with their `{…}`
 * holes. It reads the body of an Astro or MDX document the same way, as
 * JSX children.
 *
 * A small lexer instead of the parser, because the editor asks while the user
 * types and the file often doesn't parse then: an unclosed template runs to the
 * end of the file instead of losing every template in it. It knows enough of
 * JavaScript to skip strings, comments and regular expressions, and follows
 * templates nested in holes (`${items.map((i) => html`<li>${i}</li>`)}`).
 * A `<` starts JSX only where an expression can start, the same question a
 * `/` asks, so `a < b` and `f<T>()` stay code.
 */

/**
 * How a region's attributes read: Lit's (`.prop`, `@event`, `?bool`), JSX's
 * (a prop names an attribute or a property, `on<event>` an event) or
 * Astro's (a prop names an attribute or a property).
 */
export type Dialect = 'lit' | 'jsx' | 'astro';

/** A `${…}` or `{…}` hole: from its start to just past the `}`, or the end of the code. */
export interface Hole {
  start: number;
  end: number;
}

/** A tagged template's text, between its backticks, and the holes in it. */
export interface TemplateRegion {
  /** The tag's name: `html` for both `html` and `lit.html`. */
  tag: string;
  /** Just past the opening backtick. */
  start: number;
  /** At the closing backtick, or the end of the code when it's unclosed. */
  end: number;
  holes: Hole[];
  /** Absent for a Lit template. */
  dialect?: Exclude<Dialect, 'lit'>;
}

const DEFAULT_TEMPLATE_TAGS: readonly string[] = ['html', 'svg'];

/** Words after which a `/` starts a regular expression, not a division. */
const REGEX_AFTER_WORD = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
]);

const isIdentifierChar = (char: string): boolean => /[\w$]/.test(char);

interface CodeFrame {
  kind: 'code';
  /** Open `{` inside this hole; its closing `}` ends the hole at depth 0. */
  depth: number;
  /** The template whose hole this is; undefined for the top level. */
  hole?: Hole;
}

interface TemplateFrame {
  kind: 'template';
  /** Undefined for an untagged template or one with another tag. */
  region?: TemplateRegion;
}

/** JSX, or the body of an Astro or MDX document. */
interface JsxFrame {
  kind: 'jsx';
  region: TemplateRegion;
  /** Elements open around the cursor; the region ends when it's back at 0. */
  depth: number;
  /** In a tag, between its `<` and `>`; in children; or in raw text. */
  mode: 'children' | 'tag' | 'raw';
  /** The tag being read, lowercased, and whether it's a closing one. */
  tag: string;
  closing: boolean;
  /** Set for a document's body, which runs to the end. */
  document?: 'astro' | 'mdx';
}

/** Elements whose content is raw text in a document, not markup. */
const RAW_TEXT = new Set(['script', 'style']);

export interface LexerOptions {
  /** Find JSX in code, as in a `.jsx` or `.tsx` file. */
  jsx?: boolean;
}

class Lexer {
  readonly regions: TemplateRegion[] = [];
  private readonly stack: (CodeFrame | TemplateFrame | JsxFrame)[] = [
    {kind: 'code', depth: 0},
  ];
  private i = 0;
  /** The last significant character or word in code, for the `/` question. */
  private last = '';

  constructor(
    private readonly code: string,
    private readonly tags: ReadonlySet<string>,
    private readonly jsx?: Exclude<Dialect, 'lit'>
  ) {}

  run(): TemplateRegion[] {
    while (this.i < this.code.length) {
      const frame = this.stack.at(-1)!;
      if (frame.kind === 'template') this.templateStep(frame);
      else if (frame.kind === 'jsx') this.jsxStep(frame);
      else this.codeStep(frame);
    }
    return this.regions.sort((a, b) => a.start - b.start);
  }

  /** Reads `code` from `start` to the end as a document's body. */
  runDocument(start: number, document: 'astro' | 'mdx'): TemplateRegion[] {
    const region: TemplateRegion = {
      tag: '',
      start,
      end: this.code.length,
      holes: [],
      dialect: this.jsx,
    };
    this.regions.push(region);
    this.stack.push({
      kind: 'jsx',
      region,
      depth: 0,
      mode: 'children',
      tag: '',
      closing: false,
      document,
    });
    this.i = start;
    return this.run();
  }

  private templateStep(frame: TemplateFrame): void {
    const char = this.code[this.i];
    if (char === '\\') {
      this.i += 2;
    } else if (char === '`') {
      if (frame.region) frame.region.end = this.i;
      this.stack.pop();
      this.i++;
      this.last = '`';
    } else if (char === '$' && this.code[this.i + 1] === '{') {
      const hole = {start: this.i, end: this.code.length};
      frame.region?.holes.push(hole);
      this.stack.push({kind: 'code', depth: 0, hole});
      this.i += 2;
      this.last = '{';
    } else {
      this.i++;
    }
  }

  private codeStep(frame: CodeFrame): void {
    const char = this.code[this.i];
    if (char === '/') this.slash();
    else if (char === '"' || char === "'") this.skipString(char);
    else if (char === '`') this.openTemplate();
    else if (char === '{' || char === '}')
      this.brace(frame, char === '{' ? 1 : -1);
    else if (char === '<' && this.jsxStarts()) this.openJsx();
    else if (isIdentifierChar(char)) this.word();
    else this.punctuation(char);
  }

  /** A comment, a regular expression or a division. */
  private slash(): void {
    const next = this.code[this.i + 1];
    if (next === '/') this.skipTo('\n');
    else if (next === '*') this.skipBlockComment();
    else if (this.regexAllowed()) this.skipRegex();
    else this.punctuation('/');
  }

  private brace(frame: CodeFrame, step: 1 | -1): void {
    if (step === -1 && frame.depth === 0 && frame.hole) {
      frame.hole.end = this.i + 1;
      this.stack.pop();
    } else {
      frame.depth = Math.max(0, frame.depth + step);
    }
    this.last = step === 1 ? '{' : '}';
    this.i++;
  }

  private word(): void {
    const start = this.i;
    while (this.i < this.code.length && isIdentifierChar(this.code[this.i])) {
      this.i++;
    }
    this.last = this.code.slice(start, this.i);
  }

  private punctuation(char: string): void {
    if (!/\s/.test(char)) this.last = char;
    this.i++;
  }

  private openTemplate(): void {
    const tag = this.tagBefore(this.i);
    const region =
      tag !== undefined && this.tags.has(tag)
        ? {tag, start: this.i + 1, end: this.code.length, holes: []}
        : undefined;
    if (region) this.regions.push(region);
    this.stack.push({kind: 'template', region});
    this.i++;
  }

  /** The identifier right before a backtick, skipping spaces: `html` in `lit.html \``. */
  private tagBefore(backtick: number): string | undefined {
    let end = backtick;
    while (end > 0 && /\s/.test(this.code[end - 1])) end--;
    let start = end;
    while (start > 0 && isIdentifierChar(this.code[start - 1])) start--;
    return start < end ? this.code.slice(start, end) : undefined;
  }

  /**
   * Whether the `<` here starts JSX: where an expression can start, before
   * a name or `>`, and not a generic's `<T,>` or `<T extends …>`.
   */
  private jsxStarts(): boolean {
    if (!this.jsx || !this.regexAllowed()) return false;
    const rest = this.code.slice(this.i + 1, this.i + 64);
    if (rest[0] === '>') return true;
    if (!/^[A-Za-z]/.test(rest)) return false;
    return !/^[\w$]+\s*(?:,|extends\b)/.test(rest);
  }

  private openJsx(): void {
    const region: TemplateRegion = {
      tag: '',
      start: this.i,
      end: this.code.length,
      holes: [],
      dialect: this.jsx,
    };
    this.regions.push(region);
    this.stack.push({
      kind: 'jsx',
      region,
      depth: 0,
      mode: 'children',
      tag: '',
      closing: false,
    });
  }

  private jsxStep(frame: JsxFrame): void {
    if (frame.mode === 'raw') return this.rawText(frame);
    if (frame.mode === 'tag') return this.jsxTagStep(frame);
    const char = this.code[this.i];
    if (char === '{') this.openHole(frame);
    else if (char === '<') this.jsxAngle(frame);
    else if (frame.document === 'mdx' && this.skipMarkdownCode(frame)) return;
    else this.i++;
  }

  /** A `{` in JSX: a hole whose code is read until its `}`. */
  private openHole(frame: JsxFrame): void {
    const hole = {start: this.i, end: this.code.length};
    frame.region.holes.push(hole);
    this.stack.push({kind: 'code', depth: 0, hole});
    this.i++;
    this.last = '{';
  }

  /** A `<` in children: a tag, a closing tag, a comment, or text. */
  private jsxAngle(frame: JsxFrame): void {
    const next = this.code[this.i + 1];
    if (next === '!' && this.code.startsWith('<!--', this.i)) {
      const close = this.code.indexOf('-->', this.i + 4);
      this.i = close === -1 ? this.code.length : close + 3;
      return;
    }
    const closing = next === '/';
    const nameAt = this.i + (closing ? 2 : 1);
    const opensTag = closing || next === '>' || /[A-Za-z]/.test(next ?? '');
    if (!opensTag) {
      this.i++;
      return;
    }
    let end = nameAt;
    while (end < this.code.length && /[\w$.:-]/.test(this.code[end])) end++;
    frame.mode = 'tag';
    frame.closing = closing;
    frame.tag = this.code.slice(nameAt, end).toLowerCase();
    this.i = end;
  }

  private jsxTagStep(frame: JsxFrame): void {
    const char = this.code[this.i];
    if (char === '"' || char === "'") {
      const close = this.code.indexOf(char, this.i + 1);
      this.i = close === -1 ? this.code.length : close + 1;
    } else if (char === '{') {
      this.openHole(frame);
    } else if (char === '/' && this.code[this.i + 1] === '>') {
      this.i += 2;
      this.tagEnded(frame, 0);
    } else if (char === '>') {
      this.i++;
      this.tagEnded(frame, frame.closing ? -1 : 1);
    } else {
      this.i++;
    }
  }

  /** After a tag's `>`: one more element open, one fewer, or neither. */
  private tagEnded(frame: JsxFrame, step: -1 | 0 | 1): void {
    frame.depth = Math.max(0, frame.depth + step);
    const raw = step === 1 && frame.document && RAW_TEXT.has(frame.tag);
    frame.mode = raw ? 'raw' : 'children';
    if (frame.depth > 0 || frame.document) return;
    frame.region.end = this.i;
    this.stack.pop();
    this.last = ')';
  }

  /** A `<script>` or `<style>` in a document, up to its closing tag. */
  private rawText(frame: JsxFrame): void {
    const close = this.code.toLowerCase().indexOf(`</${frame.tag}`, this.i);
    this.i = close === -1 ? this.code.length : close;
    frame.mode = 'children';
  }

  /**
   * Skips Markdown that holds code rather than markup: a fenced block or an
   * `import`/`export` block at a line's start, or inline code. Each becomes
   * a hole, so no markup is read in it.
   */
  private skipMarkdownCode(frame: JsxFrame): boolean {
    const start = this.i;
    const skipped = this.markdownCodeEnd();
    if (skipped === undefined) return false;
    frame.region.holes.push({start, end: skipped});
    this.i = skipped;
    return true;
  }

  /** Where the Markdown code starting here ends, if code starts here. */
  private markdownCodeEnd(): number | undefined {
    const atLineStart = this.i === 0 || this.code[this.i - 1] === '\n';
    if (!atLineStart) return this.inlineCodeEnd();
    return this.fenceEnd() ?? this.esmEnd() ?? this.inlineCodeEnd();
  }

  /** A fenced code block's end: past its closing fence's line. */
  private fenceEnd(): number | undefined {
    const fence = /^(```|~~~)/.exec(this.code.slice(this.i, this.i + 3))?.[1];
    if (!fence) return undefined;
    const close = this.code.indexOf(`\n${fence}`, this.i + 3);
    const lineEnd = close === -1 ? -1 : this.code.indexOf('\n', close + 1);
    return lineEnd === -1 ? this.code.length : lineEnd;
  }

  /** An `import` or `export` block's end: the next blank line. */
  private esmEnd(): number | undefined {
    if (!/^(?:import|export)\s/.test(this.code.slice(this.i, this.i + 7)))
      return undefined;
    const blank = this.code.indexOf('\n\n', this.i);
    return blank === -1 ? this.code.length : blank;
  }

  /** Inline code's end, when its closing backtick is in the same paragraph. */
  private inlineCodeEnd(): number | undefined {
    if (this.code[this.i] !== '`') return undefined;
    const close = this.code.indexOf('`', this.i + 1);
    const paragraph = this.code.indexOf('\n\n', this.i);
    const ends = close !== -1 && (paragraph === -1 || close < paragraph);
    return ends ? close + 1 : undefined;
  }

  private regexAllowed(): boolean {
    if (this.last === '') return true;
    if (isIdentifierChar(this.last[0])) return REGEX_AFTER_WORD.has(this.last);
    return !/[)\]}`'"]/.test(this.last);
  }

  private skipTo(char: string): void {
    const at = this.code.indexOf(char, this.i);
    this.i = at === -1 ? this.code.length : at;
  }

  private skipBlockComment(): void {
    const at = this.code.indexOf('*/', this.i + 2);
    this.i = at === -1 ? this.code.length : at + 2;
  }

  private skipString(quote: string): void {
    this.i++;
    while (this.i < this.code.length) {
      const char = this.code[this.i];
      if (char === '\\') this.i += 2;
      else if (char === quote || char === '\n') break;
      else this.i++;
    }
    this.i++;
    this.last = quote;
  }

  private skipRegex(): void {
    this.i++;
    let inClass = false;
    while (this.i < this.code.length) {
      const char = this.code[this.i];
      if (char === '\\') this.i++;
      else if (char === '\n') break;
      else if (char === '[') inClass = true;
      else if (char === ']') inClass = false;
      else if (char === '/' && !inClass) break;
      this.i++;
    }
    this.i++;
    this.word();
    this.last = ')';
  }
}

/**
 * The tagged templates in `code` whose tag is one of `tags`, in source order,
 * nested ones included; with `jsx`, its JSX elements too.
 */
export const findTemplates = (
  code: string,
  tags: readonly string[] = DEFAULT_TEMPLATE_TAGS,
  options: LexerOptions = {}
): TemplateRegion[] =>
  new Lexer(code, new Set(tags), options.jsx ? 'jsx' : undefined).run();

/**
 * The markup of an Astro or MDX document: its body, read as JSX children,
 * with the templates and JSX in its `{…}` expressions. An Astro document's
 * body starts after its `---` frontmatter, whose tagged templates come too.
 */
export const findDocumentRegions = (
  code: string,
  document: 'astro' | 'mdx',
  tags: readonly string[] = DEFAULT_TEMPLATE_TAGS
): TemplateRegion[] => {
  const set = new Set(tags);
  if (document === 'mdx')
    return new Lexer(code, set, 'jsx').runDocument(0, 'mdx');
  const frontmatter = /^\s*---\r?\n([\s\S]*?)\r?\n---[^\n]*(?:\n|$)/.exec(code);
  const bodyStart = frontmatter ? frontmatter[0].length : 0;
  const scripts = frontmatter
    ? new Lexer(code.slice(0, bodyStart), set).run()
    : [];
  return [
    ...scripts,
    ...new Lexer(code, set, 'astro').runDocument(bodyStart, 'astro'),
  ].sort((a, b) => a.start - b.start);
};
