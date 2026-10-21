/**
 * The script a page outside Vite loads to join a standalone devframe, as
 * served by `lit-devtools dev` and by {@link createLitDevtools}'s handler.
 */

import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {ConnectionMeta} from 'devframe';
import {PACKAGE_ROOT} from './paths.js';

/** Built by `build:standalone`. */
const STANDALONE_SCRIPT: string = join(
  PACKAGE_ROOT,
  'dist',
  'standalone',
  'lit-devtools.js'
);

/**
 * `lit-devtools.js` with the server's connection descriptor prepended as
 * `globalThis.__LIT_DEVTOOLS_CONNECT__`, so the page never fetches
 * `__connection.json`: from a page on another origin that request is
 * cross-origin and gets no CORS headers. The descriptor's fields are picked,
 * not spread, so nothing else devframe puts in it rides along to any page
 * that can load a script tag.
 *
 * @param url Where the devframe answers; the page's fallback when it cannot
 *   read its own script's address.
 */
export const standaloneScriptResponse = async (
  url: string,
  {backend, websocket, sse}: ConnectionMeta
): Promise<Response> => {
  const headers = {
    'content-type': 'text/javascript; charset=utf-8',
    'cache-control': 'no-store',
  };
  let bundle: string;
  try {
    bundle = await readFile(STANDALONE_SCRIPT, 'utf8');
  } catch {
    return new Response(
      '// lit-devtools: the standalone script is not built. ' +
        'Run `pnpm run build` in the package and restart.\n',
      {status: 500, headers}
    );
  }
  const config = {url, connectionMeta: {backend, websocket, sse}};
  return new Response(
    `globalThis.__LIT_DEVTOOLS_CONNECT__ = ${JSON.stringify(config)};\n${bundle}`,
    {headers}
  );
};
