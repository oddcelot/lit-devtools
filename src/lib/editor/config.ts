/**
 * What the Lit language server can be told: where to read components, which
 * extra manifests to load, what to leave alone, and how loud each diagnostic
 * is. Set as `litPlugin({languageServer})` in a Vite config, or as
 * `languageServer` in a `lit-devtools.config.ts`; the Vite config wins.
 */

export const DIAGNOSTIC_RULES = [
  'unknown-element',
  'unknown-attribute',
  'unknown-binding',
  'invalid-value',
  'missing-import',
  'event-type',
  'css',
] as const;

export type DiagnosticRule = (typeof DIAGNOSTIC_RULES)[number];

export const SEVERITIES = ['error', 'warning', 'info', 'hint', 'off'] as const;

export type Severity = (typeof SEVERITIES)[number];

export interface LanguageServerConfig {
  /**
   * Folders to read components from, relative to the package. Defaults to
   * the `manifest` option's `scan`, else `src`.
   */
  scan?: string[];
  /** More manifests to read: paths relative to the package, or URLs. */
  manifests?: string[];
  /** Tags no diagnostic reports, with `*` wildcards: `['legacy-*']`. */
  ignoreTags?: string[];
  /**
   * Attributes accepted on any element, with `*` wildcards. `data-*`,
   * `aria-*` and the global HTML attributes always are.
   */
  ignoreAttributes?: string[];
  /** Each rule's severity, or `off`. */
  diagnostics?: Partial<Record<DiagnosticRule, Severity>>;
  /**
   * The modules pages start from, for `missing-import`: relative to the
   * package. A Vite config's inputs are used when there is one.
   */
  entries?: string[];
  /** Tags of the templates to read; `html` and `svg` by default. */
  templateTags?: string[];
  /** Tags of the CSS templates to read; `css` by default. */
  cssTemplateTags?: string[];
}

/** What a `lit-devtools.config.ts` exports by default. */
export interface LitDevtoolsConfig {
  languageServer?: LanguageServerConfig;
}

export const DEFAULT_SEVERITIES: Readonly<Record<DiagnosticRule, Severity>> = {
  'unknown-element': 'warning',
  'unknown-attribute': 'warning',
  'unknown-binding': 'warning',
  'invalid-value': 'warning',
  'missing-import': 'off',
  'event-type': 'error',
  css: 'warning',
};
