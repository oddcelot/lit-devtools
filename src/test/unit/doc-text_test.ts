import {describe, expect, test} from 'vite-plus/test';
import {docPlainText, parseBlocks, parseInline} from '../../panel/doc-text.js';

describe('blocks', () => {
  test('a soft break joins a paragraph; a blank line splits it', () => {
    expect(parseBlocks('One two\nthree.\n\nNext one.')).toEqual([
      {kind: 'p', text: 'One two three.'},
      {kind: 'p', text: 'Next one.'},
    ]);
  });

  test('unordered lists, with a continuation line joining its item', () => {
    expect(parseBlocks('- a\n* b\n  more of b\n+ c')).toEqual([
      {
        kind: 'list',
        ordered: false,
        start: 1,
        items: ['a', 'b more of b', 'c'],
      },
    ]);
  });

  test('ordered lists keep their first number', () => {
    expect(parseBlocks('3. x\n4) y')).toEqual([
      {kind: 'list', ordered: true, start: 3, items: ['x', 'y']},
    ]);
  });

  test('a nested marker joins its parent item', () => {
    expect(parseBlocks('- a\n  - b')).toEqual([
      {kind: 'list', ordered: false, start: 1, items: ['a - b']},
    ]);
  });

  test('a list ends at a blank line', () => {
    expect(parseBlocks('- a\n\ntext')).toEqual([
      {kind: 'list', ordered: false, start: 1, items: ['a']},
      {kind: 'p', text: 'text'},
    ]);
  });

  test('fenced code keeps its text verbatim', () => {
    const source = '```ts\nconst a = 1;\n\n  *b* _c_\n```\nafter';
    expect(parseBlocks(source)).toEqual([
      {kind: 'code', text: 'const a = 1;\n\n  *b* _c_'},
      {kind: 'p', text: 'after'},
    ]);
    expect(parseBlocks('~~~\nx\n~~~')).toEqual([{kind: 'code', text: 'x'}]);
  });

  test('an unclosed fence runs to the end', () => {
    expect(parseBlocks('```\nx\ny')).toEqual([{kind: 'code', text: 'x\ny'}]);
  });

  test('a heading is its own block', () => {
    expect(parseBlocks('## Usage ##\ntext')).toEqual([
      {kind: 'heading', text: 'Usage'},
      {kind: 'p', text: 'text'},
    ]);
  });
});

describe('inline', () => {
  test('code, strong and em, with the underscore forms', () => {
    expect(parseInline('a `b` **c** __d__ *e* _f_')).toEqual([
      {kind: 'text', text: 'a '},
      {kind: 'code', text: 'b'},
      {kind: 'text', text: ' '},
      {kind: 'strong', children: [{kind: 'text', text: 'c'}]},
      {kind: 'text', text: ' '},
      {kind: 'strong', children: [{kind: 'text', text: 'd'}]},
      {kind: 'text', text: ' '},
      {kind: 'em', children: [{kind: 'text', text: 'e'}]},
      {kind: 'text', text: ' '},
      {kind: 'em', children: [{kind: 'text', text: 'f'}]},
    ]);
  });

  test('underscores inside a word, and spaced asterisks, are text', () => {
    for (const source of ['snake_case_name', 'a _b_c', '2 * 3 * 4']) {
      expect(parseInline(source)).toEqual([{kind: 'text', text: source}]);
    }
  });

  test('markup nests', () => {
    expect(parseInline('**a `b` c**')).toEqual([
      {
        kind: 'strong',
        children: [
          {kind: 'text', text: 'a '},
          {kind: 'code', text: 'b'},
          {kind: 'text', text: ' c'},
        ],
      },
    ]);
  });

  test('a backtick run closes on a run as long', () => {
    expect(parseInline('`` a`b ``')).toEqual([{kind: 'code', text: 'a`b'}]);
    expect(parseInline('`open')).toEqual([{kind: 'text', text: '`open'}]);
  });

  test('backslash escapes markdown punctuation', () => {
    expect(parseInline('\\*not\\* \\`x\\` \\{@link A}')).toEqual([
      {kind: 'text', text: '*not* `x` {@link A}'},
    ]);
    expect(parseInline('a\\b')).toEqual([{kind: 'text', text: 'a\\b'}]);
  });

  test('links: https is linked, other schemes are only their text', () => {
    expect(parseInline('[docs](https://x.dev/a)')).toEqual([
      {
        kind: 'link',
        href: 'https://x.dev/a',
        children: [{kind: 'text', text: 'docs'}],
      },
    ]);
    expect(parseInline('[hi](javascript:alert(1))')).toEqual([
      {kind: 'text', text: 'hi'},
    ]);
    expect(parseInline('[rel](./a.md) [d](data:text/html,x)')).toEqual([
      {kind: 'text', text: 'rel d'},
    ]);
  });

  test('an autolink needs an http(s) URL', () => {
    expect(parseInline('<https://x.dev>')).toEqual([
      {
        kind: 'link',
        href: 'https://x.dev/',
        children: [{kind: 'text', text: 'https://x.dev'}],
      },
    ]);
    expect(parseInline('<javascript:x>')).toEqual([
      {kind: 'text', text: '<javascript:x>'},
    ]);
  });

  test('{@link} variants', () => {
    const link = (children: unknown) => [
      {kind: 'link', href: 'https://x.dev/', children},
    ];
    const url = [{kind: 'text', text: 'https://x.dev'}];
    expect(parseInline('{@link https://x.dev}')).toEqual(link(url));
    expect(parseInline('{@link https://x.dev|the site}')).toEqual(
      link([{kind: 'text', text: 'the site'}])
    );
    expect(parseInline('{@link https://x.dev the site}')).toEqual(
      link([{kind: 'text', text: 'the site'}])
    );
    expect(parseInline('{@linkcode https://x.dev}')).toEqual(
      link([{kind: 'code', text: 'https://x.dev'}])
    );
    expect(parseInline('{@linkplain Foo}')).toEqual([
      {kind: 'text', text: 'Foo'},
    ]);
  });

  test('a {@link} to a symbol is code, or its text when given', () => {
    expect(parseInline('{@link XButton}')).toEqual([
      {kind: 'code', text: 'XButton'},
    ]);
    expect(parseInline('{@link XButton|the button}')).toEqual([
      {kind: 'text', text: 'the button'},
    ]);
    expect(parseInline('{@linkcode XButton#press}')).toEqual([
      {kind: 'code', text: 'XButton#press'},
    ]);
    expect(parseInline('{@link}')).toEqual([{kind: 'text', text: '{@link}'}]);
  });
});

describe('docPlainText', () => {
  test('strips markup, joins soft breaks, keeps link text', () => {
    const source =
      'A **bold**, `code`\nand [linked](https://x.dev) {@link Foo}.\n\n- one\n- two\n\n3. x';
    expect(docPlainText(source)).toBe(
      'A bold, code and linked Foo.\n\n- one\n- two\n\n3. x'
    );
  });

  test('code blocks and headings keep their text', () => {
    expect(docPlainText('# T\n\n```\na\n  *b*\n```')).toBe('T\n\na\n  *b*');
  });

  test('plain text passes through', () => {
    expect(docPlainText('Just text.')).toBe('Just text.');
    expect(docPlainText('')).toBe('');
  });
});
