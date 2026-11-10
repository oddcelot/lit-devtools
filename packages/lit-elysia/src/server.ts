import {Elysia, type AnyElysia} from 'elysia';
import {compose, headOf, titleOf, type View} from './compose.ts';
import {renderDocument, renderHead} from './document.ts';
import {
  ActionFailure,
  PageError,
  type ActionContext,
  type Actions,
  type ErrorData,
  type Layout,
  type Load,
  type LoadContext,
  type Page,
} from './page.ts';
import {safePromises} from './deferred.ts';
import {ROUTE} from './links.ts';
import {records} from './serialize.ts';
import {
  DATA_HEADER,
  ERROR,
  NOT_FOUND,
  type PageData,
  type Payload,
} from './shared.ts';

export {renderDocument} from './document.ts';

type Import<T> = () => Promise<T>;

/** A module and the loader in its `.server.ts`, as the server entry hands them over. */
export interface ServerModule<T> {
  page: Import<{default: T}>;
  // `any` params: a load typed for its route's params is still a load.
  // oxlint-disable-next-line typescript/no-explicit-any
  server?: Import<{load?: Load<unknown, any>; actions?: Actions}>;
}

/** A route as the generated server entry hands it over. */
export interface ServerRoute extends ServerModule<Page<unknown>> {
  path: string;
  /** The layouts around it, outermost first. */
  layouts: ServerModule<Layout<unknown>>[];
}

export interface PagesOptions {
  routes: ServerRoute[];
  /**
   * The `context` plugin `src/server.ts` exports: the page routes are added
   * to it, so what it decorates and derives reaches every load and action,
   * and its hooks, such as a guard in `onBeforeHandle`, run before them.
   */
  base?: AnyElysia;
  /**
   * Each route's chunks and stylesheets, from the build's manifest: the
   * document links them so they load beside the client entry.
   */
  preloads?: Record<string, string[]>;
  /** `_404.ts` and `_error.ts`, named `#404` and `#error`. */
  errors?: ServerRoute[];
  /**
   * The app shell, `index.html`, for a request's URL: the dev server
   * transforms it per request, the build once.
   */
  shell: (url: string) => string | Promise<string>;
}

/**
 * An Elysia plugin with a `GET` route for each page: it runs the page's
 * `load` and its layouts', then streams the shell with the page rendered
 * into it, or, for the client router, answers with the data alone. An
 * error, and any other `GET` for a page, answers with an error page.
 */
export const pages = (options: PagesOptions) => {
  // Typed as a plain Elysia here: what the base adds is the pages' business.
  const app = (options.base ??
    new Elysia({name: '@oddsquad/lit-elysia/pages'})) as Elysia;
  for (const route of options.routes) {
    app.get(route.path, (context) =>
      handle(options, route, context as unknown as Raw)
    );
    if (route.server) {
      app.post(route.path, (context) =>
        act(options, route, context as unknown as Raw)
      );
    }
  }
  // Last, so every route above, the user's included, comes first.
  app.get('/*', (context) =>
    wantsPage(context.request)
      ? failure(options, context as unknown as Raw, notFound())
      : new Response('Not Found', {status: 404})
  );
  return app;
};

/** The parts of Elysia's context the framework itself reads. */
interface Raw {
  request: Request;
}

/** What a request's loads and actions set aside for its response. */
interface Collected {
  headers: Record<string, string>;
  depends: Set<string>;
}

/**
 * The context the loads and actions of one request share: Elysia's own,
 * with whatever the `context` plugin added, and the framework's helpers.
 */
const pageContext = (raw: Raw) => {
  const collected: Collected = {headers: {}, depends: new Set()};
  const context = Object.assign(raw, {
    setHeaders: (headers: Record<string, string>) => {
      for (const [name, value] of Object.entries(headers)) {
        collected.headers[name.toLowerCase()] = value;
      }
    },
    depends: (...keys: string[]) => {
      for (const key of keys) collected.depends.add(key);
    },
  }) as unknown as ActionContext;
  return {context, collected};
};

const handle = async (options: PagesOptions, route: ServerRoute, raw: Raw) => {
  const {context, collected} = pageContext(raw);
  try {
    const loaded = await loadAll(route, context);
    if (loaded instanceof Response) return loaded;
    return await respond(options, route, context.request, collected, {
      route: route.path,
      ...loaded,
    });
  } catch (thrown) {
    return failure(options, raw, thrown);
  }
};

/**
 * A form posted to a page: runs the action it names, then answers with
 * what the action returned, or with the page loaded again and the
 * action's result as its `form`.
 */
const act = async (options: PagesOptions, route: ServerRoute, raw: Raw) => {
  const {context, collected} = pageContext(raw);
  try {
    const result = await runAction(route, context);
    if (result instanceof Response) return result;
    const failed = result instanceof ActionFailure;
    const loaded = await loadAll(route, context);
    if (loaded instanceof Response) return loaded;
    return await respond(options, route, context.request, collected, {
      route: route.path,
      ...loaded,
      form: failed ? result.data : result,
      ...(failed && {status: result.status}),
    });
  } catch (thrown) {
    return failure(options, raw, thrown);
  }
};

const runAction = async (route: ServerRoute, context: ActionContext) => {
  const name = actionName(context.request);
  const actions = (await route.server!()).actions;
  checkRoute(actions, route.path);
  const action = actions?.[name];
  if (!action) throw new PageError(405, `No action named ${name}`);
  return action(context);
};

