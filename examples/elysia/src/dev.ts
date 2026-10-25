/**
 * The dev server: `bun --watch src/dev.ts`.
 *
 * Bun builds the client bundle in memory, so there is nothing on disk and
 * no Vite. Two kinds of change reach the page:
 *
 * - A file the server imports (the page, a component): `bun --watch`
 *   restarts the process, which builds the bundle again and starts with a
 *   new boot id. The page notices the id change and reloads.
 * - A file only the client imports (`src/client/`): the server is not
 *   restarted, so it watches `src/` itself, rebuilds, and tells the page.
 *
 * It is a reload, not HMR: the page comes back from the server, freshly
 * rendered.
 */

import {watch} from 'node:fs';
import {createLitDevtools} from '@oddsquad/lit-devtools/devframe';
import {Elysia} from 'elysia';
import {createApp, type Assets} from './app.ts';
import {openEntries} from './entries.ts';

const SRC = new URL('.', import.meta.url).pathname;
const ENTRY = `${SRC}client/entry.ts`;
const RELOAD = 'reload';
const bootId = crypto.randomUUID();

const bundle = async () => {
  const result = await Bun.build({
    entrypoints: [ENTRY],
    target: 'browser',
    // Linked, so the standalone DevTools can find where each component is
    // defined: the page fetches the map and hands it over.
    sourcemap: 'linked',
  });
  if (!result.success) {
    console.error(new AggregateError(result.logs, 'Client build failed'));
    return;
  }
  const files = new Map<string, Blob>();
  for (const output of result.outputs) {
    const name = output.path.replace(/^\.\//, '');
    if (output.kind !== 'sourcemap') {
      files.set(name, output);
      continue;
    }
    // Bun writes `sources` relative to the project, but the map is served
    // from `/assets/`, which would put every file under `assets/src/…`.
    const map = {...(await output.json()), sourceRoot: '/'};
    files.set(name, new Blob([JSON.stringify(map)], {type: output.type}));
  }
  return files;
};

let files = (await bundle()) ?? new Map();

const assets: Assets = {
  script: '/assets/entry.js',
  serve: (path) => {
    const file = files.get(path);
    return file && new Response(file, {headers: {'cache-control': 'no-store'}});
  },
};

// The page reloads when the boot id it was given changes (the server
// restarted) or when it is told to (the client bundle was rebuilt).
const reload = `(function connect(id) {
  var ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/__reload');
  ws.onmessage = function (event) {
    if (event.data === '${RELOAD}' || (id && event.data !== id)) location.reload();
    id = event.data;
  };
  ws.onclose = function () { setTimeout(function () { connect(id); }, 300); };
})()`;

const entries = openEntries(process.env.DB ?? 'guestbook.sqlite');
if (entries.list(1).length === 0) {
  entries.add({name: 'Lit', message: 'Rendered on the server, hydrated here.'});
  entries.add({name: 'Elysia', message: 'Served from Bun, no Vite in sight.'});
}

// Behind a tunnel or cloud preview (ngrok: `https://*.ngrok-free.app`) the
// page is on an origin of its own, often one hostname per port. The server
// then listens on every interface for the tunnel to reach, and the DevTools
// keep their RPC on the page's origin (SSE), admit that origin, and ask for
// the code they print: the tunnel is reachable by more than this machine.
const preview = process.env.PREVIEW_ORIGIN;

// The Lit DevTools panel, served by this app at /__lit-devtools/. Locally no
// code gate: the server only listens on loopback.
const devtools = createLitDevtools(
  preview === undefined
    ? {auth: false}
    : {transport: 'sse', allowedOrigins: [preview]}
);

const app = createApp({
  entries,
  assets,
  devtools: devtools.script,
  reload,
})
  .all(`${devtools.base}*`, ({request}) => devtools.handler(request))
  .use(
    new Elysia().ws('/__reload', {
      open(ws) {
        ws.subscribe(RELOAD);
        ws.send(bootId);
      },
    })
  )
  .listen({
    hostname: preview === undefined ? 'localhost' : '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
  });

let timer: ReturnType<typeof setTimeout> | undefined;
watch(SRC, {recursive: true}, () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const next = await bundle();
    if (!next) return;
    files = next;
    app.server?.publish(RELOAD, RELOAD);
  }, 50);
});

if (preview === undefined) {
  console.log(`Guestbook at ${app.server?.url}`);
  console.log(`Lit DevTools at ${new URL(devtools.base, app.server?.url)}`);
} else {
  console.log(`Guestbook on port ${app.server?.port}, behind ${preview}`);
  console.log(
    `Lit DevTools at ${devtools.base} on the preview; the code it asks ` +
      `for prints here`
  );
}
