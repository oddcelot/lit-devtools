import {Elysia} from 'elysia';
import {compose, titleOf, type View} from './compose.ts';
import {renderDocument} from './document.ts';
import type {Layout, Load, LoadContext, Page} from './page.ts';
import {encode} from './serialize.ts';
import {DATA_HEADER, type PageData, type Payload} from './shared.ts';

export {renderDocument} from './document.ts';

type Import<T> = () => Promise<T>;

/** A module and the loader in its `.server.ts`, as the server entry hands them over. */
export interface ServerModule<T> {
  page: Import<{default: T}>;
  server?: Import<{load?: Load<unknown>}>;
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
   * The app shell, `index.html`, for a request's URL: the dev server
   * transforms it per request, the build once.
   */
  shell: (url: string) => string | Promise<string>;
}

/**
 * An Elysia plugin with a `GET` route for each page: it runs the page's
 * `load` and its layouts', then streams the shell with the page rendered
 * into it, or, for the client router, answers with the data alone.
 */
export const pages = ({routes, shell}: PagesOptions) => {
  const app = new Elysia({name: '@oddsquad/lit-elysia/pages'});
  for (const route of routes) {
    app.get(route.path, async (context) => {
      const loaded = await loadAll(route, context as unknown as LoadContext);
      if (loaded instanceof Response) return loaded;
      const payload: Payload = {route: route.path, ...loaded};
      const {request} = context;
      return request.headers.get(DATA_HEADER) === 'data'
        ? dataResponse(payload)
        : documentResponse(
            await viewOf(route),
            payload,
            await shell(pathOf(request))
          );
    });
  }
  return app;
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
    [route, ...route.layouts].map((module) => loadData(module, context))
  );
  const response = [data, ...layouts].find(
    (value) => value instanceof Response
  );
  return (response as Response | undefined) ?? {data, layouts};
};

const loadData = async (
  module: ServerModule<unknown>,
  context: LoadContext
) => {
  const load = module.server && (await module.server()).load;
  return load ? load(context) : undefined;
};

/** One URL answers with HTML or data, so caches have to tell them apart. */
const VARY = {vary: DATA_HEADER};

const dataResponse = (payload: PageData) =>
  new Response(encode(payload), {
    headers: {
      ...VARY,
      [DATA_HEADER]: 'data',
      'content-type': 'application/json',
    },
  });

const documentResponse = (view: View, payload: Payload, shell: string) =>
  new Response(
    renderDocument({
      shell,
      template: compose(view, payload),
      title: titleOf(view, payload),
      payload,
    }),
    {headers: {...VARY, 'content-type': 'text/html; charset=utf-8'}}
  );

const pathOf = (request: Request) => {
  const url = new URL(request.url);
  return url.pathname + url.search;
};
