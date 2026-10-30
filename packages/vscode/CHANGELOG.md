# Changelog

All notable changes to Lit DevTools for VS Code, including the language
server it bundles. The rest of Lit DevTools is in the repository's
[changelog](https://github.com/oddcelot/lit-devtools/blob/main/CHANGELOG.md).

## 0.3.0 — 2026-10-30

JSX event handlers get the typing Lit's `@event` bindings have, components a
page defines in its own `<script>` are known, and hovers show a field's type
when its code only gives it a starting value. Tag completion stays quick in a
workspace with thousands of components.

### Added

- **Event handlers in JSX get typed too.** In React 19, Preact and Solid
  files, an untyped `onadd={(ev) => …}` or `on:add` handler shows the custom
  event's type as an inlay hint, offers "Add event type", completes
  `ev.detail.`, and is reported when its parameter type doesn't fit the
  event, as Lit's `@event` bindings already were.
- **Components an Astro or HTML page defines in its own script are known.**
  A class that a `<script>` in an `.astro` file, or an inline module script
  in an HTML page, registers with `customElements.define` now completes,
  hovers and goes to its definition, instead of being reported as an unknown
  element.
- **Hovers show the type of a field that starts as a literal.** `label = ''`
  reads as a `string` and `count = 0` as a `number`, where the hover showed
  no type.

### Fixed

- **Tag completion stays quick in a large workspace.** With thousands of
  components, completing a tag name took over 100 ms and grew with every
  component added; it now takes about a third of that.

## 0.2.0 — 2026-10-30

VS Code now checks what your templates do with your components, not just
what they name: unknown tags and props, values that don't fit a binding,
directives in the wrong place and templates Lit reads differently than
written, in Lit templates and in JSX, Astro, MDX and HTML. On save, your
project's TypeScript checks every binding against what the element takes.

### Added

- **Unknown elements, attributes, properties and slots are warnings.** A tag,
  attribute, `.property` or `slot="…"` nothing defines is reported with the
  name you probably meant, and so is a value outside an attribute's type, in
  `html` and `svg` templates and in JSX, Astro, MDX and HTML files.
  `ignoreTags` and `ignoreAttributes` silence them.
- **Binding type errors show when you save.** Your project's TypeScript
  checks every `.prop=${…}`, `attr=${…}`, `?bool=${…}` and `@event=${…}`
  against what the element takes, seeing through `live` and `ifDefined`, so
  `.size=${this.name}` is underlined when `name` is a `string` and `size` is
  `'small' | 'large'`. A literal that can't fit, such as `?hidden=${'no'}`, is
  reported as you type. Set `checkOnSave: false` to turn the check off, or the
  `binding-type` rule to `warning` or `off`.
- **Templates Lit reads differently than written are reported.** A component
  closed with `/>` or never closed, a `.`, `?` or `@` binding without `${…}`,
  a stray quote next to an expression and Polymer's `name$=` are flagged as
  you type.
- **A Lit directive where Lit can't apply it is an error.** `classMap`
  outside `class`, `styleMap` outside `style`, `ifDefined` on a property,
  `live` on a listener, `ref` in an attribute, and `repeat` or `unsafeHTML`
  anywhere but between tags.
- **Component declarations are checked.** A tag `customElements.define` would
  refuse, an `attribute:` name HTML lowercases away, a property whose `type`
  option doesn't fit its type, and a field that replaces an element's own
  method or breaks Lit's updates (`shadowed-member`) are reported in the
  component's file. `property-visibility`, off by default, flags
  `@property()` on private fields and `@state()` on public ones.
- **A component missing from `HTMLElementTagNameMap` is a warning, with a
  fix.** The quick fix writes the `declare global` block, so TypeScript knows
  what `document.createElement('x-button')` returns.
- **`missing-import` reports components a file never imports.** Turn it on to
  catch a tag used where nothing imports its definition, with a quick fix that
  adds the import. `entries` names an app entry whose imports count for every
  file.
- **The `manifests` setting is read.** List a manifest, by path or URL, for
  components whose package ships none, and they complete, hover and are
  checked like any other.
- **Silence a problem with a `lit-ignore` comment.** `<!-- lit-ignore -->`
  before an element, `// lit-ignore-next-line` above a line, or
  `// lit-ignore-file` for the file, each optionally naming the rules.
- **`lit-devtools check` runs the same checks in CI.** It type-checks every
  binding, lists the elements it couldn't check, follows the `binding-type`
  severity and, run at a monorepo's root, checks every package with its own
  settings and tsconfig.

### Changed

- **The extension is no longer experimental.** Its README and the language
  server's docs drop the Experimental label.

### Fixed

- **Settings apply to a project opened through a symlink.** A folder reached
  through a link, such as one under /tmp on macOS, ran with the default
  settings, ignoring `manifests`, `entries`, the rules it turned on and the
  check on save.
- **Completion and hover see what you just typed in another file.** A
  component added in one editor was sometimes missing from completion in the
  next for a moment.
- **No false CSS problems around expressions in a `css` template.** A
  selector or a whole block body written as `${…}` made the rules around it
  report errors.
- **Hovers name a component's file relative to your project.** A tag's hover
  shows `src/x-button.ts` instead of the file's full path on disk.
- **Code in an indented MDX fence stays code.** A fenced block under a list
  item was read as markup.

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
