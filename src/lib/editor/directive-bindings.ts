/**
 * `directive-binding`: a built-in Lit directive written where Lit can't
 * apply it, which throws when the template first renders. `classMap` and
 * `styleMap` take the whole value of `class` and `style`; `ifDefined` an
 * attribute; `live` anything but a listener; `ref` the element itself,
 * `<div ${ref(…)}>`; and the directives that render children, such as
 * `repeat` and `unsafeHTML`, the space between tags.
 *
 * Only directives imported from Lit's own modules are read, by the name
 * they were exported as, so `import {live as l}` is still `live`.
 */

import {templateBindings} from './bindings.js';
import type {Problem} from './diagnostics.js';
import {calleeOf, directivesIn} from './directives.js';
import type {FeatureRequest} from './features.js';
import type {MarkupAttribute} from './markup.js';

type Request = Omit<FeatureRequest, 'offset'>;

const CHILD_ONLY = [
  'repeat',
  'unsafeHTML',
  'unsafeSVG',
  'unsafeMathML',
  'cache',
  'asyncAppend',
  'templateContent',
];

const writtenAs = ({binding, name}: MarkupAttribute) => `\`${binding}${name}\``;

/** `classMap` and `styleMap`: the value of their one attribute. */
const onlyOn =
  (directive: string, only: string) =>
  (attribute: MarkupAttribute): string | undefined =>
    attribute.binding === '' && attribute.name === only
      ? undefined
      : `\`${directive}\` only works as the value of \`${only}\`, not ${writtenAs(attribute)}.`;

const childOnly =
  (directive: string) =>
  (attribute: MarkupAttribute): string =>
    `\`${directive}\` renders children, so it goes between tags, not in ${writtenAs(attribute)}.`;

/** Why each directive can't go in an attribute's value, or undefined when it can. */
const PLACES: Record<
  string,
  (attribute: MarkupAttribute) => string | undefined
> = {
  classMap: onlyOn('classMap', 'class'),
  styleMap: onlyOn('styleMap', 'style'),
  ifDefined: (attribute) =>
    attribute.binding === ''
      ? undefined
      : `\`ifDefined\` is for attributes; ${writtenAs(attribute)} takes \`undefined\` as it is.`,
  live: ({binding}) =>
    binding === '@'
      ? "`live` compares a value with the element's, which a listener doesn't have."
      : undefined,
  ref: (attribute) =>
    `\`ref\` goes on the element itself, \`<div \${ref(…)}>\`, not in ${writtenAs(attribute)}.`,
  ...Object.fromEntries(CHILD_ONLY.map((name) => [name, childOnly(name)])),
};

const misplaced = (
  directive: string,
  attribute: MarkupAttribute
): string | undefined => PLACES[directive]?.(attribute);

const LIT_MODULE = /^(lit|lit-html|@lit\/[^/]+)\/directives\//;

/** Lit's own directives, by local name: imported from `lit…/directives/…`. */
const litDirectives = (request: Request): Map<string, string> =>
  new Map(
    [...directivesIn(request.code, request.file)]
      .filter(([, directive]) => LIT_MODULE.test(directive.from))
      .map(([local, directive]) => [local, directive.name])
  );

/** The directives in a document's Lit templates written where Lit can't apply them. */
export const directiveBindingProblems = (request: Request): Problem[] => {
  if (request.kind !== 'script') return [];
  const directives = litDirectives(request);
  if (directives.size === 0) return [];
  return templateBindings(request).flatMap(({attribute, start, end}) => {
    const callee = calleeOf(request.code.slice(start, end));
    const directive = callee && directives.get(callee);
    const reason = directive && misplaced(directive, attribute);
    return reason
      ? [{rule: 'directive-binding' as const, start, end, message: reason}]
      : [];
  });
};
