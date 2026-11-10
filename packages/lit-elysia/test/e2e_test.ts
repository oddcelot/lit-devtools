/**
 * The Elysia framework package, on a copy of its demo: the dev server renders
 * and hydrates the pages and keeps state through an edit, and the build
 * serves the same pages from its server entry.
 */

import {randomUUID} from 'node:crypto';
import {cp, readFile, rm, writeFile} from 'node:fs/promises';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {createBuilder, createServer, type ViteDevServer} from 'vite';
import {chromium, type Browser, type Page} from 'playwright-core';
import {litElysia} from '../src/index.ts';
import {createReader} from '../src/serialize.ts';

const DEMO_DIR = fileURLToPath(new URL('../demo', import.meta.url));

let root: string;
let server: ViteDevServer;
let origin: string;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  // Inside the demo, so its bare imports resolve from its node_modules.
  root = path.join(DEMO_DIR, '.e2e-tmp', randomUUID().slice(0, 8));
  for (const entry of ['index.html', 'src']) {
    await cp(path.join(DEMO_DIR, entry), path.join(root, entry), {
      recursive: true,
    });
  }
  server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    cacheDir: path.join(root, '.vite'),
    server: {port: 0, host: '127.0.0.1'},
    plugins: [litElysia()],
  });
  await server.listen();
  const address = server.httpServer!.address() as {port: number};
  origin = `http://127.0.0.1:${address.port}`;

  const executablePath = process.env['HMR_E2E_EXECUTABLE'];
  browser = await chromium.launch({
    ...(executablePath ? {executablePath} : {channel: 'chrome'}),
    headless: process.env['HMR_E2E_HEADED'] === undefined,
  });
  page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  // The first load can still be optimizing deps; start from a settled one.
  await page.goto(`${origin}/`);
  await server.waitForRequestsIdle();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
  if (root) await rm(root, {recursive: true, force: true});
});

test('a page is rendered on the server with its data', async () => {
  const response = await fetch(`${origin}/notes/2`);
  expect(response.headers.get('content-type')).toContain('text/html');
  const html = await response.text();
  expect(html).toContain('<title>Lit</title>');
  expect(html).toContain('<template shadowroot="open" shadowrootmode="open">');
  const record = /id="lit-elysia-data">[^<]*?\.push\((.*?)\)<\/script>/s.exec(
    html
  )![1]!;
  expect(createReader().read(record)).toMatchObject({
    route: '/notes/:id',
    data: {id: 2},
  });
});

test('the dev server writes the route list that types links', async () => {
  const types = await readFile(path.join(root, 'src/routes.gen.d.ts'), 'utf8');
  expect(types).toContain('interface Register');
  expect(types).toContain("| '/notes/:id'");
  expect(types).toContain("| '/files/*'");
  expect(types).not.toContain('#404');
});

test('errors answer with the error pages, through the layouts', async () => {
  const missing = await fetch(`${origin}/notes/99`, {
    headers: {accept: 'text/html'},
  });
  expect(missing.status).toBe(404);
  const html = await missing.text();
  expect(html).toContain('<title>Not found</title>');
  expect(html).toContain('No such note');
  expect(html).toContain('id="note-count"');

  const broken = await fetch(`${origin}/broken`, {
    headers: {accept: 'text/html'},
  });
  expect(broken.status).toBe(500);
  const text = await broken.text();
  expect(text).toContain('<title>Error 500</title>');
  // What went wrong stays on the server.
  expect(text).not.toContain('on fire');

  const nowhere = await fetch(`${origin}/nowhere`, {
    headers: {accept: 'text/html'},
  });
  expect(nowhere.status).toBe(404);
  expect(await nowhere.text()).toContain('<title>Not found</title>');
  // Clients that don't ask for a page get a plain 404.
  const api = await fetch(`${origin}/api/nowhere`);
  expect(api.status).toBe(404);
  expect(await api.text()).toBe('Not Found');
});

test("the user's Elysia app keeps its routes and validation", async () => {
  const notes = (await (
    await fetch(`${origin}/api/notes`)
  ).json()) as unknown[];
  expect(notes.length).toBeGreaterThan(0);
  const invalid = await fetch(`${origin}/api/notes`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({title: 1}),
  });
  expect(invalid.status).toBe(422);
});

