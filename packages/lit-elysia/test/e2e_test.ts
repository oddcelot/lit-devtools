/**
 * The Elysia framework package, on a copy of its demo: the dev server renders
 * and hydrates the pages and keeps state through an edit, and the build
 * serves the same pages from its server entry.
 */

import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {cp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer as createNetServer} from 'node:net';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {afterAll, afterEach, beforeAll, expect, test} from 'vite-plus/test';
import {createBuilder, createServer, type ViteDevServer} from 'vite';
import {chromium, type Browser, type Page} from 'playwright-core';
import {litElysia} from '../src/index.ts';
import {serve} from '../src/node.ts';
import {createReader} from '../src/serialize.ts';

/**
 * Strict, as a deployment would want it: no 'unsafe-inline' for scripts or
 * style elements, so every one a page carries needs the nonce. Style
 * attributes, which Web Awesome's templates use, are allowed. The whole
 * suite runs under it, and a test fails on any violation (see afterEach).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'nonce-{nonce}'",
  "style-src 'self' 'nonce-{nonce}'",
  // Web Awesome's templates use style attributes, which no nonce covers.
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  // Web Awesome loads its built-in icons from data: URLs.
  "connect-src 'self' data: ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

/** Every CSP violation the pages report, until the test that saw it ends. */
const violations: string[] = [];

const DEMO_DIR = fileURLToPath(new URL('../demo', import.meta.url));

let root: string;
let server: ViteDevServer;
let origin: string;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  // Inside the demo, so its bare imports resolve from its node_modules.
  root = path.join(DEMO_DIR, '.e2e-tmp', randomUUID().slice(0, 8));
  for (const entry of ['index.html', 'public', 'src']) {
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
    plugins: [litElysia({csp: CSP})],
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
  await page.exposeFunction('reportViolation', (report: string) =>
    violations.push(report)
  );
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      (
        window as unknown as {reportViolation(report: string): void}
      ).reportViolation(
        `${event.effectiveDirective} ${event.blockedURI} ${event.sample} at ${event.sourceFile}:${event.lineNumber}`
      );
    });
  });
  // The first load can still be optimizing deps; start from a settled one.
  await page.goto(`${origin}/`);
  await server.waitForRequestsIdle();
});

/**
 * The Lit plugin's dev runtime (its HMR indicator, its injected tokens)
 * adds styles without the nonce yet, which is why the dev server sends the
 * policy report-only (bead vpl-a3h1). Everything else must comply.
 */
const pluginDevRuntime = /\/lib\/(runtime\/|token-text\.js)/;

