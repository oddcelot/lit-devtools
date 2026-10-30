/**
 * Problems in a document's markup, by rule. Here `event-type` (literal
 * values are `binding-literals.ts`'s `binding-type`): an `@event` handler
 * whose parameter type doesn't fit the event, whether
 * written inline, `@go=${(e: CustomEvent<{id: string}>) => …}`, or as a
 * method of the same file's class, `@go=${this.#onGo}`. JSX's `ongo={…}`
 * and Solid's `on:go={…}` are read too, for the events `handlerEventType`
 * types there.
 *
 * The comparison is the type text's (`type-text.ts`), so only plain
 * conflicts are reported and anything it can't read stays silent.
 */

import type {DiagnosticRule} from './config.js';
import {
  type DocsSource,
  type FeatureRequest,
  handlerEventType,
} from './features.js';
import {eventBindings} from './handlers.js';
import {
  type Node,
  child,
  nameOf,
  nodes,
  nodesOf,
} from '../component-docs/ast.js';
import {parseModule} from '../component-docs/parse.js';
import {typeMismatch} from './type-text.js';

export interface Problem {
  rule: DiagnosticRule;
  start: number;
  end: number;
  message: string;
  /** A quick fix: one edit, at offsets into the document. */
  fix?: {title: string; start: number; end: number; newText: string};
}

/** The text of a function's first parameter's type annotation. */
const firstParamType = (
  code: string,
  fn: Node | undefined
): string | undefined => {
  const param = nodes(fn?.params)[0];
  const annotation = child(child(param, 'typeAnnotation'), 'typeAnnotation');
  return annotation && code.slice(annotation.start, annotation.end);
};

const unwrap = (node: Node | undefined): Node | undefined =>
  node?.type === 'ParenthesizedExpression'
    ? unwrap(child(node, 'expression'))
    : node;

const isFunction = (node: Node | undefined): boolean =>
  node?.type === 'ArrowFunctionExpression' ||
  node?.type === 'FunctionExpression';

/** An inline handler's parameter type, read by parsing the expression alone. */
const inlineParamType = (expression: string): string | undefined => {
  const wrapped = `(${expression});`;
  let program: Node;
  try {
    program = parseModule(wrapped, 'handler.ts');
  } catch {
    return undefined;
  }
  const statement = nodes(program.body)[0];
  const fn = unwrap(child(statement, 'expression'));
  return isFunction(fn) ? firstParamType(wrapped, fn) : undefined;
};

/** A class member's name as `this.` reaches it: `#onAdd` or `onAdd`. */
const memberName = (member: Node): string | undefined => {
  const key = child(member, 'key');
  if (key?.type === 'PrivateIdentifier') return `#${String(key.name)}`;
  return nameOf(key);
};

/** The methods and function-valued fields of the file's classes, by name, with their parameter type. */
const methodParamTypes = (code: string, file: string): Map<string, string> => {
  const types = new Map<string, string>();
  let program: Node;
  try {
    program = parseModule(code, file);
  } catch {
    return types;
  }
  for (const node of nodesOf(program)) {
    if (node.type !== 'MethodDefinition' && node.type !== 'PropertyDefinition')
      continue;
    const name = memberName(node);
    const value = child(node, 'value');
    const type = isFunction(value) ? firstParamType(code, value) : undefined;
    if (name && type && !types.has(name)) types.set(name, type);
  }
  return types;
};

const METHOD_RE = /^\s*this\s*\.\s*(#?[A-Za-z_$][\w$]*)\s*$/;

/** The handlers in the document whose parameter type doesn't fit their event. */
export const eventTypeProblems = async (
  source: DocsSource,
  request: Omit<FeatureRequest, 'offset'>
): Promise<Problem[]> => {
  const {file, code, kind, templateTags} = request;
  const bindings = eventBindings(code, kind, {templateTags});
  if (bindings.length === 0) return [];
  let methods: Map<string, string> | undefined;
  const problems: Problem[] = [];
  for (const binding of bindings) {
    const {attribute, start, end} = binding;
    const expression = code.slice(start, end);
    const method = METHOD_RE.exec(expression)?.[1];
    const expected = method
      ? (methods ??= methodParamTypes(code, file)).get(method)
      : inlineParamType(expression);
    if (!expected) continue;
    const actual = await handlerEventType(source, file, binding);
    const reason = actual && typeMismatch(actual, expected);
    if (!reason) continue;
    const who = method ? `\`${method}\` takes` : 'The handler takes';
    // JSX's `ongo` listens for `go`.
    const event =
      attribute.binding === '@' ? attribute.name : attribute.name.slice(2);
    problems.push({
      rule: 'event-type',
      start,
      end,
      message: `${who} \`${expected}\`, but \`${event}\` sends \`${actual}\`: ${reason}.`,
    });
  }
  return problems;
};
