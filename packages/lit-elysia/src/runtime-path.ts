import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {normalizePath} from 'vite';

/**
 * The path of one of the package's own modules, for Vite to load: the
 * TypeScript source in the repo, the built `.mjs` once packed.
 */
export const runtime = (file: string): string => {
  const source = new URL(file, import.meta.url);
  const built = new URL(file.replace(/\.ts$/, '.mjs'), import.meta.url);
  return normalizePath(fileURLToPath(existsSync(source) ? source : built));
};