test('the page hydrates, and an edit keeps the state', async () => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      warnings.push(message.text());
    }
  });
  // Hydrating with a string where the server had a Date would throw here.
  page.on('pageerror', (error) => warnings.push(error.message));
  await page.goto(`${origin}/notes/1`);
  expect(await page.locator('time').textContent()).toBe('2026-11-01');
  const button = page.locator('note-counter button');
  await button.click();
  await button.click();
  await expect.poll(() => button.textContent()).toContain('Liked 2 times');
  // Hydrated, not rendered a second time.
  expect(await button.count()).toBe(1);

  const file = path.join(root, 'src/components/note-counter.ts');
  const code = await readFile(file, 'utf8');
  await writeFile(file, code.replace('Liked ${', 'Loved ${'));
  await expect.poll(() => button.textContent()).toContain('Loved 2 times');
  expect(warnings.filter((text) => !text.includes('dev mode'))).toEqual([]);
});

test('an edited page renders again in place, and its elements keep their state', async () => {
  await page.goto(`${origin}/`);
  const button = page.locator('note-counter button');
  await button.click();
  await button.click();
  await expect.poll(() => button.textContent()).toContain('2 times');
  await page.evaluate(() => ((window as {mark?: boolean}).mark = true));

  const file = path.join(root, 'src/routes/index.ts');
  const code = await readFile(file, 'utf8');
  await writeFile(
    file,
    code
      .replace('<h1>Notes</h1>', '<h1>All notes</h1>')
      .replace("title: () => 'Notes'", "title: () => 'All notes'")
  );
  await expect.poll(() => page.locator('h1').textContent()).toBe('All notes');
  expect(await page.title()).toBe('All notes');
  // No reload, and the counter in the page kept its count.
  expect(await page.evaluate(() => (window as {mark?: boolean}).mark)).toBe(
    true
  );
  expect(await button.textContent()).toContain('2 times');
  await writeFile(file, code);
  await expect.poll(() => page.locator('h1').textContent()).toBe('Notes');
});

test('the router asks a page for its data alone', async () => {
  const response = await fetch(`${origin}/notes/2`, {
    headers: {'x-lit-elysia': 'data'},
  });
  expect(response.headers.get('vary')).toContain('x-lit-elysia');
  expect(response.headers.get('content-type')).toBe('application/x-ndjson');
  const [first] = (await response.text()).split('\n');
  const data = createReader().read<{
    route: string;
    data: {createdAt: Date};
    layouts: unknown[];
  }>(first!);
  expect(data.route).toBe('/notes/:id');
  // Each layout's data, outermost first; the notes layout has no loader.
  expect(data.layouts).toEqual([
    {count: expect.any(Number), path: '/notes/2'},
    undefined,
  ]);
  expect(data.data.createdAt).toBeInstanceOf(Date);
});

/** Marks the document, to tell a rendered page from a loaded one. */
const mark = (page: Page) =>
  page.evaluate(() => ((window as {mark?: boolean}).mark = true));
const marked = (page: Page) =>
  page.evaluate(() => (window as {mark?: boolean}).mark === true);

test('after hydrating, the router renders pages without loading them', async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter button').waitFor();
  await mark(page);

  await page.getByRole('link', {name: 'Lit'}).click();
  await expect.poll(() => page.locator('h1').textContent()).toBe('Lit');
  // A Date in the data, which plain JSON would have turned into a string.
  expect(await page.locator('time').textContent()).toBe('2026-11-02');
  expect(page.url()).toBe(`${origin}/notes/2`);
  expect(await page.title()).toBe('Lit');

  await page.goBack();
  await expect.poll(() => page.locator('h1').textContent()).toBe('Notes');
  expect(await page.title()).toBe('Notes');

  // A redirect from `load` lands on its target, still without a load.
  await page.getByRole('link', {name: 'Newest note'}).click();
  await expect.poll(() => page.url()).toMatch(/\/notes\/\d+$/);
  await expect.poll(() => page.locator('h1').count()).toBe(1);
  expect(await marked(page)).toBe(true);
});

