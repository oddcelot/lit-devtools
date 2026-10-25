# Changelog

All notable changes to `@oddsquad/oxlint-plugin-lit`, on its own versions.
The language server's are in
[its CHANGELOG.md](../lit-language-server/CHANGELOG.md), and the Vite
plugin's in the repository's [CHANGELOG.md](../../CHANGELOG.md).

## 0.1.0 — 2026-10-25

The first release: the problems the Lit language server shows in your editor
can now fail a lint run. It reads your components the way the server does,
from your sources and your dependencies' Custom Elements Manifests, with the
same settings, and reports through Oxlint's own severities and comments.

### Added

- **Fail a lint run on the problems the editor shows.** Extend
  `configs.recommended` from `@oddsquad/oxlint-plugin-lit` in
  `oxlint.config.ts`, or Vite+'s `lint`, and a handler that doesn't fit its
  event or a broken `css` template fails Oxlint, at the editor's severities.
- **Rules named so they don't clash.** `lit-devtools/event-type` and
  `lit-devtools/css` sit next to eslint-plugin-lit's `lit/` rules; turn one
  off in `rules` or silence a line with `// oxlint-disable-next-line`.
