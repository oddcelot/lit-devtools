/**
 * Comments that silence the server's problems, in the editor, in Oxlint and
 * in `lit-devtools check` alike:
 *
 * - `<!-- lit-ignore [rules] -->` in a template: the next element's tag,
 *   attributes and values. A JavaScript comment there would be template
 *   text, so it's HTML's.
 * - `// lit-ignore-next-line [rules]`: the next line.
 * - `// lit-ignore-file [rules]`, anywhere: the whole file.
 *
 * Rules are separated by spaces or commas; without any, every rule is.
 */

import {DIAGNOSTIC_RULES, type DiagnosticRule} from './config.js';
import {type DocumentKind, markupRegions, scanMarkup} from './markup.js';

interface Suppression {
  /** Every rule when empty. */
  rules: Set<string>;
  start: number;
  end: number;
}

const rulesOf = (text: string | undefined): Set<string> =>
  new Set(
    (text ?? '')
      .split(/[\s,]+/)
      .filter((rule) => (DIAGNOSTIC_RULES as readonly string[]).includes(rule))
  );

const fileWide = (code: string): Suppression[] =>
  [...code.matchAll(/\/[/*]\s*lit-ignore-file\b([^\n*]*)/g)].map((match) => ({
    rules: rulesOf(match[1]),
    start: 0,
    end: code.length,
  }));

const nextLines = (code: string): Suppression[] =>
  [...code.matchAll(/\/\/\s*lit-ignore-next-line\b([^\n]*)/g)].flatMap(
    (match) => {
      const lineEnd = code.indexOf('\n', match.index);
      if (lineEnd === -1) return [];
      const nextEnd = code.indexOf('\n', lineEnd + 1);
      return [
        {
          rules: rulesOf(match[1]),
          start: lineEnd + 1,
          end: nextEnd === -1 ? code.length : nextEnd,
        },
      ];
    }
  );

const nextElements = (
  code: string,
  kind: DocumentKind,
  templateTags: readonly string[] | undefined
): Suppression[] =>
  markupRegions(code, kind, {templateTags}).flatMap((region) => {
    const text = code.slice(region.start, region.end);
    const comments = [...text.matchAll(/<!--\s*lit-ignore\b([\s\S]*?)-->/g)];
    if (comments.length === 0) return [];
    const elements = scanMarkup(code, region);
    return comments.flatMap((comment) => {
      const after = region.start + comment.index + comment[0].length;
      const element = elements.find((candidate) => candidate.start >= after);
      return element
        ? [{rules: rulesOf(comment[1]), start: element.start, end: element.end}]
        : [];
    });
  });

/**
 * Whether a problem is silenced by a comment in the document: a test for
 * a problem's rule and start.
 */
export const suppressionsOf = (
  code: string,
  kind: DocumentKind,
  templateTags?: readonly string[]
): ((problem: {rule: DiagnosticRule; start: number}) => boolean) => {
  if (!code.includes('lit-ignore')) return () => false;
  const all = [
    ...fileWide(code),
    ...nextLines(code),
    ...nextElements(code, kind, templateTags),
  ];
  return ({rule, start}) =>
    all.some(
      (s) =>
        start >= s.start &&
        start < s.end &&
        (s.rules.size === 0 || s.rules.has(rule))
    );
};
