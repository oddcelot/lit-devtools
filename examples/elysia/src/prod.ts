/**
 * The production server. `scripts/build.ts` compiles it into one executable
 * with the client bundle inside, through a generated entry that calls
 * `start()` with the embedded files.
 */

import {createApp, type Assets} from './app.ts';
import {openEntries} from './entries.ts';

const TYPES: Record<string, string> = {
  js: 'text/javascript; charset=utf-8',
  map: 'application/json; charset=utf-8',
};

export interface Build {
  /** File name of the client entry, as served under `/assets/`. */
  entry: string;
  /** Every client file by name, as a path `Bun.file()` can read. */
  files: Record<string, string>;
}

export const start = ({entry, files}: Build) => {
  const assets: Assets = {
    script: `/assets/${entry}`,
    serve: (path) => {
      const file = files[path];
      if (!file) return;
      return new Response(Bun.file(file), {
        headers: {
          'content-type':
            TYPES[path.split('.').pop()!] ?? 'application/octet-stream',
          // The names carry a content hash.
          'cache-control': 'public, max-age=31536000, immutable',
        },
      });
    },
  };

  const app = createApp({
    entries: openEntries(process.env.DB ?? 'guestbook.sqlite'),
    assets,
    devtools: process.env.LIT_DEVTOOLS,
  }).listen(Number(process.env.PORT ?? 3000));

  console.log(`Guestbook at ${app.server?.url}`);
};