test('layouts nest, load their own data, and stay mounted', async () => {
  await page.goto(`${origin}/`);
  expect(await page.locator('#note-count').textContent()).toMatch(
    /^\d+ notes$/
  );
  const layout = page.locator('layout-clicks button');
  await layout.click();
  await layout.click();
  await expect.poll(() => layout.textContent()).toContain('Layout clicks: 2');

  await page.getByRole('link', {name: 'Lit'}).click();
  await expect
    .poll(() => page.locator('article.note h1').textContent())
    .toBe('Lit');
  // The root layout's element is the same one, count and all.
  expect(await layout.textContent()).toContain('Layout clicks: 2');
  await page.goBack();
  await expect.poll(() => page.locator('h1').textContent()).toBe('Notes');
  expect(await page.locator('article.note').count()).toBe(0);
  expect(await layout.textContent()).toContain('Layout clicks: 2');
});

/** The page's head tags: name or rel, and value, in document order. */
const headTags = (page: Page) =>
  page.evaluate(() =>
    Array.from(
      document.head.querySelectorAll(
        'meta[name="description"], meta[name="theme-color"], link[rel="canonical"]'
      )
    ).map(
      (el) =>
        `${el.getAttribute('name') ?? el.getAttribute('rel')}=${el.getAttribute('content') ?? el.getAttribute('href')}`
    )
  );

test("pages and layouts set head tags, and the router swaps the page's", async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter button').waitFor();
  expect(await headTags(page)).toEqual([
    'theme-color=#324fff',
    expect.stringMatching(/^description=\d+ notes$/),
  ]);
  await page.getByRole('link', {name: 'Lit'}).click();
  await expect.poll(() => page.title()).toBe('Lit');
  expect(await headTags(page)).toEqual([
    'theme-color=#324fff',
    'description=The pages: rendered on the server, hydrated.',
    'canonical=/notes/2',
  ]);
  await page.goBack();
  await expect.poll(() => page.title()).toBe('Notes');
  expect(await headTags(page)).toHaveLength(2);
});

test('an edited layout renders again in place', async () => {
  await page.goto(`${origin}/`);
  const layout = page.locator('layout-clicks button');
  await layout.click();
  await expect.poll(() => layout.textContent()).toContain('Layout clicks: 1');
  const file = path.join(root, 'src/routes/_layout.ts');
  const code = await readFile(file, 'utf8');
  await writeFile(
    file,
    code.replace('${count} notes', '${count} notes in all')
  );
  await expect
    .poll(() => page.locator('#note-count').textContent())
    .toMatch(/notes in all$/);
  expect(await layout.textContent()).toContain('Layout clicks: 1');
  await writeFile(file, code);
  await expect
    .poll(() => page.locator('#note-count').textContent())
    .toMatch(/notes$/);
});

test('the router renders error pages in place, and Back still works', async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter button').waitFor();
  await mark(page);
  await page.getByRole('link', {name: "A note that isn't there"}).click();
  await expect.poll(() => page.title()).toBe('Not found');
  expect(await page.locator('#error-message').textContent()).toBe(
    'No such note'
  );
  await page.goBack();
  await expect.poll(() => page.locator('h1').textContent()).toBe('Notes');
  await page.getByRole('link', {name: 'A page that fails'}).click();
  await expect.poll(() => page.title()).toBe('Error 500');
  expect(await marked(page)).toBe(true);
});

test('a form posts to its action without JavaScript', async () => {
  const invalid = await fetch(`${origin}/`, {
    method: 'POST',
    headers: {accept: 'text/html'},
    body: new URLSearchParams({title: ' ', body: 'kept'}),
  });
  expect(invalid.status).toBe(400);
  const html = await invalid.text();
  expect(html).toContain('A note needs a title.');
  expect(html).toMatch(/name="body"[^>]*value="kept"/);

  const created = await fetch(`${origin}/`, {
    method: 'POST',
    body: new URLSearchParams({title: 'Posted', body: 'plain'}),
    redirect: 'manual',
  });
  expect(created.status).toBe(303);
  expect(created.headers.get('location')).toMatch(/^\/notes\/\d+$/);

  const unnamed = await fetch(`${origin}/?/nope`, {
    method: 'POST',
    headers: {accept: 'text/html'},
    body: new URLSearchParams({}),
  });
  expect(unnamed.status).toBe(405);
});

