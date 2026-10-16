import {render} from '@lit-labs/ssr';
import {collectResult} from '@lit-labs/ssr/lib/render-result.js';
import {page} from './page.js';

/**
 * The page's components as HTML with declarative shadow roots, for
 * `server.mjs` to put in `index.html`.
 */
export const renderPage = (): Promise<string> => collectResult(render(page()));
