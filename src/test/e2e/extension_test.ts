/**
 * The Chrome extension, loaded unpacked, injects the Lit runtime into a page
 * it was enabled for: in the page's own world, before the page's first
 * script, and through a `script-src 'self'` CSP that would refuse the
 * `<script>` tag `lit-devtools dev` relies on.
 *
 * Worth an e2e rather than a unit test: what can break is Chrome's side of
 * it -- dynamic content-script registration, `world: 'MAIN'` at
 * `document_start`, a classic-script bundle of the runtime, the port from the
 * relay reaching the background.
 *
 * Two things stand in for the user. The host permission the panel would
 * request on a click (a browser prompt automation cannot answer) is granted
 * by copying the build and listing the test origin under `host_permissions`;
 * everything after the grant runs as shipped. And the panel's runtime
 * messages and port are sent from an extension page the test opens, since
 * DevTools itself is not scriptable here: `devtools.html` is that page, whose
 * own script fails outside DevTools, which does not matter. The Lit tab
 * itself, `panel.html`, is opened the same way, in a tab, told which tab it
 * inspects by the `?tabId=` seam `panel.ts` keeps for this.
 *
 * Extensions need Playwright's Chromium (`channel: 'chromium'`, which also
 * runs them headless): Chrome-branded builds ignore `--load-extension`.
 *
 * Needs `pnpm run build:extension` (it loads `dist/extension`).
 */

import {createServer, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {build} from 'vite';
import {
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from 'playwright-core';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {fsp, joinPath, tmpRoot} from './utils.js';

// The extension page's `chrome`, as far as the callbacks below use it.
declare const chrome: {
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
    connect(info: {name: string}): {
      postMessage(message: unknown): void;
      onMessage: {addListener(callback: (message: unknown) => void): void};
      disconnect(): void;
    };
  };
  tabs: {query(info: {url: string}): Promise<Array<{id?: number}>>};
  storage: {local: {remove(key: string): Promise<void>}};
};

const DIST = decodeURIComponent(
  new URL('../../../dist/extension', import.meta.url).pathname
);

const CSP = "script-src 'self'";
// A site that allows one Trusted Types policy, the one its own Lit creates.
const TRUSTED_TYPES_CSP = `${CSP}; require-trusted-types-for 'script'; trusted-types lit-html`;

let workDir: string;
let server: Server;
let appOrigin: string;
/** Two other sites serving a manifest: the extension may read A, not B. */
const cdns: Server[] = [];
let cdnA: string;
let cdnB: string;
let context: BrowserContext;
let worker: Worker;
let extensionId: string;
let extensionPage: Page;

// Runs first in <head>, under the page's CSP like every page script: notes
// whether something had already replaced `customElements.define` and
// published the runtime's page channel by the time the page started.
const PROBE_JS = `window.__probe = {
  defineWrapped: !Function.prototype.toString
    .call(customElements.define)
    .includes('[native code]'),
  channel: Symbol.for('@oddsquad/vite-plugin-lit#page-channel') in globalThis,
};`;

const APP_SOURCE = `import {LitElement, html} from 'lit';
class ProbeHello extends LitElement {
  static properties = {greeting: {}};
  constructor() { super(); this.greeting = 'hello'; }
  render() { return html\`\${this.greeting}\`; }
}
customElements.define('probe-hello', ProbeHello);
`;

// The same kind of page with an external sourcemap: the extension maps the
// define call back to this file, line 5, and finds where mapped-hello
// renders its mapped-item by the template's text, on line 3.
const MAPPED_SOURCE = `import {LitElement, html} from 'lit';
class MappedHello extends LitElement {
  render() { return html\`mapped <mapped-item></mapped-item>\`; }
}
customElements.define('mapped-hello', MappedHello);
customElements.define('mapped-item', class extends LitElement {});
`;

const UNLINKED_MANIFEST = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'probe-hello.js',
      declarations: [
        {
          kind: 'class',
          name: 'ProbeHello',
          tagName: 'probe-hello',
          customElement: true,
          summary: 'Says hello from an unlinked manifest.',
        },
      ],
    },
  ],
};

const MAPPED_MANIFEST = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/mapped.js',
      declarations: [
        {
          kind: 'class',
          name: 'MappedHello',
          tagName: 'mapped-hello',
          customElement: true,
          summary: 'Found next to the bundle.',
        },
      ],
    },
  ],
};

const ROOT_MANIFEST = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'probe-hello.js',
      declarations: [
        {
          kind: 'class',
          name: 'ProbeHello',
          tagName: 'probe-hello',
          customElement: true,
          summary: 'Found at the site root.',
        },
      ],
    },
  ],
};

