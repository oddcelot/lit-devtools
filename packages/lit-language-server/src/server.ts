/**
 * The Lit language server: the protocol around the editor features in
 * `src/lib/editor`. It keeps one workspace per workspace root, read when a
 * file in it is first opened, feeds it every open buffer, and reads it again
 * when a config file changes.
 */

import htmlData from '@vscode/web-custom-data/data/browsers.html-data.json' with {type: 'json'};
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {TextDocument} from 'vscode-languageserver-textdocument';
import {
  type CompletionItem,
  type Connection,
  type Diagnostic,
  DiagnosticSeverity,
  DidChangeWatchedFilesNotification,
  type FileEvent,
  FileChangeType,
  type Hover as LspHover,
  MarkupKind,
  type Position,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from 'vscode-languageserver/node';
import {
  type Completion,
  type DocsSource,
  type FeatureRequest,
  completionsAt,
  hoverAt,
} from '../../../src/lib/editor/features.js';
import {
  type HtmlData,
  createHtmlDocs,
} from '../../../src/lib/editor/html-data.js';
import type {ConfigProblem} from '../../../src/lib/editor/load-config.js';
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

/**
 * Where a document's docs come from. In a template, standard elements and
 * what every element accepts come from HTML's data as well; an HTML file
 * leaves those to the editor's own HTML server, which would repeat them.
 */
const docsSourceFor = (workspace: Workspace, kind: DocumentKind): DocsSource =>
  kind === 'html'
    ? workspace
    : {
        get: async (file, tag) =>
          (await workspace.get(file, tag)) ?? html.get(tag),
        tags: async (file) => [
          ...new Set([...(await workspace.tags(file)), ...html.tags()]),
        ],
        globals: () => html.globals,
      };

/** What kind of markup document a file is, or undefined when it holds none. */
const kindOf = (document: TextDocument): DocumentKind | undefined => {
  if (document.languageId === 'html' || document.uri.endsWith('.html')) {
    return 'html';
  }
  return SCRIPT_RE.test(document.uri) ? 'script' : undefined;
};

const fileOf = (uri: string): string | undefined =>
  uri.startsWith('file:') ? fileURLToPath(uri) : undefined;

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

  /** What every feature takes, or undefined for a document without markup. */
  const requestFor = async (
    uri: string,
    position: Position
  ): Promise<
    | {document: TextDocument; source: DocsSource; request: FeatureRequest}
    | undefined
  > => {
    const document = documents.get(uri);
    const file = fileOf(uri);
    const kind = document && kindOf(document);
    if (!document || !file || !kind) return undefined;
    const workspace = await workspaceOf(file);
    if (!workspace) return undefined;
    const {templateTags} = workspace.configOf(file) ?? {};
    const offset = document.offsetAt(position);
    const code = document.getText();
    return {
      document,
      source: docsSourceFor(workspace, kind),
      request: {file, code, kind, offset, templateTags},
    };
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
          triggerCharacters: ['<', ' ', '.', '@', '?', '"', "'"],
        },
        hoverProvider: true,
      },
    };
  });

  documents.onDidChangeContent(async ({document}) => {
    const file = fileOf(document.uri);
    if (file) await (await workspaceOf(file))?.update(file, document.getText());
  });

  // A closed buffer's unsaved edits are gone; the file on disk counts again.
  documents.onDidClose(async ({document}) => {
    const file = fileOf(document.uri);
    if (file) await refreshFromDisk(await workspaceOf(file), file);
  });

  connection.onDidChangeWatchedFiles(async ({changes}) => {
    for (const change of changes) await onWatchedChange(change);
  });

  connection.onCompletion(async ({textDocument, position}) => {
    const found = await requestFor(textDocument.uri, position);
    if (!found) return [];
    const items = await completionsAt(found.source, found.request);
    return items.map((item) => toItem(found.document, item));
  });

  connection.onHover(
    async ({textDocument, position}): Promise<LspHover | null> => {
      const found = await requestFor(textDocument.uri, position);
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

  connection.onShutdown(async () => {
    for (const pending of workspaces.values()) await (await pending)?.close();
  });

  documents.listen(connection);
  connection.listen();
  return connection;
};