afterEach(() => {
  const seen = violations
    .splice(0)
    .filter((report) => !pluginDevRuntime.test(report));
  expect(seen, 'Content-Security-Policy violations').toEqual([]);
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

test('the dev server writes the route list that types pages and links', async () => {
  const types = await readFile(path.join(root, 'src/routes.gen.d.ts'), 'utf8');
  expect(types).toContain('interface Register');
  expect(types).toContain(
    "'/notes/:id': ServerTypes<typeof import('./routes/notes/[id].server')>;"
  );
  expect(types).toContain("'/eden': ServerTypes<undefined>;");
  expect(types).toContain("'/files/*': ServerTypes<");
  // Layouts by their folders' paths.
  expect(types).toMatch(/layouts: \{[^}]*'\/nested': ServerTypes</);
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

  const missing = await fetch(`${origin}/api/notes/99`);
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({message: 'There is no note 99.'});
  const taken = await fetch(`${origin}/api/notes`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({title: 'elysia', body: 'again'}),
  });
  expect(taken.status).toBe(409);
  expect(await taken.json()).toMatchObject({existing: 1});
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
  const button = page.locator('note-counter wa-button');
  await button.click();
  await button.click();
  await expect.poll(() => button.textContent()).toContain('Liked 2 times');
  // Hydrated, not rendered a second time.
  expect(await button.count()).toBe(1);

  const file = path.join(root, 'src/components/note-counter.ts');
  const code = await readFile(file, 'utf8');
  await writeFile(file, code.replace('Liked ${', 'Loved ${'));
  await expect.poll(() => button.textContent()).toContain('Loved 2 times');
  // CSP reports are checked on their own, after each test.
  expect(
    warnings.filter(
      (text) =>
        !text.includes('dev mode') &&
        !text.includes('Content Security Policy') &&
        // Lit's dev-mode note on Web Awesome's wa-page and wa-drawer, which
        // set properties in their own updates: theirs, not ours.
        !text.includes('lit.dev/msg/change-in-update')
    )
  ).toEqual([]);
});

test('an edited page renders again in place, and its elements keep their state', async () => {
  await page.goto(`${origin}/`);
  const button = page.locator('note-counter wa-button');
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
    {
      count: expect.any(Number),
      path: '/notes/2',
      latency: 0,
      pendingMs: 150,
      pendingMinMs: 300,
    },
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
  await page.locator('note-counter wa-button').waitFor();
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
  const layout = page.locator('layout-clicks wa-button');
  await layout.click();
  await layout.click();
  await expect.poll(() => layout.textContent()).toContain('Layout clicks: 2');

  await page.getByRole('link', {name: 'Lit'}).click();
  await expect.poll(() => page.locator('.note h1').textContent()).toBe('Lit');
  // The root layout's element is the same one, count and all.
  expect(await layout.textContent()).toContain('Layout clicks: 2');
  await page.goBack();
  await expect.poll(() => page.locator('h1').textContent()).toBe('Notes');
  expect(await page.locator('.note').count()).toBe(0);
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
  await page.locator('note-counter wa-button').waitFor();
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
  const layout = page.locator('layout-clicks wa-button');
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
  await page.locator('note-counter wa-button').waitFor();
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
  await page.locator('note-counter wa-button').waitFor();
  await mark(page);
  const counter = page.locator('note-counter wa-button');
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
  await page.locator('note-counter wa-button').waitFor();
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
    .locator('#menu')
    .getByRole('link', {name: label, exact: true})
    .click();
};

const current = () =>
  page.locator('#menu a[aria-current="page"]').allTextContents();

test('the sidebar marks the page on screen as the router moves', async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter wa-button').waitFor();
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
  await page.locator('note-counter wa-button').waitFor();
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
  const counter = page.locator('note-counter wa-button');
  await counter.click();
  await counter.click();
  const firstLoad = await page.locator('#loaded-at').textContent();
  await page
    .getByRole('navigation', {name: 'Section tabs'})
    .getByRole('link', {name: 'Second tab'})
    .click();
  await expect
    .poll(() => page.locator('#content h1').textContent())
    .toBe('Second tab');
  expect(await counter.textContent()).toContain('2 times');
  await expect
    .poll(() => page.locator('#loaded-at').textContent())
    .not.toBe(firstLoad);
  // Leaving the section and coming back starts it over.
  await follow('All notes');
  await expect
    .poll(() => page.locator('#content h1').textContent())
    .toBe('Notes');
  await follow('Nested layout');
  await expect
    .poll(() => page.locator('#content h1').textContent())
    .toBe('First tab');
  expect(
    await page.locator('.section note-counter wa-button').textContent()
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
  // The page that answered the post is still the one the menu marks.
  expect(await current()).toEqual(['Named actions']);
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
  const external = page.locator('#menu a[rel="external"]');
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
  const counter = page.locator('note-counter wa-button');
  // Hydrated: the element has rendered on the client, listeners and all.
  await page.waitForFunction(
    () =>
      (document.querySelector('note-counter') as {hasUpdated?: boolean} | null)
        ?.hasUpdated === true
  );
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
  await page.locator('note-counter wa-button').waitFor();
  await mark(page);
  const started = Date.now();
  await follow('Deferred data');
  await expect
    .poll(() => page.locator('#content h1').textContent())
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
  await page.locator('note-counter wa-button').waitFor();
  await follow('Cached for 10 seconds');
  await expect
    .poll(() => page.locator('#content h1').textContent())
    .toBe('Cached for 10 seconds');
  const first = await loadedAt();
  await follow('All notes');
  await expect
    .poll(() => page.locator('#content h1').textContent())
    .toBe('Notes');
  await follow('Cached for 10 seconds');
  await expect
    .poll(() => page.locator('#content h1').textContent())
    .toBe('Cached for 10 seconds');
  // The browser had it: the same response, not a new render.
  expect(await loadedAt()).toBe(first);

  await mark(page);
  const counter = page.locator('note-counter wa-button');
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
  await page.locator('note-counter wa-button').waitFor();
  await follow('Cached for 10 seconds');
  await expect
    .poll(() => page.locator('#content h1').textContent())
    .toBe('Cached for 10 seconds');
  const first = await loadedAt();
  const notes = Number(await page.locator('#cached-notes').textContent());
  await follow('All notes');
  await page.getByLabel('Title').fill('Fresh');
  await page.getByRole('button', {name: 'Add'}).click();
  await expect
    .poll(() => page.locator('#content h1').textContent())
    .toBe('Fresh');
  await follow('Cached for 10 seconds');
  await expect
    .poll(() => page.locator('#cached-notes').textContent())
    .toBe(String(notes + 1));
  expect(await loadedAt()).not.toBe(first);
});

test("the context plugin's locals reach loads, and its guard runs first", async () => {
  // Without a name, the guard sends the private page to the form.
  const guarded = await fetch(`${origin}/private`, {
    headers: {accept: 'text/html'},
    redirect: 'manual',
  });
  expect(guarded.status).toBe(303);
  expect(guarded.headers.get('location')).toBe('/visitor?from=private');

  await page.context().clearCookies();
  await page.goto(`${origin}/`);
  await page.locator('note-counter wa-button').waitFor();
  await mark(page);
  await follow('A guarded page');
  await expect.poll(() => page.url()).toBe(`${origin}/visitor?from=private`);
  expect(await page.locator('#greeting').textContent()).toContain(
    'Hello, stranger. Welcome to Notes.'
  );

  // The action sets a cookie and redirects; the next load derives from it.
  await page.getByLabel('Name').fill('Ada');
  await page.getByRole('button', {name: 'Save'}).click();
  await expect.poll(() => page.url()).toBe(`${origin}/private`);
  expect(await page.locator('#private-greeting').textContent()).toContain(
    'like Ada'
  );
  await follow('Who you are');
  await expect
    .poll(() => page.locator('#greeting').textContent())
    .toContain('Hello, Ada.');
  expect(await marked(page)).toBe(true);
  await page.context().clearCookies();
});

test('components call the API through the typed Eden client', async () => {
  await page.goto(`${origin}/eden`);
  const component = page.locator('api-notes');
  await component.locator('#list').click();
  await expect
    .poll(() => component.locator('#api-titles li').count())
    .toBeGreaterThan(1);
  const before = await component.locator('#api-titles li').count();
  const count = Number(
    (await page.locator('#note-count').textContent())!.split(' ')[0]
  );
  await mark(page);
  await component.locator('#add').click();
  await expect
    .poll(() => component.locator('#api-titles li').count())
    .toBe(before + 1);
  // invalidate() loaded the page again in place: the layout's count too.
  await expect
    .poll(() => page.locator('#note-count').textContent())
    .toBe(`${count + 1} notes`);
  expect(await marked(page)).toBe(true);

  // The API's errors reach the component typed, by their status.
  await component.locator('#add-taken').click();
  await expect
    .poll(() => component.locator('wa-callout').textContent())
    .toBe('409: “Elysia” is taken. It is note 1.');
  await component.locator('#look-up').click();
  await expect
    .poll(() => component.locator('wa-callout').textContent())
    .toBe('404: There is no note 99.');
});

test('a generator route streams server-sent events to a component', async () => {
  await page.goto(`${origin}/live`);
  const feed = page.locator('note-feed');
  await expect
    .poll(() => feed.locator('#feed-state').textContent())
    .toBe('Listening');
  // A note added elsewhere, past the component, arrives through the feed.
  const added = await fetch(`${origin}/api/notes`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({title: 'Over the feed', body: 'sse'}),
  });
  expect(added.status).toBe(200);
  await expect
    .poll(() => feed.locator('#feed li').allTextContents())
    .toEqual(['Over the feed']);
  await feed.locator('#feed-add').click();
  await expect.poll(() => feed.locator('#feed li').count()).toBe(2);
});

test("a macro guards the API's routes, and Eden types its 401", async () => {
  await page.goto(`${origin}/whoami`);
  const who = page.locator('who-am-i');
  await who.locator('#ask').click();
  await expect
    .poll(() => who.locator('#answer').textContent())
    .toBe('401: Tell the site your name first.');
  await page
    .context()
    .addCookies([{name: 'visitor', value: 'Ada', url: origin}]);
  await who.locator('#ask').click();
  await expect
    .poll(() => who.locator('#answer').textContent())
    .toBe('The API knows you as Ada.');
  await page.context().clearCookies();
});

test('resting on a link prefetches its code, and its data inside data-prefetch', async () => {
  const seen: string[] = [];
  const listen = (request: import('playwright-core').Request) => {
    const url = new URL(request.url());
    if (request.headers()['x-lit-elysia'] === 'data')
      seen.push(`data ${url.pathname}`);
    else if (url.pathname.includes('/routes/'))
      seen.push(`code ${url.pathname}`);
  };
  const data = () => seen.filter((entry) => entry.startsWith('data'));
  const code = (route: string) => new RegExp(`^code .*/routes/${route}\\.ts$`);
  await page.goto(`${origin}/notes/1`);
  await page.locator('note-counter wa-button').waitFor();
  page.on('request', listen);
  try {
    // A link in the page, outside data-prefetch: its page's module, no data.
    await page
      .locator('#content')
      .getByRole('link', {name: '← All notes'})
      .hover();
    await expect
      .poll(() => seen)
      .toContainEqual(expect.stringMatching(code('index')));
    expect(data()).toEqual([]);

    // A sidebar entry, inside the menu's data-prefetch: its data too.
    const menu = page.locator('#menu');
    await menu.getByRole('link', {name: 'Eden client', exact: true}).hover();
    await expect.poll(() => seen).toContain('data /eden');
    expect(seen).toContainEqual(expect.stringMatching(code('eden')));

    // An entry that opts out: code only.
    seen.length = 0;
    await menu
      .getByRole('link', {name: 'A page that fails', exact: true})
      .hover();
    await expect
      .poll(() => seen)
      .toContainEqual(expect.stringMatching(code('broken')));
    await page.waitForTimeout(200);
    expect(data()).toEqual([]);

    // A rested-on note is fetched once: the click takes the prefetched data.
    await menu.getByRole('link', {name: 'All notes', exact: true}).click();
    await expect
      .poll(() => page.locator('#content h1').textContent())
      .toBe('Notes');
    seen.length = 0;
    const note = page
      .locator('#content')
      .getByRole('link', {name: 'Lit', exact: true});
    await note.hover();
    await expect.poll(() => seen).toContain('data /notes/2');
    await note.click();
    await expect
      .poll(() => page.locator('#content h1').textContent())
      .toBe('Lit');
    expect(seen.filter((entry) => entry === 'data /notes/2')).toHaveLength(1);
  } finally {
    page.off('request', listen);
  }
});

test('each document gets its own nonce, on every tag that needs one', async () => {
  const read = async () => {
    const response = await fetch(`${origin}/deferred`, {
      headers: {accept: 'text/html'},
    });
    // Report-only in dev, where the Lit plugin's tools need inline styles.
    const policy = response.headers.get('content-security-policy-report-only')!;
    return {policy, html: await response.text()};
  };
  const first = await read();
  const second = await read();
  const nonce = /'nonce-([^']+)'/.exec(first.policy)![1]!;
  expect(/'nonce-([^']+)'/.exec(second.policy)![1]).not.toBe(nonce);
  expect(first.policy).toBe(CSP.replaceAll('{nonce}', nonce));
  // Every script and style: the shell's, Vite's, the streamed data, and the
  // styles Lit writes into shadow roots.
  const tags = [...first.html.matchAll(/<(script|style)\b[^>]*>/g)].map(
    (match) => match[0]
  );
  expect(tags.length).toBeGreaterThan(4);
  for (const tag of tags) expect(tag).toContain(`nonce="${nonce}"`);
  expect(first.html).toContain(`<meta property="csp-nonce" nonce="${nonce}">`);
});

