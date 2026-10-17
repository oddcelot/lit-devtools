/**
 * Facts about the panel the plugin serves on Vite's own server when no Vite
 * DevTools hub mounts it, shared by the hub-less mount in `vite.ts` and the
 * hosts that embed that panel (the Astro dev toolbar app). Kept apart from
 * `vite.ts` so reading them does not load the dev-only devframe code.
 */

import type {ViteDevServer} from 'vite';

/** Where the panel is served when no Vite DevTools hub mounts it. */
export const STANDALONE_PANEL_BASE = '/__lit/';

/**
 * Whether the developer turned client auth off the way Vite DevTools reads
 * it: `devtools: {clientAuth: false}` (as written, or as Vite resolved it
 * under `config`) or `VITE_DEVTOOLS_DISABLE_CLIENT_AUTH=true`.
 */
export const clientAuthDisabled = (server: ViteDevServer): boolean => {
  type Auth = {clientAuth?: unknown; config?: {clientAuth?: unknown}};
  const devtools = (server.config as {devtools?: Auth}).devtools;
  return (
    devtools?.clientAuth === false ||
    devtools?.config?.clientAuth === false ||
    process.env['VITE_DEVTOOLS_DISABLE_CLIENT_AUTH'] === 'true'
  );
};