beforeAll(async () => {
  workDir = tmpRoot('extension');
  await fsp.mkdir(joinPath(workDir, 'src'), {recursive: true});

  const mappedEntry = joinPath(workDir, 'src', 'mapped.js');
  await fsp.writeFile(mappedEntry, MAPPED_SOURCE);
  const mapped = (await build({
    root: workDir,
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      sourcemap: true,
      lib: {
        entry: mappedEntry,
        formats: ['iife'],
        name: 'mapped',
        fileName: () => 'mapped.js',
      },
    },
  })) as unknown as Array<{
    output: Array<{fileName: string; code?: string; source?: string}>;
  }>;
  const mappedFiles = new Map(
    mapped[0].output.map((o) => [
      `/assets/${o.fileName}`,
      String(o.code ?? o.source),
    ])
  );

  const entry = joinPath(workDir, 'app.js');
  await fsp.writeFile(entry, APP_SOURCE);
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

  server = createServer((req, res) => {
    res.setHeader(
      'content-security-policy',
      req.url === '/trusted-types' ? TRUSTED_TYPES_CSP : CSP
    );
    if (req.url === '/plain') {
      res.setHeader('content-type', 'text/html');
      res.end(
        '<!doctype html><html><head></head><body><p>plain</p></body></html>'
      );
      return;
    }
    if (req.url === '/image.svg') {
      res.setHeader('content-type', 'image/svg+xml');
      res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect id="r" width="40" height="40" fill="red"/></svg>'
      );
      return;
    }
    // A manifest the page does not link; the user points the panel at it.
    if (req.url === '/assets/cem.json') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(UNLINKED_MANIFEST));
      return;
    }
    // At the root: a second manifest for the panel to find.
    if (req.url === '/custom-elements.json') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(ROOT_MANIFEST));
      return;
    }
    // Beside /assets/mapped.js, where the panel looks for one by itself.
    if (req.url === '/assets/custom-elements.json') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(MAPPED_MANIFEST));
      return;
    }
    if (req.url === '/probe.js' || req.url === '/app.js') {
      res.setHeader('content-type', 'text/javascript');
      res.end(req.url === '/probe.js' ? PROBE_JS : appJs);
      return;
    }
    const asset = mappedFiles.get(req.url ?? '');
    if (asset !== undefined) {
      res.setHeader('content-type', 'text/javascript');
      res.end(asset);
      return;
    }
    res.setHeader('content-type', 'text/html');
    if (req.url === '/linked-elsewhere') {
      res.end(`<!doctype html><html><head>
<link rel="custom-elements-manifest" href="${cdnB}/cem.json">
<script src="/probe.js"></script>
<script src="/app.js"></script>
</head><body><probe-hello></probe-hello></body></html>`);
      return;
    }
    if (req.url === '/linked') {
      res.end(`<!doctype html><html><head>
<link rel="custom-elements-manifest" href="/custom-elements.json">
<script src="/probe.js"></script>
<script src="/app.js"></script>
</head><body><probe-hello></probe-hello></body></html>`);
      return;
    }
    if (req.url === '/mapped') {
      res.end(`<!doctype html><html><head>
<script src="/assets/mapped.js"></script>
</head><body><mapped-hello></mapped-hello></body></html>`);
      return;
    }
    res.end(`<!doctype html><html><head>
<script src="/probe.js"></script>
<script>window.__inline = true;</script>
<script src="/app.js"></script>
</head><body><probe-hello></probe-hello></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  appOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // The build as shipped, plus the grant the user would click through.
  const extensionDir = joinPath(workDir, 'unpacked');
  await fsp.cp(DIST, extensionDir, {recursive: true});
  const manifestPath = joinPath(extensionDir, 'manifest.json');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  // Another site with a manifest, granted up front: Chrome's prompt for a
  // host can't be clicked in a test, and a granted host isn't asked about.
  const otherSite = async (summary: string): Promise<string> => {
    const cdn = createServer((req, res) => {
      if (req.url !== '/cem.json') {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          schemaVersion: '1.0.0',
          modules: [
            {
              kind: 'javascript-module',
              path: 'probe-hello.js',
              declarations: [
                {
                  kind: 'class',
                  name: 'ProbeHello',
                  tagName: 'probe-hello',
                  customElement: true,
                  summary,
                },
              ],
            },
          ],
        })
      );
    });
    await new Promise<void>((resolve) => cdn.listen(0, '127.0.0.1', resolve));
    cdns.push(cdn);
    return `http://127.0.0.1:${(cdn.address() as AddressInfo).port}`;
  };
  cdnA = await otherSite('Read from another site.');
  cdnB = await otherSite('Never read without access.');
  manifest.host_permissions = [`${appOrigin}/*`, `${cdnA}/*`];
  await fsp.writeFile(manifestPath, JSON.stringify(manifest));

  const executablePath = process.env['HMR_E2E_EXECUTABLE'];
  context = await chromium.launchPersistentContext(
    joinPath(workDir, 'profile'),
    {
      ...(executablePath !== undefined && executablePath !== ''
        ? {executablePath}
        : {channel: 'chromium'}),
      headless: process.env['HMR_E2E_HEADED'] === undefined,
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
      ],
    }
  );
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
  extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/devtools.html`);
}, 60_000);

afterAll(async () => {
  await Promise.all(
    cdns.map(
      (cdn) => new Promise<void>((resolve) => cdn.close(() => resolve()))
    )
  );
  await context?.close();
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve()
  );
  if (workDir !== undefined) {
    await fsp.rm(workDir, {recursive: true, force: true});
  }
});

/** Sends a registry message the way the panel does. */
const registry = (type: 'lit:enable' | 'lit:disable' | 'lit:status') =>
  extensionPage.evaluate(
    ([type, origin]) => chrome.runtime.sendMessage({type, origin}),
    [type, appOrigin] as const
  );

interface Probe {
  defineWrapped: boolean;
  channel: boolean;
}

const probe = (page: Page) =>
  page.evaluate(() => (window as unknown as {__probe: Probe}).__probe);

test('nothing is injected until the site is enabled', async () => {
  expect(await registry('lit:status')).toEqual({
    origin: appOrigin,
    enabled: false,
    permitted: true,
  });
  const page = await context.newPage();
  await page.goto(appOrigin);
  expect(await probe(page)).toEqual({defineWrapped: false, channel: false});
  await page.close();
});

test('once enabled, the runtime is in the page before its first script', async () => {
  expect(await registry('lit:enable')).toEqual({
    origin: appOrigin,
    enabled: true,
    permitted: true,
  });

  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(appOrigin);

  expect(await probe(page)).toEqual({defineWrapped: true, channel: true});
  // The CSP is in force: the page's own inline script was refused.
  expect(await page.evaluate(() => 'inline' in window)).toBe(false);
  // The page's Lit went through the wrapped define: its shared update
  // lifecycle carries the timeline's brand.
  expect(
    await page.evaluate(() => {
      const brand = Symbol.for('@oddsquad/vite-plugin-lit#timeline-lifecycle');
      const el = document.querySelector('probe-hello') as unknown as Record<
        string,
        unknown
      >;
      const performUpdate = el['performUpdate'] as Record<symbol, unknown>;
      return performUpdate[brand];
    })
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.close();
});

test("the runtime leaves a Trusted Types site's own Lit policy to it", async () => {
  await registry('lit:enable');
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    // The page's inline script is refused on purpose, as on every page here.
    if (msg.type() === 'error' && !msg.text().includes('inline script'))
      errors.push(msg.text());
  });
  await page.goto(`${appOrigin}/trusted-types`);
  expect(await probe(page)).toEqual({defineWrapped: true, channel: true});
  // The page's Lit created its policy and rendered through it.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector('probe-hello')?.shadowRoot?.textContent
      )
    )
    .toContain('hello');
  expect(errors).toEqual([]);
  await page.close();
});

test('the runtime adds only $lit to the globals of a page without Lit', async () => {
  await registry('lit:enable');
  const globalsAt = async (url: string) => {
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForTimeout(300);
    const names = await page.evaluate(() => Object.getOwnPropertyNames(window));
    const storage = await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    }));
    await page.close();
    return {names, storage};
  };
  // The same server under a host the extension may not touch.
  const plainOrigin = appOrigin.replace('127.0.0.1', 'localhost');
  const enabled = await globalsAt(`${appOrigin}/plain`);
  const plain = await globalsAt(`${plainOrigin}/plain`);
  // `$lit` is the console's selection; `litIssuedWarnings` is Lit's own
  // name, created early so its dev warnings reach the panel; the two
  // polyfill hooks are lit-html's, set so it reports its templates. None
  // takes the place of anything the page had.
  expect(enabled.names.filter((n) => !plain.names.includes(n)).sort()).toEqual([
    '$lit',
    'litHtmlPolyfillSupport',
    'litHtmlPolyfillSupportDevMode',
    'litIssuedWarnings',
  ]);
  expect(plain.names.filter((n) => !enabled.names.includes(n))).toEqual([]);
  // Nothing in the site's localStorage; sessionStorage holds the tab ids the
  // privacy page lists.
  expect(enabled.storage.local).toEqual([]);
  expect(enabled.storage.session.sort()).toEqual([
    '@oddsquad/vite-plugin-lit#tab-id',
    'devframe:in-page-channel:instance',
  ]);
});

test('an SVG document on an enabled site opens without errors', async () => {
  await registry('lit:enable');
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto(`${appOrigin}/image.svg`);
  await page.waitForLoadState('load');
  // Long enough for anything deferred to DOMContentLoaded or a first tick.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.localName)).toBe(
    'svg'
  );
  expect(errors).toEqual([]);
  await page.close();
});

test("the page's runtime reaches a panel through the relay, per document", async () => {
  const page = await context.newPage();
  await page.goto(appOrigin);
  type Message = {
    channel: string;
    data?: {connected?: boolean; pageId?: string};
  };
  // A panel opens after the page booted, as it usually does: the page has to
  // re-announce itself through MAIN world, window, relay and background.
  const openPanel = (name: string) =>
    extensionPage.evaluate(
      async ([origin, name]) => {
        const [tab] = await chrome.tabs.query({url: `${origin}/*`});
        const w = window as unknown as {
          panels: Record<string, {port: {disconnect(): void}; got: unknown[]}>;
        };
        w.panels ??= {};
        const port = chrome.runtime.connect({name: 'lit-panel'});
        const got: unknown[] = [];
        port.onMessage.addListener((message) => got.push(message));
        port.postMessage({tabId: tab.id});
        w.panels[name] = {port, got};
      },
      [appOrigin, name] as const
    );
  const closePanel = (name: string) =>
    extensionPage.evaluate((name) => {
      const w = window as unknown as {
        panels: Record<string, {port: {disconnect(): void}}>;
      };
      w.panels[name]?.port.disconnect();
    }, name);
  const received = (name: string, channel: string) =>
    extensionPage.evaluate(
      ([name, channel]) =>
        (
          window as unknown as {panels: Record<string, {got: Message[]}>}
        ).panels[name]!.got.filter((message) => message.channel === channel),
      [name, channel] as const
    );
  const statuses = (name: string) => received(name, 'lit-ext:page');
  const readies = (name: string) =>
    received(name, 'lit:timeline:runtime-ready');
  const connected = {channel: 'lit-ext:page', data: {connected: true}};

  await openPanel('first');
  await expect.poll(() => statuses('first')).toEqual([connected]);
  await expect
    .poll(async () => (await readies('first')).length)
    .toBeGreaterThan(0);
  const firstPageId = (await readies('first'))[0]?.data?.pageId;
  expect(firstPageId).toBeTypeOf('string');

  // DevTools closed and opened again on the same document. Its start-up
  // traffic is long gone, so only the re-announce can reach this panel.
  await closePanel('first');
  await openPanel('second');
  await expect
    .poll(async () => (await readies('second')).map((m) => m.data?.pageId))
    .toContain(firstPageId);

  // A reload is a new document with a new port and a new page id; the panel
  // keeps its own port.
  await page.reload();
  await expect
    .poll(async () => (await statuses('second')).at(-1))
    .toEqual(connected);
  expect((await statuses('second')).length).toBeGreaterThan(1);
  await expect
    .poll(async () => (await readies('second')).at(-1)?.data?.pageId)
    .not.toBe(firstPageId);

  await page.close();
  await expect
    .poll(async () => (await statuses('second')).at(-1))
    .toEqual({channel: 'lit-ext:page', data: {connected: false}});
});

test("the Lit tab shows the page's components, picks, and follows a reload", async () => {
  const page = await context.newPage();
  await page.goto(appOrigin);
  const tabId = await extensionPage.evaluate(
    async (origin) => (await chrome.tabs.query({url: `${origin}/*`}))[0]?.id,
    appOrigin
  );
  expect(tabId).toBeTypeOf('number');

  // The panel as DevTools would host it, in a tab of its own (see panel.ts
  // for the `tabId` seam). Anything it fails to load, or the extension's CSP
  // refuses, surfaces as a console error or a failed request.
  const panel = await context.newPage();
  const problems: string[] = [];
  panel.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  panel.on('pageerror', (error) => problems.push(error.message));
  panel.on('requestfailed', (request) =>
    problems.push(`${request.url()}: ${request.failure()?.errorText}`)
  );
  await panel.goto(
    `chrome-extension://${extensionId}/panel.html?tabId=${tabId}#tab=components`
  );
  const rows = panel.locator('components-view .row').filter({
    hasText: 'probe-hello',
  });
  await rows.first().waitFor({timeout: 15_000});
  await expect
    .poll(() => panel.locator('#page').textContent())
    .toContain('Lit runtime connected');

  // Pick: the panel's toggle reaches the page's picker through the port, and
  // the pick comes back the same way and selects the element.
  await panel.locator('components-view lit-button.pick').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.head.querySelectorAll('style')].some((s) =>
          s.textContent?.includes('crosshair')
        )
      )
    )
    .toBe(true);
  const box = (await page.locator('probe-hello').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // Past the picker's hover throttle.
  await page.waitForTimeout(150);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await panel
    .locator('components-view .row.selected')
    .filter({hasText: 'probe-hello'})
    .waitFor({timeout: 10_000});

  // A reload is a new document; the panel follows it. A second element added
  // to the new document shows up, so the tree is the new page's, live.
  await page.reload();
  await expect
    .poll(() => panel.locator('#page').textContent())
    .toContain('Lit runtime connected');
  await page.evaluate(() =>
    document.body.append(document.createElement('probe-hello'))
  );
  await expect.poll(() => rows.count(), {timeout: 15_000}).toBe(2);

  expect(problems).toEqual([]);
  await panel.close();
  await page.close();
}, 60_000);

test('the Lit tab leaves out what needs a dev server', async () => {
  const page = await context.newPage();
  await page.goto(appOrigin);
  const tabId = await extensionPage.evaluate(
    async (origin) => (await chrome.tabs.query({url: `${origin}/*`}))[0]?.id,
    appOrigin
  );
  const panel = await context.newPage();
  await panel.goto(
    `chrome-extension://${extensionId}/panel.html?tabId=${tabId}#tab=components`
  );
  await panel
    .locator('components-view .row')
    .filter({hasText: 'probe-hello'})
    .first()
    .click({timeout: 15_000});
  // Details shown, and no source link: no transform stamped one, and there
  // is no editor to open it in.
  await panel.locator('components-view .details h2').waitFor();
  expect(await panel.locator('components-view .src').count()).toBe(0);

  // And the footer says why nothing can open a location here, once the
  // manifest nudge, which goes first, is put away.
  const later = panel.locator('#manifest-nudge-later');
  if (await later.isVisible()) await later.click();
  await expect
    .poll(() => panel.locator('#editor-notice').isVisible())
    .toBe(true);
  expect(await panel.locator('#editor-notice-text').textContent()).toBe(
    'Nothing here can open a location: no dev server answered, and there is no Sources panel'
  );
  expect(await panel.locator('#editor-folder-offer').isVisible()).toBe(false);

  // No disk to write a snapshot to, so no button that could only fail.
  await panel.locator('timeline-view lit-button.record').waitFor({
    state: 'attached',
  });
  expect(await panel.locator('timeline-view lit-button.export').count()).toBe(
    0
  );

  // The Settings tab says why the plugin settings are missing.
  await panel.locator('lit-tabs').getByText('Settings').click();
  await expect
    .poll(async () =>
      (await panel.locator('devtools-settings .empty').textContent())?.trim()
    )
    .toBe(
      'Plugin settings need the Vite plugin; this page is inspected without a Vite dev server.'
    );

  await panel.close();
  await page.close();
}, 60_000);

test("the Elements sidebar's Lit tab shows only an element's details", async () => {
  const page = await context.newPage();
  await page.goto(appOrigin);
  const tabId = await extensionPage.evaluate(
    async (origin) => (await chrome.tabs.query({url: `${origin}/*`}))[0]?.id,
    appOrigin
  );
  // What `$0` would name; DevTools itself is not scriptable, so the id
  // arrives as a link instead.
  const id = await page.evaluate(() =>
    (globalThis as unknown as Record<symbol, (n: Node) => number | undefined>)[
      Symbol.for('@oddsquad/vite-plugin-lit#lit-id-of')
    ]?.(document.querySelector('probe-hello')!)
  );
  expect(typeof id).toBe('number');
  const sidebar = await context.newPage();
  await sidebar.goto(
    `chrome-extension://${extensionId}/panel.html?tabId=${tabId}&view=sidebar#tab=components&component=${id}`
  );
  await expect
    .poll(() => sidebar.locator('components-view .details h2').textContent(), {
      timeout: 15_000,
    })
    .toContain('probe-hello');
  expect(await sidebar.locator('lit-tabs').count()).toBe(0);
  expect(await sidebar.locator('components-view .tree').count()).toBe(0);
  expect(await sidebar.locator('#bar').isVisible()).toBe(false);

  await sidebar.close();
  await page.close();
}, 60_000);

test("the Lit tab finds where a component is defined through the page's sourcemap", async () => {
  const page = await context.newPage();
  await page.goto(`${appOrigin}/mapped`);
  const tabId = await extensionPage.evaluate(
    async (origin) =>
      (await chrome.tabs.query({url: `${origin}/mapped`}))[0]?.id,
    appOrigin
  );
  const panel = await context.newPage();
  await panel.goto(
    `chrome-extension://${extensionId}/panel.html?tabId=${tabId}#tab=components`
  );
  await panel
    .locator('components-view .row')
    .filter({hasText: 'mapped-hello'})
    .first()
    .click({timeout: 15_000});
  // Plain text: a tab is not DevTools, so there is no Sources panel to open,
  // and this server has no editor endpoint either.
  await expect
    .poll(() => panel.locator('components-view .src-text').textContent(), {
      timeout: 15_000,
    })
    .toBe('src/mapped.js:5');

  await panel.close();
  await page.close();
}, 60_000);

test("the Lit tab finds where an element is rendered by its template's text", async () => {
  const page = await context.newPage();
  await page.goto(`${appOrigin}/mapped`);
  const tabId = await extensionPage.evaluate(
    async (origin) =>
      (await chrome.tabs.query({url: `${origin}/mapped`}))[0]?.id,
    appOrigin
  );
  const panel = await context.newPage();
  await panel.goto(
    `chrome-extension://${extensionId}/panel.html?tabId=${tabId}#tab=components`
  );
  const rows = panel.locator('components-view .row');
  const item = rows.filter({hasText: /^\s*<mapped-item>\s*$/});
  await rows
    .filter({hasText: 'mapped-hello'})
    .first()
    .waitFor({timeout: 15_000});
  if (!(await item.first().isVisible())) {
    await rows
      .filter({hasText: 'mapped-hello'})
      .first()
      .locator('.twisty')
      .click();
  }
  await item.first().click();
  await expect
    .poll(() => panel.locator('components-view .call-site').textContent(), {
      timeout: 15_000,
    })
    .toBe('src/mapped.js:3');

  await panel.close();
  await page.close();
}, 60_000);

/** The Settings tab's Component docs section. */
const docsSettings = async (panel: Page) => {
  await panel.evaluate(() => location.replace('#tab=settings'));
  return panel
    .locator('devtools-settings section')
    .filter({hasText: 'Component docs'});
};

