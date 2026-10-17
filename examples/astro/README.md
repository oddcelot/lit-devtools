# Lit in Astro

Lit components rendered on the server by Astro and hydrated in the page,
through `@oddsquad/vite-plugin-lit/astro`: Astro's renderer for Lit, the
plugin's HMR, and its Lit panel in Astro's dev toolbar.

```sh
pnpm install
pnpm dev
```

`astro.config.mjs` adds one integration, `lit()`. Click the Lit logo in the
dev toolbar to open the panel; the first time, it asks for the code the
terminal prints.

- `<ssr-counter>` is a plain tag. It hydrates as soon as its class loads,
  and says _Hydrated_.
- `<ssr-deferred>` is written with `defer-hydration`, which the renderer
  leaves alone: its plant hangs wilted until **Water the plant** removes the
  attribute.
- `<ssr-themed>` adopts a `?css-sheet` stylesheet, which the server writes
  into its shadow root.
- `<tag-list>` takes an array, which no attribute can carry. As a plain tag
  (`#plain`) the array rides along as JSON; as a `client:visible` island
  (`#island`) Astro hands it over when it scrolls into view; as
  `client:only` (`#only`) it renders in the browser only.

Edit a component while the page is open: it updates in place and keeps its
state.

## Production build

```sh
pnpm build
pnpm preview
```

The build hydrates as dev does, with no devtools in it.

## On-demand rendering

`astro.config.mjs` uses the Node adapter: the site is prebuilt, except
`/on-demand/`, which sets `prerender = false` and renders for each request.
`pnpm build` then `pnpm preview` serves both.

## Container API

```sh
pnpm test
```

`test/container.test.ts` renders the page with Astro's container API and
the renderer from `getContainerRenderer()`.

## Next to Preact

`astro.config.mjs` adds Preact's integration, limited to `.tsx` files so it
leaves Lit's decorated `.ts` to Lit. `/frameworks/` puts Preact islands next
to Lit's, and Lit elements inside a Preact component.
