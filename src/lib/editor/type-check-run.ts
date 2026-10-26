/**
 * Runs the binding type check (`type-check.ts`) over a package: writes the
 * shadow copies of its scripts under `node_modules/.cache/lit-check`, runs
 * the package's own `tsc` on them with a tsconfig extending the package's,
 * and maps what it reports back to the sources.
 *
 * The generated tsconfig lists the package's folder and the cache in
 * `rootDirs`, so a copy's relative imports resolve to the real modules next
 * to the source. Errors `tsc` reports in a source itself are left out of a
 * copy's, so only what the wrapping found is reported.
 */

import {spawn} from 'node:child_process';
import {realpathSync} from 'node:fs';
import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import process from 'node:process';
import {eventTypeOf} from './features.js';
import {kindOfFile} from './navigation.js';
import {suppressionsOf} from './suppressions.js';
import {
  PRELUDE,
  type Shadow,
  type TscDiagnostic,
  bindingMessage,
  parseTscOutput,
  shadowSource,
  toSource,
  wrapAt,
} from './type-check.js';
import type {Workspace} from './workspace.js';

export interface BindingTypeProblem {
  file: string;
  /** 1-based. */
  line: number;
  column: number;
  message: string;
}

export interface BindingTypeCheck {
  problems: BindingTypeProblem[];
  /** How many scripts had a binding to check. */
  checked: number;
  /** What `tsc` said that isn't about a file, such as a broken tsconfig. */
  notes: string[];
  /**
   * Custom elements bound to that `HTMLElementTagNameMap` doesn't have, so
   * their properties weren't checked.
   */
  unmapped: string[];
}

const CACHE = path.join('node_modules', '.cache', 'lit-check');

const SCRIPT_RE = /\.[cm]?[jt]sx?$/;

const offsetAt = (text: string, line: number, column: number): number => {
  let offset = 0;
  for (let i = 1; i < line; i++) offset = text.indexOf('\n', offset) + 1;
  return offset + column - 1;
};

const positionAt = (text: string, offset: number) => {
  const before = text.slice(0, offset).split('\n');
  return {line: before.length, column: before.at(-1)!.length + 1};
};

/** The `tsc` the package installs; TypeScript 5 and 7 both start from `bin/tsc`. */
const tscOf = (root: string): string => {
  const require = createRequire(path.join(root, 'package.json'));
  const manifest = require.resolve('typescript/package.json');
  const {bin} = require(manifest) as {bin: {tsc: string}};
  return path.resolve(path.dirname(manifest), bin.tsc);
};

const runTsc = (root: string, project: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [tscOf(root), '-p', project, '--pretty', 'false'],
      // tsc names files relative to the working directory it reads from
      // PWD, which a spawn otherwise leaves at the parent's.
      {cwd: root, env: {...process.env, PWD: root}}
    );
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk));
    child.on('error', reject);
    child.on('close', () => resolve(output));
  });

interface Copy {
  source: string;
  code: string;
  shadow: Shadow;
  /** Whether a `lit-ignore` comment silences a problem at an offset. */
  suppressed: (problem: {rule: 'binding-type'; start: number}) => boolean;
}

/** The package's scripts the workspace reads components and markup from. */
/**
 * The package's scripts: every one under its read folders, whether it
 * defines a component or only renders templates, and the components the
 * workspace read elsewhere in the package.
 */
const scriptsOf = async (
  workspace: Workspace,
  root: string
): Promise<string[]> => {
  const scan = workspace.configOf(path.join(root, 'package.json'))?.scan ?? [
    'src',
  ];
  const listed = await Promise.all(
    scan.map(async (folder) => {
      const dir = path.resolve(root, folder);
      const names = await readdir(dir, {recursive: true}).catch(() => []);
      return names.map((name) => path.join(dir, String(name)));
    })
  );
  const read = await workspace.markupFiles();
  return [
    ...new Set(
      [...listed.flat(), ...read].filter(
        (file) =>
          !path.relative(root, file).startsWith('..') &&
          SCRIPT_RE.test(file) &&
          !/\.d\.[cm]?ts$/.test(file) &&
          !file.includes(`${path.sep}node_modules${path.sep}`)
      )
    ),
  ];
};

/** The shadow copies of the scripts that have bindings. */
const shadowCopies = async (
  workspace: Workspace,
  scripts: string[]
): Promise<Copy[]> => {
  const copies: Copy[] = [];
  for (const source of scripts) {
    const code = await readFile(source, 'utf8');
    const kind = kindOfFile(source);
    const templateTags = workspace.configOf(source)?.templateTags;
    const shadow = await shadowSource(
      {file: source, code, kind, templateTags},
      (tag, name) => eventTypeOf(workspace, source, tag, name)
    );
    const suppressed = suppressionsOf(code, kind, templateTags);
    if (shadow) copies.push({source, code, shadow, suppressed});
  }
  return copies;
};

/** The file asking `tsc` which used tags `HTMLElementTagNameMap` has. */
const TAGS_FILE = 'lit-check-tags.ts';

