/// <reference types="node" />
/**
 * The Lit Inspector extension on Vite dev servers: where a component is
 * defined and where it is rendered, and a click on either opening it in the
 * editor through the server. Three servers, each in its own process with
 * `LAUNCH_EDITOR` pointing at a script that writes down what it was asked to
 * open:
 *
 * - plain Vite, started in the app's root the way `vite` usually is: the
 *   locations come from the page's sourcemaps and open through Vite's own
 *   `/__open-in-editor`;
 * - plain Vite under `base: '/app/'`, where everything, the endpoint
 *   included, sits under the base;
 * - Vite with the plugin and its source overlay (which serves the plugin's
 *   endpoint), started from the directory above the root, as `vite app` is:
 *   Vite's endpoint would look for the root-relative path in the wrong
 *   directory, so the open goes through the plugin's endpoint, asked from
 *   the page.
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
const {BASE, PLUGIN} = process.env;
const plugins = PLUGIN
  ? [(await import(PLUGIN)).litPlugin({sourceOverlay: true})]
  : [];
const server = await createServer({
  root: new URL('.', import.meta.url).pathname,
  configFile: false,
  logLevel: 'warn',
  base: BASE || '/',
  plugins,
  server: {port: 0},
});
await server.listen();
console.log('ready ' + server.resolvedUrls.local[0]);
`,
  'fake-editor.sh': '#!/bin/sh\necho "$@" >> "$(dirname "$0")/opened.log"\n',
};

const PLUGIN = decodeURIComponent(
  new URL('../../../index.js', import.meta.url).pathname
);

interface Server {
  name: string;
  /** Where the page is, under the server's base. */
  page: string;
  /** Run from the directory above the root rather than the root. */
  outside?: boolean;
  env?: Record<string, string>;
  origin?: string;
  process?: ChildProcess;
}

const SERVERS: Server[] = [
  {name: 'plain Vite', page: '/'},
  {name: 'Vite with a base', page: '/app/', env: {BASE: '/app/'}},
  {
    name: 'Vite with the plugin, started outside its root',
    page: '/',
    outside: true,
    env: {PLUGIN},
  },
];

let workDir: string;
let appDir: string;
let context: BrowserContext;
let extensionId: string;
let extensionPage: Page;

const startVite = (server: Server): Promise<string> =>
  new Promise((resolve, reject) => {
    const vite = spawn(process.execPath, [joinPath(appDir, 'serve.mjs')], {
      cwd: server.outside === true ? workDir : appDir,
      env: {
        ...process.env,
        ...server.env,
        LAUNCH_EDITOR: joinPath(appDir, 'fake-editor.sh'),
      },
    });
    server.process = vite;
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
  for (const server of SERVERS) server.origin = await startVite(server);

  const extensionDir = joinPath(workDir, 'unpacked');
  await fsp.cp(DIST, extensionDir, {recursive: true});
  const manifestPath = joinPath(extensionDir, 'manifest.json');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  manifest.host_permissions = SERVERS.map((server) => `${server.origin}/*`);
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
  for (const server of SERVERS) {
    await extensionPage.evaluate(
      (at) => chrome.runtime.sendMessage({type: 'lit:enable', origin: at}),
      server.origin
    );
  }
}, 90_000);

afterAll(async () => {
  await context?.close();
  for (const {process: vite} of SERVERS) {
    vite?.removeAllListeners('exit');
    vite?.kill();
  }
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

test.each(SERVERS)(
  'the Lit tab opens sources in the editor: $name',
  async (server) => {
    await fsp.rm(joinPath(appDir, 'opened.log'), {force: true});
    const url = `${server.origin}${server.page}`;
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', (m) => errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(url);
    await page
      .locator('my-el')
      .waitFor({state: 'attached', timeout: 10_000})
      .catch(() => {
        throw new Error(errors.join('\n'));
      });
    const tabId = await extensionPage.evaluate(
      async (at) => (await chrome.tabs.query({url: at}))[0]?.id,
      url
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
      .toContain('src/my-el.ts:');
    expect(await defined.getAttribute('data-tip')).toBe('Open in your editor');
    await defined.click();
    await expect
      .poll(opened, {timeout: 10_000})
      .toEqual([expect.stringMatching(/\/app\/src\/my-el\.ts \d+ \d+$/)]);

    const rendered = panel.locator('components-view button.call-site');
    await expect
      .poll(() => rendered.textContent(), {timeout: 15_000})
      .toContain('src/main.ts:6');
    await rendered.click();
    await expect
      .poll(opened, {timeout: 10_000})
      .toEqual([
        expect.stringMatching(/\/app\/src\/my-el\.ts \d+ \d+$/),
        expect.stringMatching(/\/app\/src\/main\.ts 6 \d+$/),
      ]);

    await panel.close();
    await page.close();
  },
  60_000
);
