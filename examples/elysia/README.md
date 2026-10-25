# Lit on Elysia

A guestbook of Lit components that [Elysia](https://elysiajs.com) renders on
the server with [`@lit-labs/ssr`](https://lit.dev/docs/ssr/overview/), streams
to the browser, and keeps live over a WebSocket. Runs on Bun, which also
bundles the client. No Vite.

```sh
pnpm install   # or bun install, outside this repo
pnpm dev       # http://localhost:3000
```

Open it in two windows and sign in one: the entry arrives in both. Click a
signature for its own page.

## What happens on a request

There are two pages, and moving between them is a full page load, as in any
multi-page app:

- **`/`** is the book: the masthead, the form and every signature.
- **`/entries/:id`** is one signature, with links to the ones either side. A
  signature made while you read it shows up as **Newer →**.

Each page is a list of regions in [`src/page.ts`](src/page.ts), each region its
own Lit template. The server renders them into a `ReadableStream`
([`src/render.ts`](src/render.ts)): the head goes out before Lit has rendered
anything, so the browser starts fetching the client bundle while the server is
still at work. The page data follows as JSON, with a `page` field that says
which page it is.

In the browser, [`src/client/entry.ts`](src/client/entry.ts) imports Lit's
hydrate support before any component, reads that `page` field, then hydrates
each of the page's live regions with the same template and data. From there the client owns the data: every change, from
the clock or the socket, is a plain `render()` of the regions.

- **`<live-status>`** shows whether the page is connected to `/live` and how
  many readers are. The server renders the count it has; the socket updates it.
- **`<guest-book>`** lists the entries. Each **`<guest-entry>`** shows its time
  in UTC until the client passes in the reader's clock, then switches to
  "5 minutes ago".
- **`<sign-form>`** is an island. The server renders it with `defer-hydration`,
  and it stays server HTML until someone points at it or focuses it. Before
  that it is a plain `<form method="post" action="/sign">`, which works with
  JavaScript off; after, it posts through Eden and the entry comes back over
  the socket.

## Elysia

[`src/app.ts`](src/app.ts) is the whole server: the two pages, `/assets/*`, a JSON
API with TypeBox validation, the form's `/sign` action, and the `/live`
WebSocket that every page subscribes to. The client calls the API through
[Eden Treaty](https://elysiajs.com/eden/overview), typed from the app itself
([`src/client/api.ts`](src/client/api.ts)), so a renamed route or a changed body
fails the type check in the component that uses it. Entries live in SQLite
through `bun:sqlite`.

## Things that bite

Lit's hydration expects the first client render to produce exactly the server's
HTML, and does not patch the DOM where it differs; it just believes it.

- **Don't change data before hydration is done.** Elements hydrate in the
  microtasks after `hydrate()`. Setting the clock straight after left every time
  in UTC for good: the elements hydrated with the new value and never wrote it.
  The entry waits a task before its first change.
- **`hydrate()` removes `defer-hydration`** from every custom element in the
  template it hydrates. An island has to sit outside any hydrated template,
  which is why the form is a region of its own that the client never hydrates.
- **Browser-only state stays out of the first render.** The server cannot know
  the reader's time zone or connection, so both start as values the server can
  render (UTC, "Connecting…") and change after hydration.
- **Bun resolves Lit's `development` build** unless `NODE_ENV=production`. The
  `production` export condition alone does not switch it. The build script runs
  with `NODE_ENV=production`.

## Dev loop

`pnpm dev` is `bun --watch src/dev.ts`. Bun builds the client in memory at
startup. A change to anything the server imports restarts the process; a change
under `src/client/` rebuilds the bundle in place. Either way the page reloads
itself: an inline script holds a socket to `/__reload`.

It is a full reload, not HMR. `@oddsquad/vite-plugin-lit` hot-patches
components by transforming them in Vite, and nothing here runs Vite.

## Lit DevTools without Vite

The dev server hosts the Lit DevTools itself. Click the Lit button in the
bottom-right corner of the page and the panel opens in a drawer along the
bottom; drag its top edge to make it taller. Picking an element (**⌖ Pick** in
the panel, or Ctrl/⌘+Shift+S on the page) selects it there. The panel is also a
page of its own, at the second address `pnpm dev` prints:

```text
Guestbook at http://localhost:3000/
Lit DevTools at http://localhost:3000/__lit-devtools/
```

[`src/dev.ts`](src/dev.ts) makes
the panel with `createLitDevtools()` from `@oddsquad/lit-devtools/devframe`,
mounts its handler on `/__lit-devtools/*`, and puts its script first in
`<head>`, so the runtime sees every component the client defines. The panel and
its script are routes on the app; the RPC is a WebSocket devframe serves on a
spare port of its own, so there is no second process to start. The code gate is
off because the dev server only listens on `localhost`.

The Components tab shows `<sign-form>` as deferred until you point at it, the
inspector shows each element's properties, and the sourcemap gives where each
one is defined and rendered. HMR needs Vite and is not available.

Following a signature to its page reloads everything, the panel included. The
drawer comes back open, as tall as it was and on the tab you had, showing the
new page's components. A selection does not carry over: it named an element of
the page that left. Nor does a timeline recording, which restarts with each
page.

In this repo the package is linked from the root, so run `pnpm run build` there
first: the example loads its built `lib/` and `dist/`.

## Behind a tunnel or cloud preview

A tunnel or cloud preview (ngrok, a cloud IDE) puts the page on an origin of
its own, often with one hostname per port. Start the dev server with that
origin in `PREVIEW_ORIGIN`, a `*` standing for any subdomain:

```sh
PREVIEW_ORIGIN='https://*.ngrok-free.app' pnpm dev
```

[`src/dev.ts`](src/dev.ts) then listens on every interface, and the DevTools
keep their RPC on the page's origin (`transport: 'sse'`), admit that origin and
keep the code gate on: the page asks for the code the dev server printed, once
per browser. In a frame, such as an IDE's built-in preview, the Lit button
carries a dot instead, and the drawer holds the field for the code.

## Production

```sh
pnpm build   # dist/guestbook
pnpm start
```

[`scripts/build.ts`](scripts/build.ts) bundles the client with hashed names,
then compiles the server into one executable with those files embedded. Copy
`dist/guestbook` anywhere and run it: it needs neither Bun nor `node_modules`.
`PORT` and `DB` (the SQLite file, `guestbook.sqlite` by default) work there
too. The binary carries no DevTools; to inspect it, start `npx lit-devtools dev`
and set `LIT_DEVTOOLS` to the script address it prints.

## Tests

```sh
pnpm test        # bun test: the page, the API and the form, in process
pnpm typecheck
```
