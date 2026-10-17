/// <reference types="node" />
/**
 * `examples/astro` under Astro's JavaScript API, as `ssr-utils.ts` serves
 * `examples/ssr`: a throwaway copy, a server for it and a browser on it.
 * The dev server is Astro's `dev()`, a build is `build()` then `preview()`,
 * all in this process, so the plugin under test is the repo's build output
 * (`examples/astro` links it as `@oddsquad/vite-plugin-lit`).
 *
 * The copy sits inside the example, so `astro`, `@lit-labs/ssr` and the
 * adapters resolve from the example's own `node_modules`.
 */

import {randomUUID} from 'node:crypto';
import {cp, readFile, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {chromium, type Browser, type Page} from 'playwright-core';

const EXAMPLE_DIR = fileURLToPath(
  new URL('../../../examples/astro', import.meta.url)
);

/** The configs in `examples/astro`, one per setup. */
export type AstroConfig =
  | 'astro.config.mjs'
  | 'astro.server.config.mjs'
  | 'astro.multi.config.mjs';

export interface AstroFixture {
  browser: Browser;
  page: Page;
  root: string;
  origin: string;
  /** Edits a file under the copy's root, like `Fixture.edit`. */
  edit(rel: string, transform: (code: string) => string): Promise<void>;
  close(): Promise<void>;
}

export interface AstroFixtureOptions {
  config?: AstroConfig;
  /** Build the site and serve the build, rather than run the dev server. */
  build?: boolean;
  /** Merged into the copy's Vite config. */
  vite?: Record<string, unknown>;
}

interface Stoppable {
  stop(): Promise<void>;
}

type AstroApi = {
  dev(config: object): Promise<Stoppable>;
  build(config: object): Promise<void>;
  preview(config: object): Promise<Stoppable>;
};

/** A port nothing listens on: the Node adapter's preview reports 0 back. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address() as {port: number};
      server.close(() => resolve(port));
    });
  });

/** The example's Astro, not one the repo root might find. */
const loadAstro = async (): Promise<AstroApi> => {
  const require = createRequire(path.join(EXAMPLE_DIR, 'package.json'));
  return (await import(
    pathToFileURL(require.resolve('astro')).href
  )) as AstroApi;
};

const COPIED = [
  'astro.config.mjs',
  'astro.server.config.mjs',
  'astro.multi.config.mjs',
  'tsconfig.json',
  'public',
  'src',
  'multi',
];

export const startAstroFixture = async ({
  config = 'astro.config.mjs',
  build = false,
  vite = {},
}: AstroFixtureOptions = {}): Promise<AstroFixture> => {
  const root = path.join(EXAMPLE_DIR, '.e2e-tmp', randomUUID().slice(0, 8));
  // Entry by entry: the copy lives inside the example, which `cp` won't
  // copy into itself.
  for (const entry of COPIED) {
    await cp(path.join(EXAMPLE_DIR, entry), path.join(root, entry), {
      recursive: true,
    });
  }
  const env = {...process.env};
  process.env['ASTRO_TELEMETRY_DISABLED'] = '1';
  // Under Vitest, Astro's dev server leaves out its own request handler,
  // and `NODE_ENV=test` turns HMR off: run it as a developer would.
  delete process.env['VITEST'];
  process.env['NODE_ENV'] = build ? 'production' : 'development';
  const astro = await loadAstro();
  const inline = {
    root,
    // Relative: Astro joins it to `root`.
    configFile: config,
    logLevel: 'error',
    server: {host: '127.0.0.1', port: await freePort()},
    // Its own optimizer cache, as `startSsrFixture` keeps: the example's is
    // shared with `pnpm dev`, under other configs.
    vite: {cacheDir: path.join(root, '.vite'), ...vite},
  };
  let server: Stoppable;
  if (build) {
    await astro.build(inline);
    server = await astro.preview(inline);
  } else {
    server = await astro.dev(inline);
  }
  const origin = `http://127.0.0.1:${inline.server.port}`;

  const executablePath = process.env['HMR_E2E_EXECUTABLE'];
  const browser = await chromium.launch({
    ...(executablePath !== undefined && executablePath !== ''
      ? {executablePath}
      : {channel: 'chrome'}),
    headless: process.env['HMR_E2E_HEADED'] === undefined,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  if (!build) {
    // The first load can still be optimizing deps, which reloads the page:
    // let it settle, then start from a clean load.
    await page.goto(`${origin}/`);
    await page.waitForLoadState('networkidle');
    await page.reload();
  }

  return {
    browser,
    page,
    root,
    origin,
    edit: async (rel, transform) => {
      const file = path.join(root, rel);
      const code = await readFile(file, 'utf8');
      const next = transform(code);
      if (next === code) throw new Error(`edit of ${rel} changed nothing`);
      await writeFile(file, next);
    },
    close: async () => {
      await browser.close();
      await server.stop();
      await rm(root, {recursive: true, force: true});
      process.env = env;
    },
  };
};
