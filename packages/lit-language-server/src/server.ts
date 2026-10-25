/**
 * The Lit language server: the protocol around the editor features in
 * `src/lib/editor`. It keeps one workspace per workspace root, read when a
 * file in it is first opened, feeds it every open buffer, and reads it again
 * when a config file changes.
 */

import htmlData from '@vscode/web-custom-data/data/browsers.html-data.json' with {type: 'json'};
import {svgElementAttributes} from 'svg-element-attributes';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {TextDocument} from 'vscode-languageserver-textdocument';
import {
  CodeActionKind,
  type CompletionItem,
  type Connection,
  type Diagnostic,
  DiagnosticSeverity,
  DidChangeWatchedFilesNotification,
  type FileEvent,
  FileChangeType,
  type Hover as LspHover,
  InlayHintKind,
  type Location,
  MarkupKind,
  type Position,
  ProposedFeatures,
  type Range,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from 'vscode-languageserver/node';
import {
  type Completion,
  type DocsSource,
  type FeatureRequest,
  completionsAt,
  handlerTypes,
  hoverAt,
} from '../../../src/lib/editor/features.js';
import {
  type HtmlData,
  createHtmlDocs,
} from '../../../src/lib/editor/html-data.js';
import {svgData} from '../../../src/lib/editor/svg-data.js';
import {
  type NavigationSource,
  type Span,
  implementationAt,
  kindOfFile,
  referencesAt,
} from '../../../src/lib/editor/navigation.js';
import {cssDocCompletions} from '../../../src/lib/editor/css.js';
import {eventTypeProblems} from '../../../src/lib/editor/diagnostics.js';
import {cssCompletions, cssDiagnostics, cssHover, forgetCss} from './css.js';
import type {ConfigProblem} from '../../../src/lib/editor/load-config.js';
import type {Severity} from '../../../src/lib/editor/config.js';
import type {DocumentKind} from '../../../src/lib/editor/markup.js';
import {findWorkspace} from '../../../src/lib/editor/workspace-packages.js';
import {
  type Workspace,
  createWorkspace,
} from '../../../src/lib/editor/workspace.js';

const SCRIPT_RE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

const CONFIG_RE =
  /(?:^|\/)(?:lit-devtools\.config\.(?:[cm]?[jt]s|json)|vite\.config\.[cm]?[jt]s|package\.json|pnpm-workspace\.yaml)$/;

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
const docsSourceFor = (workspace: Workspace, kind: DocumentKind): DocsSource =>
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

const LANGUAGE_KINDS: Record<string, DocumentKind> = {
  html: 'html',
  astro: 'astro',
  mdx: 'mdx',
  javascriptreact: 'jsx',
  typescriptreact: 'jsx',
};

/** What kind of markup document a file is, or undefined when it holds none. */
const kindOf = (document: TextDocument): DocumentKind | undefined => {
  const byLanguage = LANGUAGE_KINDS[document.languageId];
  if (byLanguage) return byLanguage;
  if (
    /\.(?:html|astro|mdx)$/.test(document.uri) ||
    SCRIPT_RE.test(document.uri)
  )
    return kindOfFile(document.uri);
  return undefined;
};

const fileOf = (uri: string): string | undefined =>
  uri.startsWith('file:') ? fileURLToPath(uri) : undefined;

const SEVERITY: Record<Exclude<Severity, 'off'>, DiagnosticSeverity> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info: DiagnosticSeverity.Information,
  hint: DiagnosticSeverity.Hint,
};

/** Settings problems as diagnostics on the first line of their file. */
const diagnosticsOf = (messages: string[]): Diagnostic[] =>
  messages.map((message) => ({
    range: {start: {line: 0, character: 0}, end: {line: 0, character: 0}},
    severity: DiagnosticSeverity.Warning,
    source: 'lit',
    message,
  }));

const byFile = (problems: ConfigProblem[]): Map<string, string[]> => {
  const grouped = new Map<string, string[]>();
  for (const {file, message} of problems) {
    grouped.set(file, [...(grouped.get(file) ?? []), message]);
  }
  return grouped;
};

