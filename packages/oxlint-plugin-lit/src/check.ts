/**
 * The problems in files read from disk, as the language server reports them
 * for open documents: what the plugin's worker answers with. It keeps one
 * workspace per workspace root, read when a file in it is first checked.
 */

import {pathToFileURL} from 'node:url';
import {TextDocument} from 'vscode-languageserver-textdocument';
import type {Problem} from '../../../src/lib/editor/diagnostics.js';
import {kindOfFile} from '../../../src/lib/editor/navigation.js';
import {findWorkspace} from '../../../src/lib/editor/workspace-packages.js';
import {
  type Workspace,
  createWorkspace,
} from '../../../src/lib/editor/workspace.js';
import {forgetCss} from '../../lit-language-server/src/css.js';
import {
  cssTagsFor,
  docsSourceFor,
  documentProblems,
} from '../../lit-language-server/src/documents.js';

export type {Problem};

export interface Checker {
  /** The problems in `file`, whose text is `code`; none outside a workspace. */
  check(file: string, code: string): Promise<Problem[]>;
  close(): Promise<void>;
}

export const createChecker = (): Checker => {
  const workspaces = new Map<string, Promise<Workspace | undefined>>();

  const workspaceOf = async (file: string): Promise<Workspace | undefined> => {
    const layout = await findWorkspace(file);
    if (!layout) return undefined;
    let workspace = workspaces.get(layout.root);
    if (!workspace) {
      workspace = createWorkspace(layout.root);
      workspaces.set(layout.root, workspace);
    }
    return workspace;
  };

  return {
    async check(file, code) {
      const workspace = await workspaceOf(file);
      if (!workspace) return [];
      const kind = kindOfFile(file);
      const config = workspace.configOf(file);
      const uri = pathToFileURL(file).href;
      const document = TextDocument.create(uri, '', 0, code);
      try {
        return await documentProblems(
          docsSourceFor(workspace, kind),
          {
            file,
            code,
            kind,
            templateTags: config?.templateTags,
            ignoreTags: config?.ignoreTags,
            ignoreAttributes: config?.ignoreAttributes,
          },
          document,
          cssTagsFor(kind, config)
        );
      } finally {
        forgetCss(uri);
      }
    },
    async close() {
      const all = await Promise.all(workspaces.values());
      workspaces.clear();
      await Promise.all(
        all.flatMap((workspace) => (workspace ? [workspace.close()] : []))
      );
    },
  };
};
