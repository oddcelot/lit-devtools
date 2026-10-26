/**
 * The `binding-type` problems a binding's literal value shows without a type
 * checker: a string in `?hidden=${'no'}`, `true` in `title=${true}`, a number
 * in `@click=${1}`, or `'huge'` in `.size=${'huge'}` when `size` is
 * `'small' | 'large'`. An expression that isn't a literal is left to
 * `lit-devtools check`, which asks TypeScript (`type-check.ts`).
 */

import {type Node, child, nodes} from '../component-docs/ast.js';
import {parseModule} from '../component-docs/parse.js';
import {type BindingsRequest, templateBindings} from './bindings.js';
import type {Problem} from './diagnostics.js';
import {type DocsSource, bindingTypeOf, literalValues} from './features.js';
import type {Binding} from './markup.js';

type LiteralKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'undefined'
  | 'object'
  | 'array'
  | 'function';

interface Literal {
  kind: LiteralKind;
  /** A string's value. */
  value?: string;
}

const kindOfLiteral = (node: Node): Literal | undefined => {
  const value = node.value;
  if (value === null && node.raw === 'null') return {kind: 'null'};
  if (typeof value === 'string') return {kind: 'string', value};
  if (typeof value === 'number') return {kind: 'number'};
  if (typeof value === 'boolean') return {kind: 'boolean'};
  return undefined;
};

const SHAPES: Record<string, LiteralKind> = {
  ObjectExpression: 'object',
  ArrayExpression: 'array',
  ArrowFunctionExpression: 'function',
  FunctionExpression: 'function',
};

/** What a literal node is; undefined for anything else. */
const literalOf = (node: Node | undefined): Literal | undefined => {
  if (!node) return undefined;
  if (node.type === 'ParenthesizedExpression')
    return literalOf(child(node, 'expression'));
  if (node.type === 'Literal') return kindOfLiteral(node);
  if (node.type === 'Identifier' && node.name === 'undefined')
    return {kind: 'undefined'};
  if (node.type === 'TemplateLiteral' && nodes(node.expressions).length === 0) {
    const quasi = nodes(node.quasis)[0];
    const cooked = (quasi?.value as {cooked?: string} | undefined)?.cooked;
    return {kind: 'string', value: cooked ?? ''};
  }
  if (node.type === 'UnaryExpression' && node.operator === '-')
    return literalOf(child(node, 'argument'))?.kind === 'number'
      ? {kind: 'number'}
      : undefined;
  const shape = SHAPES[node.type];
  return shape ? {kind: shape} : undefined;
};

/** The literal an expression is, read by parsing it alone. */
const parseLiteral = (expression: string): Literal | undefined => {
  let program: Node;
  try {
    program = parseModule(`(${expression});`, 'binding.ts');
  } catch {
    return undefined;
  }
  return literalOf(child(nodes(program.body)[0], 'expression'));
};

const ARTICLE: Record<LiteralKind, string> = {
  string: 'a string',
  number: 'a number',
  boolean: 'a boolean',
  null: '`null`',
  undefined: '`undefined`',
  object: 'an object',
  array: 'an array',
  function: 'a function',
};

/** `?name=${…}`: anything but a boolean is a mistake. */
const booleanProblem = (name: string, literal: Literal): string | undefined =>
  ['string', 'number', 'object', 'array', 'function'].includes(literal.kind)
    ? `\`?${name}\` takes a boolean, not ${ARTICLE[literal.kind]}.`
    : undefined;

/** `name=${…}`: an attribute's value is text. */
const attributeProblem = (
  name: string,
  literal: Literal
): string | undefined => {
  switch (literal.kind) {
    case 'boolean':
      return `\`${name}\` is set to the text \`true\` or \`false\`; write \`?${name}\` to add or remove it.`;
    case 'null':
    case 'undefined':
      return `${ARTICLE[literal.kind]} sets \`${name}\` to an empty value; bind \`nothing\` to leave it out.`;
    case 'object':
    case 'array':
    case 'function':
      return `\`${name}\` is set to ${ARTICLE[literal.kind]} as text; write \`.${name}\` to set the property.`;
    default:
      return undefined;
  }
};

/** `@name=${…}`: a listener is a function or an object with `handleEvent`. */
const eventProblem = (name: string, literal: Literal): string | undefined =>
  ['string', 'number', 'boolean', 'array'].includes(literal.kind)
    ? `\`@${name}\` takes a function, not ${ARTICLE[literal.kind]}.`
    : undefined;

const PRIMITIVE_TYPES = new Set(['string', 'number', 'boolean']);

/**
 * Why a literal can't be a value of `type`, read as a union of primitives
 * and string literals; undefined when it can or the type says more than that.
 */
const valueMismatch = (literal: Literal, type: string): string | undefined => {
  const parts = type.split('|').map((part) => part.trim());
  const strings = literalValues(type);
  const primitives = parts.filter((part) => PRIMITIVE_TYPES.has(part));
  const optional: string[] = parts.filter(
    (part) => part === 'null' || part === 'undefined'
  );
  if (strings.length + primitives.length + optional.length !== parts.length)
    return undefined;
  if (optional.includes(literal.kind)) return undefined;
  if (primitives.includes(literal.kind)) return undefined;
  if (literal.kind === 'string' && strings.includes(literal.value ?? ''))
    return undefined;
  if (literal.kind === 'string' && strings.length > 0)
    return `\`'${literal.value}'\` isn't one of ${strings.map((s) => `\`'${s}'\``).join(', ')}`;
  return `it's ${ARTICLE[literal.kind]}`;
};

const propertyProblem = (
  name: string,
  literal: Literal,
  type: string | undefined
): string | undefined => {
  const reason = type && valueMismatch(literal, type);
  return reason ? `\`.${name}\` takes \`${type}\`, but ${reason}.` : undefined;
};

const RULES: Record<
  Exclude<Binding, '.'>,
  (name: string, literal: Literal) => string | undefined
> = {
  '?': booleanProblem,
  '': attributeProblem,
  '@': eventProblem,
};

/** The bindings in the document whose literal value can't be right. */
export const bindingLiteralProblems = async (
  source: DocsSource,
  request: BindingsRequest & {file: string}
): Promise<Problem[]> => {
  const problems: Problem[] = [];
  for (const {element, attribute, start, end} of templateBindings(request)) {
    const literal = parseLiteral(request.code.slice(start, end));
    if (!literal) continue;
    const {binding, name} = attribute;
    const message =
      binding === '.'
        ? propertyProblem(
            name,
            literal,
            await bindingTypeOf(source, request.file, element.tag, '.', name)
          )
        : RULES[binding](name, literal);
    if (message) problems.push({rule: 'binding-type', start, end, message});
  }
  return problems;
};
