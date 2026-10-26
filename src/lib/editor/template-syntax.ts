/**
 * Mistakes in how a Lit template is written, read from the markup alone:
 *
 * - `unclosed-tag`: a component never closed, or closed with `/>`, which
 *   HTML reads as an open tag, so everything after it becomes its children.
 *   Standard elements are left alone, since HTML lets many go unclosed.
 * - `binding-syntax`: a `.`, `?` or `@` binding without a `${…}`; one whose
 *   value has a stray `"`, `'` or `}` next to the expression, or a `/` in
 *   an unquoted one, `.value=${v}"`; and Polymer's `name$=`.
 */

import type {Problem} from './diagnostics.js';
import type {FeatureRequest} from './features.js';
import {
  type MarkupAttribute,
  type MarkupElement,
  type MarkupRegion,
  markupRegions,
  scanMarkup,
} from './markup.js';

type Request = Omit<FeatureRequest, 'offset'>;

const isComponent = (tag: string) => tag.includes('-');

const selfClosed = (code: string, element: MarkupElement) =>
  element.closed && code[element.end - 2] === '/';

const inHole = (region: MarkupRegion, offset: number) =>
  region.holes.some((hole) => hole.start <= offset && offset < hole.end);

/** The `</tag>`s of components in a region, outside its holes. */
const closingTags = (code: string, region: MarkupRegion) => {
  const text = code.slice(region.start, region.end);
  const tags: {tag: string; at: number}[] = [];
  for (const match of text.matchAll(/<\/([a-z][\w.-]*-[\w.-]*)\s*>/gi)) {
    const at = region.start + match.index;
    if (!inHole(region, at)) tags.push({tag: match[1].toLowerCase(), at});
  }
  return tags;
};

/** The components a region opens and never closes. */
const unclosedIn = (code: string, region: MarkupRegion): Problem[] => {
  const opened = scanMarkup(code, region)
    .filter((element) => isComponent(element.tag))
    .filter((element) => !selfClosed(code, element))
    .map((element) => ({element, at: element.start}));
  const events = [
    ...opened.map((open) => ({...open, tag: open.element.tag.toLowerCase()})),
    ...closingTags(code, region).map((close) => ({...close, element: null})),
  ].sort((a, b) => a.at - b.at);
  const stack: MarkupElement[] = [];
  for (const {element, tag} of events) {
    if (element) {
      stack.push(element);
      continue;
    }
    let match = stack.length - 1;
    while (match >= 0 && stack[match].tag.toLowerCase() !== tag) match--;
    if (match !== -1) stack.splice(match);
  }
  return stack.map((element) => ({
    rule: 'unclosed-tag',
    start: element.start + 1,
    end: element.nameEnd,
    message: `\`<${element.tag}>\` is never closed: add \`</${element.tag}>\`.`,
  }));
};

const selfClosedIn = (code: string, region: MarkupRegion): Problem[] =>
  scanMarkup(code, region)
    .filter((element) => isComponent(element.tag) && selfClosed(code, element))
    .map((element) => ({
      rule: 'unclosed-tag',
      start: element.start + 1,
      end: element.nameEnd,
      message: `HTML reads \`<${element.tag} />\` as an open tag, so what follows becomes its children: close it with \`</${element.tag}>\`.`,
    }));

const WHAT = {'.': 'a property', '?': 'a boolean attribute', '@': 'a listener'};

/** Text left in a value once its holes are taken out. */
const outsideHoles = (
  code: string,
  region: MarkupRegion,
  start: number,
  end: number
) => {
  let text = '';
  for (let i = start; i < end; i++) if (!inHole(region, i)) text += code[i];
  return text.trim();
};

/** Polymer's `name$=`. */
const legacyProblem = ({
  binding,
  name,
  nameStart,
  nameEnd,
}: MarkupAttribute): Problem | undefined =>
  binding === '' && name.endsWith('$')
    ? {
        rule: 'binding-syntax',
        start: nameStart,
        end: nameEnd,
        message: `\`${name}=\` is Polymer's syntax; Lit sets the attribute with \`${name.slice(0, -1)}=\${…}\`.`,
      }
    : undefined;

/** A `.`, `?` or `@` binding without a `${…}`. */
const expressionlessProblem = ({
  binding,
  name,
  nameStart,
  nameEnd,
  value,
}: MarkupAttribute): Problem | undefined =>
  binding !== '' && !value?.expression
    ? {
        rule: 'binding-syntax',
        start: nameStart,
        end: nameEnd,
        message: `\`${binding}${name}\` sets ${WHAT[binding]}, so its value is an expression: \`${binding}${name}=\${…}\`.`,
      }
    : undefined;

/** A stray character next to an expression, `title=${t}"`. */
const strayProblem = (
  code: string,
  region: MarkupRegion,
  {binding, name, value}: MarkupAttribute
): Problem | undefined => {
  if (!value?.expression) return undefined;
  // `href="${base}/"` means the slash; next to an unquoted hole it can't.
  const stray = outsideHoles(code, region, value.start, value.end);
  const strayRe = value.quote ? /^["'}]+$/ : /^["'}/]+$/;
  if (!strayRe.test(stray)) return undefined;
  return {
    rule: 'binding-syntax',
    start: value.start,
    end: value.end,
    message: `A stray \`${stray}\` sits next to the expression, which makes \`${binding}${name}\` a string.`,
  };
};

const attributeProblem = (
  code: string,
  region: MarkupRegion,
  attribute: MarkupAttribute
): Problem | undefined =>
  legacyProblem(attribute) ??
  expressionlessProblem(attribute) ??
  strayProblem(code, region, attribute);

const bindingsIn = (code: string, region: MarkupRegion): Problem[] =>
  scanMarkup(code, region).flatMap((element) =>
    element.attributes.flatMap((attribute) => {
      const problem = attributeProblem(code, region, attribute);
      return problem ? [problem] : [];
    })
  );

/** The syntax mistakes in a document's Lit templates. */
export const templateSyntaxProblems = (request: Request): Problem[] => {
  if (request.kind !== 'script') return [];
  const {code} = request;
  return markupRegions(code, request.kind, {
    templateTags: request.templateTags,
  }).flatMap((region) => [
    ...unclosedIn(code, region),
    ...selfClosedIn(code, region),
    ...bindingsIn(code, region),
  ]);
};
