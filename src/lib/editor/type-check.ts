/**
 * The binding checks TypeScript makes, without asking it anything but a
 * `tsc` run. Each script gets a shadow copy in which every single-hole
 * binding's expression is wrapped in a call that says what the binding
 * takes, in place, so it keeps its scope:
 *
 * ```ts
 * html`<x-button .size=${this.size}>`
 * html`<x-button .size=${__litProp<'x-button', 'size'>((this.size))}>`
 * ```
 *
 * `PRELUDE` declares the calls: a property takes the element's property type
 * from `HTMLElementTagNameMap`, an attribute text, `?` a boolean, and `@` a
 * listener for the event. Copies are only inserted into, so an error's
 * offset in the copy maps back to the source (`toSource`).
 *
 * A generic element is in `HTMLElementTagNameMap` with `unknown` for its
 * type parameters, so `unknown` in a property type, its array's items or a
 * callback's parameters reads as `any`, and an array may be readonly: Lit
 * sets it, it never writes to it.
 *
 * Lit's `DirectiveResult` loses its members when Lit's types are built, so
 * it would accept anything; a call to a directive (`live(x)`, `classMap(…)`)
 * is left unwrapped instead.
 */

import {type Node, child, nodes, walk} from '../component-docs/ast.js';
import {parseModule} from '../component-docs/parse.js';
import {
  type BindingsRequest,
  type TemplateBinding,
  templateBindings,
} from './bindings.js';
import type {Binding} from './markup.js';

/** Declarations every shadow copy is checked with. */
export const PRELUDE = `\
type __LitSpecial = typeof import('lit').nothing | typeof import('lit').noChange;
type __LitElementOf<K> = K extends keyof HTMLElementTagNameMap
  ? HTMLElementTagNameMap[K]
  : K extends keyof SVGElementTagNameMap
    ? SVGElementTagNameMap[K]
    : unknown;
type __LitLoose<T> = 0 extends 1 & T
  ? T
  : unknown extends T
    ? any
    : T extends (...args: infer A) => infer R
      ? (...args: {[I in keyof A]: unknown extends A[I] ? any : A[I]}) => R
      : T extends readonly (infer U)[]
        ? readonly __LitLoose<U>[]
        : T;
type __LitPropOf<K, P> = P extends keyof __LitElementOf<K> ? __LitLoose<__LitElementOf<K>[P]> : any;
type __LitEventOf<N, F> = N extends keyof HTMLElementEventMap ? HTMLElementEventMap[N] : F;
declare function __litProp<K extends string, P extends string>(value: __LitPropOf<K, P> | __LitSpecial): void;
declare function __litAttr(value: string | number | bigint | __LitSpecial): void;
type __LitTextOf<T> = [T & {}] extends [string]
  ? string extends T & {}
    ? string | number | bigint
    : T & {}
  : string | number | bigint;
declare function __litAttrOf<K extends string, P extends string>(value: __LitTextOf<__LitPropOf<K, P>> | __LitSpecial): void;
declare function __litBool(value: boolean | null | undefined | __LitSpecial): void;
declare function __litEvent<N extends string, F = any>(
  value:
    | ((event: __LitEventOf<N, F>) => unknown)
    | {handleEvent(event: __LitEventOf<N, F>): unknown}
    | null
    | undefined
    | __LitSpecial
): void;
`;

/** A binding whose expression the shadow copy wraps. */
export interface Wrap {
  binding: Binding;
  name: string;
  tag: string;
  /** The expression in the source. */
  start: number;
  end: number;
}

/** Text the shadow copy inserts before the source's offset `at`. */
interface Insertion {
  at: number;
  text: string;
}

export interface Shadow {
  text: string;
  wraps: Wrap[];
  insertions: Insertion[];
}

const literal = (text: string): string => `'${text.replace(/['\\]/g, '\\$&')}'`;

/**
 * What a binding's call needs from the docs: a custom event's type, and the
 * property a component's attribute sets.
 */
export interface BindingLookup {
  eventType(tag: string, name: string): Promise<string | undefined>;
  propertyOf?(tag: string, attribute: string): Promise<string | undefined>;
}

const typeArgumentFor = (
  {element, attribute}: TemplateBinding,
  lookup: BindingLookup
): Promise<string | undefined> | undefined => {
  if (attribute.binding === '@')
    return lookup.eventType(element.tag, attribute.name);
  if (attribute.binding === '' && element.tag.includes('-'))
    return lookup.propertyOf?.(element.tag, attribute.name);
  return undefined;
};

/**
 * The call a binding's expression goes into. `known` is a custom event's
 * type for `@`, and for a plain attribute the property it sets, whose type
 * then narrows the text it takes: `'small' | 'large'`, not any string.
 */
const callFor = (
  {element, attribute}: TemplateBinding,
  known: string | undefined
): string => {
  const tag = literal(element.tag.toLowerCase());
  const name = literal(attribute.name);
  switch (attribute.binding) {
    case '.':
      return `__litProp<${tag}, ${name}>`;
    case '?':
      return '__litBool';
    case '@':
      return known ? `__litEvent<${name}, ${known}>` : `__litEvent<${name}>`;
    default:
      return known ? `__litAttrOf<${tag}, ${literal(known)}>` : '__litAttr';
  }
};

/** The local names an `import … from '…directive…'` binds. */
const importedDirectives = (node: Node): string[] => {
  if (node.type !== 'ImportDeclaration') return [];
  const from = child(node, 'source')?.value;
  if (typeof from !== 'string' || !/directive/i.test(from)) return [];
  return nodes(node.specifiers).flatMap((specifier) => {
    const local = child(specifier, 'local')?.name;
    return typeof local === 'string' ? [local] : [];
  });
};

