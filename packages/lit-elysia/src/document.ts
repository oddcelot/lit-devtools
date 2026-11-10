import {render} from '@lit-labs/ssr';
import {
  collectResult,
  type RenderResult,
} from '@lit-labs/ssr/lib/render-result.js';
import type {TemplateResult} from 'lit';
import {encode} from './serialize.ts';
import {
  BODY,
  DATA_ID,
  HEAD,
  HEAD_END,
  HEAD_START,
  OUTLET_ID,
  type Payload,
} from './shared.ts';

export interface DocumentOptions {
  shell: string;
  /** The page inside its layouts. */
  template: TemplateResult;
  title: string | undefined;
  /** The `<head>` tags, rendered with {@link renderHead}. */
  head: string;
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
  payload,
}: DocumentOptions): ReadableStream<Uint8Array> => {
  const [before, after = ''] = shell
    .replace(
      HEAD,
      `${title === undefined ? '' : `<title>${escapeHtml(title)}</title>`}<!--${HEAD_START}-->${head}<!--${HEAD_END}-->`
    )
    .split(BODY);
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (html: string) => controller.enqueue(encoder.encode(html));
      try {
        send(`${before}<div id="${OUTLET_ID}">`);
        for await (const chunk of flatten(render(template))) send(chunk);
        send(
          `</div><script type="application/json" id="${DATA_ID}">${encode(payload)}</script>${after}`
        );
        controller.close();
      } catch (error) {
        controller.error(error);
      }
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

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
