# Changelog

All notable changes to `@oddsquad/lit-devtools`, on its own versions: what
it exports and which versions of its parts it installs. What the parts
themselves do is in their changelogs: the Vite plugin's
[CHANGELOG.md](../../CHANGELOG.md), the
[language server's](../lit-language-server/CHANGELOG.md) and the
[Oxlint plugin's](../oxlint-plugin-lit/CHANGELOG.md).

## 0.1.0 — 2026-10-25

The first release: Lit DevTools in one install. It brings the Vite and Astro
plugin, the language server and its Oxlint rules, and re-exports each under
its own import, so a project names one package whichever part it starts
from. It installs `@oddsquad/vite-plugin-lit` 0.24,
`@oddsquad/lit-language-server` 0.2 and `@oddsquad/oxlint-plugin-lit` 0.1.

### Added

- **One install for every part.** `@oddsquad/lit-devtools/vite`, `/build`,
  `/astro`, `/css`, `/uno`, `/devframe` and `/client` are the Vite plugin's;
  `/oxlint` is the Oxlint plugin with `configs.recommended`; the root has
  `defineConfig` for `lit-devtools.config.ts`.
- **The `lit-devtools` and `lit-language-server` commands.** Both are linked
  into the project, and the VS Code and Zed extensions start the language
  server it installs, so its version matches the project's.
