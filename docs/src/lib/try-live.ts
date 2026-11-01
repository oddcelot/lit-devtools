/**
 * The project the hero's "Try it live" button runs on runbun.dev
 * (components/landing/TryLive.astro): the flame example with the plugin
 * from npm, a real Vite dev server in the visitor's browser. The page and
 * the component are the example's own files, so the two stay in step; only
 * the start script and package.json are written for runbun.
 */
import page from '../../../examples/flame/index.html?raw';
import component from '../../../examples/flame/src/lit-flame.ts?raw';
import tsconfig from '../../../examples/flame/tsconfig.json?raw';
import favicon from '../../../examples/flame/public/favicon.svg?raw';
import {dependencies, version} from '../../../package.json';

/**
 * runbun runs a file, not the `vite` command, so the dev server starts here,
 * with the example's vite.config.ts written out inline. The rest is what
 * examples/flame/stackblitz.mjs does for StackBlitz, for the same reasons:
 * the preview is a frame on its own origin (run.runbun.dev), where the dock
 * would neither mount nor be let in.
 */
const start = `import {createServer} from 'vite';
import {litPlugin} from '@oddsquad/vite-plugin-lit';

// The Vite DevTools dock refuses to mount in a frame, and the preview is
// one. Runs before any other script; reading a cross-origin parent's
// location throws, and \`parent\` is [Replaceable], so this shadows it.
const unframeDock = \`try {
  window.parent.location.href;
} catch {
  window.parent = window;
}\`;

const server = await createServer({
  root: process.cwd(),
  plugins: [
    // Edit src/lit-flame.ts: each save patches the running element, and
    // the corner of the preview counts the patches.
    litPlugin({hmr: {indicator: {count: true}}, timeline: true, sourceOverlay: true}),
    {
      name: 'unframe-dock',
      transformIndexHtml: () => [
        {tag: 'script', children: unframeDock, injectTo: 'head-prepend'},
      ],
    },
  ],
  // The dock along the bottom, with the Lit panel in it. This server runs
  // in your browser tab and nothing else can reach it, so it skips the
  // approval DevTools asks for in a terminal and lets the preview's origin
  // in. Don't copy that into a server other machines can reach.
  devtools: {
    enabled: true,
    clientAuth: false,
    dockPreferences: {defaultMode: 'edge', defaultPosition: 'bottom'},
    allowedOrigins: {
      token: crypto.randomUUID(),
      registerFromUrl: () => undefined,
      isAllowed: () => true,
    },
  },
});
await server.listen();
server.printUrls();
`;

const packageJson = {
  name: 'lit-devtools-try-live',
  private: true,
  type: 'module',
  dependencies: {
    '@oddsquad/vite-plugin-lit': `^${version}`,
    lit: '^3.3.3',
    vite: '^8.3.2',
    '@vitejs/devtools': '^0.7.6',
    // oxc-parser, which the plugin parses with, needs its WebAssembly build
    // in a browser, at the plugin's own oxc-parser range. That build pins
    // @emnapi 2.0.0-alpha.3, which @napi-rs/wasm-runtime can't load; 1.x at
    // the top of node_modules can.
    '@oxc-parser/binding-wasm32-wasi': dependencies['oxc-parser'],
    '@emnapi/core': '^1.7.1',
    '@emnapi/runtime': '^1.7.1',
  },
};

export const entry = 'src/lit-flame.ts';

export const files: Record<string, string> = {
  'package.json': JSON.stringify(packageJson, null, 2),
  'index.ts': start,
  'index.html': page,
  [entry]: component,
  'tsconfig.json': tsconfig,
  'public/favicon.svg': favicon,
};
