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
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {ViteDevServer} from 'vite';
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

export const startSsrFixture = async (
  plugin: LitPluginOptions = {timeline: true}
): Promise<SsrFixture> => {
  const root = path.join(EXAMPLE_DIR, '.e2e-tmp', randomUUID().slice(0, 8));
  // Entry by entry: the copy lives inside the example, which `cp` won't
  // copy into itself.
  for (const entry of [
    'index.html',
    'server.mjs',
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
  const server = await startSsrServer({
    root,
    port: 0,
    host: '127.0.0.1',
    vite: {configFile: false, logLevel: 'silent', plugins: [litPlugin(plugin)]},
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
