/**
 * Vite's `normalizePath`, so the reader needs no Vite: forward slashes on
 * Windows, then POSIX normalization.
 */

import {posix} from 'node:path';

const isWindows = process.platform === 'win32';

export const normalizePath = (id: string): string =>
  posix.normalize(isWindows ? id.replaceAll('\\', '/') : id);
