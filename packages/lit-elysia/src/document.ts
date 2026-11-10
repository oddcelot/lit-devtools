import {render} from '@lit-labs/ssr';
import {
  collectResult,
  type RenderResult,
} from '@lit-labs/ssr/lib/render-result.js';
import type {TemplateResult} from 'lit';
import {records} from './serialize.ts';
import {
  BODY,
  DATA_ID,
  HEAD,
  HEAD_END,
  HEAD_START,
  OUTLET_ID,
  QUEUE,
  type Payload,
} from './shared.ts';

export interface DocumentOptions {
  shell: string;
  /** The page inside its layouts. */
  template: TemplateResult;
  title: string | undefined;
  /** The `<head>` tags, rendered with {@link renderHead}. */
  head: string;
  /** Links to the page's chunks and stylesheets, from the build. */
  preload?: string;
  payload: Payload;
}

/**
 * The pages' `<head>` tags as HTML. Nothing hydrates them, so Lit's markers
 * are left out; the router renders the next page's tags itself.
 */
export const renderHead = async (
  templates: TemplateResult[]
): Promise<string> => {
  const html = await Promise.all(
    templates.map((template) => collectResult(render(template)))
  );
  return html.join('').replace(/<!--\/?lit-[^>]*-->/g, '');
};

/**
 * The shell as a stream: everything before the page goes out before Lit has
 * rendered anything, so the browser starts on the scripts and styles while
 * the server is still at work.
 */
export const renderDocument = ({
  shell,
  template,
  title,
  head,
  preload = '',
  payload,
}: DocumentOptions): ReadableStream<Uint8Array> => {
  const [before, after = ''] = shell
    .replace(
      HEAD,
      `${title === undefined ? '' : `<title>${escapeHtml(title)}</title>`}${preload}<!--${HEAD_START}-->${head}<!--${HEAD_END}-->`
    )
    .split(BODY);
  // The data's promises stream after the page, before `</body>`.
  const close = after.lastIndexOf('</body>');
  const [beforeClose, closing] =
    close < 0 ? [after, ''] : [after.slice(0, close), after.slice(close)];
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (html: string) => controller.enqueue(encoder.encode(html));
      try {
        send(`${before}<div id="${OUTLET_ID}">`);
        for await (const chunk of flatten(render(template))) send(chunk);
        const data = records(payload);
        const first = await data.next();
        // Right after the page: when it runs, the page above is complete,
        // and the client can hydrate while the rest still streams.
        send(`</div>${push(first.value as string, DATA_ID)}${beforeClose}`);
        for await (const record of data) send(push(record));
        send(closing);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
};

/** An inline script that queues a data record for the client. */
const push = (record: string, id?: string) =>
  `<script${id ? ` id="${id}"` : ''}>(self.${QUEUE}||=[]).push(${record})</script>`;

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

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
