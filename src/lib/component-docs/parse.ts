/**
 * Parses a module for the component-docs reader, with oxc's parser rather
 * than Vite's `parseAst`, so the reader runs where Vite isn't installed (the
 * language server in a project without it). Rolldown's `parseAst`, which Vite
 * re-exports, is built on the same parser and gives the same ESTree.
 */

import {parseSync} from 'oxc-parser';
import type {Node} from './ast.js';

/** The parser's language for a file, from its extension. */
export const langOf = (file: string): 'ts' | 'tsx' | 'js' | 'jsx' => {
  const ext = /\.([cm]?[jt]sx?)$/.exec(file)?.[1] ?? 'js';
  if (ext.endsWith('tsx')) return 'tsx';
  if (ext.endsWith('ts')) return 'ts';
  if (ext.endsWith('jsx')) return 'jsx';
  return 'js';
};

/** The last few parses, so the checks that read one file share its tree. */
const recent: {file: string; code: string; result: Node | SyntaxError}[] = [];
const RECENT = 4;

const parse = (code: string, file: string): Node | SyntaxError => {
  const {program, errors} = parseSync(file, code, {
    sourceType: 'module',
    lang: langOf(file),
  });
  const error = errors.find((e) => e.severity === 'Error');
  return error ? new SyntaxError(error.message) : (program as unknown as Node);
};

/**
 * The module's program. Throws on a syntax error, as `parseAst` does, though
 * oxc recovers and could hand back what it read. The same text parses once:
 * the editor's checks each read the file, and none changes the tree.
 */
export const parseModule = (code: string, file: string): Node => {
  let hit = recent.find((entry) => entry.file === file && entry.code === code);
  if (!hit) {
    hit = {file, code, result: parse(code, file)};
    recent.unshift(hit);
    recent.length = Math.min(recent.length, RECENT);
  }
  if (hit.result instanceof SyntaxError) throw hit.result;
  return hit.result;
};
