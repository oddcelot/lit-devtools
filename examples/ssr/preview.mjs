/**
 * The example's production build, served without Vite: a plain Node HTTP
 * server hands out `dist/client` and renders each page request with the
 * server build's `renderPage`.
 *
 *     npm run build
 *     npm run preview
 *
 * There is no Vite here, so no HMR and no DevTools dock. The Lit panel can
 * still attach: start `npx lit-devtools dev` and pass the script it prints,
 *
 *     npm run preview -- --devtools http://localhost:5180/lit-devtools.js
 *
 * which goes at the top of `<head>`, so it runs before the client entry
 * hydrates anything.
 */

import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTLET = '<!--ssr-outlet-->';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/**
 * @param {object} [options]
 * @param {string} [options.root] Where `dist/` is.
 * @param {number} [options.port]
 * @param {string} [options.host]
 * @param {string} [options.devtools] The URL of `lit-devtools.js`.
 */
export const startPreviewServer = async ({
  root = here,
  port = 4180,
  host = 'localhost',
  devtools,
} = {}) => {
  const client = path.join(root, 'dist/client');
  const {renderPage} = await import(
    pathToFileURL(path.join(root, 'dist/server/entry-server.js')).href
  );
  let template = await readFile(path.join(client, 'index.html'), 'utf8');
  if (devtools !== undefined) {
    template = template.replace(
      '<head>',
      `<head>\n    <script src="${devtools}"></script>`
    );
  }

  const http = createServer(async (req, res) => {
    const {pathname} = new URL(req.url ?? '/', 'http://x');
    const file = path.join(client, pathname);
    if (pathname !== '/' && file.startsWith(client + path.sep)) {
      try {
        const body = await readFile(file);
        res.setHeader(
          'content-type',
          TYPES[path.extname(file)] ?? 'application/octet-stream'
        );
        res.end(body);
        return;
      } catch {
        // Not a file: render it as a page.
      }
    }
    try {
      const html = template.replace(OUTLET, await renderPage());
      res.writeHead(200, {'content-type': TYPES['.html']}).end(html);
    } catch (error) {
      console.error(error);
      res.writeHead(500, {'content-type': 'text/plain'});
      res.end(String(error?.stack ?? error));
    }
  });
  await new Promise((resolve) => http.listen(port, host, resolve));
  const address = http.address();

  return {
    origin: `http://${host}:${address.port}`,
    close: () => new Promise((resolve) => http.close(resolve)),
  };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf('--devtools');
  const devtools = flag === -1 ? undefined : process.argv[flag + 1];
  const {origin} = await startPreviewServer({devtools});
  console.log(`Lit SSR example (production build) at ${origin}/`);
}
