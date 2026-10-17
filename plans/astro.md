# Astro

`@oddsquad/vite-plugin-lit/astro` makes the plugin a complete Lit integration
for Astro: Astro's renderer for Lit (server rendering and hydration), the
plugin's HMR, and the Lit panel in Astro's dev toolbar. `lit()` is all of it;
`litDevtools()` is the same without the renderer, for a site that keeps
another one such as `@awesome.me/astro-lit`. Experimental.

## Parts

- **`src/astro.ts`**, the integration. Adds `litPlugin()` to Astro's Vite
  config with the timeline on, registers the renderer by package export
  (`./astro/server`, `./astro/client`), injects the page script, registers
  the toolbar app, and in dev runs the plugin's `transformIndexHtml` hooks
  on each HTML page (`lib/astro/page-tags.ts`), since Astro never calls
  them. Imports nothing from `astro`: hook arguments are declared as the
  slices it uses.
- **`lib/astro/server.ts`**, the renderer's server half. `check()` takes a
  tag string or a class and asks the registry (`get`, `getName`);
  `renderToStaticMarkup()` renders the element with `@lit-labs/ssr`'s
  `LitElementRenderer` into a declarative shadow root, then the slots.
- **`lib/astro/client.ts`**, the renderer's client half, called by an
  `<astro-island>`. Sets the properties the HTML couldn't carry and releases
  the element; for `client:only`, creates it by tag.
- **`lib/astro/props.ts`**, shared by both halves: which props are
  attributes and which are properties, and how a plain tag carries its
  properties: plain JSON, or Astro's island tags when JSON loses a value.
- **`lib/astro/slots.ts`**, shared: puts `slot="name"` back on named-slot
  content, which Astro hands over with the attribute taken off.
- **`lib/astro/boot.ts` and `release.ts`**, the page script: releases the
  elements the renderer deferred, again after a view transition.
- **`lib/astro/node-builds.ts`**, a Vite plugin for server environments
  that don't resolve the `node` condition (Cloudflare's `workerd`): sends
  `lit-html` and `@lit/reactive-element` to their node builds, which render
  through the DOM shim, instead of the browser's, which read `document` on
  load. Tried with `@astrojs/cloudflare` 14.4 on Astro 7.4; Vercel and
  Netlify trace `node_modules` and need nothing.
- **`lib/astro/shadow-roots.ts`**, also the page script's: attaches the
  incoming page's declarative shadow roots on `astro:before-swap`. Astro's
  router attaches them only after the swap, once each Lit element has made
  its own, so they would be dropped and rendered anew.
- **`lib/astro/toolbar-app.ts`**, the dev toolbar window around `/__lit/`,
  and its auth code handling.

## Invariants

- **Only release what the renderer deferred.** An element that gets
  properties is rendered with `defer-hydration` and `data-lit-props`. The
  page script and the client renderer remove `defer-hydration` only from
  elements carrying the marker, so one written by hand waits for its author.
- **Hydrate support loads before Lit, from the project.** The injected
  script imports `@lit-labs/ssr-client/lit-element-hydrate-support.js` by
  bare name, so it resolves as the project's `lit` does, and is in
  `optimizeDeps.include`. Imported from the plugin's directory it can pull a
  second Lit into the page. It is injected at both `page` and
  `before-hydration`: a page without islands loads only the first, and an
  island may hydrate before it.
- **The renderer is named `lit`.** Astro finds the renderer for
  `client:only` by name once there is more than one, and `lit` is the hint
  people write.
- **Tags, not constructors, in the browser.** In dev an island can import a
  later version of a class than the registered one (the module evaluated
  again), which can't be constructed. The client renderer creates elements
  with `document.createElement(customElements.getName(Class))`, and the HMR
  runtime's `getName()` also answers for later versions (`runtime/patch.ts`).
- **Tested through Astro's JavaScript API.** `src/test/e2e/astro*_test.ts`
  run a copy of `examples/astro` with `dev()`, or `build()` then
  `preview()`, in the test process, one setup per file: the server-side
  registry is global, so two builds can't share a process. Astro drops its
  request handler under `VITEST` and HMR under `NODE_ENV=test`; the fixture
  unsets both.
- **The page script is dev and production alike.** Nothing it does depends
  on the dev server, so a build hydrates as dev does.

## Parity with @awesome.me/astro-lit

| Feature                                           | astro-lit 5.0.4               | here                                                       |
| ------------------------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| Render a tag in a page (`<my-el>`)                | yes                           | yes                                                        |
| Render an imported class (`<MyEl client:load />`) | patches `define`              | `customElements.getName()`, no patch                       |
| Attributes vs properties                          | by name                       | by name, and a property's name maps to its attribute       |
| Object props on an island                         | yes                           | yes                                                        |
| Object props on a plain tag                       | lost                          | carried in `data-lit-props`, with Astro's island types     |
| `defer-hydration` written by hand                 | released at once              | respected                                                  |
| Named slots                                       | `parse5`                      | top-level scanner, also wraps loose text                   |
| `client:only`                                     | yes                           | yes, by tag                                                |
| Next to another renderer                          | yes                           | yes, renderer named `lit`, so `client:only="lit"` resolves |
| Client bootstrap                                  | two imports by hand, in order | injected                                                   |
| Declarative shadow DOM polyfill                   | import by hand                | `shadowRootPolyfill: true`, built in, before components    |
| Container API (`getContainerRenderer`)            | yes                           | yes, tested (`examples/astro/test`)                        |
| Server DOM shim swap                              | replaces `HTMLElement`        | not needed on Astro 7                                      |
| HMR, `?css-sheet` on the server, panel            | no                            | yes                                                        |

## Decisions

- **One integration, not two packages.** The renderer needs the plugin's
  server-side handling (`?css-sheet`, dev re-definition), and the panel needs
  the renderer's hydration states to mean something; shipping them apart
  would mean keeping two release flows in step.
- **`@lit-labs/ssr` and `@lit-labs/ssr-client` are optional peers.** Only the
  renderer needs them; a Vite-only user installs nothing new.
- **`LitElementRenderer` directly, not `render()` of a template.** Rendering
  the element through a template would leave `lit-part` markers around it in
  the page.
- **Slots go in as light DOM, not `<astro-slot>`.** A wrapper would be the
  element's one slotted child, so the default slot would show it whole and
  named content inside it would never reach its slot. Without the wrapper
  Astro also keeps each slot of an island in a
  `<template data-astro-template>`, inert, dropped as the island hydrates,
  and what a `client:only` island builds its children from: the slot HTML
  goes out twice for an island, the cost of keeping slots working.
  `supportsAstroStaticSlot` only changes which wrapper Astro looks for and
  strips (`<astro-static-slot>` outside islands), so it stays off
  (`src/test/e2e/astro-slots_test.ts`).
- **Astro 7.3 and later.** `astro` is an optional peer at `^7.3.0`, the
  version everything was tested on; astro-lit's server DOM shim swap, for
  older Astro, isn't needed there. Supporting Astro 6 would mean that swap
  and a second fixture.
- **No `parse5`.** It would be a dependency for every user of the Vite
  plugin, for one job a small scanner does.
