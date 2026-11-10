import {html} from 'lit';
import {expect, test} from 'vite-plus/test';
import {routePath, scanRoutes} from '../src/routes.ts';
import {decode, encode} from '../src/serialize.ts';
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

test('the scan pairs each page with its .server.ts', async () => {
  const routes = await scanRoutes(DEMO_ROUTES);
  expect(
    routes.map((route) => ({
      path: route.path,
      page: route.page.slice(DEMO_ROUTES.length),
      server: route.server?.slice(DEMO_ROUTES.length),
    }))
  ).toEqual([
    {path: '/', page: '/index.ts', server: '/index.server.ts'},
    {path: '/latest', page: '/latest.ts', server: '/latest.server.ts'},
    {
      path: '/notes/:id',
      page: '/notes/[id].ts',
      server: '/notes/[id].server.ts',
    },
  ]);
});

test('a missing routes directory has no pages', async () => {
  expect(await scanRoutes(`${DEMO_ROUTES}/nowhere`)).toEqual([]);
});

test('the document fills the shell and carries the data', async () => {
  const stream = renderDocument({
    shell:
      '<html><head><!--lit-elysia:head--></head><body><!--lit-elysia:body--><footer></footer></body></html>',
    page: {
      title: (data) => `<${String(data)}>`,
      render: (data) => html`<p>${String(data)}</p>`,
    },
    payload: {route: '/', data: '</script>'},
  });
  const text = await new Response(stream).text();
  expect(text).toContain('<title>&#60;&#60;/script&#62;&#62;</title>');
  expect(text).toMatch(/<div id="lit-elysia"><!--lit-part [^>]+--><p>/);
  // The data can't close its own script element.
  const script =
    /<script type="application\/json" id="lit-elysia-data">(.*?)<\/script><footer>/s.exec(
      text
    );
  expect(script).not.toBeNull();
  expect(decode(script![1]!)).toEqual({route: '/', data: '</script>'});
});

test('page data keeps the types JSON loses', () => {
  const shared = {name: 'shared'};
  const data = {
    when: new Date('2026-11-10T12:00:00Z'),
    tags: new Set(['a', 'b']),
    counts: new Map([['a', 1n]]),
    missing: undefined,
    first: shared,
    second: shared,
  };
  const back = decode<typeof data>(encode(data));
  expect(back.when).toBeInstanceOf(Date);
  expect(back.when.toISOString()).toBe('2026-11-10T12:00:00.000Z');
  expect(back.tags).toEqual(new Set(['a', 'b']));
  expect(back.counts.get('a')).toBe(1n);
  expect('missing' in back).toBe(true);
  expect(back.second).toBe(back.first);
  expect(encode('</script><!--')).not.toContain('<');
});