test('after hydrating, the router posts forms and renders the answer', async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter button').waitFor();
  await mark(page);
  const counter = page.locator('note-counter button');
  await counter.click();

  await page.getByLabel('Text').fill('kept too');
  await page.getByRole('button', {name: 'Add'}).click();
  await expect
    .poll(() => page.locator('#form-error').textContent())
    .toBe('A note needs a title.');
  // The same page, re-rendered in place: same address, same counter.
  expect(page.url()).toBe(`${origin}/`);
  expect(await counter.textContent()).toContain('1 times');
  expect(await page.getByLabel('Text').inputValue()).toBe('kept too');

  await page.getByLabel('Title').fill('Routed');
  await page.getByRole('button', {name: 'Add'}).click();
  await expect.poll(() => page.locator('h1').textContent()).toBe('Routed');
  expect(page.url()).toMatch(/\/notes\/\d+$/);
  expect(await marked(page)).toBe(true);
  await page.goBack();
  await expect.poll(() => page.locator('h1').textContent()).toBe('Notes');
  expect(await page.getByRole('link', {name: 'Routed'}).count()).toBe(1);
});

test('the page is marked busy while the router waits on the server', async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter button').waitFor();
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as {seen?: string[]}).seen = seen;
    for (const type of ['lit-elysia:navigating', 'lit-elysia:navigated']) {
      addEventListener(type, () =>
        seen.push(
          `${type}:${document.documentElement.hasAttribute('data-navigating')}`
        )
      );
    }
  });
  await page.getByRole('link', {name: 'A slow note'}).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.hasAttribute('data-navigating')
      )
    )
    .toBe(true);
  expect(await page.locator('html').getAttribute('aria-busy')).toBe('true');
  // Not on the outlet, which Pico and Blades restyle: that reflowed the page.
  expect(
    await page.locator('#lit-elysia').getAttribute('aria-busy')
  ).toBeNull();
  expect(
    await page
      .locator('#lit-elysia')
      .evaluate((el) => getComputedStyle(el).whiteSpace)
  ).toBe('normal');
  await expect.poll(() => page.locator('h1').textContent()).toBe('Elysia');
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.hasAttribute('data-navigating')
      )
    )
    .toBe(false);
  expect(await page.locator('html').getAttribute('aria-busy')).toBeNull();
  // One wait for the whole navigation, fetch and modules together.
  expect(await page.evaluate(() => (window as {seen?: string[]}).seen)).toEqual(
    ['lit-elysia:navigating:true', 'lit-elysia:navigated:false']
  );
});

/** Follows a sidebar entry, as the router does after hydrating. */
const follow = async (label: string) => {
  await page
    .locator('aside')
    .getByRole('link', {name: label, exact: true})
    .click();
};

const current = () =>
  page.locator('aside a[aria-current="page"]').allTextContents();

test('the sidebar marks the page on screen as the router moves', async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter button').waitFor();
  await mark(page);
  expect(await current()).toEqual(['All notes']);
  await follow('Two params');
  await expect.poll(current).toEqual(['Two params']);
  await follow('A note');
  // The full-load link to the same address isn't marked.
  await expect.poll(current).toEqual(['A note']);
  expect(await marked(page)).toBe(true);
});

test('params, a catch-all and a query string reach the page', async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter button').waitFor();
  await follow('Two params');
  await expect.poll(() => page.locator('#param-a').textContent()).toBe('red');
  expect(await page.locator('#param-b').textContent()).toBe('round');
  await page.getByRole('link', {name: 'swap them'}).click();
  await expect.poll(() => page.locator('#param-a').textContent()).toBe('round');

  await follow('Catch-all');
  await expect
    .poll(() => page.locator('#segments li').allTextContents())
    .toEqual(['docs', 'guide', 'routing.md']);

  await follow('Query string');
  await expect.poll(() => page.title()).toBe('Search: the');
  await mark(page);
  // A GET form is a navigation like a link's.
  await page.getByRole('searchbox').fill('elysia');
  await page.getByRole('button', {name: 'Search'}).click();
  await expect.poll(() => page.url()).toBe(`${origin}/search?q=elysia`);
  await expect
    .poll(() => page.locator('#result-count').textContent())
    .toBe('1 notes match');
  expect(await marked(page)).toBe(true);
});