/** In the Settings tab: add `value` as a manifest URL. */
const addManifest = async (panel: Page, value: string) => {
  const section = await docsSettings(panel);
  await section.locator('lit-input input').fill(value);
  await section.getByRole('button', {name: 'Add'}).click();
};

/** In the Settings tab: remove every manifest the user added. */
const removeManifests = async (panel: Page) => {
  const section = await docsSettings(panel);
  const remove = section.locator('.manifest-row').getByRole('button', {
    name: 'Remove',
  });
  while ((await remove.count()) > 0) await remove.first().click();
};

/** Back in the Components tab, the details pane as text. */
const detailsText = async (panel: Page) => {
  await panel.evaluate(() => location.replace('#tab=components'));
  return panel.locator('components-view .details').textContent();
};

test('the Lit tab reads docs from the manifests the user points it at', async () => {
  const page = await context.newPage();
  await page.goto(appOrigin);
  const tabId = await extensionPage.evaluate(
    async (origin) => (await chrome.tabs.query({url: `${origin}/`}))[0]?.id,
    appOrigin
  );
  const panel = await context.newPage();
  await panel.goto(
    `chrome-extension://${extensionId}/panel.html?tabId=${tabId}#tab=components`
  );
  await panel
    .locator('components-view .row')
    .filter({hasText: 'probe-hello'})
    .first()
    .click({timeout: 15_000});
  await expect.poll(() => detailsText(panel)).toContain('greeting');
  expect(await detailsText(panel)).not.toContain('unlinked manifest');

  await addManifest(panel, 'data:,{}');
  await expect
    .poll(() => panel.locator('devtools-settings [role=alert]').textContent())
    .toContain('Not an http(s) URL');

  await addManifest(panel, '/assets/cem.json');
  await expect
    .poll(() => detailsText(panel), {timeout: 15_000})
    .toContain('Says hello from an unlinked manifest.');

  // Removed, so later tests see the page as it is.
  await removeManifests(panel);
  await expect
    .poll(() => detailsText(panel), {timeout: 15_000})
    .not.toContain('Says hello from an unlinked manifest.');
  await panel.close();
  await page.close();
}, 60_000);

