/**
 * The directives a module can call, by the name it calls them: imported
 * from a module whose name says `directive` (`lit/directives/live.js`, a
 * project's own `./directives/…`), or made with `directive(…)`. Each maps to
 * the name it was exported as, so `import {live as l}` is still `live`, and
 * the module it came from; a directive made in the file has neither.
 */

import {type Node, child, nodes, nodesOf} from '../component-docs/ast.js';
import {parseModule} from '../component-docs/parse.js';

export interface Directive {
  /** As exported: `live`. Empty for one made in the file. */
  name: string;
  /** The module imported from: `lit/directives/live.js`. */
  from: string;
}

const importedDirectives = (node: Node): [string, Directive][] => {
  if (node.type !== 'ImportDeclaration') return [];
  const from = child(node, 'source')?.value;
  if (typeof from !== 'string' || !/directive/i.test(from)) return [];
  return nodes(node.specifiers).flatMap((specifier): [string, Directive][] => {
    const local = child(specifier, 'local')?.name;
    const imported = child(specifier, 'imported')?.name ?? local;
    return typeof local === 'string'
      ? [[local, {name: String(imported), from}]]
      : [];
  });
};

const madeDirective = (node: Node): [string, Directive][] => {
  if (node.type !== 'VariableDeclarator') return [];
  const init = child(node, 'init');
  const id = child(node, 'id')?.name;
  return init?.type === 'CallExpression' &&
    child(init, 'callee')?.name === 'directive' &&
    typeof id === 'string'
    ? [[id, {name: '', from: ''}]]
    : [];
};

/** Each directive the module can call, by local name, to its exported name. */
export const directivesIn = (
  code: string,
  file: string
): Map<string, Directive> => {
  const names = new Map<string, Directive>();
  if (!code.includes('irective')) return names;
  let program: Node;
  try {
    program = parseModule(code, file);
  } catch {
    return names;
  }
  for (const node of nodesOf(program)) {
    for (const [local, name] of [
      ...importedDirectives(node),
      ...madeDirective(node),
    ])
      names.set(local, name);
  }
  return names;
};

const CALL_RE = /^\s*([A-Za-z_$][\w$]*)\s*\(/;

/** The name a binding's expression calls, when it is a call: `live(x)` gives `live`. */
export const calleeOf = (expression: string): string | undefined =>
  CALL_RE.exec(expression)?.[1];
