/**
 * Types and a helper for `lit-devtools.config.ts`, the language server's
 * settings in a project without a Vite config:
 *
 * ```ts
 * import {defineConfig} from '@oddsquad/lit-language-server';
 *
 * export default defineConfig({
 *   languageServer: {ignoreTags: ['legacy-*']},
 * });
 * ```
 */

import type {LitDevtoolsConfig} from '../../../src/lib/editor/config.js';

export type {
  DiagnosticRule,
  LanguageServerConfig,
  LitDevtoolsConfig,
  Severity,
} from '../../../src/lib/editor/config.js';

/** Returns `config` as given; only there for its types. */
export const defineConfig = (config: LitDevtoolsConfig): LitDevtoolsConfig =>
  config;
