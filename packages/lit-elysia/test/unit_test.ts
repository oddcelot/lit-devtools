import {html} from 'lit';
import {expect, test} from 'vite-plus/test';
import {routePath, scanRoutes} from '../src/routes.ts';
import {safePromises} from '../src/deferred.ts';
import {matchRoute} from '../src/site.ts';
import {api} from '../src/eden.ts';
import {PageError, definePage, defineLayout} from '../src/page.ts';
import {createReader, records, roundTrip} from '../src/serialize.ts';
import {renderHead} from '../src/document.ts';
import {action, href, route} from '../src/links.ts';
import {sendResponse, toRequest} from '../src/node.ts';
import {pages, renderDocument} from '../src/server.ts';
import {createServer, request as httpRequest} from 'node:http';

const DEMO_ROUTES = decodeURIComponent(
  new URL('../demo/src/routes', import.meta.url).pathname
);

test('a page file names its Elysia path', () => {
  expect(routePath('index.ts')).toBe('/');
  expect(routePath('about.ts')).toBe('/about');
  expect(routePath('notes/index.ts')).toBe('/notes');
  expect(routePath('notes/[id].ts')).toBe('/notes/:id');
  expect(routePath('files/[...rest].ts')).toBe('/files/*');
});

const ROOT = {page: '/_layout.ts', server: '/_layout.server.ts'};

test('the scan pairs each page with its loader and its layouts', async () => {
  const {pages: routes} = await scanRoutes(DEMO_ROUTES);
  expect(
    routes.map((route) => ({
      path: route.path,
      page: route.page.slice(DEMO_ROUTES.length),
      server: route.server?.slice(DEMO_ROUTES.length),
      layouts: route.layouts.map((layout) => ({
        page: layout.page.slice(DEMO_ROUTES.length),
        server: layout.server?.slice(DEMO_ROUTES.length),
      })),
    }))
  ).toEqual(
    expect.arrayContaining([
      {
        path: '/',
        page: '/index.ts',
        server: '/index.server.ts',
        layouts: [ROOT],
      },
      {
        path: '/notes/:id',
        page: '/notes/[id].ts',
        server: '/notes/[id].server.ts',
        // Outermost first; the inner one has no loader.
        layouts: [ROOT, {page: '/notes/_layout.ts', server: undefined}],
      },
      {
        path: '/params/:a/:b',
        page: '/params/[a]/[b].ts',
        server: '/params/[a]/[b].server.ts',
        layouts: [ROOT],
      },
      {
        path: '/files/*',
        page: '/files/[...path].ts',
        server: '/files/[...path].server.ts',
        layouts: [ROOT],
      },
      {
        path: '/nested',
        page: '/nested/index.ts',
        server: undefined,
        layouts: [
          ROOT,
          {page: '/nested/_layout.ts', server: '/nested/_layout.server.ts'},
        ],
      },
    ])
  );
  // Files starting with `_` are never pages.
  expect(routes.some((route) => route.page.includes('/_'))).toBe(false);
});

