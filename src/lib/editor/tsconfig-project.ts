/**
 * Which tsconfig checks a package's scripts. A solution-style
 * `tsconfig.json`, as Vite's templates write it, lists other configs under
 * `references` and holds no files itself (`"files": []`), so its compiler
 * options are TypeScript's defaults: `strict` off before TypeScript 7. The
 * check then uses the referenced config whose `include` covers the scripts,
 * `tsconfig.app.json` in a Vite project.
 */

import {existsSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';

interface RawConfig {
  files?: unknown;
  include?: unknown;
  references?: unknown;
}

/** JSON with comments and trailing commas, as tsconfigs are written. */
const parseJsonc = (text: string): unknown => {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const end = /"(?:[^"\\]|\\.)*"/y;
      end.lastIndex = i;
      const string = end.exec(text)?.[0] ?? char;
      out += string;
      i += string.length - 1;
    } else if (text.startsWith('//', i)) {
      const lineEnd = text.indexOf('\n', i);
      i = lineEnd === -1 ? text.length : lineEnd - 1;
    } else if (text.startsWith('/*', i)) {
      const close = text.indexOf('*/', i + 2);
      i = close === -1 ? text.length : close + 1;
    } else {
      out += char;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
};

const readConfig = (file: string): RawConfig | undefined => {
  try {
    return parseJsonc(readFileSync(file, 'utf8')) as RawConfig;
  } catch {
    return undefined;
  }
};

/** A reference's config: a file, or `tsconfig.json` in a folder. */
const referencedFile = (
  dir: string,
  reference: unknown
): string | undefined => {
  const target = (reference as {path?: unknown} | null)?.path;
  if (typeof target !== 'string') return undefined;
  const resolved = path.resolve(dir, target);
  const isDir = existsSync(resolved) && statSync(resolved).isDirectory();
  return isDir ? path.join(resolved, 'tsconfig.json') : resolved;
};

/** Whether a config's `include` reaches `file`; without one it reaches everything. */
const includes = (config: RawConfig, dir: string, file: string): boolean => {
  if (!Array.isArray(config.include)) return true;
  return config.include.some((pattern) => {
    if (typeof pattern !== 'string') return false;
    const fixed = pattern.split(/[*?{[]/)[0].replace(/\/$/, '');
    const base = path.resolve(dir, fixed);
    return file === base || file.startsWith(base + path.sep);
  });
};

/**
 * The tsconfig for checking `scripts` in a package: `tsconfig.json`, or the
 * config it references that includes the most of them when it only holds
 * references.
 */
export const projectFor = (
  root: string,
  scripts: readonly string[]
): string => {
  const main = path.join(root, 'tsconfig.json');
  const config = readConfig(main);
  const references = config?.references;
  const solution =
    Array.isArray(references) &&
    references.length > 0 &&
    Array.isArray(config?.files) &&
    config.files.length === 0 &&
    config.include === undefined;
  if (!solution) return main;
  let best = {file: main, count: 0};
  for (const reference of references) {
    const file = referencedFile(root, reference);
    const referenced = file && readConfig(file);
    if (!file || !referenced) continue;
    const dir = path.dirname(file);
    const count = scripts.filter((script) =>
      includes(referenced, dir, script)
    ).length;
    if (count > best.count) best = {file, count};
  }
  return best.file;
};
