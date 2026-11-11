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
  PAGE_END,
  PAGE_START,
  QUEUE,
  type Payload,
} from './shared.ts';

export interface DocumentOptions {
  shell: string;
  /** The page inside its layouts. */
  template: TemplateResult;
  /**
   * A page that isn't hydrated: the layouts in `template` hold its marker,
   * and the page is written after it, outside their templates.
   */
  page?: TemplateResult;
  title: string | undefined;
  /** The `<head>` tags, rendered with {@link renderHead}. */
  head: string;
  /** Links to the page's chunks and stylesheets, from the build. */
  preload?: string;
  /**
   * This response's CSP nonce: it goes on every script, style and link the
   * document carries, Lit's shadow-root styles included.
   */
  nonce?: string;
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
  page,
  title,
  head,
  preload = '',
  nonce,
  payload,
}: DocumentOptions): ReadableStream<Uint8Array> => {
  // Vite's client reads the nonce here for the styles and scripts it adds.
  const meta = nonce ? `<meta property="csp-nonce" nonce="${nonce}">` : '';
  const [before, after = ''] = shell
    .replace(
      HEAD,
      `${title === undefined ? '' : `<title>${escapeHtml(title)}</title>`}${meta}${preload}<!--${HEAD_START}-->${head}<!--${HEAD_END}-->`
    )
    .split(BODY);
  // The data's promises stream after the page, before `</body>`.
  const close = after.lastIndexOf('</body>');
  const [beforeClose, closing] =
    close < 0 ? [after, ''] : [after.slice(0, close), after.slice(close)];
  const encoder = new TextEncoder();
  const sign = signer(nonce);
  let cancelled = false;
  return new ReadableStream({
    async start(controller) {
      // Once the client has gone, nothing more is rendered or awaited.
      const send = (html: string) => {
        if (cancelled) throw new Error('cancelled');
        controller.enqueue(encoder.encode(sign(html)));
      };
      try {
        send(`${before}<div id="${OUTLET_ID}">`);
        for await (const chunk of withPage(flatten(render(template)), page)) {
          send(chunk);
        }
        const data = records(payload);
        const first = await data.next();
        // Right after the page: when it runs, the page above is complete,
        // and the client can hydrate while the rest still streams.
        send(`</div>${push(first.value as string, DATA_ID)}${beforeClose}`);
        for await (const record of data) send(push(record));
        send(closing);
        controller.close();
      } catch (error) {
        if (!cancelled) controller.error(error);
      }
    },
    cancel() {
      cancelled = true;
    },
  });
};

/**
 * Puts the nonce on the tags CSP checks. Text Lit renders has its `<`
 * escaped, and so do the data records, so only real tags match.
 */
const signer = (nonce: string | undefined) =>
  nonce
    ? (html: string) =>
        html.replace(
          /<(script|style|link)\b(?![^>]*\snonce=)/gi,
          `<$1 nonce="${nonce}"`
        )
    : (html: string) => html;

/** An inline script that queues a data record for the client. */
const push = (record: string, id?: string) =>
  `<script${id ? ` id="${id}"` : ''}>(self.${QUEUE}||=[]).push(${record})</script>`;

/**
 * The layouts' HTML with the page's after its marker, then the end marker
 * the browser looks for. The marker is static text in one template, so it
 * arrives whole, in one chunk.
 */
async function* withPage(
  chunks: AsyncGenerator<string>,
  page: TemplateResult | undefined
): AsyncGenerator<string> {
  const marker = `<!--${PAGE_START}-->`;
  for await (const chunk of chunks) {
    const at = page ? chunk.indexOf(marker) : -1;
    if (at < 0) {
      yield chunk;
      continue;
    }
    yield chunk.slice(0, at + marker.length);
    const strip = markerStripper();
    for await (const html of flatten(render(page!))) yield strip(html);
    yield `<!--${PAGE_END}-->${chunk.slice(at + marker.length)}`;
  }
}

/**
 * Takes Lit's markers out of a page nothing hydrates, chunk by chunk: its
 * template's, which only hydration reads. Inside a `<template>`, such as a
 * component's declarative shadow root, they stay: the component hydrates
 * against them. Each marker is one string to Lit, so none spans two chunks.
 */
const markerStripper = () => {
  let depth = 0;
  return (html: string) =>
    html.replace(
      /<template\b|<\/template>|<!--\/?lit-(?:part|node)\b[^>]*-->/g,
      (token) => {
        if (token.startsWith('<template')) depth++;
        else if (token === '</template>') depth--;
        else if (depth === 0) return '';
        return token;
      }
    );
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
