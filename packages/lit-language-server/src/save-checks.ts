/**
 * The binding type check `lit-devtools check` makes, run for a script when
 * it's saved: its problems join the document's as `binding-type`, until the
 * document changes again. One check runs per package at a time; files saved
 * meanwhile are checked together once it ends. A package without
 * TypeScript, or with `checkOnSave: false` or the rule `off`, is skipped.
 */

import {realpathSync} from 'node:fs';
import type {Problem} from '../../../src/lib/editor/diagnostics.js';
import {checkBindingTypes} from '../../../src/lib/editor/type-check-run.js';
import type {Workspace} from '../../../src/lib/editor/workspace.js';

export interface SaveChecks {
  /** The problems the last check found in `file`. */
  problemsOf(file: string): Problem[];
  /** Forgets `file`'s problems: its text changed since the check. */
  clear(file: string): void;
  /** Checks `file`, then calls `done` with each file it has new problems for. */
  check(workspace: Workspace, file: string): Promise<void>;
}

const SCRIPT_RE = /\.[cm]?[jt]sx?$/;

export const createSaveChecks = (
  done: (files: string[]) => void
): SaveChecks => {
  const problems = new Map<string, Problem[]>();
  const running = new Map<string, Promise<void>>();
  const waiting = new Map<string, Set<string>>();

  const run = async (workspace: Workspace, dir: string, files: string[]) => {
    try {
      const result = await checkBindingTypes(workspace, dir, {
        only: files,
        cache: 'lit-check-server',
      });
      // The check names files by their real path, the editor maybe not.
      const asOpened = new Map(files.map((file) => [realpathSync(file), file]));
      for (const file of files) problems.set(file, []);
      for (const {file, start, end, message} of result.problems) {
        problems
          .get(asOpened.get(file) ?? file)
          ?.push({rule: 'binding-type', start, end, message});
      }
      done(files);
    } catch {
      // No TypeScript in the package, or a tsc that couldn't start: the
      // check is CI's then, through `lit-devtools check`.
    }
  };

  const schedule = (workspace: Workspace, dir: string): void => {
    const files = waiting.get(dir);
    if (!files?.size || running.has(dir)) return;
    waiting.delete(dir);
    const current = run(workspace, dir, [...files]).finally(() => {
      running.delete(dir);
      schedule(workspace, dir);
    });
    running.set(dir, current);
  };

  return {
    problemsOf: (file) => problems.get(file) ?? [],
    clear: (file) => void problems.delete(file),
    async check(workspace, file) {
      const config = workspace.configOf(file);
      if (!SCRIPT_RE.test(file) || !config?.checkOnSave) return;
      if (config.diagnostics['binding-type'] === 'off') return;
      const pkg = workspace.packageOf(file);
      if (!pkg) return;
      const files = waiting.get(pkg.dir) ?? new Set<string>();
      files.add(file);
      waiting.set(pkg.dir, files);
      schedule(workspace, pkg.dir);
      await running.get(pkg.dir);
    },
  };
};
