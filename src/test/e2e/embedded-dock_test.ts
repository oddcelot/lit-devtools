/**
 * `createLitDevtools()` hosted by a server that is not Vite, with the panel
 * docked in the page: the route a multi-page app takes.
 *
 * Worth an e2e: the dock's iframe, the in-page pick, the scroll space it
 * reserves and what survives a full page load only exist in a browser.
 *
 * The host is a bare `node:http` server feeding Fetch requests to the
 * handler, as Elysia, Hono or `Bun.serve` would. Needs `pnpm run build`
 * (the handler serves `dist/client` and `dist/standalone`).
 */

import {randomUUID} from 'node:crypto';
import {mkdir, rm, writeFile} from 'node:fs/promises';
import {createServer, type IncomingMessage, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import * as path from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {chromium, type Browser, type Page} from 'playwright-core';
import {build} from 'vite';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {createLitDevtools, type LitDevtools} from '../../lib/devframe/embed.js';

const PACKAGE_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

let browser: Browser;
let server: Server;
let devtools: LitDevtools;
let origin: string;
let workDir: string;
let previousHome: string | undefined;

/** A Node request as the Fetch `Request` a web-standard handler takes. */
const toRequest = (req: IncomingMessage, base: string): Request => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value))
      for (const v of value) headers.append(name, v);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(new URL(req.url ?? '/', base), {
    method: req.method,
    headers,
    ...(hasBody
      ? {body: Readable.toWeb(req) as ReadableStream, duplex: 'half'}
      : {}),
  } as RequestInit);
};

const page = (title: string, tag: string) => `<!doctype html>
<html><head><title>${title}</title>
<script src="${devtools.script}"></script>
<script src="/app.js"></script>
</head><body>
<nav><a href="/">one</a> <a href="/two">two</a></nav>
<${tag}></${tag}>
<div style="height: 150vh"></div>
<p id="last">the end</p>
</body></html>`;

beforeAll(async () => {
  workDir = path.join(
    PACKAGE_ROOT,
    '.e2e-tmp',
    `embedded-${randomUUID().slice(0, 8)}`
  );
  await mkdir(workDir, {recursive: true});
  // devframe keeps per-user settings under $HOME, read on each call.
  previousHome = process.env['HOME'];
  process.env['HOME'] = workDir;

  const entry = path.join(workDir, 'app.js');
  await writeFile(
    entry,
    `import {LitElement, html} from 'lit';
class PageOne extends LitElement { render() { return html\`page one\`; } }
class PageTwo extends LitElement { render() { return html\`page two\`; } }
customElements.define('page-one', PageOne);
customElements.define('page-two', PageTwo);
`
  );
  const built = (await build({
    root: workDir,
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {entry, formats: ['iife'], name: 'app', fileName: () => 'app.js'},
    },
  })) as unknown as Array<{output: Array<{code: string}>}>;
  const appJs = built[0].output[0].code;

  // The page is on 127.0.0.1, and the browser dials the side-car WebSocket on
  // the page's hostname.
  devtools = createLitDevtools({auth: false, host: '127.0.0.1'});
  server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://x').pathname;
    if (pathname.startsWith(devtools.base)) {
      void devtools.handler(toRequest(req, origin)).then((response) => {
        res.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body === null) res.end();
        else Readable.fromWeb(response.body as never).pipe(res);
      });
      return;
    }
    if (pathname === '/app.js') {
      res.setHeader('content-type', 'text/javascript');
      res.end(appJs);
      return;
    }
    res.setHeader('content-type', 'text/html');
    res.end(
      pathname === '/two' ? page('two', 'page-two') : page('one', 'page-one')
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const executablePath = process.env['HMR_E2E_EXECUTABLE'];
  browser = await chromium.launch({
    ...(executablePath !== undefined && executablePath !== ''
      ? {executablePath}
      : {channel: 'chrome'}),
    headless: process.env['HMR_E2E_HEADED'] === undefined,
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await devtools?.close();
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve()
  );
  server?.closeAllConnections();
  if (previousHome === undefined) delete process.env['HOME'];
  else process.env['HOME'] = previousHome;
  await rm(workDir, {recursive: true, force: true});
});

