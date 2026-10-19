/**
 * A source location as the panel prints it, everywhere it prints one: the
 * package and version for a file under `node_modules` (see
 * `source-label.ts`), then the path, split at each `/` so a long one wraps at
 * a directory rather than mid-name. Views add {@link sourceTextStyles} to
 * their own.
 *
 * A class defined in a package is usually defined in a bundler's chunk
 * (`dist/chunks/chunk.7VGCIHDG.js`), which says nothing about the class. When
 * the package's own Custom Elements Manifest names the module that declares
 * it, that module and the class's name stand in for the chunk
 * ({@link manifestModuleOf}). The chunk's line belongs to the chunk, so it
 * goes; the full path and line stay in the tooltip, and a click still opens
 * them.
 */

import {css, html, nothing, type TemplateResult} from 'lit';
import type {ComponentDocs} from '../types/component-docs.js';
import {sourceLabel} from './source-label.js';

/** Where a package's manifest says one of its classes is declared. */
export interface ManifestModule {
  /** The package that ships the manifest. */
  package: string;
  /** The declaring module, as the manifest gives it. */
  path: string;
  className: string;
}

/**
 * The module a package's manifest names for the class `docs` describes;
 * `undefined` for the project's own docs, or ones read from source.
 */
export const manifestModuleOf = (
  docs: ComponentDocs | null
): ManifestModule | undefined => {
  const origin = docs?.origin;
  if (
    docs == null ||
    origin?.package === undefined ||
    origin.source === true ||
    origin.module === ''
  ) {
    return undefined;
  }
  return {
    package: origin.package,
    path: origin.module,
    className: docs.className,
  };
};

const segmentsOf = (text: string): TemplateResult[] =>
  text
    .split(/(?<=\/)/)
    .map((segment) => html`<span class="seg">${segment}</span>`);

/**
 * `file:line` as the panel prints it; for a file in the package `module`
 * comes from, the module and class it names instead.
 */
export const sourceText = (
  file: string,
  line: number,
  module?: ManifestModule
): TemplateResult => {
  const {pkg, path} = sourceLabel(file);
  const segments =
    pkg !== undefined && module?.package === pkg.name
      ? html`${segmentsOf(module.path)}
          <span class="class">(${module.className})</span>`
      : segmentsOf(`${path}:${line}`);
  if (pkg === undefined) return html`${segments}`;
  return html`<span class="pkg"
      >${pkg.name}${
        pkg.version === undefined
          ? nothing
          : html` <span class="ver">${pkg.version}</span>`
      }</span
    ><span class="sep"> › </span>${segments}`;
};

/**
 * The whole `file:line` when {@link sourceText} shortened it, so the full
 * path is still there to read on hover; `undefined` when nothing was cut.
 */
export const fullSourceTip = (
  file: string,
  line: number
): string | undefined => {
  const {pkg, path} = sourceLabel(file);
  return pkg === undefined && path === file ? undefined : `${file}:${line}`;
};

/** `tip`, followed by {@link fullSourceTip} when there is one. */
export const sourceTip = (tip: string, file: string, line: number): string => {
  const full = fullSourceTip(file, line);
  return full === undefined ? tip : `${tip}: ${full}`;
};

export const sourceTextStyles = css`
  .seg {
    display: inline-block;
    max-width: 100%;
  }
  .pkg {
    font-weight: 600;
  }
  .ver,
  .sep,
  .class {
    font-weight: normal;
    color: var(--lit-devtools-text-muted);
  }
`;
