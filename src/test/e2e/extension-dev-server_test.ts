/**
 * The Lit Inspector extension enabled for a dev server that already runs the
 * plugin: two runtimes for one page, the extension's injected at
 * `document_start` and the plugin's served by Vite. The first serves the page
 * and the plugin's only adds its carrier (`runtime-registry.ts`), so there
 * is one picker and one inspector, and both panels work: the extension's,
 * over the window relay, and the dev server's, over Vite's socket.
 *
 * Set up like `extension_test.ts`: the build loaded unpacked, the dev
 * server's origin granted in the manifest, the panel opened in a tab with
 * `?tabId=`. Needs `pnpm run build` and `pnpm run build:extension`.
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
  fixture = await startFixture({
    plugin: {sourceOverlay: true, timeline: true},
    panel: true,
  });
  // Its own page would feed the dev server's panel by itself; only the
  // page in the extension's browser should.
  await fixture.page.close();
  workDir = tmpRoot('lit-extension-dev');
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
}, 90_000);

afterAll(async () => {
  await context?.close();
  await fixture?.close();
  if (workDir !== undefined) {
    await fsp.rm(workDir, {recursive: true, force: true});
  }
});

test('one runtime serves both panels on a dev server page', async () => {
  const page = await context.newPage();
  const notes: string[] = [];
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'info') notes.push(message.text());
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixture.origin);
  await page.locator('hmr-counter').waitFor();

  // Both runtimes joined; the extension's serves the page, alone.
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
    .poll(() => notes.filter((n) => n.includes('already serves')).length)
    .toBe(1);
  expect(
    await page.evaluate(
      () => document.querySelectorAll('lit-source-overlay').length
    )
  ).toBe(1);
  // One inspector: a command the extension's relay carries in gets one
  // answer back, not one from each runtime's copy.
  const treeReplies = await page.evaluate(async () => {
    const SOURCE = '@oddsquad/vite-plugin-lit';
    let replies = 0;
    addEventListener('message', (event) => {
      const d = event.data as {
        source?: string;
        dir?: string;
        channel?: string;
        data?: {type?: string};
      };
      if (
        d?.source === SOURCE &&
        d.dir === 'to-extension' &&
        d.channel === 'lit:inspect:data' &&
        d.data?.type === 'tree'
      ) {
        replies++;
      }
    });
    postMessage(
      {
        source: SOURCE,
        dir: 'to-page',
        channel: 'lit:inspect:cmd',
        data: {type: 'tree'},
      },
      '*'
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    return replies;
  });
  expect(treeReplies).toBe(1);

  // The extension's panel: told who serves the page, and its Pick works.
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
      {timeout: 15_000}
    )
    .toContain('The Lit Inspector extension serves this page');
  await panel.locator('components-view lit-icon-button.pick').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.head.querySelectorAll('style')].some((s) =>
          s.textContent?.includes('crosshair')
        )
      )
    )
    .toBe(true);
  const box = (await page.locator('hmr-counter').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // Past the picker's hover throttle.
  await page.waitForTimeout(150);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await panel
    .locator('components-view .row.selected')
    .filter({hasText: 'hmr-counter'})
    .waitFor({timeout: 10_000});

  // The dev server's own panel hears the same runtime over Vite's socket.
  const devPanel = await fixture.openPanel();
  await devPanel.page
    .locator('components-view .row')
    .filter({hasText: 'hmr-counter'})
    .first()
    .waitFor({timeout: 15_000});

  expect(errors).toEqual([]);
  await panel.close();
  await page.close();
}, 90_000);
