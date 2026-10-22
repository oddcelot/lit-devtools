/**
 * The generated half of each kitchen-sink section: a grid of an element's
 * variants and a table of its attributes, both built from its documented
 * API (served by docs-plugin.ts; {@link loadDocs} fetches it). A new attribute value
 * shows up here without editing the page; the section's `variants` option
 * only picks which attributes are worth a grid.
 */
import {html, nothing, type TemplateResult} from 'lit';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import type {
  ComponentDocs,
  DocEntry,
} from '../../../src/types/component-docs.js';

let docs: Record<string, ComponentDocs> = {};

/** Fetches every element's API from the dev server; call before rendering. */
export const loadDocs = async () => {
  // DOCS_PATH in docs-plugin.ts, which runs in Node and can't be imported.
  const res = await fetch('/__kitchen-sink/docs.json');
  docs = (await res.json()) as Record<string, ComponentDocs>;
};

export interface Variants {
  /** Attributes to vary, each over its type's values. Default: variant, appearance, size. */
  attributes?: string[];
  /** Boolean attributes, each shown set on its own. */
  booleans?: string[];
  /** Attributes every instance carries, such as an icon button's `icon`. */
  fixed?: Record<string, string>;
  /** Markup inside each instance. Default: the element's name. */
  content?: string;
}

/** Web Awesome's long size names, kept for compatibility: the short ones suffice. */
const SYNONYMS = new Set(['small', 'medium', 'large']);

/** `'a' | 'b'` → `['a', 'b']`; anything else → `[]`. */
const unionValues = (type: string | undefined): string[] => {
  const parts = (type ?? '')
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  return parts.length > 1 && parts.every((p) => /^'[^']*'$/.test(p))
    ? parts.map((p) => p.slice(1, -1)).filter((v) => !SYNONYMS.has(v))
    : [];
};

/** Web Awesome's own bookkeeping, not part of an element's API. */
const INTERNAL = new Set(['did-ssr']);

const attributes = (tag: string): DocEntry[] =>
  (docs[tag]?.attributes ?? []).filter((a) => !INTERNAL.has(a.name));

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const instance = (
  tag: string,
  options: Variants,
  set: Record<string, string | true>
) => {
  const all = {...options.fixed, ...set};
  const attrs = Object.entries(all)
    .map(([k, v]) => (v === true ? k : `${k}="${escape(v)}"`))
    .join(' ');
  const content =
    options.content ??
    tag.replace(/^lit-/, '').replace(/^./, (c) => c.toUpperCase());
  return unsafeHTML(`<${tag} ${attrs}>${content}</${tag}>`);
};

interface Union {
  name: string;
  values: string[];
}

/** The wanted attributes that have a list of values to show. */
const unionsOf = (tag: string, wanted: string[]): Union[] =>
  wanted
    .map((name) => ({
      name,
      values: unionValues(attributes(tag).find((a) => a.name === name)?.type),
    }))
    .filter((u) => u.values.length > 0);

/** Variant down the side, the next attribute across. */
const matrix = (tag: string, options: Variants, rows: Union, cols: Union) =>
  html`<div
    class="matrix"
    style="grid-template-columns: auto repeat(${cols.values.length}, auto)"
  >
    <span class="label">${rows.name} × ${cols.name}</span>
    ${cols.values.map((c) => html`<span class="label">${c}</span>`)}
    ${rows.values.map(
      (r) =>
        html`<span class="label">${r}</span>${cols.values.map((c) =>
            instance(tag, options, {[rows.name]: r, [cols.name]: c})
          )}`
    )}
  </div>`;

/** One labelled row: an instance per setting, each captioned. */
const row = (
  tag: string,
  options: Variants,
  label: string,
  settings: [caption: string, set: Record<string, string | true>][]
) =>
  html`<div class="row">
    <span class="label">${label}</span>
    ${settings.map(
      ([caption, set]) =>
        html`<span class="cell"
          >${instance(tag, options, set)}<code>${caption}</code></span
        >`
    )}
  </div>`;

/** The variant grid, rendered once per scheme half. */
export const renderVariants = (tag: string, options: Variants) => {
  const unions = unionsOf(
    tag,
    options.attributes ?? ['variant', 'appearance', 'size']
  );
  const [first, second] = unions;
  const paired = first?.name === 'variant' && second !== undefined;
  const singles = paired ? unions.slice(2) : unions;
  const booleans = options.booleans ?? [];
  return html`${paired ? matrix(tag, options, first, second) : nothing}
  ${singles.map((u) =>
    row(
      tag,
      options,
      u.name,
      u.values.map((v) => [v, {[u.name]: v}])
    )
  )}
  ${
    booleans.length === 0
      ? nothing
      : row(
          tag,
          options,
          'booleans',
          booleans.map((b) => [b, {[b]: true}])
        )
  }`;
};

const camel = (name: string) =>
  name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

/** A property value as the table shows it. */
const shown = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return `'${value}'`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value as number | boolean);
};

/** The live default: what a fresh instance holds, design-system defaults included. */
const liveDefault = (tag: string, attr: DocEntry): string => {
  const el = document.createElement(tag) as unknown as Record<string, unknown>;
  return shown(el[attr.counterpart ?? camel(attr.name)]);
};

/** Whether the package set a default other than Web Awesome's. */
const isChanged = (attr: DocEntry, live: string) =>
  attr.inheritedFrom !== undefined &&
  attr.default !== undefined &&
  live !== attr.default;

const apiRow = (tag: string, a: DocEntry) => {
  const live = liveDefault(tag, a);
  return html`<tr>
    <td><code>${a.name}</code></td>
    <td><code>${a.type ?? ''}</code></td>
    <td class=${isChanged(a, live) ? 'changed' : ''}><code>${live}</code></td>
    <td>${a.inheritedFrom ?? 'own'}</td>
    <td>${a.description?.split(/(?<=\.)\s/)[0] ?? ''}</td>
  </tr>`;
};

/** A table of the element's attributes, under both halves. */
export const renderApi = (tag: string): TemplateResult | typeof nothing => {
  const attrs = attributes(tag);
  if (attrs.length === 0) return nothing;
  return html`<details class="api">
    <summary>${attrs.length} attributes · ${docs[tag]?.className}</summary>
    <table>
      <thead>
        <tr>
          <th>attribute</th>
          <th>type</th>
          <th>default</th>
          <th>from</th>
          <th>description</th>
        </tr>
      </thead>
      <tbody>
        ${attrs.map((a) => apiRow(tag, a))}
      </tbody>
    </table>
  </details>`;
};
