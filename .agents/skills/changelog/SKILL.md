---
name: changelog
description: Draft the user-facing changelog entry for a commit, or assemble a changelog section for a release from the commits since the last tag. Covers CHANGELOG.md, the changelog of Lit DevTools (@oddsquad/lit-devtools and the plugin, released together), and the language server's, the Oxlint plugin's and the VS Code extension's own. Use at commit time (`/changelog entry`) and at release time (`/changelog release v0.25.0`, `/changelog release lit-language-server-v0.3.0`, `/changelog release oxlint-plugin-lit-v0.2.0`, `/changelog release vscode-v0.2.0`).
---

# Changelog

The changelogs are hand-written prose. Each commit carries its own entry,
folded under one `Changelog:` trailer that names the kind of change and the
part of Lit DevTools it changes, and `pnpm run changelog` (or a package's
`changelog:*` script) assembles those entries into a draft section. This
skill writes the entry at commit time and turns the draft into the committed
section at release time.

## `/changelog entry`

Draft the trailer for the change that is staged (or, if nothing is staged, the
working tree). Read the diff, not the commit body: the body says why the code
changed, the entry says what a user gets.

Output exactly this block, ready to paste at the end of the commit message
above `Co-Authored-By`:

```
Changelog: Fixed panel
  **Source links open in the editor you chose.** Clicks from the panel and
  the in-page overlay now pass the editor picked in config, env or Settings,
  so picking Cursor no longer opens VS Code.
```

The part decides where the entry lands: under its heading in `CHANGELOG.md`,
and in a package's own changelog for the parts that have one.

| Part              | Changed files                                     | Also drafts into    |
| ----------------- | ------------------------------------------------- | ------------------- |
| `plugin`          | the Vite plugin: HMR, CSS, the manifest, the CLI  |                     |
| `astro`           | `src/astro.ts`, `src/lib/astro/`                  |                     |
| `panel`           | `src/panel/`, the panel's runtime and devframe    |                     |
| `inspector`       | `extension/` (Lit Inspector)                      |                     |
| `language-server` | `packages/lit-language-server`, `src/lib/editor/` | server's, VS Code's |
| `vscode`          | `packages/vscode`                                 | VS Code's           |
| `zed`             | `packages/zed`                                    |                     |
| `oxlint`          | `packages/oxlint-plugin-lit`                      | Oxlint plugin's     |
| `docs`            | `docs/`, `examples/`                              |                     |

Pick the part whose users notice the change. Write the entry for them: an
editor entry speaks of hovers and completions, a lint entry of what a run
reports. A change two kinds of user meet separately is better as two commits.

Rules for the entry:

- One bullet, one to three sentences, wrapped at 79 columns, every
  continuation line indented two spaces. The indent is what makes git fold it
  into the trailer.
- Starts with a bold phrase naming the outcome from the user's side
  (`**A reloaded live panel keeps the recorded events.**`), not the
  implementation (`**Replay buffer into panel on connect**`).
- Then the symptom that is gone or the thing that is now possible. Name the
  option, env var or UI control the user touches, in backticks.
- Kind: `Added` for a new capability, `Changed` for different behaviour of an
  existing one, `Fixed` for a bug, `Removed` for something gone.
  `Changelog: skip`, with no part and nothing folded under it, for tests,
  docs plumbing, tooling and refactors. When in doubt between Changed and
  Fixed: was the old behaviour ever intended? Fixed if not.
- Match the voice of the existing entries in `CHANGELOG.md`.

## `/changelog release vX.Y.Z`

Assemble and write the Lit DevTools section: the plugin and
`@oddsquad/lit-devtools` release together at this version. Nothing here tags
or pushes; that stays with the person.

1. `pnpm run changelog --tag vX.Y.Z` prints the draft: one `###` heading per
   part with entries, in a fixed order, each bullet starting with its kind
   (`- **Fixed** — **Outcome.** …`). Bullets marked
   `<!-- no entry under the trailer; drafted from the body -->` are commits
   that only carried a kind and part. Rewrite each from its diff
   (`git show <hash>`) using the rules above, and drop the comment. Commits
   before 0.25.0 carry no part and draft under the Vite & Astro plugin; move
   one under the heading it belongs to.
2. Merge bullets that describe one user-facing change from several commits.
   Inside a part keep the kinds in order (Added, Changed, Fixed, Removed),
   bigger things first within each.
3. Write the intro paragraph: two to four sentences saying what this release
   is about across its parts, in the voice of the existing sections. Read the
   last two intros first.
4. Insert the section below the preamble of `CHANGELOG.md`, above the
   previous release. The heading must read `## X.Y.Z — YYYY-MM-DD` with an em
   dash; `scripts/release-notes.mjs` finds the section by that heading and
   the release workflow fails without it.
5. Bump `version` in `package.json` and in
   `packages/lit-devtools/package.json`, to the same version.
6. Show the resulting diff and stop. The release commit itself is described in
   AGENTS.md ("Commits and the changelog"); its subject is `Release X.Y.Z`,
   its body a two-sentence summary ending in "See CHANGELOG.md for the full
   section.", and its trailer `Changelog: skip`.

If the draft is empty, say so and stop: either HEAD is already tagged or every
commit since the tag was `skip`.

## `/changelog release lit-language-server-vX.Y.Z`

The same steps for the language server's own changelog, with its own files:
`pnpm run changelog:language-server --tag lit-language-server-vX.Y.Z` for
the draft (the `language-server` part, and the `Changelog-Language-Server:`
trailers commits before 0.25.0 carried), `packages/lit-language-server/CHANGELOG.md`
for the section, with `### Added` / `### Changed` / … headings as before,
and the `version` in `packages/lit-language-server/package.json`. The
release commit's subject is `Release the language server X.Y.Z`; the tag
that publishes it is `lit-language-server-vX.Y.Z`.

## `/changelog release oxlint-plugin-lit-vX.Y.Z`

The same again for the Oxlint plugin:
`pnpm run changelog:oxlint-plugin --tag oxlint-plugin-lit-vX.Y.Z` (the
`oxlint` part), `packages/oxlint-plugin-lit/CHANGELOG.md`, and the `version`
in `packages/oxlint-plugin-lit/package.json`. The release commit's subject is
`Release the Oxlint plugin X.Y.Z`; the tag that publishes it is
`oxlint-plugin-lit-vX.Y.Z`.

## `/changelog release vscode-vX.Y.Z`

And for the VS Code extension: `pnpm run changelog:vscode --tag
vscode-vX.Y.Z` (the `vscode` part, and `language-server`, since the extension
bundles the server; write those for someone using VS Code),
`packages/vscode/CHANGELOG.md`, and the `version` in
`packages/vscode/package.json`. The release commit's subject is
`Release the VS Code extension X.Y.Z`; the tag that publishes it is
`vscode-vX.Y.Z`.
