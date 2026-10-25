/**
 * Starts the Lit language server for HTML, JavaScript, TypeScript, JSX,
 * Astro and MDX files, with VS Code's own Node, and restarts it when its
 * path setting changes.
 */

import {readFileSync} from 'node:fs';
import {commands, workspace, type ExtensionContext} from 'vscode';
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from 'vscode-languageclient/node';
import {findServer} from './find-server.js';

const LANGUAGES = [
  'astro',
  'html',
  'javascript',
  'javascriptreact',
  'mdx',
  'typescript',
  'typescriptreact',
];

let client: LanguageClient | undefined;

const readText = (file: string): string | undefined => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

const start = async (context: ExtensionContext): Promise<void> => {
  const server = findServer({
    setting: workspace
      .getConfiguration('lit')
      .get<string | null>('server.path'),
    folders: (workspace.workspaceFolders ?? []).map(
      (folder) => folder.uri.fsPath
    ),
    bundled: context.asAbsolutePath('dist/server/bin.mjs'),
    readText,
  });
  const run = {module: server.path, transport: TransportKind.stdio};
  const serverOptions: ServerOptions = {run, debug: run};
  const clientOptions: LanguageClientOptions = {
    documentSelector: LANGUAGES.map((language) => ({scheme: 'file', language})),
  };
  client = new LanguageClient(
    'lit',
    'Lit Language Server',
    serverOptions,
    clientOptions
  );
  client.outputChannel.appendLine(
    `Starting the ${server.source} server: ${server.path}`
  );
  await client.start();
};

const stop = async (): Promise<void> => {
  const running = client;
  client = undefined;
  await running?.stop();
};

const restart = async (context: ExtensionContext): Promise<void> => {
  await stop();
  await start(context);
};

export const activate = async (context: ExtensionContext): Promise<void> => {
  context.subscriptions.push(
    commands.registerCommand('lit.restartServer', () => restart(context)),
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('lit.server.path')) void restart(context);
    })
  );
  await start(context);
};

export const deactivate = (): Promise<void> => stop();
