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
import {decode} from '../src/serialize.ts';

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
  const script = /id="lit-elysia-data">(.*?)<\/script>/s.exec(html)![1]!;
  expect(decode(script)).toMatchObject({route: '/notes/:id', data: {id: 2}});
});

test("a load's Response is sent in place of the page", async () => {
  expect((await fetch(`${origin}/notes/99`)).status).toBe(404);
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

test('the router asks a page for its data alone', async () => {
  const response = await fetch(`${origin}/notes/2`, {
    headers: {'x-lit-elysia': 'data'},
  });
  expect(response.headers.get('vary')).toContain('x-lit-elysia');
  const data = decode<{route: string; title: string; data: {createdAt: Date}}>(
    await response.text()
  );
  expect(data).toMatchObject({route: '/notes/:id', title: 'Lit'});
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

test('anything the router cannot render is a full load', async () => {
  await page.goto(`${origin}/`);
  await page.locator('note-counter button').waitFor();
  await mark(page);
  await page.getByRole('link', {name: "A note that isn't there"}).click();
  await expect.poll(() => page.textContent('body')).toContain('No such note');
  expect(await marked(page)).toBe(false);

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
    plugins: [litElysia({lit: false})],
  });
  await builder.buildApp();
  const entry = pathToFileURL(path.join(root, 'dist/server/entry.js')).href;
  const {default: app} = (await import(entry)) as {
    default: {handle: (url: string) => Promise<Response>};
  };
  const html = await (await app.handle('/')).text();
  expect(html).toContain('<title>Notes</title>');
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  expect(script).toBeDefined();
  const asset = await app.handle(script!);
  expect(asset.status).toBe(200);
  expect(asset.headers.get('cache-control')).toContain('immutable');
  expect((await app.handle('/notes/99')).status).toBe(404);
});
