/**
 * The example's dev server: Vite in middleware mode behind a plain Node HTTP
 * server, which renders each page request with `@lit-labs/ssr` before the
 * browser sees it.
 *
 *     npm run dev
 *
 * The server half (`src/entry-server.ts`) is loaded through Vite's SSR
 * module graph, so an edit to a component reaches the next server render
 * without a restart, while the open page is hot-patched by the plugin.
 *
 * `startSsrServer` is also what the repo's e2e tests start, with their own
 * root, plugins and port.
 */

import {createServer as createHttpServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTLET = '<!--ssr-outlet-->';

/**
 * @param {object} [options]
 * @param {string} [options.root] Where `index.html` and `src/` are.
 * @param {import('vite').InlineConfig} [options.vite] Merged into Vite's config.
 * @param {number} [options.port]
 * @param {string} [options.host]
 */
export const startSsrServer = async ({
  root = here,
  vite: extra = {},
  port = 5180,
  host = 'localhost',
} = {}) => {
  const vite = await createServer({
    root,
    appType: 'custom',
    ...extra,
    // `host` too: with no HTTP server of Vite's own, the DevTools dock opens
    // a side socket on `server.host`, and the page dials it at the host the
    // page came from. Left to its `localhost` default it can bind `::1`
    // while the page is on 127.0.0.1, and the dock never connects.
    server: {...extra.server, middlewareMode: true, host},
  });

  const renderHtml = async (url) => {
    const template = await vite.transformIndexHtml(
      url,
      await readFile(path.join(root, 'index.html'), 'utf8')
    );
    const {renderPage} = await vite.ssrLoadModule('/src/entry-server.ts');
    return template.replace(OUTLET, await renderPage());
  };

  const http = createHttpServer((req, res) => {
    vite.middlewares(req, res, async () => {
      // Anything Vite didn't serve is a page.
      try {
        const html = await renderHtml(req.url ?? '/');
        res.writeHead(200, {'content-type': 'text/html'}).end(html);
      } catch (error) {
        vite.ssrFixStacktrace(error);
        console.error(error);
        res.writeHead(500, {'content-type': 'text/plain'});
        res.end(String(error?.stack ?? error));
      }
    });
  });
  await new Promise((resolve) => http.listen(port, host, resolve));
  const address = http.address();
  const origin = `http://${host}:${address.port}`;

  return {
    vite,
    origin,
    close: async () => {
      await vite.close();
      await new Promise((resolve) => http.close(resolve));
    },
  };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const {origin} = await startSsrServer();
  console.log(`Lit SSR example at ${origin}/`);
}