test('the Lit tab offers every manifest it finds: ignore, reset and use each', async () => {
  const page = await context.newPage();
  await page.goto(`${appOrigin}/mapped`);
  const tabId = await extensionPage.evaluate(
    async (origin) =>
      (await chrome.tabs.query({url: `${origin}/mapped`}))[0]?.id,
    appOrigin
  );
  const panel = await context.newPage();
  const openPanel = async () => {
    await panel.goto(
      `chrome-extension://${extensionId}/panel.html?tabId=${tabId}#tab=components`
    );
    await panel.reload();
  };
  const nudge = panel.locator('#manifest-nudge');
  const row = (path: string) =>
    panel.locator('devtools-settings .manifest-found').filter({hasText: path});
  const ASSETS = '/assets/custom-elements.json';
  const ROOT = 'Found /custom-elements.json';

  // Both found, counted in the footer; Not now puts off only the nudge.
  await openPanel();
  await expect.poll(() => nudge.isVisible(), {timeout: 15_000}).toBe(true);
  expect(await nudge.textContent()).toContain(
    'Found 2 Custom Elements Manifests'
  );
  await nudge.getByRole('button', {name: 'Not now'}).click();
  expect(await nudge.isVisible()).toBe(false);
  await docsSettings(panel);
  await expect.poll(() => row(ASSETS).count()).toBe(1);
  await expect.poll(() => row(ROOT).count()).toBe(1);

  // Ignore the root one: it stays listed as ignored, after a reload too.
  await row(ROOT).getByRole('button', {name: 'Always ignore'}).click();
  await expect
    .poll(() => row('/custom-elements.json,').textContent())
    .toContain('Ignored');
  await openPanel();
  await expect
    .poll(() => nudge.textContent(), {timeout: 15_000})
    .toContain('Found a Custom Elements Manifest');
  await docsSettings(panel);
  await expect
    .poll(() => row('/custom-elements.json,').textContent(), {timeout: 15_000})
    .toContain('Ignored');

  // Reset puts it back on offer.
  await row('/custom-elements.json,')
    .getByRole('button', {name: 'Reset'})
    .click();
  await expect.poll(() => row(ROOT).count()).toBe(1);

  // Use both: both are read, and the bundle's describes mapped-hello.
  await row(ASSETS).getByRole('button', {name: 'Use it'}).click();
  await row(ROOT).getByRole('button', {name: 'Use it'}).click();
  await expect
    .poll(() => panel.locator('devtools-settings .manifest-row').count())
    .toBe(2);
  expect(await nudge.isVisible()).toBe(false);
  await panel.evaluate(() => location.replace('#tab=components'));
  await panel
    .locator('components-view .row')
    .filter({hasText: 'mapped-hello'})
    .first()
    .click({timeout: 15_000});
  await expect
    .poll(() => detailsText(panel), {timeout: 15_000})
    .toContain('Found next to the bundle.');

  await removeManifests(panel);
  await extensionPage.evaluate(() =>
    chrome.storage.local.remove('lit:manifest-ignored')
  );
  await panel.close();
  await page.close();
}, 120_000);

