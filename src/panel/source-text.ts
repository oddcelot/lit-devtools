/**
 * A source location as the panel prints it, everywhere it prints one: the
 * package and version for a file under `node_modules` (see
 * `source-label.ts`), then the path, split at each `/` so a long one wraps at
 * a directory rather than mid-name. Views add {@link sourceTextStyles} to
 * their own.
 */

import {css, html, nothing, type TemplateResult} from 'lit';
import {sourceLabel} from './source-label.js';

/** `file:line` as the panel prints it. */
export const sourceText = (file: string, line: number): TemplateResult => {
  const {pkg, path} = sourceLabel(file);
  const segments = `${path}:${line}`
    .split(/(?<=\/)/)
    .map((segment) => html`<span class="seg">${segment}</span>`);
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
  .sep {
    font-weight: normal;
    color: var(--lit-devtools-text-muted);
  }
`;
