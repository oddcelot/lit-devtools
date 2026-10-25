# Lit in Astro

A demo site for `@oddsquad/lit-devtools/astro`: Astro's renderer for
Lit, the plugin's HMR, and its Lit panel in Astro's dev toolbar, with a page
for each thing they do.

```sh
pnpm install
pnpm dev
```

Or open it on
[StackBlitz](https://stackblitz.com/github/oddcelot/vite-plugin-lit/tree/main/examples/astro?file=src/components/ssr-counter.ts),
which installs the latest release of the plugin from npm.

Click the Lit logo in the dev toolbar to open the panel; the first time, it
asks for the code the terminal prints.

| Page            | What it shows                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------- |
| `/basics/`      | Declarative shadow roots, hydration in place, `?css-sheet`, a `defer-hydration` you control   |
| `/islands/`     | Every `client:` directive, each element saying when it hydrated                               |
| `/props/`       | Attributes and properties; `Date`, `Map`, `Set`, `URL`, `BigInt` on a plain tag and an island |
| `/slots/`       | Default and named slots on a plain tag, a hydrated island and a `client:only` one             |
| `/nested/`      | Lit elements rendering Lit elements, server-rendered as one                                   |
| `/transitions/` | Pages swapped in by the `ClientRouter` that still hydrate, and a persisted element            |
| `/frameworks/`  | Preact islands next to Lit's, and Lit elements inside a Preact component                      |
| `/web-awesome/` | Web Awesome's elements as plain tags and inside a Lit component, server-rendered and hydrated |
| `/on-demand/`   | A page the Node adapter renders for each request                                              |
| `/devtools/`    | Edits that keep state, the toolbar panel, the source overlay                                  |

The site is styled with the Lit design system's tokens (`src/styles/tokens.css`);
the components share one `?css-sheet`, `src/components/ui.css`.

## Production build

```sh
pnpm build
pnpm preview
```

The build hydrates as dev does, with no devtools in it. `/on-demand/` is
served by the Node adapter; every other page is prebuilt.

## Container API

```sh
pnpm test
```

`test/container.test.ts` renders `/basics/` with Astro's container API and
the renderer from `getContainerRenderer()`.

## Next to Preact

`astro.config.mjs` adds Preact's integration, limited to `.tsx` files so it
leaves Lit's decorated `.ts` to Lit. `/frameworks/` puts Preact islands next
to Lit's, and Lit elements inside a Preact component.
