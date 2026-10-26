import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/**
 * Resolves a runtime module to an absolute fs path (served via `/@fs/`), so
 * the plugin works from any served root. Falls back from the built `.js` to
 * the `.ts` source when running un-built (e.g. under vitest).
 */
export const resolveRuntimeModule = (name: string): string => {
  for (const ext of ['js', 'ts'] as const) {
    const url = new URL(`../runtime/${name}.${ext}`, import.meta.url);
    if (existsSync(url)) {
      return fileURLToPath(url).replace(/\\/g, '/');
    }
  }
  throw new Error(`[lit-plugin] runtime module not found: ${name}`);
};

const RUNTIME_DIR = fileURLToPath(
  new URL('../runtime/', import.meta.url)
).replace(/\\/g, '/');

/**
 * Whether `id` is one of this plugin's runtime modules. Installed from npm
 * they sit under `node_modules`, which the transforms skip anyway; linked
 * from a workspace they don't, and only their folder tells them apart from
 * the project's own code.
 */
export const isRuntimeModule = (id: string): boolean =>
  id.replace(/\\/g, '/').startsWith(RUNTIME_DIR);

export const JS_FILE_RE = /\.[cm]?[jt]sx?$/;
