---
name: vite-plugin-lit
description: Set up and use @oddsquad/lit-devtools (the Lit Vite plugin, @oddsquad/vite-plugin-lit) in a Vite project with Lit components - true HMR that keeps component state, CSS delivered to shadow roots (?css-sheet, ?hmr-url, urlSheet()), and the Lit DevTools panel and its MCP server. Use when adding the plugin, typing its import queries, choosing how to ship CSS to Lit components, diagnosing why an edit reloaded the page instead of hot-patching, or connecting a coding agent to a running Lit app.
---

# Lit DevTools

`@oddsquad/lit-devtools` installs the Lit Vite plugin,
`@oddsquad/vite-plugin-lit`, which hot-patches Lit components in a Vite dev
server: an edit lands in the running page without a reload, and focus,
input values, reactive properties and child state survive. It also adds
CSS import queries for shadow roots and an optional DevTools panel.

Every docs page is available as Markdown: append `index.md` to its URL, or
request it with `Accept: text/markdown`. The whole site is in
https://lit-devtools.oddsquad.dev/llms-full.txt.

## Install

```sh
npm i -D @oddsquad/lit-devtools
```

Lit and Vite stay the project's own dependencies.

```ts
// vite.config.ts
import {defineConfig} from 'vite';
import {litPlugin} from '@oddsquad/lit-devtools/vite';

export default defineConfig({
  plugins: [litPlugin()],
});
```

Hot patching, the on-page indicator and the CSS queries are on from here;
everything dev-only stays out of `vite build`. For a build that loads none
of the dev code, use `litCss()` from `@oddsquad/lit-devtools/build`
when `command !== 'serve'`.

Register the query types. `types` replaces TypeScript's default list, so
keep `vite/client` beside it:

```json
{
  "compilerOptions": {
    "types": ["vite/client", "@oddsquad/lit-devtools/client"]
  }
}
```

or add `/// <reference types="@oddsquad/lit-devtools/client" />` to any
`.d.ts` in `include`.

Verify: run the dev server, type into an input inside a component, edit
that component's template and save. The text stays and the corner
indicator pulses green. A full reload means the edit hit a shape that
can't be patched in place; see Limitations below.

## Deliver CSS to shadow roots

| Shape                                   | Use when                                                           | An edit                              |
| --------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| `import sheet from './x.css?css-sheet'` | many components share one sheet, cached as its own `.css` asset    | restyles every adopter, no re-render |
| `urlSheet()` with `?url`                | the same, with a custom fetch or code that runs without the plugin | restyles every adopter, no re-render |
| `?raw` in one shared module             | a shared sheet that must not flash on first paint                  | restyles every adopter, no re-render |
| `?hmr-url` in a `<link>`                | rules one component owns, kept as a `.css` asset                   | re-renders that component            |
| `?raw` / `?inline` + `unsafeCSS`        | rules one component owns, shipped in the JS chunk                  | re-renders that component            |

Generated utility CSS (Tailwind, UnoCSS) belongs in a shared sheet.
`static styles` takes an array: shared sheet first, the component's own
`css` after it.

Guide: https://lit-devtools.oddsquad.dev/guides/stylesheets/index.md

## When an edit doesn't patch cleanly

The console names the reason with a `[lit-plugin] <my-element>:` line.

- **Reloads: standard `accessor` decorators.** Switch to experimental
  decorators (`experimentalDecorators: true`,
  `useDefineForClassFields: false`) or `static properties`.
  `hmr.onIncompatible: 'warn'` keeps the page up and only warns.
- **Other exports look stale.** A module exporting a component and other
  values accepts its own updates, so importers keep old bindings. Move
  shared non-class exports into their own module.
- **Top-level state resets.** A hot patch re-runs the edited module, so
  signals, caches and context keys declared there start over. Keep them in
  a module you aren't editing.
- **`observedAttributes` changed.** The platform can't update it; reload.

Every shape, its console line and its fix:
https://lit-devtools.oddsquad.dev/reference/limitations/index.md and
https://lit-devtools.oddsquad.dev/guides/troubleshooting/index.md

## DevTools panel and MCP

The panel records lifecycle, render and input events and explains why
each component updated. It's dev-only and off by default:

```ts
import {DevTools} from '@vitejs/devtools'; // npm i -D @vitejs/devtools

(litPlugin({timeline: true, sourceOverlay: true}), DevTools());
```

`LIT_PLUGIN_TIMELINE=true` in `.env.local` does the same. Without
`@vitejs/devtools` the dev server serves the panel itself at `/__lit/`.

With the panel on, a coding agent can read the running app over MCP. One
entry covers every dev server on the machine:

```sh
claude mcp add lit-devtools -- npx -y @oddsquad/lit-devtools mcp
```

Start with `lit_update-summary` for "why did this re-render";
`lit_hmr-history` and `lit_hmr-incompatibilities` for "did my edit land".
`lit_list-components` and `lit_component-details` read the live tree;
`lit_set-prop` writes a property and shows up in the panel's overrides.
The tools answer only while a dev server with DevTools runs, and the
endpoint is localhost-only (`/__devtools/__mcp`, or `/__lit/__mcp` without
Vite DevTools).

Guide: https://lit-devtools.oddsquad.dev/guides/devtools/agents/index.md

## Reference

- Options: https://lit-devtools.oddsquad.dev/reference/options/index.md
  (`hmr.*`, `sourceOverlay`, `timeline`, `cssSheetBuild`, Astro options)
- Environment variables: https://lit-devtools.oddsquad.dev/reference/environment-variables/index.md
- Import queries: https://lit-devtools.oddsquad.dev/reference/import-queries/index.md
- Compatibility (Lit, Vite and Node versions): https://lit-devtools.oddsquad.dev/reference/compatibility/index.md
- Astro: https://lit-devtools.oddsquad.dev/guides/astro/index.md