const toItem = (document: TextDocument, item: Completion): CompletionItem => ({
  label: item.label,
  kind: item.kind as CompletionItem['kind'],
  ...(item.detail ? {detail: item.detail} : {}),
  ...(item.documentation
    ? {documentation: {kind: MarkupKind.Markdown, value: item.documentation}}
    : {}),
  ...(item.deprecated ? {tags: [1]} : {}),
  ...(item.sortText ? {sortText: item.sortText} : {}),
  textEdit: {
    range: {
      start: document.positionAt(item.start),
      end: document.positionAt(item.end),
    },
    newText: item.newText,
  },
});

/** Reads `file` from disk into `workspace`, or forgets it when it's gone. */
const refreshFromDisk = async (
  workspace: Workspace | undefined,
  file: string
): Promise<void> => {
  const code = await readFile(file, 'utf8').catch(() => undefined);
  if (code === undefined) workspace?.remove(file);
  else await workspace?.update(file, code);
};

export interface ServerStreams {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

/** Starts the server on `streams`, or on stdio (`--stdio`) without them. */
export const startServer = (streams?: ServerStreams): Connection => {
  const connection = streams
    ? createConnection(ProposedFeatures.all, streams.input, streams.output)
    : createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);
  /** Workspaces by root, read on first use. */
  const workspaces = new Map<string, Promise<Workspace | undefined>>();
  /** Config files that have problems published on them. */
  let problemFiles = new Set<string>();

  const publishProblems = async (): Promise<void> => {
    const ready = await Promise.all(workspaces.values());
    const problems = byFile(ready.flatMap((w) => w?.problems() ?? []));
    for (const file of new Set([...problemFiles, ...problems.keys()])) {
      void connection.sendDiagnostics({
        uri: pathToFileURL(file).href,
        diagnostics: diagnosticsOf(problems.get(file) ?? []),
      });
    }
    problemFiles = new Set(problems.keys());
  };

  /** Open buffers are newer than the files a workspace's first read saw. */
  const catchUp = async (workspace: Workspace | undefined): Promise<void> => {
    for (const document of documents.all()) {
      const file = fileOf(document.uri);
      if (file) await workspace?.update(file, document.getText());
    }
    await publishProblems();
    scheduleDiagnostics();
  };

  /** The workspace `file` belongs to, read on first use. */
  const workspaceOf = async (file: string): Promise<Workspace | undefined> => {
    const layout = await findWorkspace(file);
    if (!layout) return undefined;
    let workspace = workspaces.get(layout.root);
    if (!workspace) {
      workspace = createWorkspace(layout.root);
      workspaces.set(layout.root, workspace);
      void workspace.then(catchUp);
    }
    return workspace;
  };

  /** Drops every workspace a changed config file belongs to, to read it again. */
  const reload = async (file: string): Promise<void> => {
    for (const [root, pending] of workspaces) {
      const workspace = await pending;
      if (file.startsWith(`${root}/`) || workspace?.watched().includes(file)) {
        workspaces.delete(root);
        await workspace?.close();
      }
    }
    await publishProblems();
  };

  const onWatchedChange = async (change: FileEvent): Promise<void> => {
    const file = fileOf(change.uri);
    if (!file) return;
    if (CONFIG_RE.test(file)) return reload(file);
    // An open buffer is newer than the file.
    if (documents.get(change.uri)) return;
    const workspace = await workspaceOf(file);
    if (change.type === FileChangeType.Deleted) workspace?.remove(file);
    else await refreshFromDisk(workspace, file);
  };

  /** A document's request, without a cursor; undefined without markup. */
  const documentRequest = async (
    uri: string
  ): Promise<
    | {
        document: TextDocument;
        workspace: Workspace;
        source: DocsSource;
        request: Omit<FeatureRequest, 'offset'>;
        /** The CSS template tags; none in an HTML file. */
        cssTags: readonly string[];
      }
    | undefined
  > => {
    const document = documents.get(uri);
    const file = fileOf(uri);
    const kind = document && kindOf(document);
    if (!document || !file || !kind) return undefined;
    const workspace = await workspaceOf(file);
    if (!workspace) return undefined;
    const {templateTags, cssTemplateTags} = workspace.configOf(file) ?? {};
    return {
      document,
      workspace,
      source: docsSourceFor(workspace, kind),
      request: {file, code: document.getText(), kind, templateTags},
      cssTags:
        kind === 'script' || kind === 'jsx' ? (cssTemplateTags ?? ['css']) : [],
    };
  };

