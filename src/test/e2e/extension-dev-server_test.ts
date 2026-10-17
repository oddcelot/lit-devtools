/**
 * The Lit Inspector extension enabled for a dev server that already runs the
 * plugin: two runtimes on one page, the extension's injected at
 * `document_start` and the plugin's served by Vite. They share the page's
 * globals, so they get in each other's way (`runtime-registry.ts`); this
 * checks that the page knows, says so once in the console, and that the
 * extension's panel warns.
 *
 * Set up like `extension_test.ts`: the build loaded unpacked, the dev
 * server's origin granted in the manifest, the panel opened in a tab with
 * `?tabId=`. Needs `pnpm run build:extension` (it loads `dist/extension`).
 */

import {chromium, type BrowserContext, type Page} from 'playwright-core';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {fsp, joinPath, startFixture, tmpRoot, type Fixture} from './utils.js';

declare const chrome: {
  runtime: {sendMessage(message: unknown): Promise<unknown>};
  tabs: {query(info: {url: string}): Promise<Array<{id?: number}>>};
};

const DIST = decodeURIComponent(
  new URL('../../../dist/extension', import.meta.url).pathname
);

let fixture: Fixture;
let workDir: string;
let context: BrowserContext;
let extensionId: string;
let extensionPage: Page;

beforeAll(async () => {
  fixture = await startFixture();
  workDir = tmpRoot('lit-extension-dev-');
  const extensionDir = joinPath(workDir, 'unpacked');
  await fsp.cp(DIST, extensionDir, {recursive: true});
  const manifestPath = joinPath(extensionDir, 'manifest.json');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  manifest.host_permissions = [`${fixture.origin}/*`];
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
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
  extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/devtools.html`);
  await extensionPage.evaluate(
    (origin) => chrome.runtime.sendMessage({type: 'lit:enable', origin}),
    fixture.origin
  );
}, 60_000);

afterAll(async () => {
  await context?.close();
  await fixture?.close();
  if (workDir !== undefined) {
    await fsp.rm(workDir, {recursive: true, force: true});
  }
});

test('two runtimes on a dev server page are noticed, once, and shown', async () => {
  const page = await context.newPage();
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.goto(fixture.origin);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as Record<symbol, {kinds: string[]}>)[
            Symbol.for('@oddsquad/vite-plugin-lit#runtimes')
          ]?.kinds
      )
    )
    .toEqual(['extension', 'vite']);
  await expect
    .poll(
      () =>
        warnings.filter((w) => w.includes('Two Lit DevTools runtimes')).length
    )
    .toBe(1);

  const tabId = await extensionPage.evaluate(
    async (origin) => (await chrome.tabs.query({url: `${origin}/*`}))[0]?.id,
    fixture.origin
  );
  const panel = await context.newPage();
  await panel.goto(
    `chrome-extension://${extensionId}/panel.html?tabId=${tabId}#tab=components`
  );
  await expect
    .poll(
      () => panel.locator('components-view .runtimes-banner').textContent(),
      {
        timeout: 15_000,
      }
    )
    .toContain("the Lit Inspector extension and the dev server's plugin");
  await panel.close();
  await page.close();
}, 60_000);