test('the latency controls slow every page request down on the server', async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter wa-button').waitFor();
  const choose = async (label: string) => {
    await page.locator('#latency wa-button', {hasText: label}).click();
    await expect
      .poll(() =>
        page.locator('#latency wa-button[variant="brand"]').textContent()
      )
      .toContain(label);
  };
  const timed = async (label: string, heading: string) => {
    const started = Date.now();
    await follow(label);
    await expect
      .poll(() => page.locator('#content h1').textContent())
      .toBe(heading);
    return Date.now() - started;
  };
  try {
    await choose('Fast 3G');
    expect(await timed('Two params', 'Two params')).toBeGreaterThanOrEqual(450);
    // A document as well as the router's fetches.
    const started = Date.now();
    await page.reload();
    await page.locator('#content h1').waitFor();
    expect(Date.now() - started).toBeGreaterThanOrEqual(450);
    await choose('Instant');
    expect(await timed('Catch-all', 'Catch-all')).toBeLessThan(450);
  } finally {
    await page.context().clearCookies();
  }
});

test('pendingMs and pendingMinMs decide when the page is marked busy, and how long', async () => {
  const set = (values: Record<string, number>) =>
    page.context().addCookies(
      Object.entries(values).map(([name, value]) => ({
        name,
        value: String(value),
        url: origin,
      }))
    );
  /** Loads the page fresh, then records each change of the busy state. */
  const watch = async () => {
    await page.goto(`${origin}/`);
    await page.waitForFunction(
      () =>
        (
          document.querySelector('sim-controls') as {
            hasUpdated?: boolean;
          } | null
        )?.hasUpdated
    );
    await page.evaluate(() => {
      const log: [number, boolean][] = [];
      (window as {busy?: typeof log}).busy = log;
      const started = performance.now();
      new MutationObserver(() =>
        log.push([
          Math.round(performance.now() - started),
          document.documentElement.hasAttribute('data-navigating'),
        ])
      ).observe(document.documentElement, {
        attributeFilter: ['data-navigating'],
      });
    });
  };
  const busy = () =>
    page.evaluate(() => (window as {busy?: [number, boolean][]}).busy!);
  try {
    // A 500 ms navigation under a 1000 ms pendingMs never counts as pending.
    await set({latency: 500, 'pending-ms': 1000, 'pending-min-ms': 0});
    await watch();
    await follow('Two params');
    await expect
      .poll(() => page.locator('#content h1').textContent())
      .toBe('Two params');
    await page.waitForTimeout(300);
    expect(await busy()).toEqual([]);

    // A quick one under pendingMs 0 shows at once, and for pendingMinMs.
    await set({latency: 0, 'pending-ms': 0, 'pending-min-ms': 1000});
    await watch();
    await follow('Catch-all');
    await expect.poll(busy, {timeout: 3000}).toHaveLength(2);
    const [[shown, on], [hidden, off]] = (await busy()) as [
      [number, boolean],
      [number, boolean],
    ];
    expect([on, off]).toEqual([true, false]);
    expect(hidden - shown).toBeGreaterThanOrEqual(950);

    // The sliders set the values, and keep them in a cookie.
    await page
      .locator('#pending-ms')
      .evaluate((slider: HTMLElement & {value: number}) => {
        slider.value = 2000;
        slider.dispatchEvent(
          new Event('input', {bubbles: true, composed: true})
        );
      });
    await expect
      .poll(() => page.locator('#pending-ms').getAttribute('label'))
      .toBe('pendingMs: 2000 ms');
    expect(await page.evaluate(() => document.cookie)).toContain(
      'pending-ms=2000'
    );
  } finally {
    await page.context().clearCookies();
  }
});

