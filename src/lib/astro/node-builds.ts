/**
 * Lit's node builds for a server that doesn't run on Node. `lit-html` and
 * `@lit/reactive-element` pick their build by export condition: `node`
 * gets the one that renders through `@lit-labs/ssr`'s DOM shim, anything
 * else the browser's, which reads `document` as it loads. Vite resolves a
 * Node server with `node` among its conditions; an adapter for another
 * runtime doesn't (Cloudflare's resolves for `workerd`), and the server
 * bundle then fails on load with `document is not defined`.
 *
 * So in a server environment without `node`, the two resolve to their
 * node builds. Lit lays those out as the browser's under `node/`, which
 * keeps whatever else Vite chose, such as the development build; files
 * inside then import each other relatively, within `node/`.
 */

import type {Plugin} from 'vite';

const LIT_BUILDS = /^(?:lit-html|@lit\/reactive-element)(?:\/|$)/;

/** The package directory in a resolved file, where `node/` goes in. */
const PACKAGE_DIR =
  /\/node_modules\/(?:lit-html|@lit\/reactive-element)\/(?!node\/)/;

/** The node build's path for a file of the browser's, or the file as is. */
export const nodeBuildOf = (file: string): string =>
  file.replace(PACKAGE_DIR, (dir) => `${dir}node/`);

export const litNodeBuilds = (): Plugin => ({
  name: 'lit-plugin:astro-node-builds',
  enforce: 'pre',
  applyToEnvironment: (environment) =>
    environment.config.consumer === 'server' &&
    !environment.config.resolve.conditions.includes('node'),
  async resolveId(id, importer, options) {
    if (!LIT_BUILDS.test(id)) return null;
    const resolved = await this.resolve(id, importer, {
      ...options,
      skipSelf: true,
    });
    if (resolved === null) return null;
    return {...resolved, id: nodeBuildOf(resolved.id)};
  },
});
