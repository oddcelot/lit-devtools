/**
 * A class's public methods, with their parameters and return type, for the
 * manifest. Read from TypeScript annotations first, else the comment's
 * `@param {Type} name - description` and `@returns {Type} description`.
 *
 * Lifecycle callbacks of custom elements and of `ReactiveElement` are left
 * out: they are how Lit calls the class, not API a user calls. So are static,
 * private, protected, `#` and computed members, and ones tagged `@private`,
 * `@internal` or `@ignore`.
 */

import {type Node, child, docOf, nameOf, nodes, put} from './ast.js';
import {type JsDoc, deprecationOf, namedEntry, typedText} from './jsdoc.js';
import {HIDDEN_ACCESS, isHidden, sliceOf} from './members.js';

export interface MethodParameter {
  name: string;
  type?: string;
  description?: string;
  /** Source text of its default value. */
  default?: string;
  optional?: true;
  rest?: true;
}

export interface MethodDocs {
  name: string;
  description?: string;
  deprecated?: boolean | string;
  parameters?: MethodParameter[];
  return?: {type?: string; description?: string};
}

const LIFECYCLE = new Set([
  'constructor',
  'connectedCallback',
  'disconnectedCallback',
  'adoptedCallback',
  'attributeChangedCallback',
  'connectedMoveCallback',
  'formAssociatedCallback',
  'formDisabledCallback',
  'formResetCallback',
  'formStateRestoreCallback',
  'render',
  'createRenderRoot',
  'shouldUpdate',
  'willUpdate',
  'update',
  'updated',
  'firstUpdated',
  'performUpdate',
  'scheduleUpdate',
  'getUpdateComplete',
]);

const typeOf = (code: string, node: Node | undefined): string | undefined =>
  sliceOf(code, child(child(node, 'typeAnnotation'), 'typeAnnotation'));

/** `[name]` or `[name=value]`: an optional parameter, and its default. */
const OPTIONAL_NAME = /^\[([^=\]]+)(?:=([^\]]*))?\]$/;

/** One `@param {Type} name - description` tag. */
const paramTag = (text: string): MethodParameter => {
  const entry = namedEntry(text);
  const optional = OPTIONAL_NAME.exec(entry.name);
  const param: MethodParameter = {name: optional?.[1] ?? entry.name};
  put(param, 'type', entry.type);
  put(param, 'description', entry.description);
  if (optional !== null) param.optional = true;
  put(param, 'default', optional?.[2]?.trim() || undefined);
  return param;
};

/** `@param` tags by name. */
const paramTags = (doc: JsDoc | undefined): Map<string, MethodParameter> =>
  new Map(
    (doc?.tags ?? [])
      .filter((tag) => tag.tag === 'param')
      .map((tag) => paramTag(tag.text))
      .map((param) => [param.name, param])
  );

/** What a parameter's own syntax says: `a = 1` has a default, `...a` is rest. */
const declaredParameter = (
  code: string,
  node: Node
): {target: Node; default?: string; rest?: true} => {
  if (node.type === 'AssignmentPattern')
    return {
      target: child(node, 'left') ?? node,
      default: sliceOf(code, child(node, 'right')),
    };
  if (node.type === 'RestElement')
    return {target: child(node, 'argument') ?? node, rest: true};
  return {target: node};
};

/** One parameter as declared, completed from its `@param` tag. */
const parameterOf = (
  code: string,
  node: Node,
  tags: Map<string, MethodParameter>
): MethodParameter | undefined => {
  const declared = declaredParameter(code, node);
  const name = nameOf(declared.target);
  if (name === undefined) return undefined;
  const tag = tags.get(name);
  const param: MethodParameter = {name};
  put(
    param,
    'type',
    typeOf(code, node) ?? typeOf(code, declared.target) ?? tag?.type
  );
  put(param, 'description', tag?.description);
  put(param, 'default', declared.default ?? tag?.default);
  const optional =
    param.default !== undefined ||
    declared.target.optional === true ||
    tag?.optional === true;
  if (optional) param.optional = true;
  put(param, 'rest', declared.rest);
  return param;
};

/** The return type, annotated or from `@returns {Type}`, and its description. */
const returnOf = (
  code: string,
  fn: Node | undefined,
  doc: JsDoc | undefined
): MethodDocs['return'] => {
  const tag = doc?.tags.find((t) => t.tag === 'returns' || t.tag === 'return');
  const returns = tag === undefined ? {} : typedText(tag.text);
  const result: NonNullable<MethodDocs['return']> = {};
  put(
    result,
    'type',
    sliceOf(code, child(child(fn, 'returnType'), 'typeAnnotation')) ??
      returns.type
  );
  put(result, 'description', returns.description);
  return Object.keys(result).length > 0 ? result : undefined;
};

/** A public, non-lifecycle method's name, or `undefined` for any other member. */
const publicMethodName = (member: Node): string | undefined => {
  const isMethod =
    member.type === 'MethodDefinition' &&
    member.kind === 'method' &&
    member.static !== true &&
    member.computed !== true &&
    !HIDDEN_ACCESS.has(member.accessibility as string);
  const key = child(member, 'key');
  const name = isMethod && key?.type === 'Identifier' ? nameOf(key) : undefined;
  return name === undefined || LIFECYCLE.has(name) ? undefined : name;
};

const methodDocs = (code: string, member: Node): MethodDocs | undefined => {
  const name = publicMethodName(member);
  const doc = name === undefined ? undefined : docOf(code, member);
  if (name === undefined || isHidden(doc)) return undefined;
  const fn = child(member, 'value');
  const tags = paramTags(doc);
  const parameters = nodes(fn?.params).flatMap(
    (param) => parameterOf(code, param, tags) ?? []
  );
  const result: MethodDocs = {name};
  put(result, 'description', doc?.description);
  put(result, 'deprecated', deprecationOf(doc));
  if (parameters.length > 0) result.parameters = parameters;
  put(result, 'return', returnOf(code, fn, doc));
  return result;
};

/** The class's public methods, in source order; an overload's signatures count once. */
export const methodsOf = (code: string, cls: Node): MethodDocs[] => {
  const seen = new Set<string>();
  return nodes(child(cls, 'body')?.body).flatMap((member) => {
    const method = methodDocs(code, member);
    if (method === undefined || seen.has(method.name)) return [];
    seen.add(method.name);
    return [method];
  });
};
