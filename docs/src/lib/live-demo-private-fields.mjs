// The plugin's own rewrite, from its build: the package exports no path to it.
import {rewritePrivateNames} from '../../../lib/plugins/private-fields.js';

const EXAMPLE_SOURCE =
  /[\\/]examples[\\/][^\\/]+[\\/]src[\\/][^?]+\.[cm]?[jt]sx?(?:\?|$)/;

/**
 * The plugin's private-fields rewrite for the examples' live demos, and
 * nothing else. Under the dev server the plugin keys native `#private`
 * fields by registered symbols, which is how the Components panel can show
 * them under Private; the docs bundle the examples without the plugin, so
 * this does the same to the examples' sources, so a demo's panel shows what
 * it would under `vite dev`. Every other module of the docs is left as
 * written.
 *
 * The docs' Vite config runs it, and so does the build of each example
 * built with its own config (scripts/build-live-example.mjs).
 */
export const liveDemoPrivateFields = () => ({
  name: 'live-demo-private-fields',
  transform(code, id) {
    const at = id.search(EXAMPLE_SOURCE);
    if (at === -1 || /[\\/]node_modules[\\/]/.test(id)) return null;
    // Keyed by the path from the repo root, so the published bundles don't
    // carry the path of the machine that built them.
    return rewritePrivateNames(code, id.slice(at + 1).replaceAll('\\', '/'));
  },
});
