/**
 * The SSR example's production build, as `npm run build` and `npm run
 * preview` serve it: no Vite at runtime, Lit's production condition, the
 * shared sheet inlined by the server build, and the Lit panel attached
 * through the standalone script tag.
 *
 * Needs `pnpm run build` (the CLI serves `dist/standalone`).
 */

import {spawn, type ChildProcess} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {cp, mkdir, rm} from 'node:fs/promises';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {chromium, type Browser} from 'playwright-core';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {readScriptOrigin} from './utils.js';

const PACKAGE_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const EXAMPLE_DIR = path.join(PACKAGE_ROOT, 'examples/ssr');

let root: string;
let cliHome: string;
let cli: ChildProcess;
let browser: Browser;
let preview: {origin: string; close(): Promise<void>};
let devOrigin: string;

beforeAll(async () => {
  // Inside the example, as `startSsrFixture` does, so the copy's bare
  // imports resolve from the example's `node_modules`.
  root = path.join(EXAMPLE_DIR, '.e2e-tmp', `prod-${randomUUID().slice(0, 8)}`);
  for (const entry of [
    'index.html',
    'preview.mjs',
    'vite.config.ts',
    'tsconfig.json',
    'public',
    'src',
  ]) {
    await cp(path.join(EXAMPLE_DIR, entry), path.join(root, entry), {
      recursive: true,
    });
  }
  // Vitest sets NODE_ENV=test, which Vite resolves like development; a real
  // `vite build` picks Lit's `production` condition.
  const nodeEnv = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = 'production';
  try {
    await build({root, logLevel: 'silent', build: {outDir: 'dist/client'}});
    await build({
      root,
      logLevel: 'silent',
      build: {ssr: 'src/entry-server.ts', outDir: 'dist/server'},
    });
  } finally {
    process.env['NODE_ENV'] = nodeEnv;
  }

  cliHome = `${root}-home`;
  await mkdir(cliHome, {recursive: true});
  cli = spawn(
    process.execPath,
    [path.join(PACKAGE_ROOT, 'bin.mjs'), 'dev', '--no-auth', '--port', '0'],
    {cwd: PACKAGE_ROOT, env: {...process.env, HOME: cliHome}}
  );
  devOrigin = await readScriptOrigin(cli);

  const {startPreviewServer} = (await import(
    path.join(root, 'preview.mjs')
  )) as {
    startPreviewServer: (options: object) => Promise<typeof preview>;
  };
  preview = await startPreviewServer({
    root,
    port: 0,
    host: '127.0.0.1',
    devtools: `${devOrigin}/lit-devtools.js`,
  });

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
  cli?.kill();
  await preview?.close();
  await rm(root, {recursive: true, force: true});
  await rm(cliHome, {recursive: true, force: true});
});

test('the server build inlines the shared sheet', async () => {
  const html = await (await fetch(`${preview.origin}/`)).text();
  expect(html).toMatch(
    /<ssr-themed><template shadowroot="open" shadowrootmode="open"><style>\.note\{/
  );
});

test('the page hydrates, and the panel says where hydration stands', async () => {
  const page = await browser.newPage();
  const messages: string[] = [];
  page.on('console', (m) => messages.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));
  await page.goto(`${preview.origin}/`);
  await expect
    .poll(() => messages.some((m) => m.includes('[lit-devtools] connected')))
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        `document.querySelector('ssr-counter').hasAttribute('hydrated')`
      )
    )
    .toBe(true);
  // Production Lit: no dev-mode warning, and no hydration errors.
  expect(messages.some((m) => m.includes('Lit is in dev mode'))).toBe(false);
  expect(messages.filter((m) => /^(error|pageerror)/.test(m))).toEqual([]);
  await page.locator('ssr-counter #increment').click();
  await expect
    .poll(() =>
      page.evaluate(
        `document.querySelector('ssr-counter').shadowRoot.querySelector('button').textContent.trim()`
      )
    )
    .toBe('Count: 4');

  const panel = await browser.newPage();
  await panel.goto(`${devOrigin}/#tab=components`);
  const chips = panel.locator('components-view wa-badge.ssr');
  await expect
    .poll(() => chips.allInnerTexts(), {timeout: 15_000})
    .toEqual(['hydrated', 'deferred', 'hydrated']);
  await page.locator('#wake').click();
  await expect
    .poll(() => chips.allInnerTexts(), {timeout: 10_000})
    .toEqual(['hydrated', 'hydrated', 'hydrated']);
}, 60_000);