test('the Lit tab lists a linked manifest with the added ones, in an order the user sets', async () => {
  const page = await context.newPage();
  await page.goto(`${appOrigin}/linked`);
  const tabId = await extensionPage.evaluate(
    async (origin) =>
      (await chrome.tabs.query({url: `${origin}/linked`}))[0]?.id,
    appOrigin
  );
  const panel = await context.newPage();
  await panel.goto(
    `chrome-extension://${extensionId}/panel.html?tabId=${tabId}#tab=components`
  );
  await panel
    .locator('components-view .row')
    .filter({hasText: 'probe-hello'})
    .first()
    .click({timeout: 15_000});
  const ROOT = 'Found at the site root.';
  const ADDED = 'Says hello from an unlinked manifest.';
  await expect
    .poll(() => detailsText(panel), {timeout: 15_000})
    .toContain(ROOT);

  // The link is listed and marked; it has no Remove.
  const section = await docsSettings(panel);
  const entry = (path: string) =>
    section.locator('.manifest-row').filter({hasText: path});
  await expect
    .poll(() => entry('/custom-elements.json').textContent(), {
      timeout: 15_000,
    })
    .toContain('linked by page');
  expect(
    await entry('/custom-elements.json')
      .getByRole('button', {name: 'Remove'})
      .count()
  ).toBe(0);

  // Added after the link, it loses to it for the same tag...
  await addManifest(panel, '/assets/cem.json');
  await expect.poll(() => entry('/assets/cem.json').count()).toBe(1);
  await expect.poll(() => detailsText(panel)).toContain(ROOT);
  // ...until it moves up.
  await docsSettings(panel);
  await entry('/assets/cem.json')
    .getByRole('button', {name: 'Move /assets/cem.json up'})
    .click();
  await expect
    .poll(() => detailsText(panel), {timeout: 15_000})
    .toContain(ADDED);

  // Switched off, it is skipped; with both off, there are no docs.
  await docsSettings(panel);
  await entry('/assets/cem.json').locator('lit-switch').click();
  await expect
    .poll(() => detailsText(panel), {timeout: 15_000})
    .toContain(ROOT);
  await docsSettings(panel);
  await entry('/custom-elements.json').locator('lit-switch').click();
  await expect
    .poll(() => detailsText(panel), {timeout: 15_000})
    .not.toContain(ROOT);
  expect(await detailsText(panel)).not.toContain(ADDED);

  await extensionPage.evaluate(() =>
    chrome.storage.local.remove('lit:manifest-urls')
  );
  await panel.close();
  await page.close();
}, 90_000);