/** The name `const x = directive(…)` binds. */
const madeDirective = (node: Node): string[] => {
  if (node.type !== 'VariableDeclarator') return [];
  const init = child(node, 'init');
  const id = child(node, 'id')?.name;
  return init?.type === 'CallExpression' &&
    child(init, 'callee')?.name === 'directive' &&
    typeof id === 'string'
    ? [id]
    : [];
};

/** Names bound to directives: imported from a `…directive…` module, or made with `directive(…)`. */
const directiveNames = (code: string, file: string): Set<string> => {
  const names = new Set<string>();
  let program: Node;
  try {
    program = parseModule(code, file);
  } catch {
    return names;
  }
  for (const node of walk(program)) {
    for (const name of [...importedDirectives(node), ...madeDirective(node)])
      names.add(name);
  }
  return names;
};

const CALL_RE = /^\s*([A-Za-z_$][\w$]*)\s*\(/;

/** The shadow copy of a script, or undefined when it has no binding to wrap. */
export const shadowSource = async (
  request: BindingsRequest & {file: string},
  lookup: BindingLookup
): Promise<Shadow | undefined> => {
  const {code, file} = request;
  const bindings = templateBindings(request);
  if (bindings.length === 0) return undefined;
  const directives = directiveNames(code, file);
  const wraps: Wrap[] = [];
  const insertions: Insertion[] = [];
  for (const binding of bindings) {
    const {element, attribute, start, end} = binding;
    const callee = CALL_RE.exec(code.slice(start, end))?.[1];
    if (callee && directives.has(callee)) continue;
    const type = await typeArgumentFor(binding, lookup);
    insertions.push(
      {at: start, text: `${callFor(binding, type)}((`},
      {at: end, text: '))'}
    );
    wraps.push({
      binding: attribute.binding,
      name: attribute.name,
      tag: element.tag,
      start,
      end,
    });
  }
  if (wraps.length === 0) return undefined;
  // Stable, so a suffix and a prefix at one offset keep the order they were
  // pushed in; an inner binding's suffix never shares an outer's offset.
  insertions.sort((a, b) => a.at - b.at);
  let text = '';
  let from = 0;
  for (const {at, text: inserted} of insertions) {
    text += code.slice(from, at) + inserted;
    from = at;
  }
  text += code.slice(from);
  return {text, wraps, insertions};
};

/** The source offset of an offset into the shadow copy; inserted text maps to where it was inserted. */
export const toSource = (insertions: Insertion[], offset: number): number => {
  let shift = 0;
  for (const {at, text} of insertions) {
    const inCopy = at + shift;
    if (offset < inCopy) break;
    if (offset < inCopy + text.length) return at;
    shift += text.length;
  }
  return offset - shift;
};

/** The innermost wrapped binding holding a source offset. */
export const wrapAt = (wraps: Wrap[], offset: number): Wrap | undefined =>
  wraps
    .filter((wrap) => wrap.start <= offset && offset <= wrap.end)
    .sort((a, b) => a.end - a.start - (b.end - b.start))[0];

/** One diagnostic of `tsc --pretty false`. */
export interface TscDiagnostic {
  file: string;
  line: number;
  column: number;
  code: number;
  /** The first line of the message, then its elaboration. */
  message: string[];
}

const DIAGNOSTIC_RE = /^(.+)\((\d+),(\d+)\): error TS(\d+): (.*)$/;

/** The diagnostics in `tsc --pretty false` output, file-less ones left out. */
export const parseTscOutput = (output: string): TscDiagnostic[] => {
  const diagnostics: TscDiagnostic[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = DIAGNOSTIC_RE.exec(line);
    if (match) {
      diagnostics.push({
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
        code: Number(match[4]),
        message: [match[5]],
      });
    } else if (/^\s+\S/.test(line) && diagnostics.length > 0) {
      diagnostics.at(-1)!.message.push(line.trim());
    }
  }
  return diagnostics;
};

const ARGUMENT_RE =
  /^Argument of type '(.*)' is not assignable to parameter of type '(.*)'\.$/;

const takes = (wrap: Wrap, expected: string): string => {
  switch (wrap.binding) {
    case '.':
      return `\`.${wrap.name}\` takes \`${expected}\``;
    case '?':
      return `\`?${wrap.name}\` takes a boolean`;
    case '@':
      return `\`@${wrap.name}\` takes an event listener`;
    default:
      return expected === 'string | number | bigint'
        ? `\`${wrap.name}\` takes text`
        : `\`${wrap.name}\` takes \`${expected}\``;
  }
};

const withoutSpecial = (type: string): string =>
  type.replace(/ \| __LitSpecial|__LitSpecial \| /g, '');

/** What a diagnostic in a wrapped binding says, in the binding's terms. */
export const bindingMessage = (
  wrap: Wrap,
  diagnostic: TscDiagnostic
): string => {
  const [first, ...rest] = diagnostic.message;
  const argument = diagnostic.code === 2345 && ARGUMENT_RE.exec(first);
  if (!argument) return `\`${wrap.name}\`: ${diagnostic.message.join(' ')}`;
  const detail = rest.at(-1);
  const because =
    detail && wrap.binding === '@' ? ` ${withoutSpecial(detail)}` : '';
  return `${takes(wrap, withoutSpecial(argument[2]))}, but this is \`${argument[1]}\`.${because}`;
};