test('pages left before they arrive stop their work on the server', async () => {
  await page
    .context()
    .addCookies([{name: 'latency', value: '2000', url: origin}]);
  try {
    await page.goto(`${origin}/`);
    await page.locator('#menu a[aria-current="page"]').waitFor();
    await fetch(`${origin}/api/loads`, {method: 'DELETE'});
    // J four times, quicker than any page arrives: each one leaves the last.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('j');
      await page.waitForTimeout(150);
    }
    await expect.poll(() => page.title(), {timeout: 8000}).toMatch(/^Files/);
    // Long enough for the pages passed over to have loaded, had they run on.
    await page.waitForTimeout(2300);
    const ran = (await (await fetch(`${origin}/api/loads`)).json()) as string[];
    expect(ran).toEqual(['/files/docs/guide/routing.md']);
    await page.keyboard.press('k');
    await expect.poll(() => page.title(), {timeout: 8000}).toMatch(/^Params/);
  } finally {
    await page.context().clearCookies();
  }
});

test('the Simulate panel stays at the bottom of the menu, clear of its links', async () => {
  await page.setViewportSize({width: 1280, height: 600});
  try {
    await page.goto(`${origin}/`);
    await page.locator('sim-controls').waitFor();
    const top = async () =>
      (await page.locator('sim-controls').boundingBox())!.y;
    const before = await top();
    await page
      .locator('wa-page')
      .evaluate((wa) =>
        wa.shadowRoot!.querySelector('[part~="menu"]')!.scrollBy(0, 150)
      );
    expect(await top()).toBe(before);
    // A link near the end, focused, is scrolled into view above the panel.
    const link = page
      .locator('#menu')
      .getByRole('link', {name: 'Elysia (another site)'});
    await link.focus();
    await expect
      .poll(async () => {
        const box = (await link.boundingBox())!;
        return box.y + box.height <= (await top());
      })
      .toBe(true);
  } finally {
    await page.setViewportSize({width: 1280, height: 720});
  }
});