test('a nested layout keeps its elements across its pages, and reloads its data', async () => {
  await page.goto(`${origin}/nested`);
  const counter = page.locator('note-counter button');
  await counter.click();
  await counter.click();
  const firstLoad = await page.locator('#loaded-at').textContent();
  await page
    .getByRole('navigation', {name: 'Section tabs'})
    .getByRole('link', {name: 'Second tab'})
    .click();
  await expect
    .poll(() => page.locator('main h1').textContent())
    .toBe('Second tab');
  expect(await counter.textContent()).toContain('2 times');
  await expect
    .poll(() => page.locator('#loaded-at').textContent())
    .not.toBe(firstLoad);
  // Leaving the section and coming back starts it over.
  await follow('All notes');
  await expect.poll(() => page.locator('main h1').textContent()).toBe('Notes');
  await follow('Nested layout');
  await expect
    .poll(() => page.locator('main h1').textContent())
    .toBe('First tab');
  expect(
    await page.locator('article.section note-counter button').textContent()
  ).toContain('0 times');
});

test('named actions run the one their form names', async () => {
  await page.goto(`${origin}/actions`);
  await page.locator('#server-count').waitFor();
  const before = Number(await page.locator('#server-count').textContent());
  await page.getByRole('button', {name: 'Add one'}).click();
  await expect
    .poll(() => page.locator('#action-result').textContent())
    .toBe('Added one.');
  expect(Number(await page.locator('#server-count').textContent())).toBe(
    before + 1
  );
  expect(page.url()).toBe(`${origin}/actions`);
  await page.getByRole('button', {name: 'Reset'}).click();
  await expect
    .poll(() => page.locator('#server-count').textContent())
    .toBe('0');
  await page.getByRole('button', {name: 'Reset'}).click();
  await expect
    .poll(() => page.locator('#action-result').textContent())
    .toBe('Already at zero.');
});

test('a hash link lands on its heading, and other sites are left to the browser', async () => {
  await page.goto(`${origin}/actions`);
  await page.locator('#server-count').waitFor();
  await follow('Add a note');
  await expect.poll(() => page.url()).toBe(`${origin}/#add`);
  await expect.poll(() => page.locator('#add').isVisible()).toBe(true);
  const external = page.locator('aside a[rel="external"]');
  expect(await external.getAttribute('href')).toBe('https://elysiajs.com');
});

test('deferred data streams into the document after the page', async () => {
  const started = Date.now();
  const response = await fetch(`${origin}/deferred`, {
    headers: {accept: 'text/html'},
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let html = '';
  let pageAt = 0;
  for (
    let chunk = await reader.read();
    !chunk.done;
    chunk = await reader.read()
  ) {
    html += decoder.decode(chunk.value, {stream: true});
    if (!pageAt && html.includes('id="lit-elysia-data"'))
      pageAt = Date.now() - started;
  }
  const doneAt = Date.now() - started;
  // The page, placeholders and all, comes long before its slowest value.
  expect(html).toContain('Counting notes…');
  expect(pageAt).toBeLessThan(1000);
  expect(doneAt).toBeGreaterThanOrEqual(1900);
  expect(html.match(/__litElysia\|\|=\[\]\)\.push/g)).toHaveLength(4);
  expect(html.indexOf('</body>')).toBeGreaterThan(html.lastIndexOf('.push('));
  // What failed stays on the server.
  expect(html).not.toContain('on fire');
});

test('a streaming page hydrates before its deferred data arrives', async () => {
  await page.goto(`${origin}/deferred`, {waitUntil: 'commit'});
  const counter = page.locator('note-counter button');
  await counter.click();
  await expect.poll(() => counter.textContent()).toContain('1 times');
  // Clicked and counted while the slow values were still on their way.
  expect(await page.locator('#tags [aria-busy="true"]').count()).toBe(1);
  await expect
    .poll(() => page.locator('#broken [role="alert"]').textContent())
    .toBe('Something went wrong');
  await expect
    .poll(() => page.locator('#count p').textContent())
    .toMatch(/notes, counted at/);
  await expect
    .poll(() => page.locator('#tags li').allTextContents(), {timeout: 5000})
    .toEqual(['Elysia', 'Lit', 'seroval']);
  expect(await counter.textContent()).toContain('1 times');
});

test('the router renders a page at once, and its deferred data as it streams', async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter button').waitFor();
  await mark(page);
  const started = Date.now();
  await follow('Deferred data');
  await expect
    .poll(() => page.locator('main h1').textContent())
    .toBe('Deferred data');
  expect(Date.now() - started).toBeLessThan(1000);
  expect(await page.locator('#count [aria-busy="true"]').count()).toBe(1);
  await expect
    .poll(() => page.locator('#tags li').allTextContents(), {timeout: 5000})
    .toEqual(['Elysia', 'Lit', 'seroval']);
  expect(await page.locator('#broken [role="alert"]').textContent()).toBe(
    'Something went wrong'
  );
  expect(await marked(page)).toBe(true);
});

