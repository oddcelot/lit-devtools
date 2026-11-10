import {html} from 'lit';
import {expect, test} from 'vite-plus/test';
import {routePath, scanRoutes} from '../src/routes.ts';
import {safePromises} from '../src/deferred.ts';
import {PageError} from '../src/page.ts';
import {createReader, records, roundTrip} from '../src/serialize.ts';
import {renderHead} from '../src/document.ts';
import {href, route} from '../src/links.ts';
import {pages, renderDocument} from '../src/server.ts';

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
    "route('/params/:a/:b') is used in the page that answers /notes/:id"
  );
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
