/**
 * Loads a package's language server settings, in the order the user expects
 * to win: `litPlugin({languageServer})` in its Vite config, else
 * `languageServer` in its `lit-devtools.config.ts`, else defaults. The two
 * are never merged key by key; a config file that the Vite config overrides
 * is reported, so nobody wonders why their edits there do nothing.
 *
 * Vite is loaded only when the package has a Vite config. A mistake in the
 * settings is reported as a problem against its file, never thrown.
 */

import {existsSync, readFileSync} from 'node:fs';
import {basename, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {findViteConfig} from '../component-docs/vite-config.js';
import type {LitPluginOptions} from '../options.js';
import {
  DEFAULT_SEVERITIES,
  DIAGNOSTIC_RULES,
  type DiagnosticRule,
  type LanguageServerConfig,
  SEVERITIES,
  type Severity,
} from './config.js';

const CONFIG_FILES = [
  'lit-devtools.config.ts',
  'lit-devtools.config.mts',
  'lit-devtools.config.js',
  'lit-devtools.config.mjs',
  'lit-devtools.config.json',
];

const LIST_KEYS = [
  'scan',
  'manifests',
  'ignoreTags',
  'ignoreAttributes',
  'entries',
  'templateTags',
  'cssTemplateTags',
] as const;

export interface ConfigProblem {
  file: string;
  message: string;
}

export interface ResolvedLanguageServerConfig {
  scan: string[];
  manifests: string[];
  ignoreTags: string[];
  ignoreAttributes: string[];
  diagnostics: Record<DiagnosticRule, Severity>;
  entries: string[];
  templateTags: string[];
  cssTemplateTags: string[];
  /** Where the settings came from. */
  source: 'vite' | 'file' | 'default';
  file?: string;
  /** The package's Vite config, whose resolution then wins too. */
  viteConfigFile?: string;
  /** Every file whose change should reload these settings. */
  watched: string[];
  problems: ConfigProblem[];
}

export interface LoadConfigDeps {
  /** Reads `litPlugin()`'s options from a Vite config; loads Vite. */
  readViteOptions?: (
    root: string,
    configFile: string
  ) => Promise<LitPluginOptions | undefined>;
}

const defaultReadViteOptions = async (
  root: string,
  configFile: string
): Promise<LitPluginOptions | undefined> =>
  (await import('../component-docs/vite-resolver.js')).readLitPluginOptions(
    root,
    configFile
  );

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** A `lit-devtools.config.*` file's default export. */
const importConfigFile = async (file: string): Promise<unknown> => {
  if (file.endsWith('.json')) return JSON.parse(readFileSync(file, 'utf8'));
  // A query per load, so an edited file is imported again, not from cache.
  const url = `${pathToFileURL(file).href}?t=${Date.now()}`;
  return ((await import(url)) as {default?: unknown}).default;
};

/** The settings' mistakes, against `file`. */
const validate = (raw: unknown, file: string): ConfigProblem[] => {
  if (raw === undefined) return [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return [{file, message: '`languageServer` should be an object.'}];
  }
  const known = new Set<string>([...LIST_KEYS, 'diagnostics']);
  const problems: ConfigProblem[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!known.has(key)) {
      problems.push({file, message: `Unknown setting \`${key}\`.`});
    } else if (key === 'diagnostics') {
      problems.push(...validateDiagnostics(value, file));
    } else if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== 'string')
    ) {
      problems.push({file, message: `\`${key}\` should be a list of strings.`});
    }
  }
  return problems;
};

const validateDiagnostics = (value: unknown, file: string): ConfigProblem[] => {
  if (typeof value !== 'object' || value === null) {
    return [{file, message: '`diagnostics` should be an object.'}];
  }
  const rules = new Set<string>(DIAGNOSTIC_RULES);
  const severities = new Set<string>(SEVERITIES);
  return Object.entries(value).flatMap(([rule, severity]) => {
    if (!rules.has(rule)) {
      return [{file, message: `Unknown diagnostic \`${rule}\`.`}];
    }
    if (typeof severity !== 'string' || !severities.has(severity)) {
      const allowed = SEVERITIES.join(', ');
      return [{file, message: `\`${rule}\` should be one of ${allowed}.`}];
    }
    return [];
  });
};

type ListKey = (typeof LIST_KEYS)[number];

