/**
 * The packages the Astro renderer needs from the project: optional peers of
 * the plugin, since a Vite-only user never installs them. Without them,
 * Astro would fail to resolve an import deep in the renderer with nothing
 * saying what to install, so `lit()` checks first.
 */

import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';

const SSR_PEERS = ['@lit-labs/ssr', '@lit-labs/ssr-client'] as const;

/** Whether `name` is in a `node_modules` of `dir` or of a directory above. */
const installedFrom = (
  dir: string,
  name: string,
  exists: (path: string) => boolean
): boolean => {
  for (let at = dir; ; at = dirname(at)) {
    if (exists(join(at, 'node_modules', name, 'package.json'))) return true;
    if (dirname(at) === at) return false;
  }
};

/** The peers Node would not find from the project's root. */
export const missingPeers = (
  root: string,
  exists: (path: string) => boolean = existsSync
): string[] => SSR_PEERS.filter((name) => !installedFrom(root, name, exists));

const PLUGIN = '@oddsquad/vite-plugin-lit';
const UMBRELLA = '@oddsquad/lit-devtools';

/**
 * How the project reaches the plugin, as a Vite dependency path such as
 * `@oddsquad/vite-plugin-lit > devframe/in-page-channel` starts: directly,
 * or through @oddsquad/lit-devtools, which installs it as its own dependency,
 * where pnpm keeps it out of the project's `node_modules`.
 */
export const pluginPath = (
  root: string,
  exists: (path: string) => boolean = existsSync
): string =>
  !installedFrom(root, PLUGIN, exists) && installedFrom(root, UMBRELLA, exists)
    ? `${UMBRELLA} > ${PLUGIN}`
    : PLUGIN;

export const missingPeersMessage = (missing: readonly string[]): string =>
  `lit() renders Lit components on the server, which needs ` +
  `${SSR_PEERS.join(' and ')}. Install ${missing.length === 1 ? 'the missing one' : 'them'}: ` +
  `npm install ${missing.join(' ')}. Or use litDevtools() to keep another ` +
  `Lit renderer.`;
