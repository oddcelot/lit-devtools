# Lit SSR

Lit components rendered on the server by a Vite dev server with
[`@lit-labs/ssr`](https://lit.dev/docs/ssr/overview/), then hydrated in the
page, with `@oddsquad/vite-plugin-lit` running on both.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/oddcelot/vite-plugin-lit/tree/main/examples/ssr?file=src/ssr-counter.ts)

```sh
pnpm install
pnpm dev
```

`server.mjs` runs Vite in middleware mode behind a plain Node HTTP server.
Each page request loads `src/entry-server.ts` through Vite's SSR module graph,
renders `src/page.ts` to HTML with declarative shadow roots, and puts it in
`index.html`. The browser then loads `src/entry-client.ts`, which imports
`@lit-labs/ssr-client/lit-element-hydrate-support.js` before any component, so
the elements hydrate in place instead of rendering again.

- `<ssr-counter>` arrives showing its server-side count and says
  _Server-rendered_ until it hydrates, then _Hydrated_. The count works from
  there.
- `<ssr-deferred>` is rendered with `defer-hydration`, so it stays inert server
  HTML until **Hydrate the deferred one** removes the attribute.

The Vite DevTools dock and its Lit panel work here too. Because Vite has no
HTTP server of its own in middleware mode, the dock opens a socket on
`server.host`, so `server.mjs` passes the host it listens on to Vite as well.
Without that the socket can bind `::1` while the page is on `127.0.0.1`.

On StackBlitz it installs the published plugin with npm and starts with
`npm run stackblitz`. StackBlitz gives each port its own origin, so the page
could reach neither Vite's HMR socket nor the dock's on ports of their own;
`stackblitz.mjs` starts `server.mjs` with `one-port.mjs`'s config, which
serves both from the page's server, and lets the dock connect from
StackBlitz's origin.

This example is also the fixture for the repo's SSR end-to-end tests
(`src/test/e2e/ssr_test.ts`), which start `startSsrServer` from `server.mjs`
with the repo's build of the plugin.
