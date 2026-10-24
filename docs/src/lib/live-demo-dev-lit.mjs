import {existsSync} from 'node:fs';

const LIT_ROOT =
  /^(.*[\\/]node_modules[\\/](?:lit|lit-html|lit-element|@lit[\\/]reactive-element)[\\/])(?!development[\\/])(.+)$/;
const DEV_LIT =
  /[\\/]node_modules[\\/](?:lit|lit-html|lit-element|@lit[\\/]reactive-element)[\\/]development[\\/]/;
const DEMO_SOURCE = /[\\/](?:playground|examples[\\/][^\\/]+)[\\/]src[\\/]/;
const DEMO_QUERY = '?live-demo';
const PACKAGE_JS = /[\\/]node_modules[\\/](?!\.vite[\\/]).*\.[cm]?js$/;

/** Whether a module belongs to the demo pages alone: the playground's or
 *  an example's source, Lit's development build, or a package module a
 *  demo imports (marked below). */
const inDemo = (id) =>
  DEMO_SOURCE.test(id) || DEV_LIT.test(id) || id.endsWith(DEMO_QUERY);

/**
 * Lit's development build for the live panel's demo pages
 * (/live-panel/demo/ and /live-panel/examples/<name>/demo/) and nothing
 * else. Lit's production build emits no render events, so the panel beside
 * a demo would show empty Lit Render lanes in its Timeline. The demos'
 * components are the playground's and the examples', which no other page
 * bundles, so wherever what they import is Lit, it resolves to
 * `development/`: a copy of Lit of their own, apart from the production
 * one every other page shares.
 *
 * The packages they use that import Lit themselves (Web Awesome,
 * @lit/context) are the docs' own pages' too, and a module imports one Lit
 * for every page that loads it. So a package module imported from a demo
 * becomes a module of its own, marked with a `?live-demo` query, and its
 * imports resolve the same way, down to Lit's development build. A demo
 * page runs one Lit, the development one, and no other page loads it.
 *
 * The docs' Vite config runs it, and so does the build of each example
 * built with its own config (scripts/build-live-example.mjs), where every
 * module is the demo's.
 */
export const liveDemoDevLit = () => ({
  name: 'live-demo-dev-lit',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (importer === undefined || !inDemo(importer)) return null;
    const resolved = await this.resolve(source, importer, {
      ...options,
      skipSelf: true,
    });
    if (!resolved || resolved.external || inDemo(resolved.id)) return resolved;
    const match = resolved.id.match(LIT_ROOT);
    if (match) {
      const dev = `${match[1]}development/${match[2]}`;
      return existsSync(dev) ? {...resolved, id: dev} : resolved;
    }
    return PACKAGE_JS.test(resolved.id)
      ? {...resolved, id: `${resolved.id}${DEMO_QUERY}`}
      : resolved;
  },
});
