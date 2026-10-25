# @oddsquad/lit-devtools

Lit DevTools in one install: the Vite and Astro plugin with true HMR and a
DevTools panel, the language server for your editor, and Oxlint rules for
Lit templates.

```sh
npm install -D @oddsquad/lit-devtools
```

| Import                            | What                                                                 |
| --------------------------------- | -------------------------------------------------------------------- |
| `@oddsquad/lit-devtools`          | `defineConfig` and the types for `lit-devtools.config.ts`            |
| `@oddsquad/lit-devtools/vite`     | `litPlugin`, for `vite.config.ts`                                    |
| `@oddsquad/lit-devtools/build`    | `litCss`, for a build-only config                                    |
| `@oddsquad/lit-devtools/css`      | `urlSheet`, `devCacheBust`: the CSS helpers for component code       |
| `@oddsquad/lit-devtools/astro`    | the Astro integration                                                |
| `@oddsquad/lit-devtools/uno`      | `unoSheet`, UnoCSS in a Lit stylesheet                               |
| `@oddsquad/lit-devtools/devframe` | `createLitDevtools`, the panel in your own page                      |
| `@oddsquad/lit-devtools/oxlint`   | the Oxlint plugin, with `configs.recommended`                        |
| `@oddsquad/lit-devtools/client`   | types for the plugin's import queries, for `tsconfig.json`'s `types` |

It also links the `lit-devtools` and `lit-language-server` commands, and the
VS Code and Zed extensions find the language server inside it, so the
server's version matches the project's.

```ts
// vite.config.ts
import {defineConfig} from 'vite';
import {litPlugin} from '@oddsquad/lit-devtools/vite';

export default defineConfig({plugins: [litPlugin()]});
```

Each part is also its own package, for a project that wants only one:
[`@oddsquad/vite-plugin-lit`](https://www.npmjs.com/package/@oddsquad/vite-plugin-lit),
[`@oddsquad/lit-language-server`](https://www.npmjs.com/package/@oddsquad/lit-language-server)
and
[`@oddsquad/oxlint-plugin-lit`](https://www.npmjs.com/package/@oddsquad/oxlint-plugin-lit).
This package only re-exports them.

[The docs](https://lit-devtools.oddsquad.dev/) cover each part.

## License

BSD-3-Clause
