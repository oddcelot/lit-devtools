import {readdirSync, statSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Elysia} from 'elysia';

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serves the built client's files, read once at startup, before any route
 * runs. `index.html` stays out: it is the shell the pages render into.
 * Hashed files under `assets/` are cached for good.
 */
export const staticFiles = (dir: URL) => {
  const root = fileURLToPath(dir);
  const files = new Set(
    readdirSync(root, {recursive: true})
      .map((file) => String(file).split(path.sep).join('/'))
      .filter(
        (file) =>
          file !== 'index.html' && statSync(path.join(root, file)).isFile()
      )
  );
  return new Elysia({name: '@oddsquad/lit-elysia/static'}).onRequest(
    async ({request}) => {
      const file = servable(request, files);
      if (file === undefined) return;
      return new Response(await readFile(path.join(root, file)), {
        headers: headersFor(file),
      });
    }
  );
};

/** The file a request asks for, when it is a read of one the build wrote. */
const servable = (request: Request, files: Set<string>) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined;
  const file = decodeURIComponent(new URL(request.url).pathname).slice(1);
  return files.has(file) ? file : undefined;
};

const headersFor = (file: string): Record<string, string> => ({
  'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
  ...(file.startsWith('assets/') && {
    'cache-control': 'public, max-age=31536000, immutable',
  }),
});