test('the error pages answer no path and load nothing of their own', async () => {
  const {errors} = await scanRoutes(DEMO_ROUTES);
  expect(
    errors
      .map((route) => ({
        path: route.path,
        page: route.page.slice(DEMO_ROUTES.length),
        server: route.server,
        layouts: route.layouts.length,
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
  ).toEqual([
    {path: '#404', page: '/_404.ts', server: undefined, layouts: 1},
    {path: '#error', page: '/_error.ts', server: undefined, layouts: 1},
  ]);
});

test('a missing routes directory has no pages', async () => {
  expect(await scanRoutes(`${DEMO_ROUTES}/nowhere`)).toEqual({
    pages: [],
    errors: [],
  });
});

test('the document fills the shell and carries the data', async () => {
  const stream = renderDocument({
    shell:
      '<html><head><!--lit-elysia:head--></head><body><!--lit-elysia:body--><footer></footer></body></html>',
    template: html`<p>${'</script>'}</p>`,
    title: '<</script>>',
    head: '<meta name="description" content="x">',
    payload: {route: '/', data: '</script>', layouts: []},
  });
  const text = await new Response(stream).text();
  expect(text).toContain(
    '<title>&#60;&#60;/script&#62;&#62;</title><!--lit-elysia-head--><meta name="description" content="x"><!--/lit-elysia-head-->'
  );
  expect(text).toMatch(/<div id="lit-elysia"><!--lit-part [^>]+--><p>/);
  // Queued right after the page; the data can't close its own script.
  const script =
    /<script id="lit-elysia-data">\(self\.__litElysia\|\|=\[\]\)\.push\((.*?)\)<\/script><footer>/s.exec(
      text
    );
  expect(script).not.toBeNull();
  expect(createReader().read(script![1]!)).toEqual({
    route: '/',
    data: '</script>',
    layouts: [],
  });
});

test('deferred data streams after the page, before </body>', async () => {
  let resolve!: (value: string) => void;
  const later = new Promise<string>((r) => (resolve = r));
  const stream = renderDocument({
    shell: '<html><body><!--lit-elysia:body--><footer></footer></body></html>',
    template: html`<p>now</p>`,
    title: undefined,
    head: '',
    payload: {route: '/', data: {now: 1, later}, layouts: []},
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  // Everything up to the data's first record goes out before it settles.
  while (!text.includes('<footer></footer>')) {
    text += decoder.decode((await reader.read()).value);
  }
  expect(text).toContain('<p>now</p>');
  expect(text).not.toContain('</body>');
  resolve('settled');
  for (
    let chunk = await reader.read();
    !chunk.done;
    chunk = await reader.read()
  ) {
    text += decoder.decode(chunk.value);
  }
  const queued = [...text.matchAll(/\.push\((.*?)\)<\/script>/gs)].map(
    (m) => m[1]!
  );
  expect(queued).toHaveLength(2);
  expect(text.indexOf(queued[1]!)).toBeLessThan(text.indexOf('</body>'));
  const read = createReader();
  const payload = read.read<{data: {later: Promise<string>}}>(queued[0]!);
  read.read(queued[1]!);
  expect(await payload.data.later).toBe('settled');
});

test('page data keeps the types JSON loses, promises included', async () => {
  const shared = {name: 'shared'};
  const data = {
    when: new Date('2026-11-10T12:00:00Z'),
    tags: new Set(['a', 'b']),
    counts: new Map([['a', 1n]]),
    missing: undefined,
    first: shared,
    second: shared,
    later: Promise.resolve(new Date(0)),
  };
  const back = await roundTrip<typeof data>(data);
  expect(back.when).toBeInstanceOf(Date);
  expect(back.when.toISOString()).toBe('2026-11-10T12:00:00.000Z');
  expect(back.tags).toEqual(new Set(['a', 'b']));
  expect(back.counts.get('a')).toBe(1n);
  expect('missing' in back).toBe(true);
  expect(back.second).toBe(back.first);
  expect((await back.later).getTime()).toBe(0);
  for await (const record of records('</script><!--')) {
    expect(record).not.toContain('<');
  }
});

test('a deferred rejection sends a safe message and no stack', async () => {
  const shared = {name: 'shared'};
  const wrapped = safePromises({
    first: shared,
    second: shared,
    plain: [1, {deep: true}],
    missing: Promise.reject(new PageError(404, 'No comments')),
    broken: Promise.reject(new Error('password=hunter2')),
  });
  // Objects without promises stay themselves, shared ones too.
  expect(wrapped.second).toBe(wrapped.first);
  const sent: string[] = [];
  for await (const record of records(wrapped)) sent.push(record);
  expect(sent.join('')).not.toContain('hunter2');
  expect(sent.join('')).not.toContain('stack');
  const read = createReader();
  const back = read.read<typeof wrapped>(sent[0]!);
  for (const record of sent.slice(1)) read.read(record);
  await expect(back.missing).rejects.toThrow('No comments');
  await expect(back.broken).rejects.toThrow('Something went wrong');
});

test("head tags render without Lit's markers", async () => {
  const head = await renderHead([
    html`<meta name="theme-color" content="#fff" />`,
    html`<meta name="description" content=${'a "quoted" <note>'} />`,
  ]);
  expect(head).toBe(
    '<meta name="theme-color" content="#fff" /><meta name="description" content="a &quot;quoted&quot; &lt;note&gt;" />'
  );
});

test('href fills in and encodes params, query and hash', () => {
  // Without the generated route list, any path type-checks: the unit tests
  // exercise the runtime alone.
  expect(href('/notes/:id', {id: 2})).toBe('/notes/2');
  expect(href('/params/:a/:b', {a: 'x y', b: 'a/b'})).toBe(
    '/params/x%20y/a%2Fb'
  );
  expect(href('/files/*', {'*': 'docs/a b.md'})).toBe('/files/docs/a%20b.md');
  expect(
    href('/search', {}, {query: {q: 'lit & elysia', page: 2, none: undefined}})
  ).toBe('/search?q=lit+%26+elysia&page=2');
  expect(href('/', {}, {hash: 'add'})).toBe('/#add');
  // @ts-expect-error: the type check catches a missing param first.
  expect(() => href('/notes/:id', {})).toThrow('no value for :id');
});

test('action builds the URL a form posts to, by the action name', () => {
  expect(action('/actions', 'increment')).toBe('/actions?/increment');
  expect(action('/', 'default')).toBe('/');
  expect(
    action('/notes/:id', 'default' as never, {id: 2}, {query: {from: 'list'}})
  ).toBe('/notes/2?from=list');
  expect(
    action('/actions', 'reset', {}, {query: {from: 'list'}, hash: 'result'})
  ).toBe('/actions?/reset&from=list#result');
  // @ts-expect-error: the page's actions have no such name.
  expect(action('/actions', 'nope')).toBe('/actions?/nope');
});

test("a load typed for another route's params fails loudly", async () => {
  const shell = () => '<html><body><!--lit-elysia:body--></body></html>';
  const page = () => Promise.resolve({default: {render: () => html``}});
  const app = pages({
    shell,
    routes: [
      {
        path: '/notes/:id',
        page,
        server: () =>
          Promise.resolve({
            load: route('/params/:a/:b').load(({params}) => params),
          }),
        layouts: [],
      },
    ],
  });
  const errors: unknown[] = [];
  const log = console.error;
  console.error = (error: unknown) => errors.push(error);
  try {
    const response = await app.handle(new Request('http://localhost/notes/1'));
    expect(response.status).toBe(500);
  } finally {
    console.error = log;
  }
  expect(String(errors[0])).toContain(
    "'/params/:a/:b' is named in the page that answers /notes/:id"
  );
});

/** The first error a request to `app` logs. */
const loggedError = async (
  app: ReturnType<typeof pages>,
  url: string
): Promise<string> => {
  const errors: unknown[] = [];
  const log = console.error;
  console.error = (error: unknown) => errors.push(error);
  try {
    const response = await app.handle(new Request(url));
    expect(response.status).toBe(500);
  } finally {
    console.error = log;
  }
  return String(errors[0]);
};

test('a page or layout defined for another path fails loudly', async () => {
  const shell = () => '<html><body><!--lit-elysia:body--></body></html>';
  const notePage = definePage('/params/:a/:b', {render: () => html``});
  // A module's own page type is narrower than what the routes take.
  const page = () => Promise.resolve({default: notePage as never});
  expect(
    await loggedError(
      pages({shell, routes: [{path: '/notes/:id', page, layouts: []}]}),
      'http://localhost/notes/1'
    )
  ).toContain("'/params/:a/:b' is named in the page that answers /notes/:id");

  const layout = defineLayout('/nested', {render: (content) => content});
  const layoutModule = () => Promise.resolve({default: layout as never});
  const plain = () => Promise.resolve({default: {render: () => html``}});
  expect(
    await loggedError(
      pages({
        shell,
        routes: [
          {
            path: '/notes/:id',
            page: plain,
            layouts: [{path: '/notes', page: layoutModule}],
          },
        ],
      }),
      'http://localhost/notes/1'
    )
  ).toContain("'/nested' is named in the layout of /notes");
});

test('headers a failed load set stay off its error page', async () => {
  const page = () =>
    Promise.resolve({default: {render: () => html`<p>page</p>`}});
  const app = pages({
    shell: () => '<html><body><!--lit-elysia:body--></body></html>',
    routes: [
      {
        path: '/fine',
        page,
        server: () =>
          Promise.resolve({
            load: ({
              setHeaders,
              depends,
            }: {
              setHeaders: (h: Record<string, string>) => void;
              depends: (k: string) => void;
            }) => {
              setHeaders({'Cache-Control': 'max-age=60'});
              depends('things');
              return {};
            },
          }),
        layouts: [],
      },
      {
        path: '/fails',
        page,
        server: () =>
          Promise.resolve({
            load: ({
              setHeaders,
            }: {
              setHeaders: (h: Record<string, string>) => void;
            }) => {
              setHeaders({'cache-control': 'max-age=60'});
              throw new PageError(404, 'Gone');
            },
          }),
        layouts: [],
      },
    ],
    errors: [{path: '#404', page, layouts: []}],
  });
  const fine = await app.handle(new Request('http://localhost/fine'));
  expect(fine.headers.get('cache-control')).toBe('max-age=60');
  const failed = await app.handle(new Request('http://localhost/fails'));
  expect(failed.status).toBe(404);
  expect(failed.headers.get('cache-control')).toBeNull();
});

test('the Eden client says so when used on the server', () => {
  // Importing it is free; touching it outside a browser explains itself.
  expect(() => (api as unknown as Record<string, unknown>)['api']).toThrow(
    "api is the browser's client"
  );
});

test('the client picks the route the server would for a path', () => {
  const site = {
    files: {},
    routes: Object.fromEntries(
      [
        '/',
        '/notes/new',
        '/notes/:id',
        '/files/*',
        '/files/readme',
        '#404',
      ].map((route) => [route, {page: '', layouts: []}])
    ),
  };
  expect(matchRoute(site, '/')).toBe('/');
  expect(matchRoute(site, '/notes/2')).toBe('/notes/:id');
  // Static segments win over params, and over a catch-all.
  expect(matchRoute(site, '/notes/new')).toBe('/notes/new');
  expect(matchRoute(site, '/files/readme')).toBe('/files/readme');
  expect(matchRoute(site, '/files/a/b')).toBe('/files/*');
  expect(matchRoute(site, '/notes/2/edit')).toBeUndefined();
  expect(matchRoute(site, '/nowhere')).toBeUndefined();
});

test('a nonce goes on every tag CSP checks, and nowhere else', async () => {
  const stream = renderDocument({
    shell:
      '<html><head><script src="/a.js"></script><!--lit-elysia:head--></head><body><!--lit-elysia:body--></body></html>',
    template: html`<p>${'<script>alert(1)</script>'}</p>
      <style>
        p {
          color: red;
        }
      </style>`,
    title: 't',
    head: '<link rel="canonical" href="/">',
    preload: '<link rel="modulepreload" href="/b.js">',
    nonce: 'abc',
    payload: {route: '/', data: '<script>', layouts: []},
  });
  const text = await new Response(stream).text();
  const tags = [...text.matchAll(/<(script|style|link)\b[^>]*>/g)].map(
    (m) => m[0]
  );
  // The shell's script, the preload, the head link, the style, the data.
  expect(tags.length).toBe(5);
  for (const tag of tags) expect(tag).toContain('nonce="abc"');
  expect(text).toContain('<meta property="csp-nonce" nonce="abc">');
  // Text that only mentions a script stays text.
  expect(text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('the Node bridge aborts a request whose client left, and stops its body', async () => {
  let signal: AbortSignal | undefined;
  let cancelled = false;
  const server = createServer((req, res) => {
    const request = toRequest(req, 'http://localhost', res);
    signal = request.signal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('first'));
      },
      cancel() {
        cancelled = true;
      },
    });
    void sendResponse(res, new Response(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address() as {port: number};
  try {
    await new Promise<void>((resolve) => {
      const client = httpRequest(
        {port, host: '127.0.0.1', path: '/'},
        (res) => {
          // The first chunk is in: the client hangs up mid-stream.
          res.once('data', () => {
            client.destroy();
            resolve();
          });
        }
      );
      client.on('error', () => undefined);
      client.end();
    });
    await expect.poll(() => signal?.aborted).toBe(true);
    await expect.poll(() => cancelled).toBe(true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
