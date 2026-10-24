/**
 * Finds a project's Vite config file without loading Vite, to decide whether
 * Vite is needed at all.
 */

import {existsSync} from 'node:fs';
import {join} from 'node:path';

/** The config file names Vite looks for in the root, in its order. */
const VITE_CONFIG_FILES = [
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.ts',
  'vite.config.cjs',
  'vite.config.mts',
  'vite.config.cts',
];

/** The Vite config file in `root` that Vite would load, if there is one. */
export const findViteConfig = (root: string): string | undefined =>
  VITE_CONFIG_FILES.map((name) => join(root, name)).find((file) =>
    existsSync(file)
  );