/** The custom elements the copies bind to, in `TAGS_FILE`'s line order. */
const usedTags = (copies: Copy[]): string[] =>
  [
    ...new Set(
      copies.flatMap(({shadow}) =>
        shadow.wraps.map((wrap) => wrap.tag.toLowerCase())
      )
    ),
  ]
    .filter((tag) => tag.includes('-'))
    .sort();

/**
 * One line a tag, after `export {};`: an error on line 2 + n is tag n.
 * Exported, so `noUnusedLocals` has nothing to say about them.
 */
const tagsFileText = (tags: string[]): string =>
  [
    'export {};',
    ...tags.map(
      (tag, i) =>
        `export const _${i}: keyof HTMLElementTagNameMap = ${JSON.stringify(tag)};`
    ),
    '',
  ].join('\n');

const writeCopies = async (
  root: string,
  project: string,
  scripts: string[],
  copies: Copy[]
): Promise<string> => {
  const cache = path.join(root, CACHE);
  await rm(cache, {recursive: true, force: true});
  // `files` here drops the project's `include`, so the scripts are listed
  // too: their own errors are told apart from the copies', and every
  // `HTMLElementTagNameMap` entry is read.
  const files = [
    'lit-check.d.ts',
    TAGS_FILE,
    ...scripts.map((script) => path.relative(cache, script)),
  ];
  for (const {source, shadow} of copies) {
    const relative = path.relative(root, source);
    await mkdir(path.dirname(path.join(cache, relative)), {recursive: true});
    await writeFile(path.join(cache, relative), shadow.text);
    files.push(relative);
  }
  await writeFile(path.join(cache, 'lit-check.d.ts'), PRELUDE);
  await writeFile(path.join(cache, TAGS_FILE), tagsFileText(usedTags(copies)));
  const tsconfig = {
    extends: path.relative(cache, project),
    compilerOptions: {
      rootDirs: [path.relative(cache, root), '.'],
      noEmit: true,
      incremental: false,
      composite: false,
    },
    files,
  };
  const config = path.join(cache, 'tsconfig.json');
  await writeFile(config, JSON.stringify(tsconfig, null, 2));
  return config;
};

const keyOf = (file: string, offset: number, code: number) =>
  `${file}:${offset}:${code}`;

/** The binding problems in what `tsc` reported, at their place in the sources. */
const problemsIn = (
  root: string,
  copies: Copy[],
  diagnostics: TscDiagnostic[]
): BindingTypeProblem[] => {
  const cache = path.join(root, CACHE);
  const bySource = new Map(copies.map((copy) => [copy.source, copy]));
  const byCopy = new Map(
    copies.map((copy) => [
      path.join(cache, path.relative(root, copy.source)),
      copy,
    ])
  );
  const inSources = new Set<string>();
  for (const d of diagnostics) {
    const copy = bySource.get(path.resolve(root, d.file));
    if (!copy) continue;
    const offset = offsetAt(copy.code, d.line, d.column);
    inSources.add(keyOf(copy.source, offset, d.code));
  }
  const problems: BindingTypeProblem[] = [];
  for (const d of diagnostics) {
    const copy = byCopy.get(path.resolve(root, d.file));
    if (!copy) continue;
    const {shadow, source, code} = copy;
    const offset = toSource(
      shadow.insertions,
      offsetAt(shadow.text, d.line, d.column)
    );
    const wrap = wrapAt(shadow.wraps, offset);
    if (!wrap || inSources.has(keyOf(source, offset, d.code))) continue;
    if (copy.suppressed({rule: 'binding-type', start: wrap.start})) continue;
    problems.push({
      file: source,
      ...positionAt(code, offset),
      message: bindingMessage(wrap, d),
    });
  }
  return problems;
};

/**
 * Checks the bindings of the package at `root` with its own TypeScript.
 * `project` is its tsconfig, `tsconfig.json` by default.
 */
export const checkBindingTypes = async (
  workspace: Workspace,
  dir: string,
  project = path.join(dir, 'tsconfig.json')
): Promise<BindingTypeCheck> => {
  // The workspace names files by their real path (`/private/tmp` on macOS).
  const root = realpathSync(dir);
  const scripts = await scriptsOf(workspace, root);
  const copies = await shadowCopies(workspace, scripts);
  if (copies.length === 0) {
    return {problems: [], checked: 0, notes: [], unmapped: []};
  }
  const config = await writeCopies(root, project, scripts, copies);
  const output = await runTsc(root, config);
  const notes = output
    .split(/\r?\n/)
    .filter((line) => /^error TS\d+:/.test(line));
  const diagnostics = parseTscOutput(output);
  const tags = usedTags(copies);
  const tagsFile = path.join(root, CACHE, TAGS_FILE);
  return {
    problems: problemsIn(root, copies, diagnostics),
    checked: copies.length,
    notes,
    unmapped: diagnostics
      .filter((d) => path.resolve(root, d.file) === tagsFile)
      .map((d) => tags[d.line - 2]),
  };
};
