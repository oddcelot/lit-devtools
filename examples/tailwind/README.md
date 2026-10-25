# Tailwind with @oddsquad/vite-plugin-lit

A page whose components share Tailwind v4 utilities as one adopted
`CSSStyleSheet`. Add a class to a component and the shared sheet swaps in
place; shadows, rings and gradients render inside shadow roots.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/oddcelot/lit-devtools/tree/main/examples/tailwind?file=src/tailwind.css)

- **`tailwind.css`** imports Tailwind's theme and utilities, and sets one
  colour, `--color-brand`. `@tailwindcss/vite` fills in the utilities your
  source uses.
- **`<tw-page>`**, **`<tw-profile-card>`** and **`<tw-stat-card>`** each import
  it with `?css-sheet`. All three adopt the same sheet object.

Each component has a `renders: N` badge. It goes up when the component
re-renders and stays put when only its styles change.

## Try it

Run it (on StackBlitz this has already happened):

```sh
npm install
npm run dev
```

Then, with the page open, edit and save:

1. **The brand colour.** In `src/tailwind.css`, change `--color-brand` to
   `oklch(0.6 0.22 150)`. The heading, the avatar, the button and the number
   all recolour, and no badge moves. One sheet changed, and every component
   adopts it.
2. **A new class.** In `src/tw-profile-card.ts`, add `uppercase` to the
   button's `class`. Tailwind adds the utility to the sheet, and the button's
   label goes upper case. The profile card's badge goes up because its own
   template changed. The page's and the stat card's stay.
3. **The DevTools.** Open the Vite DevTools dock (the button in the corner)
   and its Lit tab. The Components tree lists the three components; pick one
   on the page with Ctrl/⌘+Shift+S to jump to its source. The Timeline
   records each edit above and what it updated.

## How Tailwind gets into shadow roots

Styles do not cross a shadow boundary, so a utility layer has to be inside
every shadow root that uses it. `?css-sheet` gives every importer the same
`CSSStyleSheet`: the CSS is parsed once and adopted everywhere. In dev it
swaps that sheet's rules in place whenever Tailwind regenerates them, and
`vite build` emits it as a content-hashed `.css` asset.

Two things are specific to shadow roots:

- **No preflight.** `tailwind.css` imports `theme.css` and `utilities.css`,
  not all of `tailwindcss`. The preflight is a global reset, and adopted into
  a shadow root it would repeat in every component. That is why the button
  sets `border-0` itself.
- **`@property` goes to the document.** Tailwind registers the custom
  properties behind its shadows, rings, transforms and gradients with
  `@property`, which browsers ignore inside a shadow root. The plugin copies
  those rules into a sheet on the document, where they apply everywhere.
