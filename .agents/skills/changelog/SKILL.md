---
name: changelog
description: Draft the user-facing changelog entry for a commit, or assemble the CHANGELOG.md section for a release from the commits since the last tag. Covers the plugin, and the language server and the Oxlint plugin, which keep their own changelogs. Use at commit time (`/changelog entry`) and at release time (`/changelog release v0.6.0`, `/changelog release lit-language-server-v0.2.0`, `/changelog release oxlint-plugin-lit-v0.1.0`).
---

# Changelog

`CHANGELOG.md` is hand-written prose. Each commit carries its own entry,
folded under the `Changelog:` trailer, and `pnpm run changelog` assembles
those entries into a draft section. This skill writes the entry at commit time
and turns the draft into the committed section at release time.

## `/changelog entry`

Draft the trailer for the change that is staged (or, if nothing is staged, the
working tree). Read the diff, not the commit body: the body says why the code
changed, the entry says what a user of the plugin gets.

Output exactly this block, ready to paste at the end of the commit message
above `Co-Authored-By`:

```
Changelog: Fixed
  **Source links open in the editor you chose.** Clicks from the panel and
  the in-page overlay now pass the editor picked in config, env or Settings,
  so picking Cursor no longer opens VS Code.
```

When the change also alters what the language server does
(`packages/lit-language-server`, or the editor code in `src/lib/editor/` it
bundles), add its own entry under `Changelog-Language-Server:`, written for
someone using the server in their editor. Its groups are the same, without
`skip`; leave the trailer out when the server is untouched. A change only the
server's users notice gets `Changelog: skip` for the plugin:

```
Changelog: skip
Changelog-Language-Server: Fixed
  **Hover shows inherited events.** An event a base class fires now appears
  on the component that extends it.
```

The Oxlint plugin (`packages/oxlint-plugin-lit`) bundles the same editor code
and the server's document code (`packages/lit-language-server/src/documents.ts`,
`css.ts`), so a change to what its rules report adds `Changelog-Oxlint-Plugin:`
too, written for someone reading lint output in CI. Same groups, no `skip`.

Rules for the entry:

- One bullet, one to three sentences, wrapped at 79 columns, every
  continuation line indented two spaces. The indent is what makes git fold it
  into the trailer.
- Starts with a bold phrase naming the outcome from the user's side
  (`**A reloaded live panel keeps the recorded events.**`), not the
  implementation (`**Replay buffer into panel on connect**`).
- Then the symptom that is gone or the thing that is now possible. Name the
  option, env var or UI control the user touches, in backticks.
- Group: `Added` for a new capability, `Changed` for different behaviour of an
  existing one, `Fixed` for a bug, `Removed` for something gone. `skip` with
  nothing folded under it for tests, docs, tooling and refactors. When in
  doubt between Changed and Fixed: was the old behaviour ever intended? Fixed
  if not.
- Match the voice of the existing entries in `CHANGELOG.md`.

## `/changelog release vX.Y.Z`

Assemble and write the section for a release. Nothing here tags or pushes;
that stays with the person.

1. `pnpm run changelog --tag vX.Y.Z` prints the draft. Bullets marked
   `<!-- no entry under the trailer; drafted from the body -->` are commits
   that only carried a group. Rewrite each from its diff (`git show <hash>`)
   using the rules above, and drop the comment.
2. Merge bullets that describe one user-facing change from several commits.
   Keep the order within a group: bigger things first.
3. Write the intro paragraph: two to four sentences saying what this release
   is about, in the voice of the existing sections. Read the last two intros
   first.
4. Insert the section below the preamble of `CHANGELOG.md`, above the
   previous release. The heading must read `## X.Y.Z — YYYY-MM-DD` with an em
   dash; `scripts/release-notes.mjs` finds the section by that heading and
   the release workflow fails without it.
5. Bump `version` in `package.json`.
6. Show the resulting diff and stop. The release commit itself is described in
   AGENTS.md ("Commits and the changelog"); its subject is `Release X.Y.Z`,
   its body a two-sentence summary ending in "See CHANGELOG.md for the full
   section.", and its trailer `Changelog: skip`.

If the draft is empty, say so and stop: either HEAD is already tagged or every
commit since the tag was `skip`.

## `/changelog release lit-language-server-vX.Y.Z`

The same steps for the language server's own changelog, with its own files:
`pnpm run changelog:language-server --tag lit-language-server-vX.Y.Z` for
the draft, `packages/lit-language-server/CHANGELOG.md` for the section
(heading `## X.Y.Z — YYYY-MM-DD`), and the `version` in
`packages/lit-language-server/package.json`. The release commit's subject is
`Release the language server X.Y.Z`; the tag that publishes it is
`lit-language-server-vX.Y.Z`.

## `/changelog release oxlint-plugin-lit-vX.Y.Z`

The same again for the Oxlint plugin:
`pnpm run changelog:oxlint-plugin --tag oxlint-plugin-lit-vX.Y.Z` for the
draft, `packages/oxlint-plugin-lit/CHANGELOG.md` for the section, and the
`version` in `packages/oxlint-plugin-lit/package.json`. The release commit's
subject is `Release the Oxlint plugin X.Y.Z`; the tag that publishes it is
`oxlint-plugin-lit-vX.Y.Z`.
