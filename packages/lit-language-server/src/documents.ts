/**
 * What the server and the lint plugin read a document with: where its docs
 * come from and the problems in it, so both report the same things.
 */

import htmlData from '@vscode/web-custom-data/data/browsers.html-data.json' with {type: 'json'};
import {svgElementAttributes} from 'svg-element-attributes';
import type {TextDocument} from 'vscode-languageserver-textdocument';
import type {
  DocsSource,
  FeatureRequest,
} from '../../../src/lib/editor/features.js';
import {
  type HtmlData,
  createHtmlDocs,
} from '../../../src/lib/editor/html-data.js';
import {svgData} from '../../../src/lib/editor/svg-data.js';
import {bindingLiteralProblems} from '../../../src/lib/editor/binding-literals.js';
import {missingElementTypeProblems} from '../../../src/lib/editor/element-definitions.js';
import {
  type Problem,
  eventTypeProblems,
} from '../../../src/lib/editor/diagnostics.js';
import type {ResolvedLanguageServerConfig} from '../../../src/lib/editor/load-config.js';
import type {DocumentKind} from '../../../src/lib/editor/markup.js';
import type {Workspace} from '../../../src/lib/editor/workspace.js';
import {cssDiagnostics} from './css.js';

const html = createHtmlDocs(htmlData as HtmlData);
const svg = createHtmlDocs(svgData(svgElementAttributes));

/** An SVG element, unless HTML has one of the same name (`a`, `title`). */
const isSvg = (tag: string): boolean => !html.get(tag) && svg.get(tag) !== null;

/** SVG elements share SVG's core and presentation attributes, and the DOM events. */
const svgGlobals = {
  attributes: svg.globals.attributes,
  events: html.globals.events,
  label: 'attribute of every SVG element',
};

/**
 * Where a document's docs come from. In a Lit template, standard HTML and
 * SVG elements and what every element accepts come from their data as well;
 * HTML, JSX, Astro and MDX leave those to the editor's own support for the
 * language, which would repeat them.
 */
export const docsSourceFor = (
  workspace: Workspace,
  kind: DocumentKind
): DocsSource =>
  kind !== 'script'
    ? workspace
    : {
        get: async (file, tag) =>
          (await workspace.get(file, tag)) ?? html.get(tag) ?? svg.get(tag),
        tags: async (file) => [
          ...new Set([
            ...(await workspace.tags(file)),
            ...html.tags(),
            ...svg.tags(),
          ]),
        ],
        globals: (tag) => (isSvg(tag) ? svgGlobals : html.globals),
      };

/** The CSS template tags of a document; none in an HTML file. */
export const cssTagsFor = (
  kind: DocumentKind,
  config: ResolvedLanguageServerConfig | undefined
): readonly string[] =>
  kind === 'script' || kind === 'jsx'
    ? (config?.cssTemplateTags ?? ['css'])
    : [];

/** Every problem in a document, by rule, at offsets into its text. */
export const documentProblems = async (
  source: DocsSource,
  request: Omit<FeatureRequest, 'offset'>,
  document: TextDocument,
  cssTags: readonly string[]
): Promise<Problem[]> => [
  ...(await eventTypeProblems(source, request)),
  ...(await bindingLiteralProblems(source, request)),
  ...missingElementTypeProblems(request),
  ...cssDiagnostics(document, cssTags).map((diagnostic): Problem => ({
    rule: 'css',
    start: document.offsetAt(diagnostic.range.start),
    end: document.offsetAt(diagnostic.range.end),
    message:
      typeof diagnostic.message === 'string'
        ? diagnostic.message
        : diagnostic.message.value,
  })),
];
