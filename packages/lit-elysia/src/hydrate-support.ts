/**
 * Lit's hydrate support, alone in a module the generated client entry
 * imports before anything else: it has to patch LitElement before Lit
 * loads, so server-rendered elements hydrate instead of rendering a second
 * copy. Kept out of client.ts, whose built imports a bundler may reorder.
 *
 * Lit's global `litNonce` waits for hydration (see client.ts): a component
 * that writes the nonce into its own template, as Web Awesome's wa-page
 * does, would otherwise render other HTML than the server and fail to
 * hydrate.
 */
import '@lit-labs/ssr-client/lit-element-hydrate-support.js';
