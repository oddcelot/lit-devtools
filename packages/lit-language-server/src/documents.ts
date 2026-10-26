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
  ImportSource,
} from '../../../src/lib/editor/features.js';
import {packageOf} from '../../../src/lib/editor/workspace-packages.js';
import {resolve as resolvePath} from 'node:path';
import {
  type HtmlData,
  createHtmlDocs,
} from '../../../src/lib/editor/html-data.js';
import {svgData} from '../../../src/lib/editor/svg-data.js';
import {bindingLiteralProblems} from '../../../src/lib/editor/binding-literals.js';
import {elementDefinitionProblems} from '../../../src/lib/editor/element-definitions.js';
import {propertyDefinitionProblems} from '../../../src/lib/editor/property-definitions.js';
import {unknownNameProblems} from '../../../src/lib/editor/unknown-names.js';
import {templateSyntaxProblems} from '../../../src/lib/editor/template-syntax.js';
import {directiveBindingProblems} from '../../../src/lib/editor/directive-bindings.js';
import {missingImportProblems} from '../../../src/lib/editor/missing-imports.js';
import {suppressionsOf} from '../../../src/lib/editor/suppressions.js';
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

/**
 * The HTML global attributes every element has, SVG's included: `Element`'s
 * and `HTMLOrSVGElement`'s, and ARIA's `role`.
 */
const EVERY_ELEMENT = new Set([
  'autofocus',
  'class',
  'exportparts',
  'id',
  'inert',
  'lang',
  'nonce',
  'part',
  'popover',
  'role',
  'slot',
  'style',
  'tabindex',
]);

/**
 * SVG elements share SVG's core and presentation attributes, the HTML
 * attributes every element has, and the DOM events.
 */
const svgGlobals = {
  attributes: [
    ...svg.globals.attributes,
    ...html.globals.attributes.filter(
      (entry) =>
        EVERY_ELEMENT.has(entry.name) &&
        !svg.globals.attributes.some((own) => own.name === entry.name)
    ),
  ],
  events: html.globals.events,
  label: 'attribute of every SVG element',
};

/** Imports and definitions as the workspace resolves them. */
const importSourceFor = (workspace: Workspace): ImportSource => ({
  resolve: (specifier, importer) =>
    workspace.resolveImport(specifier, importer),
  async definitionOf(file, tag) {
    const declared = workspace.declarationsOf(tag)[0];
    if (declared) return {file: declared.file};
    const docs = await workspace.get(file, tag);
    return docs?.origin.package ? {package: docs.origin.package} : undefined;
  },
  entries(file) {
    const pkg = packageOf(workspace.packages, file);
    const entries = workspace.configOf(file)?.entries ?? [];
    return pkg ? entries.map((entry) => resolvePath(pkg.dir, entry)) : [];
  },
});

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
        imports: importSourceFor(workspace),
      };

/** The CSS template tags of a document; none in an HTML file. */
export const cssTagsFor = (
  kind: DocumentKind,
  config: ResolvedLanguageServerConfig | undefined
): readonly string[] =>
  kind === 'script' || kind === 'jsx'
    ? (config?.cssTemplateTags ?? ['css'])
    : [];

/**
 * Every problem in a document, by rule, at offsets into its text, but those
 * a `lit-ignore` comment silences.
 */
export const documentProblems = async (
  source: DocsSource,
  request: Omit<FeatureRequest, 'offset'>,
  document: TextDocument,
  cssTags: readonly string[]
): Promise<Problem[]> => {
  const suppressed = suppressionsOf(
    request.code,
    request.kind,
    request.templateTags
  );
  const all = await allProblems(source, request, document, cssTags);
  return all.filter((problem) => !suppressed(problem));
};

const allProblems = async (
  source: DocsSource,
  request: Omit<FeatureRequest, 'offset'>,
  document: TextDocument,
  cssTags: readonly string[]
): Promise<Problem[]> => [
  ...(await eventTypeProblems(source, request)),
  ...(await bindingLiteralProblems(source, request)),
  ...elementDefinitionProblems(request),
  ...propertyDefinitionProblems(request),
  ...(await unknownNameProblems(source, request)),
  ...templateSyntaxProblems(request),
  ...directiveBindingProblems(request),
  ...(await missingImportProblems(source, request)),
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