test('a load sets headers on the document and on the data', async () => {
  const document = await fetch(`${origin}/cached`, {
    headers: {accept: 'text/html'},
  });
  expect(document.headers.get('cache-control')).toBe('private, max-age=10');
  const data = await fetch(`${origin}/cached`, {
    headers: {'x-lit-elysia': 'data'},
  });
  expect(data.headers.get('cache-control')).toBe('private, max-age=10');
  const [first] = (await data.text()).split('\n');
  expect(createReader().read<{depends: string[]}>(first!).depends).toEqual([
    'clock',
  ]);
});

const loadedAt = () => page.locator('#loaded-at').textContent();

test('the router reuses cached data, and invalidate loads it again in place', async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter button').waitFor();
  await follow('Cached for 10 seconds');
  await expect
    .poll(() => page.locator('main h1').textContent())
    .toBe('Cached for 10 seconds');
  const first = await loadedAt();
  await follow('All notes');
  await expect.poll(() => page.locator('main h1').textContent()).toBe('Notes');
  await follow('Cached for 10 seconds');
  await expect
    .poll(() => page.locator('main h1').textContent())
    .toBe('Cached for 10 seconds');
  // The browser had it: the same response, not a new render.
  expect(await loadedAt()).toBe(first);

  await mark(page);
  const counter = page.locator('note-counter button');
  await counter.click();
  await page.locator('#revalidate').click();
  await expect.poll(loadedAt).not.toBe(first);
  // In place: same document, same address, same counter.
  expect(await marked(page)).toBe(true);
  expect(page.url()).toBe(`${origin}/cached`);
  expect(await counter.textContent()).toContain('1 times');
});

test('after a form action, cached pages load fresh', async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter button').waitFor();
  await follow('Cached for 10 seconds');
  await expect
    .poll(() => page.locator('main h1').textContent())
    .toBe('Cached for 10 seconds');
  const first = await loadedAt();
  const notes = Number(await page.locator('#cached-notes').textContent());
  await follow('All notes');
  await page.getByLabel('Title').fill('Fresh');
  await page.getByRole('button', {name: 'Add'}).click();
  await expect.poll(() => page.locator('main h1').textContent()).toBe('Fresh');
  await follow('Cached for 10 seconds');
  await expect
    .poll(() => page.locator('#cached-notes').textContent())
    .toBe(String(notes + 1));
  expect(await loadedAt()).not.toBe(first);
});

test('a data-reload link is a full load', async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter button').waitFor();
  await mark(page);
  await page.getByRole('link', {name: 'First note, as a full load'}).click();
  await expect.poll(() => page.locator('h1').textContent()).toBe('Elysia');
  expect(await marked(page)).toBe(false);
});

test('the build serves the same pages from its server entry', async () => {
  const builder = await createBuilder({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [litElysia()],
  });
  await builder.buildApp();
  const entry = pathToFileURL(path.join(root, 'dist/server/entry.js')).href;
  const {default: app} = (await import(entry)) as {
    default: {handle: (url: string | Request) => Promise<Response>};
  };
  const html = await (await app.handle('/')).text();
  expect(html).toContain('<title>Notes</title>');
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  expect(script).toBeDefined();
  const asset = await app.handle(script!);
  expect(asset.status).toBe(200);
  expect(asset.headers.get('cache-control')).toContain('immutable');
  const missing = await app.handle(
    new Request('http://localhost/notes/99', {headers: {accept: 'text/html'}})
  );
  expect(missing.status).toBe(404);
  expect(await missing.text()).toContain('<title>Not found</title>');
});
