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

/**
 * The module's program. Throws on a syntax error, as `parseAst` does, though
 * oxc recovers and could hand back what it read.
 */
export const parseModule = (code: string, file: string): Node => {
  const {program, errors} = parseSync(file, code, {
    sourceType: 'module',
    lang: langOf(file),
  });
  const error = errors.find((e) => e.severity === 'Error');
  if (error) throw new SyntaxError(error.message);
  return program as unknown as Node;
};
