import {html} from 'lit';
import {expect, test} from 'vite-plus/test';
import {routePath, scanRoutes} from '../src/routes.ts';
import {safePromises} from '../src/deferred.ts';
import {PageError} from '../src/page.ts';
import {createReader, records, roundTrip} from '../src/serialize.ts';
import {renderHead} from '../src/document.ts';
import {renderDocument} from '../src/server.ts';

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