const dock = (app: Page) => app.locator('[data-lit-devtools-dock]');
const panel = (app: Page) =>
  app.frameLocator('[data-lit-devtools-dock] >> iframe');

let app: Page;

test('the dock opens the panel in the page, on the page’s components', async () => {
  app = await browser.newPage({viewport: {width: 1100, height: 800}});
  const errors: string[] = [];
  app.on('pageerror', (error) => errors.push(error.message));
  await app.goto(origin);

  // Closed, it is a button and no panel.
  await dock(app).locator('button.toggle').waitFor();
  expect(await app.locator('iframe').count()).toBe(0);

  await dock(app).locator('button.toggle').click();
  await panel(app)
    .getByText('<page-one>', {exact: true})
    .waitFor({timeout: 15_000});
  expect(errors).toEqual([]);
}, 60_000);

test('open, it leaves room to scroll the page’s end above it', async () => {
  await app.locator('#last').scrollIntoViewIfNeeded();
  const last = (await app.locator('#last').boundingBox())!;
  const drawer = (await dock(app).locator('.drawer').boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(drawer.y);
  await app.evaluate(() => scrollTo(0, 0));
}, 30_000);

test('a pick on the page selects in the dock, with no new tab', async () => {
  let popups = 0;
  app.on('popup', () => popups++);
  await panel(app).locator('components-view lit-icon-button.pick').click();
  await expect
    .poll(() =>
      app.evaluate(() =>
        [...document.head.querySelectorAll('style')].some((s) =>
          s.textContent?.includes('crosshair')
        )
      )
    )
    .toBe(true);
  const box = (await app.locator('page-one').boundingBox())!;
  await app.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await app.waitForTimeout(150);
  await app.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await panel(app)
    .locator('components-view .row.selected')
    .getByText('page-one')
    .waitFor({timeout: 15_000});
  expect(popups).toBe(0);
}, 60_000);

test('after a page load the dock reopens on the tab it was on', async () => {
  await panel(app).getByText('Timeline', {exact: true}).click();
  await expect
    .poll(() =>
      dock(app)
        .locator('iframe')
        .evaluate(
          (frame: HTMLIFrameElement) => frame.contentWindow!.location.hash
        )
    )
    .toContain('tab=timeline');

  await app.locator('nav a[href="/two"]').click();
  await app.waitForURL(`${origin}/two`);

  expect(await dock(app).getAttribute('open')).not.toBeNull();
  expect(
    await dock(app)
      .locator('iframe')
      .evaluate((frame: HTMLIFrameElement) => new URL(frame.src).hash)
  ).toBe('#tab=timeline');

  // The new page's components, not the old one's.
  await panel(app).getByText('Components', {exact: true}).click();
  await panel(app)
    .getByText('<page-two>', {exact: true})
    .waitFor({timeout: 15_000});
  expect(await panel(app).getByText('<page-one>', {exact: true}).count()).toBe(
    0
  );
}, 60_000);

test('four docked tabs all load: the RPC holds no HTTP connection open', async () => {
  // Over SSE, each docked tab held two streams, and Chrome allows six HTTP/1.1
  // connections per host: the fourth tab never loaded.
  const context = await browser.newContext({
    viewport: {width: 900, height: 700},
  });
  try {
    for (let n = 0; n < 4; n++) {
      const tab = await context.newPage();
      await tab.goto(origin, {timeout: 10_000});
      if (n === 0) await dock(tab).locator('button.toggle').click();
      await panel(tab)
        .getByText('<page-one>', {exact: true})
        .waitFor({timeout: 10_000});
    }
  } finally {
    await context.close();
  }
}, 90_000);
