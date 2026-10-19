/**
 * The project folder the user named for a site, for a dev server that can't
 * be asked where it is (`dev-server-editor.ts`): Vite opens a root-relative
 * path in whatever directory it was started in, and only an absolute path
 * the page names gives the root away. Kept per origin in `storage.local`,
 * like the site's manifests.
 */

import type {StorageAreaLike} from './registry.js';

/** The `storage.local` key holding each origin's project folder. */
const PROJECT_ROOTS_KEY = 'lit:project-roots';

/**
 * The value kept for an origin whose user said not to ask for its folder
 * again: opening works there, as it does wherever Vite runs in its root.
 */
const NOT_ASKED = false;

/** `folder` as the dev server names paths: slashes, no trailing one. */
export const normalizeFolder = (folder: string): string =>
  folder.trim().replace(/\\/g, '/').replace(/\/+$/, '');

const allRoots = async (
  storage: StorageAreaLike
): Promise<Record<string, unknown>> => {
  const all = (await storage.get(PROJECT_ROOTS_KEY))[PROJECT_ROOTS_KEY];
  return all !== null && typeof all === 'object'
    ? {...(all as Record<string, unknown>)}
    : {};
};

/**
 * The folder the user named for `origin`; `false` when they said not to be
 * asked; `undefined` when neither.
 */
export const readProjectRoot = async (
  storage: StorageAreaLike,
  origin: string
): Promise<string | false | undefined> => {
  const root = (await allRoots(storage))[origin];
  if (root === NOT_ASKED) return false;
  return typeof root === 'string' && root !== '' ? root : undefined;
};

/**
 * Keep `root` as `origin`'s project folder, or `false` to not ask for one
 * again; `undefined` forgets either.
 */
export const writeProjectRoot = async (
  storage: StorageAreaLike,
  origin: string,
  root: string | false | undefined
): Promise<void> => {
  const all = await allRoots(storage);
  if (root === undefined) delete all[origin];
  else all[origin] = root;
  await storage.set({[PROJECT_ROOTS_KEY]: all});
};
