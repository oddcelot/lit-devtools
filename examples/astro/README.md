# Lit in Astro

Lit components rendered on the server by Astro through
[`@awesome.me/astro-lit`](https://github.com/shoelace-style/astro-lit), then
hydrated in the page, with `@oddsquad/vite-plugin-lit` hot-patching them and
its Lit panel in Astro's dev toolbar.

```sh
pnpm install
pnpm dev
```

`astro.config.mjs` adds two integrations: `astro-lit`, which renders the
components, and `@oddsquad/vite-plugin-lit/astro`, which adds the plugin to
Astro's Vite config and the Lit panel to the dev toolbar. Click the Lit logo
in the toolbar to open it; the first time, it asks for the code the terminal
prints.

- `<ssr-counter>` is a plain server-rendered element. `astro-lit`'s
  hydration support wakes it as soon as its class loads, and it says
  _Hydrated_.
- `<ssr-deferred>` is an island, held back by a `client:on="#wake"`
  directive (`directives/on.js`) until **Water the plant** is clicked. Its
  plant hangs wilted until then. It is an island because `astro-lit` removes
  `defer-hydration` from every element outside one as soon as its class
  loads.

Edit either component while the page is open: it updates in place and keeps
its count.

## Production build

```sh
pnpm build
pnpm preview
```

The build has no devtools in it.