/** `?/name` names an action, as in `<form action="?/create">`. */
const actionName = (request: Request) => {
  const search = new URL(request.url).search;
  return search.startsWith('?/')
    ? decodeURIComponent(search.slice(2).split('&')[0]!)
    : 'default';
};

const notFound = () => new PageError(404, 'Not found');

/** A browser asking for a document, or the router asking for page data. */
const wantsPage = (request: Request) =>
  request.headers.get(DATA_HEADER) === 'data' ||
  (request.headers.get('accept') ?? '').includes('text/html');

/**
 * The error page for what a `load` threw: its status and message for a
 * `PageError`, a 500 that says nothing more for anything else. Without an
 * error page, or when the layouts around it fail too, plain text. It starts
 * over with headers of its own: a page that set `max-age` and then failed
 * doesn't get its error cached.
 */
const failure = async (options: PagesOptions, raw: Raw, thrown: unknown) => {
  const {context, collected} = pageContext(raw);
  const error = errorOf(thrown);
  const name = error.status === 404 ? NOT_FOUND : ERROR;
  const route =
    options.errors?.find((page) => page.path === name) ??
    options.errors?.find((page) => page.path === ERROR);
  const plain = new Response(error.message, {status: error.status});
  if (!route) return plain;
  try {
    const {layouts} = await loadLayouts(route, context);
    return await respond(options, route, context.request, collected, {
      route: route.path,
      data: error,
      layouts,
      status: error.status,
    });
  } catch (again) {
    console.error(again);
    return plain;
  }
};

const errorOf = (thrown: unknown): ErrorData => {
  if (thrown instanceof PageError) {
    return {status: thrown.status, message: thrown.message};
  }
  console.error(thrown);
  return {status: 500, message: 'Something went wrong'};
};

/** The page as data for the router, or as a document for everyone else. */
const respond = async (
  options: PagesOptions,
  route: ServerRoute,
  request: Request,
  collected: Collected,
  loaded: Payload
) => {
  const depends = [...collected.depends];
  const payload = safePromises({...loaded, ...(depends.length && {depends})});
  const response =
    request.headers.get(DATA_HEADER) === 'data'
      ? dataResponse(payload)
      : await documentResponse(
          await viewOf(route),
          payload,
          await options.shell(pathOf(request)),
          preloadTags(options.preloads?.[route.path])
        );
  for (const [name, value] of Object.entries(collected.headers)) {
    response.headers.set(name, value);
  }
  return response;
};

/** The modules a route renders with. */
const viewOf = async (route: ServerRoute): Promise<View> => ({
  page: (await route.page()).default,
  layouts: await Promise.all(
    route.layouts.map(async (layout) => (await layout.page()).default)
  ),
});

/**
 * The page's data and each layout's, loaded side by side. The first
 * `Response` any of them returns is sent instead of the page.
 */
const loadAll = async (route: ServerRoute, context: LoadContext) => {
  const [data, ...layouts] = await Promise.all(
    [route, ...route.layouts].map((module, i) =>
      loadData(module, context, i === 0 ? route.path : undefined)
    )
  );
  const response = [data, ...layouts].find(
    (value) => value instanceof Response
  );
  return (response as Response | undefined) ?? {data, layouts};
};

/** The layouts' data alone, for an error page: a `Response` is an error too. */
const loadLayouts = async (route: ServerRoute, context: LoadContext) => {
  const loaded = await loadAll({...route, server: undefined}, context);
  if (loaded instanceof Response) {
    throw new Error('a layout load answered an error page with a Response');
  }
  return loaded;
};

const loadData = async (
  module: ServerModule<unknown>,
  context: LoadContext,
  path?: string
) => {
  const load = module.server && (await module.server()).load;
  if (path) checkRoute(load, path);
  return load ? load(context) : undefined;
};

/**
 * A `load` or `actions` made with `route(path)` was typed for that path's
 * params; answering another path, it would read params that aren't there.
 */
const checkRoute = (value: object | undefined, path: string) => {
  const named = (value as {[ROUTE]?: string} | undefined)?.[ROUTE];
  if (named !== undefined && named !== path) {
    throw new Error(
      `[lit-elysia] route('${named}') is used in the page that answers ${path}`
    );
  }
};

/** One URL answers with HTML or data, so caches have to tell them apart. */
const VARY = {vary: DATA_HEADER};

/**
 * The page's data for the router, one record per line: the first now, one
 * more per promise as it settles.
 */
const dataResponse = (payload: PageData) =>
  new Response(lines(records(payload)), {
    status: payload.status ?? 200,
    headers: {
      ...VARY,
      [DATA_HEADER]: 'data',
      'content-type': 'application/x-ndjson',
    },
  });

/** `modulepreload` for the chunks, a stylesheet link for the CSS. */
const preloadTags = (files: string[] = []) =>
  files
    .map((file) =>
      file.endsWith('.css')
        ? `<link rel="stylesheet" href="${file}">`
        : `<link rel="modulepreload" crossorigin href="${file}">`
    )
    .join('');

const documentResponse = async (
  view: View,
  payload: Payload,
  shell: string,
  preload: string
) =>
  new Response(
    renderDocument({
      shell,
      preload,
      template: compose(view, payload),
      title: titleOf(view, payload),
      head: await renderHead(headOf(view, payload)),
      payload,
    }),
    {
      status: payload.status ?? 200,
      headers: {...VARY, 'content-type': 'text/html; charset=utf-8'},
    }
  );

const pathOf = (request: Request) => {
  const url = new URL(request.url);
  return url.pathname + url.search;
};

const lines = (source: AsyncIterable<string>) => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const line of source)
          controller.enqueue(encoder.encode(`${line}\n`));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
};
