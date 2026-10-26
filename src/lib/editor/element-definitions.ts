/**
 * `missing-element-type`: a component a TypeScript file defines, with
 * `@customElement('x-button')` or `customElements.define('x-button', XButton)`,
 * that the file doesn't add to `HTMLElementTagNameMap`. Without the entry
 * `document.createElement('x-button')` is a plain `HTMLElement`, and
 * `lit-devtools check` can't tell what the element's bindings take.
 *
 * Only the defining file is read, where the entry conventionally sits; its
 * quick fix appends the `declare global` block there.
 */

import {type Node, child, nameOf, nodes, walk} from '../component-docs/ast.js';
import {parseModule} from '../component-docs/parse.js';
import type {Problem} from './diagnostics.js';

interface Definition {
  tag: string;
  /** The class, when it has a name to write in the entry. */
  className?: string;
  /** The tag's string literal. */
  start: number;
  end: number;
}

const TS_RE = /\.[cm]?tsx?$/;

const tagLiteral = (node: Node | undefined) =>
  node?.type === 'Literal' && typeof node.value === 'string'
    ? {tag: node.value, start: node.start, end: node.end}
    : undefined;

/** `@customElement('x')` on a class. */
const decorated = (node: Node): Definition[] => {
  if (node.type !== 'ClassDeclaration' && node.type !== 'ClassExpression')
    return [];
  return nodes(node.decorators).flatMap((decorator) => {
    const call = child(decorator, 'expression');
    if (nameOf(child(call, 'callee')) !== 'customElement') return [];
    const literal = tagLiteral(nodes(call?.arguments)[0]);
    const className = nameOf(child(node, 'id'));
    return literal ? [{...literal, ...(className ? {className} : {})}] : [];
  });
};

/** Whether a callee is `customElements.define`, also on `window.`. */
const isDefine = (callee: Node | undefined): boolean => {
  if (callee?.type !== 'MemberExpression') return false;
  if (nameOf(child(callee, 'property')) !== 'define') return false;
  const object = child(callee, 'object');
  const owner =
    object?.type === 'MemberExpression'
      ? nameOf(child(object, 'property'))
      : nameOf(object);
  return owner === 'customElements';
};

/** `customElements.define('x', C)`. */
const defined = (node: Node): Definition[] => {
  if (node.type !== 'CallExpression' || !isDefine(child(node, 'callee')))
    return [];
  const [tag, cls] = nodes(node.arguments);
  const literal = tagLiteral(tag);
  const className = cls?.type === 'Identifier' ? nameOf(cls) : undefined;
  return literal ? [{...literal, ...(className ? {className} : {})}] : [];
};

/** The keys of every `interface HTMLElementTagNameMap` in the file. */
const mappedTags = (program: Node): Set<string> => {
  const tags = new Set<string>();
  for (const node of walk(program)) {
    if (node.type !== 'TSInterfaceDeclaration') continue;
    if (nameOf(child(node, 'id')) !== 'HTMLElementTagNameMap') continue;
    for (const member of nodes(child(node, 'body')?.body)) {
      const key = nameOf(child(member, 'key'));
      if (key) tags.add(key);
    }
  }
  return tags;
};

const entryText = (tag: string, className: string): string =>
  `\ndeclare global {\n  interface HTMLElementTagNameMap {\n    '${tag}': ${className};\n  }\n}\n`;

/** The components the file defines without a `HTMLElementTagNameMap` entry. */
export const missingElementTypeProblems = ({
  file,
  code,
}: {
  file: string;
  code: string;
}): Problem[] => {
  if (!TS_RE.test(file) || file.endsWith('.d.ts')) return [];
  if (!code.includes('customElement')) return [];
  let program: Node;
  try {
    program = parseModule(code, file);
  } catch {
    return [];
  }
  const definitions = [...walk(program)].flatMap((node) => [
    ...decorated(node),
    ...defined(node),
  ]);
  if (definitions.length === 0) return [];
  const mapped = mappedTags(program);
  return definitions
    .filter(({tag}) => !mapped.has(tag))
    .map(({tag, className, start, end}): Problem => ({
      rule: 'missing-element-type',
      start,
      end,
      message: `\`${tag}\` isn't in \`HTMLElementTagNameMap\`, so TypeScript and \`lit-devtools check\` don't know its type.`,
      ...(className
        ? {
            fix: {
              title: `Add '${tag}' to HTMLElementTagNameMap`,
              start: code.length,
              end: code.length,
              newText: entryText(tag, className),
            },
          }
        : {}),
    }));
};
