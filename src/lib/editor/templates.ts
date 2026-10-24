/**
 * Finds the markup templates in a script: `html` and `svg` tagged template
 * literals, with the `${…}` holes inside each.
 *
 * A small lexer instead of the parser, because the editor asks while the user
 * types and the file often doesn't parse then: an unclosed template runs to the
 * end of the file instead of losing every template in it. It knows enough of
 * JavaScript to skip strings, comments and regular expressions, and follows
 * templates nested in holes (`${items.map((i) => html`<li>${i}</li>`)}`).
 */

/** A `${…}` hole: from the `$` to just past the `}`, or the end of the code. */
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

class Lexer {
  readonly regions: TemplateRegion[] = [];
  private readonly stack: (CodeFrame | TemplateFrame)[] = [
    {kind: 'code', depth: 0},
  ];
  private i = 0;
  /** The last significant character or word in code, for the `/` question. */
  private last = '';

  constructor(
    private readonly code: string,
    private readonly tags: ReadonlySet<string>
  ) {}

  run(): TemplateRegion[] {
    while (this.i < this.code.length) {
      const frame = this.stack.at(-1)!;
      if (frame.kind === 'template') this.templateStep(frame);
      else this.codeStep(frame);
    }
    return this.regions.sort((a, b) => a.start - b.start);
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
 * nested ones included.
 */
export const findTemplates = (
  code: string,
  tags: readonly string[] = DEFAULT_TEMPLATE_TAGS
): TemplateRegion[] => new Lexer(code, new Set(tags)).run();
