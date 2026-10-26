/**
 * `lit-devtools check` over the packages a folder holds: the package it's
 * in, or, from a monorepo's root, every package of the workspace, each
 * with its own settings and tsconfig. A package whose `binding-type` rule
 * is off is skipped; one with no bindings reports nothing.
 */

import {realpathSync} from 'node:fs';
import path from 'node:path';
import type {Severity} from './config.js';
import {type BindingTypeCheck, checkBindingTypes} from './type-check-run.js';
import {packageOf} from './workspace-packages.js';
import type {Workspace} from './workspace.js';

export interface PackageCheck {
  dir: string;
  severity: Severity;
  /** Absent when the rule is off in the package's settings. */
  result?: BindingTypeCheck;
}

/** The package folders a check from `dir` covers. */
const packagesToCheck = (workspace: Workspace, dir: string): string[] => {
  const real = realpathSync(dir);
  if (real === workspace.root && workspace.packages.length > 1) {
    return workspace.packages.map((pkg) => pkg.dir);
  }
  return [
    packageOf(workspace.packages, path.join(real, 'package.json'))?.dir ?? real,
  ];
};

/**
 * Checks each package `dir` covers, one after another. `project` names the
 * tsconfig when only one package is checked.
 */
export const checkPackages = async (
  workspace: Workspace,
  dir: string,
  project?: string
): Promise<PackageCheck[]> => {
  const dirs = packagesToCheck(workspace, dir);
  const checks: PackageCheck[] = [];
  for (const pkg of dirs) {
    const severity =
      workspace.configOf(path.join(pkg, 'package.json'))?.diagnostics[
        'binding-type'
      ] ?? 'error';
    if (severity === 'off') {
      checks.push({dir: pkg, severity});
      continue;
    }
    const options = project && dirs.length === 1 ? {project} : {};
    checks.push({
      dir: pkg,
      severity,
      result: await checkBindingTypes(workspace, pkg, options),
    });
  }
  return checks;
};
