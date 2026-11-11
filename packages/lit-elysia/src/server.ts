import {
  Elysia,
  ValidationError,
  Validator,
  type AnyElysia,
  type AnySchema,
} from 'elysia';
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
import {PARAMS, QUERY, ROUTE} from './shared.ts';
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
  // `any` params and query: a load typed for its route's is still a load.
  // oxlint-disable-next-line typescript/no-explicit-any
  server?: Import<{load?: Load<unknown, any, any>; actions?: Actions}>;
}

/** A route as the generated server entry hands it over. */
export interface ServerRoute extends ServerModule<Page<unknown>> {
  path: string;
  /** The layouts around it, outermost first, by their folders' paths. */
  layouts: (ServerModule<Layout<unknown>> & {path?: string})[];
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
  /**
   * The stylesheets shadow roots import, `?css-sheet` files: preloaded as
   * styles, so the first root that imports one finds it loading, without
   * applying them to the document.
   */
  sheets?: string[];
  /**
   * A Content-Security-Policy for the documents, with `{nonce}` where each
   * response's nonce goes: `script-src 'self' 'nonce-{nonce}'`.
   */
  csp?: string;
  /**
   * Send the policy as `Content-Security-Policy-Report-Only`: violations
   * are reported, nothing is blocked. For dev, where Vite's and the Lit
   * plugin's tools add styles a strict policy would stop.
   */
  cspReportOnly?: boolean;
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
    // HEAD, for link previews and uptime checks: the GET's status and
    // headers, without the page.
    app.head(route.path, async (context) =>
      bodiless(await handle(options, route, context as unknown as Raw))
    );
    if (route.server) {
      app.post(route.path, (context) =>
        act(options, route, context as unknown as Raw)
      );
    }
  }
  // Last, so every route above, the user's included, comes first.
  const missing = (raw: Raw) =>
    wantsPage(raw.request)
      ? failure(options, raw, notFound())
      : new Response('Not Found', {status: 404});
  app.get('/*', (context) => missing(context as unknown as Raw));
  app.head('/*', async (context) =>
    bodiless(await missing(context as unknown as Raw))
  );
  return app;
};

/** A response's status and headers alone: its body, unread, stops. */
const bodiless = (response: Response) => {
  void response.body?.cancel();
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
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
    signal: raw.request.signal,
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
  return action(await withSchemas(actions, context));
};

const validators = new WeakMap<AnySchema, Validator>();

/**
 * One validator a schema, made the first time a request needs it, or at
 * startup by `prepareSchemas`.
 */
const validatorOf = (schema: AnySchema) => {
  let validator = validators.get(schema);
  if (!validator) {
    validator = Validator.create(schema as never) as Validator;
    validators.set(schema, validator);
  }
  return validator;
};

/**
 * Makes the validators of every page's and layout's schemas now, instead
 * of on the first request each needs. A Worker refuses to generate code
 * during a request, so it runs this at startup: without it, Elysia checks
 * without generated code and warns once a schema.
 */
export const prepareSchemas = async (routes: ServerRoute[]) => {
  const modules = new Set(
    routes.flatMap((route) => [route, ...route.layouts]).map((m) => m.server)
  );
  for (const server of modules) {
    if (!server) continue;
    const {load, actions} = (await server()) as {
      load?: object;
      actions?: object;
    };
    for (const value of [load, actions]) {
      const marked = value as
        | {[QUERY]?: AnySchema; [PARAMS]?: AnySchema}
        | undefined;
      if (marked?.[QUERY]) validatorOf(marked[QUERY]);
      if (marked?.[PARAMS]) validatorOf(marked[PARAMS]);
    }
  }
};

/**
 * What a schema makes of `value`, or `undefined` when it doesn't fit:
 * checked and coerced, as Elysia does for its own routes.
 */
const parse = async (
  schema: AnySchema,
  value: Record<string, unknown>,
  type: 'query' | 'params'
) => {
  try {
    return {value: await validatorOf(schema).From!(value, type)};
  } catch (thrown) {
    if (thrown instanceof ValidationError) return {error: thrown.message};
    throw thrown;
  }
};

/**
 * The context with its query and params checked and coerced by the
 * schemas `route(path, {query, params})` gave a load or actions; as it was
 * without them. A query that doesn't fit answers 400, a param 404: no
 * such page. The action's own name, `?/name`, isn't part of the query.
 * The context is shared by the layouts' loads, so the checked values go
 * on a view of it.
 */
