import {render} from '@lit-labs/ssr';
import type {RenderResult} from '@lit-labs/ssr/lib/render-result.js';
import {regions} from './page.ts';
import type {PageData} from './shared.ts';
import {documentStyles} from './styles.ts';

export interface DocumentOptions {
  data: PageData;
  /** URL of the client bundle. */
  script: string;
  /**
   * URL of a standalone `lit-devtools.js`. It goes first in `<head>`, so
   * the DevTools runtime sees every component the client bundle defines.
   */
  devtools?: string;
  /** Inline script that reloads the page when the dev server rebuilds. */
  reload?: string;
}

/**
 * The page as a stream: the head goes out before Lit renders anything, then
 * each region as `@lit-labs/ssr` produces it, then the data the client
 * hydrates with.
 */
export const renderDocument = ({
  data,
  script,
  devtools,
  reload,
}: DocumentOptions): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const head = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Guestbook · Lit on Elysia</title>${
      devtools ? `\n    <script src="${devtools}"></script>` : ''
    }
    <script type="module" src="${script}"></script>${
      reload ? `\n    <script>${reload}</script>` : ''
    }
    <style>${documentStyles}</style>
  </head>
  <body>
    <main>`;
  const tail = `
      <footer>
        Rendered with
        <a href="https://lit.dev/docs/ssr/overview/">@lit-labs/ssr</a> inside an
        <a href="https://elysiajs.com">Elysia</a> route, bundled by Bun.
      </footer>
    </main>
    <script type="application/json" id="page-data">${serialize(data)}</script>
  </body>
</html>`;

  return new ReadableStream({
    async start(controller) {
      const send = (html: string) => controller.enqueue(encoder.encode(html));
      const region = async (tag: string, id: string, result: RenderResult) => {
        send(`\n      <${tag} id="${id}">`);
        for await (const chunk of flatten(result)) send(chunk);
        send(`</${tag}>`);
      };
      send(head);
      await region('header', 'masthead', render(regions.live.masthead(data)));
      await region('section', 'sign', render(regions.sign(data)));
      await region('section', 'book', render(regions.live.book(data)));
      send(tail);
      controller.close();
    },
  });
};

/**
 * Walks a render result, joining the strings it yields synchronously and
 * waiting on the promises, so each chunk is as large as Lit could make it
 * without blocking.
 */
async function* flatten(result: RenderResult): AsyncGenerator<string> {
  let pending = '';
  for (const part of result) {
    if (typeof part === 'string') {
      pending += part;
      continue;
    }
    if (pending) yield pending;
    pending = '';
    yield* flatten(await part);
  }
  if (pending) yield pending;
}

/** JSON that is safe inside a `<script>` element. */
const serialize = (data: PageData) =>
  JSON.stringify(data).replaceAll('<', '\\u003c');
