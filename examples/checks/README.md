# Checks

Every check the Lit language server makes, with one example of each mistake,
next to a small documented component set it completes, documents and writes a
Custom Elements Manifest for. Open it in an editor with the Lit DevTools
extension and the problems are underlined; run `npm run lint` and
`npm run check` and the same ones fail a terminal run, as they would in CI.

```sh
npm install
npm run dev     # the page, which uses every component correctly
npm run lint    # Oxlint with the Lit rules: 25 problems in src/mistakes
npm run check   # TypeScript over every binding: 6 problems
```

The editor needs the extension: install Lit DevTools from the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=oddsquad.lit-devtools),
or follow [Use the Lit language server](https://lit-devtools.oddsquad.dev/guides/language-server/)
for Zed.

## What's where

- **`src/components/`** is the component set, used correctly in
  `checks-app.ts`. Nothing there is reported.
  - `x-button.ts` documents a property with a union type, an event, a slot,
    a part and a CSS custom property.
  - `x-card.ts` documents three slots, so a `slot` the card doesn't have is
    reported.
  - `x-badge.ts` is a component the app never imports.
- **`src/mistakes/`** holds one example of each mistake, with the problem it
  gets written above it. The app doesn't import these files.
- **`vendor/legacy-ui/`** stands in for a library that ships no manifest. The
  `custom-elements.json` next to it is written by hand and listed in the
  `manifests` setting, so `<legacy-chip>` is known like the rest.
- **`vite.config.ts`** turns on the manifest and sets the language server:
  `manifests`, `entries` and the two rules that are off by default.
- **`oxlint.config.ts`** extends the plugin's recommended config and turns
  the same two rules on for `npm run lint`.

## Try it in the editor

Open `src/components/checks-app.ts`:

1. **Hover** `<x-button>`. Its description, attributes, events, slots, parts
   and CSS custom properties come from its JSDoc in `x-button.ts`. Hover
   `<legacy-chip>`: its docs come from the hand-written manifest.
2. **Complete.** Type a space after `<x-button` and the attributes, `.`
   properties and `@` events it takes are offered, `@press` among them, and
   `size="` offers `small` and `large`.
3. **Go to its source.** Go to definition on `<x-card>` opens its class in
   `x-card.ts`; find references lists every place it's used.
4. **Edit the JSDoc.** Add `@slot icon - A leading icon.` to `x-button.ts`
   and hover `<x-button>` again: the new slot is there before you save.

Then open the files in `src/mistakes/`:

| File              | Shows                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `names.ts`        | `unknown-element`, `unknown-attribute`, `unknown-binding`, `invalid-value`, `unknown-slot`, each with what you meant      |
| `bindings.ts`     | `binding-type` for literals as you type, `event-type` for a handler, and `binding-type` on save for `.size=${this.label}` |
| `syntax.ts`       | `unclosed-tag`, `binding-syntax` and `directive-binding`                                                                  |
| `declarations.ts` | `invalid-name`, `missing-element-type`, `property-type`, `shadowed-member` and `property-visibility`                      |
| `imports.ts`      | `missing-import`, with a quick fix that adds the import                                                                   |
| `styles.ts`       | `css`                                                                                                                     |
| `ignored.ts`      | The same mistakes silenced with `lit-ignore` comments: nothing is reported                                                |
| `page.html`       | Custom elements checked in an HTML file, which Oxlint doesn't read                                                        |

Two quick fixes write code for you:

- In `declarations.ts`, the fix on `checks-untyped` adds the
  `HTMLElementTagNameMap` entry. `npx oxlint --fix src` does the same.
- In `imports.ts`, the fix on `<x-badge>` adds
  `import '../components/x-badge.js';`.

## The manifest

`npm run dev` writes `custom-elements.json` from the components' JSDoc, and
rewrites it as you edit them; `npm run manifest` writes it without a server.
The DevTools panel shows the same docs for the element you select.

## Docs

- [Use the Lit language server](https://lit-devtools.oddsquad.dev/guides/language-server/)
- [Every rule, with examples](https://lit-devtools.oddsquad.dev/reference/language-server/#problems-it-reports)
- [`lit-devtools check`](https://lit-devtools.oddsquad.dev/reference/cli/#lit-devtools-check)
- [Publish a Custom Elements Manifest](https://lit-devtools.oddsquad.dev/guides/manifest/)
