import {render} from '@lit-labs/ssr';
import type {RenderResult} from '@lit-labs/ssr/lib/render-result.js';
import {Elysia} from 'elysia';
import type {Load, LoadContext, Page} from './page.ts';
import {encode} from './serialize.ts';
import {
  BODY,
  DATA_HEADER,
  DATA_ID,
  HEAD,
  OUTLET_ID,
  type PageData,
  type Payload,
} from './shared.ts';

/** A route as the generated server entry hands it over. */
export interface ServerRoute {
  path: string;
  page: () => Promise<{default: Page<unknown>}>;
  server?: () => Promise<{load?: Load<unknown>}>;
}

export interface PagesOptions {
  routes: ServerRoute[];
  /**
   * The app shell, `index.html`, for a request's URL: the dev server
   * transforms it per request, the build once.
   */
  shell: (url: string) => string | Promise<string>;
}

/**
 * An Elysia plugin with a `GET` route for each page: it runs the page's
 * `load`, then streams the shell with the page rendered into it, or, for
 * the client router, answers with the data alone.
 */
export const pages = ({routes, shell}: PagesOptions) => {
  const app = new Elysia({name: '@oddsquad/lit-elysia/pages'});
  for (const route of routes) {
    app.get(route.path, async (context) => {
      const loaded = await loadData(route, context as unknown as LoadContext);
      if (loaded instanceof Response) return loaded;
      const page = (await route.page()).default;
      const payload = {route: route.path, data: loaded};
      const {request} = context;
      return request.headers.get(DATA_HEADER) === 'data'
        ? dataResponse(page, payload)
        : documentResponse(page, payload, await shell(pathOf(request)));
    });
  }
  return app;
};

/** One URL answers with HTML or data, so caches have to tell them apart. */
const VARY = {vary: DATA_HEADER};

const dataResponse = (page: Page<unknown>, payload: Payload) => {
  const body: PageData = {...payload, title: page.title?.(payload.data)};
  return new Response(encode(body), {
    headers: {
      ...VARY,
      [DATA_HEADER]: 'data',
      'content-type': 'application/json',
    },
  });
};

const documentResponse = (
  page: Page<unknown>,
  payload: Payload,
  shell: string
) =>
  new Response(renderDocument({shell, page, payload}), {
    headers: {...VARY, 'content-type': 'text/html; charset=utf-8'},
  });

const pathOf = (request: Request) => {
  const url = new URL(request.url);
  return url.pathname + url.search;
};

const loadData = async (route: ServerRoute, context: LoadContext) => {
  const load = route.server && (await route.server()).load;
  return load ? load(context) : undefined;
};

interface DocumentOptions {
  shell: string;
  page: Page<unknown>;
  payload: Payload;
}

/**
 * The shell as a stream: everything before the page goes out before Lit has
 * rendered anything, so the browser starts on the scripts and styles while
 * the server is still at work.
 */
export const renderDocument = ({
  shell,
  page,
  payload,
}: DocumentOptions): ReadableStream<Uint8Array> => {
  const title = page.title?.(payload.data);
  const [before, after = ''] = shell
    .replace(
      HEAD,
      title === undefined ? '' : `<title>${escapeHtml(title)}</title>`
    )
    .split(BODY);
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (html: string) => controller.enqueue(encoder.encode(html));
      try {
        send(`${before}<div id="${OUTLET_ID}">`);
        for await (const chunk of flatten(render(page.render(payload.data)))) {
          send(chunk);
        }
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