test('the Lit tab reads a manifest on another site it has access to, and asks for one it lacks', async () => {
  const open = async (path: string) => {
    const page = await context.newPage();
    await page.goto(`${appOrigin}${path}`);
    const tabId = await extensionPage.evaluate(
      async (url) => (await chrome.tabs.query({url}))[0]?.id,
      `${appOrigin}${path}`
    );
    const panel = await context.newPage();
    await panel.goto(
      `chrome-extension://${extensionId}/panel.html?tabId=${tabId}#tab=components`
    );
    await panel
      .locator('components-view .row')
      .filter({hasText: 'probe-hello'})
      .first()
      .click({timeout: 15_000});
    return {page, panel};
  };

  // Added by URL on a site the extension may read: its docs come through.
  const first = await open('/');
  await addManifest(first.panel, `${cdnA}/cem.json`);
  const section = await docsSettings(first.panel);
  const entry = (path: string) =>
    section.locator('.manifest-row').filter({hasText: path});
  await expect.poll(() => entry(cdnA).count(), {timeout: 15_000}).toBe(1);
  expect(
    await entry(cdnA)
      .getByRole('button', {name: /Allow access/})
      .count()
  ).toBe(0);
  await expect
    .poll(() => detailsText(first.panel), {timeout: 15_000})
    .toContain('Read from another site.');
  await removeManifests(first.panel);
  await first.panel.close();
  await first.page.close();

  // Linked on a site it may not read: listed with a way to ask, not read.
  const second = await open('/linked-elsewhere');
  const linked = (await docsSettings(second.panel))
    .locator('.manifest-row')
    .filter({hasText: cdnB});
  await expect
    .poll(() => linked.textContent(), {timeout: 15_000})
    .toContain('linked by page');
  expect(
    await linked
      .getByRole('button', {
        name: `Allow access to ${new URL(cdnB).host}`,
      })
      .count()
  ).toBe(1);
  expect(await detailsText(second.panel)).not.toContain(
    'Never read without access.'
  );
  await second.panel.close();
  await second.page.close();
}, 90_000);