  /** What every feature takes, or undefined for a document without markup. */
  const requestFor = async (
    uri: string,
    position: Position
  ): Promise<
    | {
        document: TextDocument;
        workspace: Workspace;
        source: DocsSource;
        request: FeatureRequest;
        cssTags: readonly string[];
      }
    | undefined
  > => {
    const found = await documentRequest(uri);
    if (!found) return undefined;
    const offset = found.document.offsetAt(position);
    return {...found, request: {...found.request, offset}};
  };

  /** A file's text: its open buffer, else the file on disk. */
  const readText = (file: string): Promise<string | undefined> => {
    const open = documents.get(pathToFileURL(file).href);
    return open
      ? Promise.resolve(open.getText())
      : readFile(file, 'utf8').catch(() => undefined);
  };

  const navigationFor = (workspace: Workspace): NavigationSource => ({
    get: (file, tag) => workspace.get(file, tag),
    declarationsOf: (tag) => workspace.declarationsOf(tag),
    async files() {
      const open = documents
        .all()
        .flatMap((document) => fileOf(document.uri) ?? []);
      return [...new Set([...(await workspace.markupFiles()), ...open])];
    },
    readText,
    templateTagsOf: (file) => workspace.configOf(file)?.templateTags,
  });

  /** Spans as locations, each file's offsets read against its text. */
  const locationsOf = async (spans: Span[]): Promise<Location[]> => {
    const texts = new Map<string, TextDocument>();
    const locations: Location[] = [];
    for (const span of spans) {
      const uri = pathToFileURL(span.file).href;
      let document = documents.get(uri) ?? texts.get(span.file);
      if (!document) {
        const code = await readText(span.file);
        if (code === undefined) continue;
        document = TextDocument.create(uri, '', 0, code);
        texts.set(span.file, document);
      }
      locations.push({
        uri,
        range: {
          start: document.positionAt(span.start),
          end: document.positionAt(span.end),
        },
      });
    }
    return locations;
  };

  /** Where the name under the cursor is declared, for definition and implementation alike. */
  const implementationOf = async (
    uri: string,
    position: Position
  ): Promise<Location[]> => {
    const found = await requestFor(uri, position);
    if (!found) return [];
    const source = navigationFor(found.workspace);
    return locationsOf(await implementationAt(source, found.request));
  };

  /** The untyped inline handlers whose parameter falls in `range`. */
  const handlersIn = async (uri: string, range: Range) => {
    const found = await documentRequest(uri);
    if (!found) return undefined;
    const from = found.document.offsetAt(range.start);
    const to = found.document.offsetAt(range.end);
    const all = await handlerTypes(found.source, found.request);
    const within = all.filter(
      ({handler}) => handler.param.end >= from && handler.param.start <= to
    );
    return {document: found.document, within};
  };

  /** Publishes a document's problems, each at its rule's severity. */
  const publishDocument = async (uri: string): Promise<void> => {
    const found = await documentRequest(uri);
    if (!found) return;
    const {document, workspace, source, request} = found;
    const severities = workspace.configOf(request.file)?.diagnostics;
    const problems = await eventTypeProblems(source, request);
    const diagnostics = problems.flatMap((problem): Diagnostic[] => {
      const severity = severities?.[problem.rule] ?? 'error';
      if (severity === 'off') return [];
      return [
        {
          range: {
            start: document.positionAt(problem.start),
            end: document.positionAt(problem.end),
          },
          severity: SEVERITY[severity],
          source: 'lit',
          code: problem.rule,
          message: problem.message,
        },
      ];
    });
    const cssSeverity = severities?.css ?? 'warning';
    const css =
      cssSeverity === 'off'
        ? []
        : cssDiagnostics(document, found.cssTags).map((diagnostic) => ({
            ...diagnostic,
            severity: SEVERITY[cssSeverity],
            source: 'lit',
            code: 'css',
          }));
    void connection.sendDiagnostics({
      uri,
      diagnostics: [...diagnostics, ...css],
    });
  };

  /**
   * Publishes every open document's problems once changes settle: an edit
   * in one file can change what another's handlers should take.
   */
  let diagnosticsTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleDiagnostics = (): void => {
    clearTimeout(diagnosticsTimer);
    diagnosticsTimer = setTimeout(() => {
      for (const document of documents.all())
        void publishDocument(document.uri);
    }, 200);
  };

