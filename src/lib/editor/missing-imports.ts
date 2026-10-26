/**
 * `missing-import`: a component used in a Lit template whose definition the
 * file doesn't import, directly or through the modules it imports. Without
 * the import the tag may never be defined when the template renders, or be
 * defined only because some other module happened to load first.
 *
 * A component read from source counts as imported when its module is in the
 * file's import graph; one from a package's manifest when the graph imports
 * that package. With the settings' `entries`, what they import counts too,
 * for an app whose entry loads every component. The quick fix imports the
 * defining module.
 */

import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {type Node, child, nodes, walk} from '../component-docs/ast.js';
import {parseModule} from '../component-docs/parse.js';
import type {Problem} from './diagnostics.js';
import type {DocsSource, FeatureRequest, ImportSource} from './features.js';
import {markupRegions, scanMarkup} from './markup.js';

type Request = Omit<FeatureRequest, 'offset'>;

/** How many modules one graph reads at most. */
const MAX_MODULES = 2000;

const IMPORT_NODES = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
]);

/** The string specifiers a module imports, statically or with `import('…')`. */
const specifiersOf = (code: string, file: string): string[] => {
  let program: Node;
  try {
    program = parseModule(code, file);
  } catch {
    return [];
  }
  return [...walk(program)].flatMap((node) => {
    if (!IMPORT_NODES.has(node.type)) return [];
    const value = child(node, 'source')?.value;
    return typeof value === 'string' ? [value] : [];
  });
};

/** A package's name from a bare specifier: `lit/decorators.js` is `lit`. */
const packageName = (specifier: string): string =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');

interface Graph {
  files: Set<string>;
  packages: Set<string>;
}

/** A module's text: the open file's buffer, else the file on disk. */
const codeOf = (
  file: string,
  open: {file: string; code: string}
): Promise<string | undefined> =>
  file === open.file
    ? Promise.resolve(open.code)
    : readFile(file, 'utf8').catch(() => undefined);

/** Adds a module's imports to the graph: files to visit, packages as reached. */
const follow = async (
  imports: ImportSource,
  graph: Graph,
  queue: string[],
  file: string,
  code: string
): Promise<void> => {
  for (const specifier of specifiersOf(code, file)) {
    const target = await imports.resolve(specifier, file);
    if (target && 'file' in target) {
      queue.push(target.file);
    } else if (target || !/^[./]/.test(specifier)) {
      // A bare specifier is the package's import even when it won't resolve.
      graph.packages.add(packageName(target?.external ?? specifier));
    }
  }
};

/** The modules and packages reachable from `starts`, the open file's text first. */
const graphFrom = async (
  imports: ImportSource,
  starts: string[],
  open: {file: string; code: string}
): Promise<Graph> => {
  const graph: Graph = {files: new Set(), packages: new Set()};
  const queue = [...starts];
  while (queue.length > 0 && graph.files.size < MAX_MODULES) {
    const file = queue.shift()!;
    if (graph.files.has(file)) continue;
    graph.files.add(file);
    const code = await codeOf(file, open);
    if (code !== undefined) await follow(imports, graph, queue, file, code);
  }
  return graph;
};

const has = (
  graph: Graph,
  definition: {file: string} | {package: string}
): boolean =>
  'file' in definition
    ? graph.files.has(definition.file)
    : graph.packages.has(definition.package);

/**
 * The extension the file's own relative imports use: `.js` for TypeScript's
 * usual style, the target's own for `.ts` imports, or none. `.js` when the
 * file has no relative import to go by.
 */
const extensionFor = (code: string, target: string): string => {
  const match = /from\s+['"]\.{1,2}\/[^'"]*?(\.[cm]?[jt]sx?)?['"]/.exec(code);
  if (!match) return '.js';
  const written = match[1] ?? '';
  if (written === '') return '';
  return /^\.[cm]?tsx?$/.test(written) ? path.extname(target) : '.js';
};

/** `import './x-button.js';`, written the way the file's own imports are. */
const importLine = (code: string, file: string, target: string): string => {
  let specifier = path.relative(path.dirname(file), target);
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  const stem = specifier.replace(/\.[cm]?[jt]sx?$/, '');
  return `import '${stem}${extensionFor(code, target)}';\n`;
};

/** The start of the line after the file's last top-level import, or its start. */
const importAt = (code: string, file: string): number => {
  let program: Node;
  try {
    program = parseModule(code, file);
  } catch {
    return 0;
  }
  const last = nodes(program.body)
    .filter((node) => node.type === 'ImportDeclaration')
    .at(-1);
  if (!last) return 0;
  const lineEnd = code.indexOf('\n', last.end);
  return lineEnd === -1 ? code.length : lineEnd + 1;
};

/** The first element of each component tag in the file's Lit templates. */
const usedTags = (request: Request) => {
  const first = new Map<string, {start: number; end: number}>();
  for (const region of markupRegions(request.code, request.kind, {
    templateTags: request.templateTags,
  })) {
    for (const element of scanMarkup(request.code, region)) {
      const tag = element.tag.toLowerCase();
      if (!tag.includes('-') || first.has(tag)) continue;
      first.set(tag, {start: element.start + 1, end: element.nameEnd});
    }
  }
  return first;
};

/** The components a file uses but doesn't import. */
export const missingImportProblems = async (
  source: DocsSource,
  request: Request
): Promise<Problem[]> => {
  const imports = source.imports;
  if (request.kind !== 'script' || !imports) return [];
  if (request.rulesOff?.includes('missing-import')) return [];
  const used = usedTags(request);
  if (used.size === 0) return [];
  const open = {file: request.file, code: request.code};
  const own = await graphFrom(imports, [request.file], open);
  let fromEntries: Graph | undefined;
  const problems: Problem[] = [];
  for (const [tag, at] of used) {
    const definition = await imports.definitionOf(request.file, tag);
    if (!definition || has(own, definition)) continue;
    fromEntries ??= await graphFrom(
      imports,
      imports.entries(request.file),
      open
    );
    if (has(fromEntries, definition)) continue;
    const where =
      'file' in definition
        ? `\`${path.basename(definition.file)}\``
        : `\`${definition.package}\``;
    problems.push({
      rule: 'missing-import',
      ...at,
      message: `\`<${tag}>\` is defined in ${where}, which this file doesn't import.`,
      ...('file' in definition
        ? {
            fix: {
              title: `Import ${path.basename(definition.file)}`,
              start: importAt(request.code, request.file),
              end: importAt(request.code, request.file),
              newText: importLine(request.code, request.file, definition.file),
            },
          }
        : {}),
    });
  }
  return problems;
};
