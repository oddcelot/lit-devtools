/// <reference types="node" />
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {chromium, type Browser, type Page} from 'playwright-core';
import {createServer, type ViteDevServer} from 'vite';
import {litPlugin} from '../../index.js';

/**
 * packages/lit-components in a real browser: its kitchen sink, served the way
 * `pnpm --filter @oddsquad/lit-components dev` serves it, and the Web Awesome
 * behaviour happy-dom can't show (src/test/dom/lit-components_test.ts has
 * the rest): forms, native validity, a dropdown's popover.
 */
const ROOT = new URL('../../../packages/lit-components/', import.meta.url)
  .pathname;

let server: ViteDevServer;
let browser: Browser;
let page: Page;
const errors: string[] = [];

beforeAll(async () => {
  server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'silent',
    server: {host: '127.0.0.1', port: 0},
    plugins: [litPlugin()],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (address === null || typeof address !== 'object') {
    throw new Error('dev server has no address');
  }
  const executablePath = process.env['HMR_E2E_EXECUTABLE'];
  browser = await chromium.launch(
    executablePath !== undefined && executablePath !== ''
      ? {executablePath}
      : {channel: 'chrome'}
  );
  page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`http://127.0.0.1:${address.port}/`);
  // The first load can stop for a dependency re-optimization, which reloads.
  await page.waitForFunction(
    () => document.querySelectorAll('section').length > 0,
    undefined,
    {timeout: 30_000}
  );
  await page.waitForLoadState('networkidle');
  errors.length = 0;
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll('section').length > 0
  );
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

/** Adds markup to the page and waits for its lit-* elements to render. */
const mount = (markup: string) =>
  page.evaluate(async (m) => {
    const host = document.createElement('div');
    host.className = 'test-host wa-light';
    host.innerHTML = m;
    document.body.append(host);
    await Promise.all(
      [...host.querySelectorAll('*')].map((el) =>
        Promise.resolve(
          (el as {updateComplete?: Promise<unknown>}).updateComplete
        )
      )
    );
  }, markup);

test('the kitchen sink renders every element with no errors', async () => {
  const sections = await page.$$eval('section', (els) => els.map((e) => e.id));
  expect(sections).toEqual(
    expect.arrayContaining([
      'lit-button',
      'lit-icon-button',
      'lit-copy-button',
      'lit-badge',
      'lit-callout',
      'lit-input',
      'lit-switch',
      'lit-select',
      'lit-card',
      'lit-details',
      'lit-icon',
    ])
  );
  // Every lit-* on the page upgraded (a missing define leaves it inert).
  const inert = await page.$$eval('*', (els) =>
    els
      .filter((e) => e.localName.startsWith('lit-'))
      .filter((e) => customElements.get(e.localName) === undefined)
      .map((e) => e.localName)
  );
  expect(inert).toEqual([]);
  expect(errors).toEqual([]);
});

test('lit-button type=submit submits its form', async () => {
  await mount(
    `<form id="f"><lit-button type="submit">Save</lit-button></form>`
  );
  const submitted = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        document.querySelector('#f')!.addEventListener(
          'submit',
          (e) => {
            e.preventDefault();
            resolve(true);
          },
          {once: true}
        );
      })
  );
  await page.click('#f lit-button');
  expect(await submitted).toBe(true);
});

test('lit-input reports a missing required value', async () => {
  await mount(`<lit-input id="req" required></lit-input>`);
  expect(
    await page.$eval('#req', (el) => (el as HTMLInputElement).checkValidity())
  ).toBe(false);
  await page.fill('#req input', 'hmr-counter');
  expect(
    await page.$eval('#req', (el) => (el as HTMLInputElement).checkValidity())
  ).toBe(true);
});

test('lit-switch submits with its form', async () => {
  await mount(
    `<form id="sw"><lit-switch name="flash" checked>Flash</lit-switch></form>`
  );
  const value = await page.$eval('#sw', (form) =>
    new FormData(form as HTMLFormElement).get('flash')
  );
  expect(value).toBe('on');
});

test('lit-button opens a wa-dropdown as its trigger', async () => {
  await mount(`<wa-dropdown id="dd">
      <lit-button slot="trigger">Export</lit-button>
      <wa-dropdown-item>Snapshot</wa-dropdown-item>
    </wa-dropdown>`);
  await page.click('#dd lit-button');
  await expect
    .poll(() => page.$eval('#dd', (el) => (el as {open?: boolean}).open))
    .toBe(true);
});
