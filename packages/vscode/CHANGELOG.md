# Changelog

All notable changes to Lit DevTools for VS Code, including the language
server it bundles. The rest of Lit DevTools is in the repository's
[changelog](https://github.com/oddcelot/lit-devtools/blob/main/CHANGELOG.md).

## 0.1.0 — 2026-10-25

The first release: VS Code learns your Lit components, read from your
sources as you type and from your dependencies' Custom Elements Manifests.

### Added

- **Completion, hover and problems in templates.** Tags, attributes,
  `.properties`, `?boolean` attributes and `@events` complete in `html`
  templates, HTML files and `css` templates; hovers show their docs; a
  handler that doesn't fit its event is an error.
- **Go to a component's source, and find where it's used.** Go to
  Implementation or Definition on a tag or binding opens what declares it;
  Find All References lists every template that uses it.
- **JSX, Astro and MDX.** Components complete, hover and lead to their
  source in `.jsx` and `.tsx` files, Astro templates and MDX, with React 19's,
  Preact's and Solid's ways of writing props and events.
- **Typed event handlers.** An inlay hint shows an untyped handler's event,
  and a quick fix writes it in.
- **Works with nothing installed.** The extension ships the language server,
  and runs the project's own copy instead when it installs one, directly or
  through `@oddsquad/lit-devtools`.
