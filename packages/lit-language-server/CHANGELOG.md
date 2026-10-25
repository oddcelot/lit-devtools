# Changelog

All notable changes to `@oddsquad/lit-language-server`, on its own versions.
The Vite plugin's changes are in the repository's
[CHANGELOG.md](../../CHANGELOG.md).

## 0.1.0 — 2026-10-25

The first release: a language server that makes your editor understand your
Lit components, read from your sources as you type and from your
dependencies' Custom Elements Manifests, in one package or a whole monorepo,
with or without Vite. Zed starts it through the Lit extension; any LSP editor
can run `lit-language-server --stdio`.

### Added

- **Completion in templates.** In `html` and `svg` templates, tags,
  attributes, `.properties`, `@events` and `?boolean` attributes complete
  from your components, then standard HTML and SVG elements; values of a
  union of string literals complete inside quotes.
- **Docs on hover.** A component's tag shows its API; an attribute, property
  or event shows its type, default and where it's inherited from; standard
  HTML and SVG elements link to MDN.
- **Events with their payload.** `@` offers the events any of your components
  fires, since they bubble, then DOM events, and a hover shows what the
  listener receives: `CustomEvent` · `detail` `{id: string; price: number}`.
- **Typed event handlers.** An untyped `(ev) => …` handler shows the event's
  type as an inlay hint, completes `ev.detail.` members, and the "Add event
  type" quick fix writes the annotation in.
- **A handler that doesn't fit its event is an error.** A method reference or
  typed inline handler expecting a `detail` key the event doesn't send, or the
  wrong primitive, is reported under the `event-type` rule.
- **CSS in `css` templates.** Completion, hover and validation, plus your
  components' documented custom properties after `var(--` and parts after
  `::part(`.
- **Settings.** `litPlugin({languageServer})` in a Vite config, or
  `lit-devtools.config.ts` with `defineConfig` from this package, choose the
  folders it reads, the template tags and each rule's severity.
