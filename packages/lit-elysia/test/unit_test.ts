import {html} from 'lit';
import {expect, test} from 'vite-plus/test';
import {routePath, scanRoutes} from '../src/routes.ts';
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
  expect(text).toContain(
    '<script type="application/json" id="lit-elysia-data">{"route":"/","data":"\\u003c/script>"}</script><footer>'
  );
});
