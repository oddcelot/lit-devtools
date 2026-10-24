# Editor language servers

Spike `vpl-uujx`, 2026-10-24. The question was whether we need our own
language server so editors understand components, or whether the
Custom Elements Manifest the `manifest` option writes is enough. It is
enough: two existing servers read it and cover VS Code and Zed. We don't
build an LSP.

## The servers

|                    | [Web Components Language Server][wc] (wc-toolkit)                     | [`cem lsp`][cem] (Benny Powers)                                       |
| ------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Version tried      | VS Code extension 0.0.37 (bundled binary)                             | `@pwrs/cem` 0.11.4                                                    |
| VS Code            | `wc-toolkit.web-components-language-server`, Marketplace and Open VSX | `pwrs.cem-language-server-vscode`, Marketplace only (not on Open VSX) |
| Zed                | `wc-language-server` extension                                        | `cem` extension                                                       |
| Finds the manifest | `customElements` in `package.json`, own and dependencies'             | Same, plus config and global manifests                                |
| Reload on rewrite  | Own file watcher, under 4 s                                           | Own file watcher, under 4 s                                           |

The npm package `@wc-toolkit/language-server@0.0.7` ships only its
`package.json`. The editor extensions bundle the binary, so users never
notice. Anyone wiring it into another editor by hand would.

## How we tested

A headless LSP client (stdio, `initialize` → `didOpen`/`didChange` →
`completion`/`hover`, collecting `publishDiagnostics`) drove each server
against a fixture: a Lit `x-button` extending a Lit base class, with a union
type, a renamed attribute, `attribute: false`, `@fires`, slots, parts and a
CSS property, plus a vanilla `x-vanilla` with `observedAttributes`. The
manifest came from `lit-devtools manifest`. Scenarios ran in an `.html` file
and in an `html` tagged template in a `.ts` file. Editors talk to the same
binaries, so what's left to check by hand is how each editor wires them up.

## Results with our manifest

| Scenario                                        | wc-toolkit | cem                                          |
| ----------------------------------------------- | ---------- | -------------------------------------------- |
| Tag completion (HTML, Lit)                      | yes, yes   | yes, yes                                     |
| Attribute completion                            | yes, yes   | yes, **no in Lit templates**                 |
| Attribute value completion from a union         | yes        | yes                                          |
| Inherited attribute, vanilla observed attribute | yes        | yes                                          |
| Hover on tag, attribute                         | yes        | yes                                          |
| `.prop`, `@event`, `?bool` completion in Lit    | yes        | yes                                          |
| Hover on `.prop` and `@event` bindings          | yes        | yes                                          |
| Unknown element, unknown attribute, bad value   | all three  | all three in HTML; in Lit only the bad value |
| Unknown `.prop` / `@event` binding              | no         | no                                           |
| Picks up a manifest rewrite (`write: true`)     | yes        | yes                                          |

wc-toolkit handled everything we asked of it except unknown bindings. cem's
gaps are its own: with its own generated manifest it also offers no
attributes inside a Lit template. Its generator also dropped the vanilla
element's tag and every attribute of `x-button`, which our manifest has.

## What's on our side

- **cem flags imported elements as "not imported" in TypeScript.** Our module
  paths are source paths (`src/x-button.ts`), the same as the CEM analyzer's.
  cem's own generator writes `.js` paths. cem doesn't map the specifier in
  `import './x-button.js'` back to the `.ts` source, so with our manifest
  every Lit template using `x-button` gets the warning. Source paths are
  right for a dev manifest (the panel's source links use them), so this
  belongs upstream with cem. A built manifest names `dist/*.js` files and
  isn't affected.
- **A property typed only by its initializer has no type in the manifest.**
  `ariaText = ''` shows up without a type, so hovers say nothing about it.
  The analyzer infers `string` from a literal initializer. Small and
  optional; tracked as its own bead.

## For the docs bead

`vpl-td0y` can recommend wc-toolkit as the first choice for both editors,
with cem as the alternative for people who want its MCP/CLI. Setup is: turn
on `manifest: {write: true}` so `custom-elements.json` exists and
`package.json` points at it, then install the editor extension. There's no
server config. The guide should say the manifest stays live during `vite
dev`.

[wc]: https://github.com/wc-toolkit/wc-language-server
[cem]: https://github.com/bennypowers/cem