const LIST_DEFAULTS: Record<Exclude<ListKey, 'scan'>, string[]> = {
  manifests: [],
  ignoreTags: [],
  ignoreAttributes: [],
  entries: [],
  templateTags: ['html', 'svg'],
  cssTemplateTags: ['css'],
};

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** The default severities, with each valid one from `raw` over them. */
const severities = (
  raw: LanguageServerConfig['diagnostics']
): Record<DiagnosticRule, Severity> => {
  const diagnostics = {...DEFAULT_SEVERITIES};
  for (const [rule, severity] of Object.entries(raw ?? {})) {
    if (rule in diagnostics && SEVERITIES.includes(severity)) {
      diagnostics[rule as DiagnosticRule] = severity;
    }
  }
  return diagnostics;
};

/** The settings with every key filled, keeping only what validated. */
const resolve = (
  raw: LanguageServerConfig | undefined,
  manifestScan: string[] | undefined
): Pick<ResolvedLanguageServerConfig, ListKey | 'diagnostics'> => {
  const lists = Object.fromEntries(
    Object.entries(LIST_DEFAULTS).map(([key, fallback]) => {
      const value = raw?.[key as ListKey];
      return [key, isStringList(value) ? value : fallback];
    })
  ) as Record<Exclude<ListKey, 'scan'>, string[]>;
  const scan = isStringList(raw?.scan) ? raw.scan : manifestScan;
  return {
    ...lists,
    scan: scan ?? ['src'],
    diagnostics: severities(raw?.diagnostics),
  };
};

/** The `manifest` option's `scan`, when it names folders. */
const manifestScanOf = (
  options: LitPluginOptions | undefined
): string[] | undefined => {
  const manifest = options?.manifest;
  return typeof manifest === 'object' && Array.isArray(manifest.scan)
    ? manifest.scan
    : undefined;
};

interface Source {
  raw?: LanguageServerConfig;
  source: ResolvedLanguageServerConfig['source'];
  file?: string;
  problems: ConfigProblem[];
}

const fromConfigFile = async (file: string | undefined): Promise<Source> => {
  if (file === undefined) return {source: 'default', problems: []};
  try {
    const config = await importConfigFile(file);
    const raw = (config as {languageServer?: LanguageServerConfig} | undefined)
      ?.languageServer;
    return {raw, source: 'file', file, problems: validate(raw, file)};
  } catch (error) {
    const hint = file.endsWith('ts')
      ? ' Loading a .ts config needs Node 22.18 or later; a .js or .json one works on any.'
      : '';
    return {
      source: 'default',
      problems: [{file, message: `Couldn't load: ${message(error)}.${hint}`}],
    };
  }
};

/** The settings of the package in `dir`. */
export const loadLanguageServerConfig = async (
  dir: string,
  deps: LoadConfigDeps = {}
): Promise<ResolvedLanguageServerConfig> => {
  const viteConfigFile = findViteConfig(dir);
  const configFile = CONFIG_FILES.map((name) => join(dir, name)).find((file) =>
    existsSync(file)
  );
  const problems: ConfigProblem[] = [];
  let viteOptions: LitPluginOptions | undefined;
  if (viteConfigFile) {
    try {
      viteOptions = await (deps.readViteOptions ?? defaultReadViteOptions)(
        dir,
        viteConfigFile
      );
    } catch (error) {
      problems.push({
        file: viteConfigFile,
        message: `Couldn't load: ${message(error)}`,
      });
    }
  }
  const fromVite = viteOptions?.languageServer;
  let chosen: Source;
  if (viteConfigFile && fromVite !== undefined) {
    chosen = {
      raw: fromVite,
      source: 'vite',
      file: viteConfigFile,
      problems: validate(fromVite, viteConfigFile),
    };
    if (configFile) {
      problems.push({
        file: configFile,
        message: `Ignored: ${basename(viteConfigFile)} sets \`languageServer\`, which takes precedence.`,
      });
    }
  } else {
    chosen = await fromConfigFile(configFile);
  }
  return {
    ...resolve(chosen.raw, manifestScanOf(viteOptions)),
    source: chosen.source,
    ...(chosen.file ? {file: chosen.file} : {}),
    ...(viteConfigFile ? {viteConfigFile} : {}),
    watched: [viteConfigFile, configFile].filter(
      (file): file is string => file !== undefined
    ),
    problems: [...problems, ...chosen.problems],
  };
};
