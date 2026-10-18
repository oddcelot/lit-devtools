/**
 * A dev server for `examples/ssr`, the server-rendered example, the way
 * `startFixture` serves the playground: a throwaway copy, the repo's plugin
 * and a browser on it.
 *
 * The copy sits inside the example, not in the repo's `.e2e-tmp/`, so its
 * bare imports (`@lit-labs/ssr`, which the root does not depend on) resolve
 * from the example's own `node_modules`.
 */

import {randomUUID} from 'node:crypto';
import {cp, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer as createHttpServer, type Server} from 'node:http';
import {createServer as createNetServer} from 'node:net';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {InlineConfig, ViteDevServer} from 'vite';
import {chromium, type Browser, type Page} from 'playwright-core';
import {litPlugin, type LitPluginOptions} from '../../index.js';

const EXAMPLE_DIR = fileURLToPath(
  new URL('../../../examples/ssr', import.meta.url)
);

export interface SsrFixture {
  vite: ViteDevServer;
  browser: Browser;
  page: Page;
  root: string;
  origin: string;
  /** Edits a file under the copy's root, like `Fixture.edit`. */
  edit(rel: string, transform: (code: string) => string): Promise<void>;
  close(): Promise<void>;
}

interface SsrServer {
  vite: ViteDevServer;
  origin: string;
  close(): Promise<void>;
}

/** A port nothing listens on right now, from the OS. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const {port} = probe.address() as {port: number};
      probe.close(() => resolve(port));
    });
  });

export const startSsrFixture = async (
  plugin: LitPluginOptions = {timeline: true},
  /** Merged into the dev server's Vite config, as `devtools` for the hub. */
  vite: InlineConfig = {},
  /** Serve every socket from the page's port, as `stackblitz.mjs` does. */
  {onePort = false}: {onePort?: boolean} = {}
): Promise<SsrFixture> => {
  const root = path.join(EXAMPLE_DIR, '.e2e-tmp', randomUUID().slice(0, 8));
  // Entry by entry: the copy lives inside the example, which `cp` won't
  // copy into itself.
  for (const entry of [
    'index.html',
    'server.mjs',
    'one-port.mjs',
    'tsconfig.json',
    'public',
    'src',
  ]) {
    await cp(path.join(EXAMPLE_DIR, entry), path.join(root, entry), {
      recursive: true,
    });
  }
  // Plain JavaScript; its own module, so the copy's `here` is the copy.
  const {startSsrServer} = (await import(path.join(root, 'server.mjs'))) as {
    startSsrServer: (options: object) => Promise<SsrServer>;
  };
  const http = createHttpServer();
  const shared: InlineConfig = onePort
    ? (
        (await import(path.join(root, 'one-port.mjs'))) as {
          onePort: (http: Server) => InlineConfig;
        }
      ).onePort(http)
    : {
        // In middleware mode Vite's HMR socket listens on 24678 unless told
        // otherwise. Any other dev server holding that port, or a second
        // fixture running alongside, left this one with no socket: edits
        // never reached the page, nor the next server render.
        server: {...vite.server, hmr: {port: await freePort()}},
      };
  const server = await startSsrServer({
    http,
    root,
    port: 0,
    host: '127.0.0.1',
    vite: {
      ...vite,
      configFile: false,
      logLevel: 'silent',
      // Its own optimizer cache: the example's is shared by every run and by
      // `pnpm dev`, under other configs, and a stale one re-optimizes in the
      // middle of a test, mixing two generations of Lit in one page.
      cacheDir: path.join(root, '.vite'),
      ...(shared.server ? {server: shared.server} : {}),
      plugins: [...(shared.plugins ?? []), litPlugin(plugin)],
    },
  });

  const executablePath = process.env['HMR_E2E_EXECUTABLE'];
  const browser = await chromium.launch({
    ...(executablePath !== undefined && executablePath !== ''
      ? {executablePath}
      : {channel: 'chrome'}),
    headless: process.env['HMR_E2E_HEADED'] === undefined,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  // As `startFixture` does: the plugin's runtime imports are invisible to the
  // dep scanner, so the first load can still be optimizing. Let it finish,
  // then start from a clean load.
  await page.goto(`${server.origin}/`);
  await server.vite.waitForRequestsIdle();
  await page.reload();

  return {
    vite: server.vite,
    browser,
    page,
    root,
    origin: server.origin,
    edit: async (rel, transform) => {
      const file = path.join(root, rel);
      const code = await readFile(file, 'utf8');
      const next = transform(code);
      if (next === code) throw new Error(`edit of ${rel} changed nothing`);
      await writeFile(file, next);
    },
    close: async () => {
      await browser.close();
      await server.close();
      await rm(root, {recursive: true, force: true});
    },
  };
};