const withSchemas = async <C extends LoadContext>(
  value: object | undefined,
  context: C
): Promise<C> => {
  const marked = value as
    | {[QUERY]?: AnySchema; [PARAMS]?: AnySchema}
    | undefined;
  const checked: Partial<Record<'query' | 'params', unknown>> = {};
  if (marked?.[QUERY]) {
    const raw = Object.fromEntries(
      Object.entries(context.query).filter(([name]) => !name.startsWith('/'))
    );
    const query = await parse(marked[QUERY], raw, 'query');
    if ('error' in query) throw new PageError(400, `Bad query: ${query.error}`);
    checked.query = query.value;
  }
  if (marked?.[PARAMS]) {
    const params = await parse(marked[PARAMS], context.params, 'params');
    if ('error' in params) throw notFound();
    checked.params = params.value;
  }
  if (!('query' in checked) && !('params' in checked)) return context;
  return new Proxy(context, {
    get: (target, key) =>
      typeof key === 'string' && key in checked
        ? checked[key as keyof typeof checked]
        : Reflect.get(target, key, target),
  });
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
  // The client went, and its page's work with it: nothing to show or log.
  if (raw.request.signal.aborted) return new Response(null, {status: 499});
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
          preloadTags(options.preloads?.[route.path], options.sheets),
          options
        );
  for (const [name, value] of Object.entries(collected.headers)) {
    response.headers.set(name, value);
  }
  return response;
};

/** The modules a route renders with. */
const viewOf = async (route: ServerRoute): Promise<View> => ({
  page: checkRoute((await route.page()).default, route.path),
  layouts: await Promise.all(
    route.layouts.map(async (layout) =>
      checkRoute((await layout.page()).default, layout.path, 'the layout of')
    )
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
  return load ? load(await withSchemas(load, context)) : undefined;
};

/**
 * A `load` or `actions` made with `route(path)`, or a page or layout
 * defined with its path, was typed for that path; in another file it
 * would read params and data that aren't there.
 */
const checkRoute = <T extends object | undefined>(
  value: T,
  path: string | undefined,
  where = 'the page that answers'
): T => {
  const named = (value as {[ROUTE]?: string} | undefined)?.[ROUTE];
  if (path !== undefined && named !== undefined && named !== path) {
    throw new Error(`[lit-elysia] '${named}' is named in ${where} ${path}`);
  }
  return value;
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
const preloadTags = (files: string[] = [], sheets: string[] = []) =>
  files
    .map((file) =>
      sheets.includes(file)
        ? `<link rel="preload" as="style" href="${file}">`
        : file.endsWith('.css')
          ? `<link rel="stylesheet" href="${file}">`
          : `<link rel="modulepreload" crossorigin href="${file}">`
    )
    .join('');

const documentResponse = async (
  view: View,
  payload: Payload,
  shell: string,
  preload: string,
  {csp, cspReportOnly}: PagesOptions
) => {
  const nonce = csp ? newNonce() : undefined;
  // A page that isn't hydrated goes out as HTML alone, its data and form
  // left out of the records: the layouts hydrate without it.
  const unhydrated = view.page.hydrate === false;
  const {data: _data, form: _form, ...rest} = payload;
  const sent: Payload = unhydrated
    ? {...rest, data: undefined, hydrate: false}
    : payload;
  const response = new Response(
    renderDocument({
      shell,
      preload,
      nonce,
      template: compose(view, sent),
      ...(unhydrated && {page: view.page.render(payload.data, payload.form)}),
      title: titleOf(view, payload),
      head: await renderHead(headOf(view, payload)),
      payload: sent,
    }),
    {
      status: payload.status ?? 200,
      headers: {...VARY, 'content-type': 'text/html; charset=utf-8'},
    }
  );
  if (csp && nonce) {
    response.headers.set(
      cspReportOnly
        ? 'content-security-policy-report-only'
        : 'content-security-policy',
      csp.replaceAll('{nonce}', nonce)
    );
  }
  return response;
};

/** 128 random bits, base64: a fresh nonce for each document. */
const newNonce = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));

const pathOf = (request: Request) => {
  const url = new URL(request.url);
  return url.pathname + url.search;
};

const lines = (source: AsyncIterable<string>) => {
  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const line of source) {
          // The client left: stop waiting on the data's promises.
          if (cancelled) return;
          controller.enqueue(encoder.encode(`${line}\n`));
        }
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
