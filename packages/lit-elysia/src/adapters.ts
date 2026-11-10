import {writeFile} from 'node:fs/promises';
import * as path from 'node:path';
import type {EnvironmentOptions} from 'vite';
import {runtime} from './runtime-path.ts';

/** Where the built app runs. */
export type AdapterName = 'node' | 'bun' | 'cloudflare';

export interface Adapter {
  /** Whether the app serves the client's files, or the host does. */
  servesStatic: boolean;
  /** The server entry's default export, from `app`, the Elysia app. */
  exportApp: string;
  /** A module that starts a server, written as `dist/server/index.js`. */
  start?: (entry: string) => string;
  /** The server environment's build, on top of the defaults. */
  ssr?: EnvironmentOptions;
  /** After the client build: files the host needs beside it. */
  afterClient?: (clientDir: string) => Promise<void>;
}

const json = (value: unknown) => JSON.stringify(value);

/** Runs on Node's HTTP server, from `node dist/server/index.js`. */
const node: Adapter = {
  servesStatic: true,
  exportApp: 'export default app;',
  start: (entry) => `
import app from ${json(entry)};
import {serve} from ${json(runtime('./node.ts'))};
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
await serve((request) => app.fetch(request), {port, host});
console.log(\`Listening on http://\${host}:\${port}\`);
`,
};

/** Runs on Bun's server, from `bun dist/server/index.js`. */
const bun: Adapter = {
  servesStatic: true,
  exportApp: 'export default app;',
  start: (entry) => `
import app from ${json(entry)};
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  hostname: process.env.HOST ?? '0.0.0.0',
  fetch: (request) => app.fetch(request),
});
console.log(\`Listening on \${server.url}\`);
`,
};

/**
 * Runs as a Cloudflare Worker: `dist/server/entry.js` is the worker's
 * `main`, everything bundled in, and Workers Static Assets serve
 * `dist/client`. Bindings come from `import {env} from 'cloudflare:workers'`.
 */
const cloudflare: Adapter = {
  servesStatic: false,
  // Compiled at startup: a Worker refuses code generation in a request.
  exportApp:
    'app.compile();\nexport default {fetch: (request) => app.fetch(request)};',
  ssr: {
    resolve: {noExternal: true},
    build: {
      rollupOptions: {
        external: [/^node:/, /^cloudflare:/],
        // Not `node`: Rolldown's Node runtime calls createRequire on
        // import.meta.url, which a Worker doesn't have.
        platform: 'neutral',
        // One file: a Worker's main module may export nothing but its
        // handler, and chunks would make it export what they share.
        output: {codeSplitting: false},
      },
    },
  },
  // The shell is inlined in the worker, and the manifest is the build's.
  afterClient: (clientDir) =>
    writeFile(path.join(clientDir, '.assetsignore'), 'index.html\n.vite\n'),
};

export const ADAPTERS: Record<AdapterName, Adapter> = {node, bun, cloudflare};