test("the Lit tab's switch puts Lit tracks in Chrome's Performance panel", async () => {
  const page = await context.newPage();
  await page.goto(appOrigin);
  // `console.timeStamp` is what the runtime mirrors the timeline through.
  // CDP doesn't report its six-argument track form (that goes to the trace,
  // not `Runtime.consoleAPICalled`), so count calls in the page instead; the
  // runtime looks the function up on every call.
  await page.evaluate(() => {
    const w = window as unknown as {__stamps: string[]};
    w.__stamps = [];
    const c = console as unknown as {timeStamp: (...a: unknown[]) => void};
    const original = c.timeStamp.bind(console);
    c.timeStamp = (...args) => {
      w.__stamps.push(String(args[0]));
      original(...args);
    };
  });
  const stamps = () =>
    page.evaluate(() => (window as unknown as {__stamps: string[]}).__stamps);
  const nudge = () =>
    page.evaluate(() => {
      const el = document.querySelector('probe-hello') as unknown as {
        requestUpdate(): void;
      };
      el.requestUpdate();
    });

  const tabId = await extensionPage.evaluate(
    async (origin) => (await chrome.tabs.query({url: `${origin}/*`}))[0]?.id,
    appOrigin
  );
  const panel = await context.newPage();
  await panel.goto(
    `chrome-extension://${extensionId}/panel.html?tabId=${tabId}#tab=settings`
  );
  const tracks = panel
    .locator('devtools-settings tr')
    .filter({hasText: 'performance tracks'})
    .locator('lit-switch');
  await tracks.waitFor({timeout: 15_000});

  // Off by default: an update stamps nothing.
  await nudge();
  await page.waitForTimeout(300);
  expect(await stamps()).toEqual([]);

  await tracks.click();
  await expect
    .poll(async () => {
      await nudge();
      return stamps();
    })
    .toContainEqual(expect.stringContaining('<probe-hello>'));

  // Leave the stored preference as the other tests found it.
  await tracks.click();
  await panel.close();
  await page.close();
}, 60_000);

