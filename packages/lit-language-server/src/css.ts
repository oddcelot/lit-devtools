/**
 * CSS in `css` templates, answered by VS Code's CSS language service over
 * the script's CSS text (`src/lib/editor/css.ts`), whose positions are the
 * script's, so its answers pass through unchanged.
 */

import {getCSSLanguageService} from 'vscode-css-languageservice';
import {TextDocument} from 'vscode-languageserver-textdocument';
import type {
  CompletionItem,
  Diagnostic,
  Hover,
  Position,
} from 'vscode-languageserver/node';
import {type CssText, cssTextOf, inCss} from '../../../src/lib/editor/css.js';

const service = getCSSLanguageService();

interface Prepared {
  version: number;
  tags: string;
  css: CssText;
  document: TextDocument;
  stylesheet: ReturnType<typeof service.parseStylesheet>;
}

/** The CSS of each script, read again only when the script changes. */
const prepared = new Map<string, Prepared | undefined>();

const prepare = (
  script: TextDocument,
  tags: readonly string[]
): Prepared | undefined => {
  const key = tags.join(',');
  const cached = prepared.get(script.uri);
  if (cached?.version === script.version && cached.tags === key) return cached;
  const css = cssTextOf(script.getText(), tags);
  const document =
    css && TextDocument.create(script.uri, 'css', script.version, css.text);
  const entry =
    css && document
      ? {
          version: script.version,
          tags: key,
          css,
          document,
          stylesheet: service.parseStylesheet(document),
        }
      : undefined;
  prepared.set(script.uri, entry);
  return entry;
};

/** The CSS at `position`, or undefined when the position isn't CSS. */
const cssAt = (
  script: TextDocument,
  position: Position,
  tags: readonly string[]
): Prepared | undefined => {
  const entry = prepare(script, tags);
  return entry && inCss(entry.css, script.offsetAt(position))
    ? entry
    : undefined;
};

/** CSS completion at `position`; undefined when it isn't in a `css` template. */
export const cssCompletions = (
  script: TextDocument,
  position: Position,
  tags: readonly string[]
): CompletionItem[] | undefined => {
  const entry = cssAt(script, position, tags);
  return entry
    ? service.doComplete(entry.document, position, entry.stylesheet).items
    : undefined;
};

/** CSS hover at `position`; undefined when it isn't in a `css` template. */
export const cssHover = (
  script: TextDocument,
  position: Position,
  tags: readonly string[]
): Hover | null | undefined => {
  const entry = cssAt(script, position, tags);
  return entry
    ? service.doHover(entry.document, position, entry.stylesheet)
    : undefined;
};

/** The CSS problems of the script's templates, except on lines with a hole. */
export const cssDiagnostics = (
  script: TextDocument,
  tags: readonly string[]
): Diagnostic[] => {
  const entry = prepare(script, tags);
  if (!entry) return [];
  return service
    .doValidation(entry.document, entry.stylesheet)
    .filter(
      (diagnostic) =>
        !entry.css.holeLines.has(diagnostic.range.start.line) &&
        !entry.css.holeLines.has(diagnostic.range.end.line)
    );
};

/** Forgets a closed script's CSS. */
export const forgetCss = (uri: string): void => {
  prepared.delete(uri);
};