  connection.onInitialize((params) => {
    const watches =
      params.capabilities.workspace?.didChangeWatchedFiles
        ?.dynamicRegistration === true;
    connection.onInitialized(() => {
      if (!watches) return;
      void connection.client.register(DidChangeWatchedFilesNotification.type, {
        watchers: [
          {globPattern: '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'},
          {
            globPattern:
              '**/{lit-devtools.config.*,vite.config.*,package.json,pnpm-workspace.yaml}',
          },
        ],
      });
    });
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          triggerCharacters: ['<', ' ', '.', '@', '?', '"', "'", ':', '(', '-'],
        },
        hoverProvider: true,
        definitionProvider: true,
        implementationProvider: true,
        referencesProvider: true,
        codeActionProvider: {codeActionKinds: [CodeActionKind.QuickFix]},
        inlayHintProvider: true,
      },
    };
  });

  documents.onDidChangeContent(async ({document}) => {
    const file = fileOf(document.uri);
    if (file) await (await workspaceOf(file))?.update(file, document.getText());
    scheduleDiagnostics();
  });

  // A closed buffer's unsaved edits are gone; the file on disk counts again.
  documents.onDidClose(async ({document}) => {
    void connection.sendDiagnostics({uri: document.uri, diagnostics: []});
    forgetCss(document.uri);
    const file = fileOf(document.uri);
    if (file) await refreshFromDisk(await workspaceOf(file), file);
    scheduleDiagnostics();
  });

  connection.onDidChangeWatchedFiles(async ({changes}) => {
    for (const change of changes) await onWatchedChange(change);
    scheduleDiagnostics();
  });

  connection.onCompletion(async ({textDocument, position}) => {
    const found = await requestFor(textDocument.uri, position);
    if (!found) return [];
    const {document, source, request} = found;
    const css = cssCompletions(document, position, found.cssTags);
    if (css) {
      // The components' documented custom properties and parts first.
      const {file, code, offset} = request;
      const documented = await cssDocCompletions(source, file, code, offset);
      return [...documented.map((item) => toItem(document, item)), ...css];
    }
    const items = await completionsAt(source, request);
    return items.map((item) => toItem(document, item));
  });

  connection.onHover(
    async ({textDocument, position}): Promise<LspHover | null> => {
      const found = await requestFor(textDocument.uri, position);
      const css = found && cssHover(found.document, position, found.cssTags);
      if (css !== undefined) return css;
      const hover = found && (await hoverAt(found.source, found.request));
      if (!found || !hover) return null;
      return {
        contents: {kind: MarkupKind.Markdown, value: hover.markdown},
        range: {
          start: found.document.positionAt(hover.start),
          end: found.document.positionAt(hover.end),
        },
      };
    }
  );

  connection.onDefinition(({textDocument, position}) =>
    implementationOf(textDocument.uri, position)
  );

  connection.onImplementation(({textDocument, position}) =>
    implementationOf(textDocument.uri, position)
  );

  connection.onReferences(async ({textDocument, position, context}) => {
    const found = await requestFor(textDocument.uri, position);
    if (!found) return [];
    const source = navigationFor(found.workspace);
    const spans = await referencesAt(
      source,
      found.request,
      context.includeDeclaration
    );
    return locationsOf(spans);
  });

  // Writes an inline handler's event type in, so TypeScript can take over.
  connection.onCodeAction(async ({textDocument, range}) => {
    const found = await handlersIn(textDocument.uri, range);
    return (found?.within ?? []).map(({type, edit}) => ({
      title: `Add event type ${type}`,
      kind: CodeActionKind.QuickFix,
      edit: {
        changes: {
          [textDocument.uri]: [
            {
              range: {
                start: found!.document.positionAt(edit.start),
                end: found!.document.positionAt(edit.end),
              },
              newText: edit.newText,
            },
          ],
        },
      },
    }));
  });

  // Shows an untyped inline handler's event type after its parameter.
  connection.languages.inlayHint.on(async ({textDocument, range}) => {
    const found = await handlersIn(textDocument.uri, range);
    return (found?.within ?? []).map(({handler, type}) => ({
      position: found!.document.positionAt(handler.param.end),
      label: `: ${type}`,
      kind: InlayHintKind.Type,
    }));
  });

  connection.onShutdown(async () => {
    clearTimeout(diagnosticsTimer);
    for (const pending of workspaces.values()) await (await pending)?.close();
  });

  documents.listen(connection);
  connection.listen();
  return connection;
};