test("a pinned override comes back after a reload, kept out of the site's storage", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(appOrigin);
  const shown = () =>
    page.evaluate(
      () => document.querySelector('probe-hello')?.shadowRoot?.textContent ?? ''
    );
  await expect.poll(shown).toContain('hello');
  const id = await page.evaluate(() =>
    (globalThis as unknown as Record<symbol, (el: Element) => number>)[
      Symbol.for('@oddsquad/vite-plugin-lit#lit-id-of')
    ]!(document.querySelector('probe-hello')!)
  );
  // The panel's commands, over a panel port as the Lit tab sends them.
  await extensionPage.evaluate(
    async ([origin, channel, id]) => {
      const [tab] = await chrome.tabs.query({url: `${origin}/*`});
      const port = chrome.runtime.connect({name: 'lit-panel'});
      port.postMessage({tabId: tab!.id});
      const send = (data: unknown) => port.postMessage({channel, data});
      send({type: 'set-prop', id, name: 'greeting', value: 'kept'});
      send({type: 'override-persist', id, name: 'greeting', persist: true});
      (window as unknown as {overridePort: unknown}).overridePort = port;
    },
    [appOrigin, 'lit:inspect:cmd', id] as const
  );
  await expect.poll(shown).toContain('kept');

  await page.reload();
  await expect.poll(shown, {timeout: 10_000}).toContain('kept');
  // The runtime keeps its tab id in sessionStorage regardless; what matters
  // is that no override is in either of the site's stores.
  const siteStorage = await page.evaluate(() =>
    JSON.stringify([sessionStorage, localStorage].map(Object.entries))
  );
  expect(siteStorage).not.toContain('kept');
  expect(siteStorage).not.toContain('lit-devtools-overrides');
  expect(errors).toEqual([]);
  await extensionPage.evaluate(() =>
    (
      window as unknown as {overridePort: {disconnect(): void}}
    ).overridePort.disconnect()
  );
  await page.close();
});

test('disabling stops the injection', async () => {
  expect(await registry('lit:disable')).toEqual({
    origin: appOrigin,
    enabled: false,
    permitted: true,
  });
  const page = await context.newPage();
  await page.goto(appOrigin);
  expect(await probe(page)).toEqual({defineWrapped: false, channel: false});
  await page.close();
});

test('the Lit tab follows a site enabled elsewhere, and enables a permitted one without asking', async () => {
  const page = await context.newPage();
  await page.goto(appOrigin);
  const tabId = await extensionPage.evaluate(
    async (origin) => (await chrome.tabs.query({url: `${origin}/*`}))[0]?.id,
    appOrigin
  );
  const panel = await context.newPage();
  await panel.goto(
    `chrome-extension://${extensionId}/panel.html?tabId=${tabId}`
  );
  await expect
    .poll(() => panel.locator('#status').textContent())
    .toBe('disabled');

  // Enabled from another DevTools window: this tab opens the panel itself.
  await registry('lit:enable');
  await panel.locator('lit-devtools-panel').waitFor({timeout: 15_000});

  // Disabled there too: the tab falls back to the setup screen.
  await registry('lit:disable');
  await panel.locator('#setup').waitFor({timeout: 15_000});

  // The extension already holds the site's permission, so Enable goes
  // straight to the background. A permission request outside a real user
  // gesture would reject here.
  await panel.evaluate(() =>
    document.querySelector<HTMLButtonElement>('#enable')!.click()
  );
  await panel.locator('lit-devtools-panel').waitFor({timeout: 15_000});
  expect(await registry('lit:status')).toMatchObject({enabled: true});

  await registry('lit:disable');
  await panel.close();
  await page.close();
}, 60_000);
