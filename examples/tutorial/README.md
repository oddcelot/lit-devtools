# Tutorial: finished files

These are the files you end up with after
[Build your first hot-reloading component](https://lit-devtools.oddsquad.dev/start/first-component/).
The docs page imports them with `?raw`, so what you read there is what is here.

`src/index.css` and `public/favicon.svg` are not the tutorial's: the template
ships them, `index.html` links them, and no step changes them. They are here
so that `index.html` finds what it links (the docs publish this directory as
a live demo, too); the favicon is the Lit flame rather than the template's
Vite logo.

This directory is not a runnable project on its own: it carries no
`package.json` and no lockfile, because the tutorial scaffolds those with
`npm create vite`. To verify these files, scaffold the template and copy them
in:

```sh
npm create vite@latest my-lit-app -- --template lit-ts
cd my-lit-app
npm install
npm install -D @oddsquad/lit-devtools
cp -R ../examples/tutorial/index.html ../examples/tutorial/tsconfig.json \
      ../examples/tutorial/vite.config.ts .
cp ../examples/tutorial/src/my-element.ts ../examples/tutorial/src/theme.css src/
npx tsc --noEmit
npm run dev
```

The page should render a heading, an input, an empty list, and a button. Add a
note, then edit the `<h1>` in `renderHeader()`: the note stays and the input
keeps its text. Change `dodgerblue` to `tomato` in `src/theme.css`: the note
borders turn red without a reload.
