import {existsSync} from 'node:fs';

const LIT_PACKAGE =
  /^(?:lit|lit-html|lit-element|@lit\/reactive-element)(?:\/|$)/;
const LIT_ROOT =
  /^(.*[\\/]node_modules[\\/](?:lit|lit-html|lit-element|@lit[\\/]reactive-element)[\\/])(?!development[\\/])(.+)$/;
const DEV_LIT_IMPORTER =
  /[\\/](?:playground|examples[\\/][^\\/]+)[\\/]src[\\/]|[\\/]node_modules[\\/](?:lit|lit-html|lit-element|@lit[\\/]reactive-element)[\\/]development[\\/]/;

/**
 * Lit's development build for the live panel's demo pages
 * (/live-panel/demo/ and /live-panel/examples/<name>/demo/) and nothing
 * else. Lit's production build emits no render events, so the panel beside
 * a demo would show empty Lit Render lanes in its Timeline. The demos'
 * components are the playground's and the examples', which no other page
 * bundles, so their Lit imports, and the imports inside Lit's own
 * `development/` files, resolve to `development/`: a copy of Lit of their
 * own, apart from the production one every other page shares.
 */
export const liveDemoDevLit = () => ({
  name: 'live-demo-dev-lit',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!LIT_PACKAGE.test(source) || !DEV_LIT_IMPORTER.test(importer ?? '')) {
      return null;
    }
    const resolved = await this.resolve(source, importer, {
      ...options,
      skipSelf: true,
    });
    const match = resolved?.id.match(LIT_ROOT);
    if (!match) return resolved;
    const dev = `${match[1]}development/${match[2]}`;
    return existsSync(dev) ? {...resolved, id: dev} : resolved;
  },
});
