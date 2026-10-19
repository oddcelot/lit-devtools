/// <reference types="node" />
/**
 * The Lit Inspector extension on a plain Vite dev server, one without the
 * plugin: where a component is defined and where it is rendered come from
 * the page's sourcemaps, and a click on either opens it in the editor through
 * Vite's own `/__open-in-editor`.
 *
 * The server runs in its own process, started in the app's root the way
 * `vite` usually is, because `launch-editor` resolves the root-relative path
 * against the working directory. `LAUNCH_EDITOR` points at a script that
 * writes down what it was asked to open.
 *
 * Set up like `extension_test.ts`. Needs `pnpm run build:extension`.
 */

import {spawn, type ChildProcess} from 'node:child_process';
import {chromium, type BrowserContext, type Page} from 'playwright-core';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {fsp, joinPath, tmpRoot} from './utils.js';

declare const chrome: {
  runtime: {sendMessage(message: unknown): Promise<unknown>};
  tabs: {query(info: {url: string}): Promise<Array<{id?: number}>>};
};

const DIST = decodeURIComponent(
  new URL('../../../dist/extension', import.meta.url).pathname
);

const FILES: Record<string, string> = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      experimentalDecorators: true,
      useDefineForClassFields: false,
    },
  }),
  'index.html':
    '<!doctype html><script type="module" src="/src/main.ts"></script><my-app></my-app>\n',
  'src/my-el.ts': `import {LitElement, html} from 'lit';
import {customElement} from 'lit/decorators.js';

@customElement('my-el')
export class MyEl extends LitElement {
  render() {
    return html\`<p>hi</p>\`;
  }
}
`,
  'src/main.ts': `import {LitElement, html} from 'lit';
import './my-el.js';

class MyApp extends LitElement {
  render() {
    return html\`<div><my-el></my-el></div>\`;
  }
}
customElements.define('my-app', MyApp);
`,
  'serve.mjs': `import {createServer} from 'vite';
const server = await createServer({
  configFile: false,
  logLevel: 'warn',
  server: {port: 0},
});
await server.listen();
console.log('ready ' + server.resolvedUrls.local[0]);
`,
  'fake-editor.sh': '#!/bin/sh\necho "$@" >> "$(dirname "$0")/opened.log"\n',
};

let workDir: string;
let appDir: string;
let vite: ChildProcess;
let origin: string;
let context: BrowserContext;
let extensionId: string;
let extensionPage: Page;

const startVite = (): Promise<string> =>
  new Promise((resolve, reject) => {
    vite = spawn(process.execPath, ['serve.mjs'], {
      cwd: appDir,
      env: {...process.env, LAUNCH_EDITOR: joinPath(appDir, 'fake-editor.sh')},
    });
    let out = '';
    vite.stdout!.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      const match = /ready (\S+)/.exec(out);
      if (match !== null) resolve(new URL(match[1]!).origin);
    });
    vite.stderr!.on('data', (chunk: Buffer) => (out += chunk.toString()));
    vite.on('exit', (code) => reject(new Error(`vite exited ${code}: ${out}`)));
  });

beforeAll(async () => {
  workDir = tmpRoot('lit-extension-vite-editor');
  appDir = joinPath(workDir, 'app');
  for (const [name, text] of Object.entries(FILES)) {
    await fsp.mkdir(joinPath(appDir, name, '..'), {recursive: true});
    await fsp.writeFile(joinPath(appDir, name), text, {mode: 0o755});
  }
  origin = await startVite();

  const extensionDir = joinPath(workDir, 'unpacked');
  await fsp.cp(DIST, extensionDir, {recursive: true});
  const manifestPath = joinPath(extensionDir, 'manifest.json');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  manifest.host_permissions = [`${origin}/*`];
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
    (at) => chrome.runtime.sendMessage({type: 'lit:enable', origin: at}),
    origin
  );
}, 90_000);

afterAll(async () => {
  await context?.close();
  vite?.removeAllListeners('exit');
  vite?.kill();
  if (workDir !== undefined) {
    await fsp.rm(workDir, {recursive: true, force: true});
  }
});

const opened = async (): Promise<string[]> => {
  try {
    const log = await fsp.readFile(joinPath(appDir, 'opened.log'), 'utf8');
    return log.trim().split('\n');
  } catch {
    return [];
  }
};

test("the Lit tab opens a plain Vite page's sources in the editor", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${origin}/`);
  await page
    .locator('my-el')
    .waitFor({state: 'attached', timeout: 10_000})
    .catch(() => {
      throw new Error(errors.join('\n'));
    });
  const tabId = await extensionPage.evaluate(
    async (at) => (await chrome.tabs.query({url: `${at}/`}))[0]?.id,
    origin
  );
  const panel = await context.newPage();
  await panel.goto(
    `chrome-extension://${extensionId}/panel.html?tabId=${tabId}#tab=components`
  );
  const rows = panel.locator('components-view .row');
  const myEl = rows.filter({hasText: /^\s*<my-el>\s*$/});
  await rows.filter({hasText: 'my-app'}).first().waitFor({timeout: 15_000});
  if (!(await myEl.first().isVisible())) {
    await rows.filter({hasText: 'my-app'}).first().locator('.twisty').click();
  }
  await myEl.first().click();

  const defined = panel.locator('components-view button.src:not(.call-site)');
  await expect
    .poll(() => defined.textContent(), {timeout: 15_000})
    .toContain('src/my-el.ts:4');
  await defined.click();
  await expect
    .poll(opened, {timeout: 10_000})
    .toEqual([expect.stringMatching(/\/app\/src\/my-el\.ts 4 2$/)]);

  const rendered = panel.locator('components-view button.call-site');
  await expect
    .poll(() => rendered.textContent(), {timeout: 15_000})
    .toContain('src/main.ts:6');
  await rendered.click();
  await expect
    .poll(opened, {timeout: 10_000})
    .toEqual([
      expect.stringMatching(/\/app\/src\/my-el\.ts 4 2$/),
      expect.stringMatching(/\/app\/src\/main\.ts 6 \d+$/),
    ]);

  await panel.close();
  await page.close();
}, 60_000);