test('a data-reload link is a full load', async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter wa-button').waitFor();
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
    plugins: [litElysia({csp: CSP})],
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
  // The page's chunks are linked, so they load beside the client entry.
  const note = await (
    await app.handle(
      new Request('http://localhost/notes/1', {headers: {accept: 'text/html'}})
    )
  ).text();
  const preloads = [
    ...note.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)">/g),
  ].map((match) => match[1]!);
  expect(preloads.some((file) => /\/assets\/_id_-[\w-]+\.js$/.test(file))).toBe(
    true
  );
  for (const file of preloads)
    expect((await app.handle(file)).status).toBe(200);
  // The build's manifest is not served.
  expect((await app.handle('/.vite/manifest.json')).status).toBe(404);

  const missing = await app.handle(
    new Request('http://localhost/notes/99', {headers: {accept: 'text/html'}})
  );
  expect(missing.status).toBe(404);
  expect(await missing.text()).toContain('<title>Not found</title>');
});

test('the build runs under its policy, enforced, with nothing blocked', async () => {
  // Built by the test before; served over HTTP for a real browser.
  const entry = pathToFileURL(path.join(root, 'dist/server/entry.js')).href;
  const {default: app} = (await import(entry)) as {
    default: {fetch: (request: Request) => Promise<Response>};
  };
  const server = await serve((request) => app.fetch(request), {
    port: 0,
    host: '127.0.0.1',
  });
  const built = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
  try {
    const response = await fetch(`${built}/`, {headers: {accept: 'text/html'}});
    expect(response.headers.get('content-security-policy')).toMatch(
      /'nonce-[^']+'/
    );
    await page.goto(`${built}/deferred`);
    const counter = page.locator('note-counter wa-button');
    await counter.click();
    await expect.poll(() => counter.textContent()).toContain('1 times');
    await expect
      .poll(() => page.locator('#tags li').allTextContents(), {timeout: 5000})
      .toEqual(['Elysia', 'Lit', 'seroval']);
    await follow('Two params');
    await expect.poll(() => page.locator('#param-a').textContent()).toBe('red');
    // Production has no dev runtime: not a single violation is allowed.
    expect(violations.splice(0)).toEqual([]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

/** A port nothing listens on right now, from the OS. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const {port} = probe.address() as {port: number};
      probe.close(() => resolve(port));
    });
  });

test("the node adapter's start script serves the build on PORT", async () => {
  // Built by the build test above.
  const port = await freePort();
  const child = spawn(process.execPath, ['dist/server/index.js'], {
    cwd: root,
    env: {...process.env, PORT: String(port), HOST: '127.0.0.1'},
  });
  try {
    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => {
        if (String(chunk).includes('Listening on')) resolve();
      });
      child.once('exit', (code) => reject(new Error(`exited with ${code}`)));
    });
    const page = await fetch(`http://127.0.0.1:${port}/`, {
      headers: {accept: 'text/html'},
    });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>Notes</title>');
    expect((await fetch(`http://127.0.0.1:${port}/api/notes`)).status).toBe(
      200
    );
  } finally {
    child.kill();
  }
});

test('the cloudflare adapter builds one Worker module for Static Assets', async () => {
  const workerRoot = `${root}-worker`;
  await cp(path.join(root, 'src'), path.join(workerRoot, 'src'), {
    recursive: true,
  });
  await cp(path.join(root, 'index.html'), path.join(workerRoot, 'index.html'));
  await cp(path.join(root, 'public'), path.join(workerRoot, 'public'), {
    recursive: true,
  });
  try {
    const builder = await createBuilder({
      root: workerRoot,
      configFile: false,
      logLevel: 'silent',
      plugins: [litElysia({adapter: 'cloudflare'})],
    });
    await builder.buildApp();
    // One file, exporting only its handler, with nothing Node-only at load.
    expect(await readdir(path.join(workerRoot, 'dist/server'))).toEqual([
      'entry.js',
    ]);
    const worker = await readFile(
      path.join(workerRoot, 'dist/server/entry.js'),
      'utf8'
    );
    expect([...worker.matchAll(/^export .*$/gm)].map((m) => m[0])).toEqual([
      expect.stringMatching(/^export \{ \w+ as default \};?$/),
    ]);
    // Rolldown's Node shim, which a Worker can't run at load.
    expect(worker).not.toContain('createRequire(import.meta.url)');
    expect(worker).toContain('.compile()');
    // Static Assets serve dist/client, but not the shell or the manifest.
    expect(
      await readFile(path.join(workerRoot, 'dist/client/.assetsignore'), 'utf8')
    ).toBe('index.html\n.vite\n');
  } finally {
    await rm(workerRoot, {recursive: true, force: true});
  }
});
