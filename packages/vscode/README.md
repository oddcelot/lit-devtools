# Lit DevTools for VS Code

Your editor, fluent in your Lit components. In `html` templates, HTML files,
JSX, Astro and MDX, and `css` templates, VS Code completes your components' tags, attributes,
properties and events, shows their docs on hover, takes you to their source,
and catches an event handler that doesn't fit its event.

It reads your components from source as you type, so an edit shows up before
you save, and your dependencies' Custom Elements Manifests. It works in one
package or a whole monorepo, with or without Vite, and needs no setup.

```ts
html`<x-button @submit-start=${(ev) => ev.detail.‸}></x-button>`;
//                              ^^ CustomEvent<{size: 'small' | 'large'; at: number}>
//                                 completion: size, at
```

## Features

### Completion

- **Tags.** Your components first, then those of your dependencies'
  manifests, then HTML and SVG elements.
- **Attributes, `.properties`, `?boolean` attributes and `@events`.** Each
  binding offers what the element takes, then the global ones (`id`,
  `hidden`, `click`…). `@` also offers the events your other components fire,
  since events bubble.
- **Values.** Inside quotes, the members of a union of string literals:
  `size="‸"` offers `small` and `large`.
- **CSS.** In a `css` template, VS Code's own CSS completion, plus your
  components' documented custom properties and `::part()` names.

### Hover

- **A component's tag:** its summary, description, attributes, properties,
  events, slots, CSS parts and custom properties, and where it's declared.
- **An attribute or property:** its type, default, the attribute or property
  it maps to, and the class it's inherited from.
- **An event:** who fires it and what a listener receives, down to
  `CustomEvent` · `detail` `{size: 'small' | 'large'; at: number}`.
- **HTML and SVG elements and attributes:** their description and a link to
  MDN.

### Go to implementation and find references

- **Go to Implementation** and **Go to Definition** (F12) on a tag, attribute,
  `.property` or `@event` open the class, field or `dispatchEvent` that
  declares it, in the base class when it's inherited.
- **Find All References** (Shift+F12) lists every template and HTML file that
  uses the tag or binding. An attribute and its property count as one, so
  `size` and `.size` find each other.

### JSX, Astro and MDX

Your components complete, hover and lead to their source in `.jsx` and
`.tsx` files, Astro templates and MDX too, each read its own way:

- **JSX and MDX:** `size="small"` or `selectedItem={item}` names a property
  or an attribute, and `onsubmit-start={fn}` an event, as React 19 and Preact
  read them; Solid's `on:`, `prop:`, `attr:` and `bool:` work too.
- **Astro:** a prop names a property or an attribute; the frontmatter's and
  `<script>` elements' `html` templates are Lit templates.

### Typed event handlers

TypeScript gives an inline handler's parameter no type inside a template,
or in JSX for a component's custom event. The extension knows which event
it is for:

- an **inlay hint** shows the event's type after an untyped parameter,
- the **Add event type** quick fix writes it in, so TypeScript takes over,
- `ev.` and `ev.detail.` complete from the event's type.

### Problems

- **A handler that doesn't fit its event** is an error: a method or typed
  handler that expects a `detail` key the event doesn't send, or a `string`
  where it sends a `number`.
- **CSS in `css` templates:** unknown properties and invalid values are
  warnings.
- **Settings:** a mistake in the server's settings is reported on its file.

## What to expect

- **No setup.** Open a folder with Lit components and they're known. The
  first read of a large monorepo takes a moment; edits are picked up as you
  type.
- **Where components come from:** every package's `src` folder by default,
  and the Custom Elements Manifests of the packages it depends on. Your
  sources win over a stale manifest.
- **Vite projects** are read through their Vite config, so aliases resolve.
  Projects without Vite use Node's resolution and `tsconfig.json` paths.
- **Alongside TypeScript and HTML support.** The extension adds to VS Code's
  own TypeScript and HTML features rather than replacing them; in an HTML
  file, standard elements stay with VS Code's HTML support.

## Settings

The extension has two settings of its own:

| Setting            | Default | What it does                                                          |
| ------------------ | ------- | --------------------------------------------------------------------- |
| `lit.server.path`  | none    | Runs another build of the language server: the path to its `bin.mjs`  |
| `lit.trace.server` | `off`   | Logs the messages to the server in the **Lit Language Server** output |

What the server reads and how loud each problem is go in your project, in
`litPlugin({languageServer})` in a Vite config or in a
`lit-devtools.config.ts`. The
[settings reference](https://lit-devtools.oddsquad.dev/reference/language-server/#settings)
lists them.

**Lit: Restart Language Server** starts it again. The extension runs your
project's own `@oddsquad/lit-language-server` when the project installs it,
so the version matches the project, and the copy it ships with otherwise;
the **Lit Language Server** output channel says which.

## Learn more

- [Use the Lit language server](https://lit-devtools.oddsquad.dev/guides/language-server/)
- [Everything it completes, shows and reports](https://lit-devtools.oddsquad.dev/reference/language-server/)
- [Report a problem](https://github.com/oddcelot/lit-devtools/issues)

## License

BSD-3-Clause
