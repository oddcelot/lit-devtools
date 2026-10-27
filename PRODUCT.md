# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Lit app developers** building with Vite (or Astro). The DevTools panel sits
  beside the running app while they edit, hot-patch and debug: what is this
  element's state, why did it re-render, where is it defined.
- **Lit component library authors** checking their components from the
  outside: properties, attributes, parts, slots, the custom elements manifest
  and the docs their users will see in the panel and the editor.

## Product Purpose

Lit DevTools is a toolkit for working on Lit components: an HMR that keeps
component state through an edit, a DevTools panel that understands Lit
(Components, Updates, Timeline, Settings), editor support through a language
server, and lint rules. Success is a developer who finds out what a component
is doing, and fixes it, without leaving their flow or reloading the page.

## Positioning

One toolkit across every surface a Lit developer works in, released together
at one version: the browser (the panel, the in-page overlay, the Lit Inspector
extension), the editor (the language server in VS Code, Zed and any LSP
editor) and the lint run (the Oxlint plugin). The panel is one face of that
toolkit, not a standalone product; the same components, terms and source links
carry across all of them.

## Operating Context

- The panel runs as the `lit` dock inside Vite DevTools, in its own browser
  tab, standalone from the CLI without Vite, and inside the Lit Inspector
  browser extension (Chrome, Firefox) on any Lit page.
- It is used beside the app, often docked in a narrow or short frame, during
  edit–save–look loops; clicks lead back to the source in the user's editor.
- Terminology is fixed in `CONTEXT.md` (page, followed page, reload, layer…)
  and the docs style guide in `docs/STYLE.md`.

## Capabilities and Constraints

- Panel tabs: Components (tree, details, Flash, Anatomy, picker), Updates,
  Timeline (list and tracks, layers, range filter, snapshot export), Settings
  (live overrides of plugin options, appearance, about).
- Packages released together: `@oddsquad/vite-plugin-lit`,
  `@oddsquad/lit-language-server`, `oxlint-plugin-lit` and the umbrella
  `@oddsquad/lit-devtools`; the VS Code and Zed extensions release on their
  own tags.
- The panel UI is built on the in-repo Lit Design System
  (`packages/lit-components`, `packages/webawesome-theme-lit`,
  `src/lib/design-tokens.ts`). It is **open to revision**: design work on the
  panel may change the design system itself, not only build on it.
- Status: experimental, released often.

## Brand Commitments

- Name: **Lit DevTools**; the browser extension is **Lit Inspector**.
- Light and dark are both first-class (Auto by default); every change ships
  and is checked in both.
- Docs voice follows `docs/STYLE.md`: second person, present tense, payoff
  first, no hedges.

## Evidence on Hand

- Live demos on StackBlitz: the playground, standalone mode and the examples in
  `examples/` (flame, Web Awesome, Fernhouse, CSS, Tailwind, Forms, SSR).
- Panel screenshots in light and dark: `docs/src/assets/shots/`, regenerated
  by `pnpm run docs:shots`.
- Promo and release videos (HyperFrames projects under `assets/`).
- Rule-by-rule comparisons with lit-analyzer and the manifest generators in
  `docs/src/content/docs/overview/`.
- No testimonials, user counts or benchmarks beyond those pages; do not invent
  any.

## Product Principles

1. **One toolkit, one vocabulary.** A component, a term or a source link means
   the same thing in the panel, the overlay, the extension and the editor.
2. **Serve both readers.** Every view answers the app developer's "what is it
   doing" and the library author's "what does it expose".
3. **Stay in the loop.** The panel earns its place beside the app by keeping
   the developer in the edit–look cycle: no reloads, one click to the source.
4. **Both schemes, always.** Light and dark are equal; neither is the
   afterthought.
