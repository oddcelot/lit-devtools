/**
 * Lit's hydrate support, alone in a module the generated client entry
 * imports before anything else: it has to patch LitElement before Lit
 * loads, so server-rendered elements hydrate instead of rendering a second
 * copy. Kept out of client.ts, whose built imports a bundler may reorder.
 */
import '@lit-labs/ssr-client/lit-element-hydrate-support.js';
