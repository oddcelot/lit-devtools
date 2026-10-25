/// <reference types="node" />
/**
 * `examples/astro` under Astro's JavaScript API, as `ssr-utils.ts` serves
 * `examples/ssr`: a throwaway copy, a server for it and a browser on it.
 * The dev server is Astro's `dev()`, a build is `build()` then the Node
 * adapter's server in a process of its own, as it would be deployed,
 * all in this process, so the plugin under test is the repo's build output
 * (`examples/astro` links it through `@oddsquad/lit-devtools`).
 *
 * The copy sits inside the example, so `astro`, `@lit-labs/ssr` and the
 * adapters resolve from the example's own `node_modules`.
 */

import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {chromium, type Browser, type Page} from 'playwright-core';
import type {ViteDevServer} from 'vite';

const EXAMPLE_DIR = fileURLToPath(
  new URL('../../../examples/astro', import.meta.url)
);

/** The example's config, or one a test writes into the copy with `files`. */
export type AstroConfig = 'astro.config.mjs' | `${string}.config.mjs`;

export interface AstroFixture {
  browser: Browser;
  /** Astro's Vite server, in dev: its `hot` channel reaches the page. */
  vite?: ViteDevServer;
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
  /** Files written into the copy before it starts, by path under its root. */
  files?: Record<string, string>;
}

interface Stoppable {
  stop(): Promise<void>;
}

type AstroApi = {
  dev(config: object): Promise<Stoppable>;
  build(config: object): Promise<void>;
};

/** A port nothing listens on, for the server to take. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address() as {port: number};
      server.close(() => resolve(port));
    });
  });

/**
 * The built site, served by the Node adapter's own server in a child
 * process. Not in this one: the build already defined the site's elements
 * in its registry, and the server's bundle would define them again.
 */
const serveBuild = async (root: string, port: number): Promise<Stoppable> => {
  const child = spawn(
    process.execPath,
    [path.join(root, 'dist/server/entry.mjs')],
    {
      cwd: root,
      env: {...process.env, HOST: '127.0.0.1', PORT: String(port)},
      stdio: ['ignore', 'ignore', 'inherit'],
    }
  );
  for (let tries = 0; ; tries++) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      break;
    } catch (error) {
      if (tries > 100 || child.exitCode !== null) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return {
    stop: () =>
      new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.kill();
      }),
  };
};

/** The example's Astro, not one the repo root might find. */
const loadAstro = async (): Promise<AstroApi> => {
  const require = createRequire(path.join(EXAMPLE_DIR, 'package.json'));
  return (await import(
    pathToFileURL(require.resolve('astro')).href
  )) as AstroApi;
};

const COPIED = ['astro.config.mjs', 'tsconfig.json', 'public', 'src'];

export const startAstroFixture = async ({
  config = 'astro.config.mjs',
  build = false,
  vite = {},
  files = {},
}: AstroFixtureOptions = {}): Promise<AstroFixture> => {
  const root = path.join(EXAMPLE_DIR, '.e2e-tmp', randomUUID().slice(0, 8));
  // Entry by entry: the copy lives inside the example, which `cp` won't
  // copy into itself.
  for (const entry of COPIED) {
    await cp(path.join(EXAMPLE_DIR, entry), path.join(root, entry), {
      recursive: true,
    });
  }
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, rel)), {recursive: true});
    await writeFile(path.join(root, rel), content);
  }
  const env = {...process.env};
  process.env['ASTRO_TELEMETRY_DISABLED'] = '1';
  // Under Vitest, Astro's dev server leaves out its own request handler,
  // and `NODE_ENV=test` turns HMR off: run it as a developer would.
  delete process.env['VITEST'];
  process.env['NODE_ENV'] = build ? 'production' : 'development';
  const astro = await loadAstro();
  let devServer: ViteDevServer | undefined;
  const inline = {
    root,
    // Relative: Astro joins it to `root`.
    configFile: config,
    logLevel: 'error',
    server: {host: '127.0.0.1', port: await freePort()},
    // Its own optimizer cache, as `startSsrFixture` keeps: the example's is
    // shared with `pnpm dev`, under other configs.
    vite: {cacheDir: path.join(root, '.vite'), ...vite},
    // Added to the config file's integrations, to hand the test Vite.
    integrations: [
      {
        name: 'e2e-vite',
        hooks: {
          'astro:server:setup': ({server}: {server: ViteDevServer}) => {
            devServer = server;
          },
        },
      },
    ],
  };
  let server: Stoppable;
  if (build) {
    await astro.build(inline);
    server = await serveBuild(root, inline.server.port);
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
    ...(devServer ? {vite: devServer} : {}),
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
