# @oddsquad/lit-language-server

A language server for Lit components. In `html` and `svg` templates, HTML
files, JSX, Astro and MDX, and `css` templates, it completes your
components' tags, attributes, properties and events, shows their docs on
hover, leads to their source, types your event handlers, and reports a
handler that doesn't fit its event. It reads your components
from source as you type, and your dependencies' Custom Elements Manifests, in
one package or a whole monorepo, with or without Vite.

```ts
html`<x-button @submit-start=${(ev) => ev.detail.‸}></x-button>`;
//                              ^^ CustomEvent<{size: 'small' | 'large'; at: number}>
//                                 completion: size, at
```

## Use it

- **VS Code:** install the Lit extension; it starts this server, the
  project's own copy when it installs one.
- **Zed:** install the Lit extension; it starts this server.
- **Any LSP editor:** run `lit-language-server --stdio`, from a project that
  installs it:

  ```sh
  npm install -D @oddsquad/lit-language-server
  ```

- **Oxlint:** extend its recommended config, so a lint run fails on the same
  problems:

  ```ts
  // oxlint.config.ts
  import {defineConfig} from 'oxlint';
  import {recommended} from '@oddsquad/lit-language-server/oxlint';

  export default defineConfig({extends: [recommended]});
  ```

[Use the Lit language server](https://vite-plugin-lit.oddsquad.dev/guides/language-server/)
sets it up; the
[reference](https://vite-plugin-lit.oddsquad.dev/reference/language-server/)
lists everything it completes, shows and reports.

## Settings

It needs none. In a Vite project, set `languageServer` in
`litPlugin()` from `@oddsquad/vite-plugin-lit`; elsewhere, in a
`lit-devtools.config.ts`:

```ts
import {defineConfig} from '@oddsquad/lit-language-server';

export default defineConfig({
  languageServer: {
    diagnostics: {css: 'off'},
  },
});
```

## License

BSD-3-Clause
