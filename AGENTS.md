<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Codebase health (fallow)

`pnpm fallow:check` runs in the pre-commit hook and CI and fails on new dead
code, unresolved imports, import cycles and complexity. Fix the finding, or
record in `.fallowrc.json` why it stays. Existing complexity sits in
`fallow-baselines/health.json`; re-save it with
`pnpm fallow health --save-baseline fallow-baselines/health.json` only when you
mean to accept a change to it, and never with coverage loaded, so the gate
reads the same everywhere. `pnpm run fallow:coverage` is the report to read:
it runs the unit tests with coverage and scores CRAP from that.

## Commits and the changelog

Subjects are plain sentences in the imperative — `Flash updated elements on the
page`, not `feat: flash updates`. The body explains why the change exists, for a
reader of the git history who wasn't here; the changelog entry is separate,
below.

Every non-merge commit carries one `Changelog:` trailer next to
`Co-Authored-By`; the commit-msg hook refuses one without it. It names the
kind of change and the part of Lit DevTools it changes, and a commit that
should show up in a changelog folds its user-facing entry under it, on lines
indented by two spaces:

```
Changelog: Fixed panel  # kind: Added | Changed | Fixed | Removed
  **Source links open in the editor you chose.** Clicks from the panel and
  the in-page overlay now pass the editor picked in config, env or Settings.
Changelog: skip         # tests, docs plumbing, tooling, refactors
```

The entry is one bullet from the user's side: a bold outcome, then the symptom
that is gone or the thing now possible. `/changelog entry` drafts it from the
staged diff. A trailer with nothing folded under it still lands in the draft,
with the body as a placeholder to rewrite.

| Part              | What it covers                                       | Shared heading            |
| ----------------- | ---------------------------------------------------- | ------------------------- |
| `plugin`          | the Vite plugin: HMR, CSS, the manifest, the CLI     | Vite & Astro plugin       |
| `astro`           | the Astro integration                                | Vite & Astro plugin       |
| `panel`           | the DevTools panel, under Vite or standalone         | DevTools panel            |
| `inspector`       | Lit Inspector, the browser extension                 | Lit Inspector             |
| `language-server` | `packages/lit-language-server` and `src/lib/editor/` | Editors & language server |
| `vscode`          | `packages/vscode`                                    | Editors & language server |
| `zed`             | `packages/zed`                                       | Editors & language server |
| `oxlint`          | `packages/oxlint-plugin-lit`                         | Lint rules                |
| `docs`            | the docs site and the examples                       | Docs & examples           |

A change to two parts that users meet separately, such as an editor fix that
also changes what the lint rules report, is two commits or one entry under
the part most users see.

`CHANGELOG.md` is the changelog of Lit DevTools, organised by the shared
headings above; `pnpm run changelog` drafts its section from every part. The
VS Code extension keeps its own changelog on its own versions, drafted from
its parts with `pnpm run changelog:vscode` (`vscode`, and `language-server`,
since it bundles the server).

Four packages release together at one version from one `v*` tag: the plugin
(`@oddsquad/vite-plugin-lit`), the language server
(`packages/lit-language-server`), the Oxlint plugin
(`packages/oxlint-plugin-lit`) and `@oddsquad/lit-devtools`
(`packages/lit-devtools`), which re-exports the other three. A release commit
bumps all four `package.json` files, which a unit test keeps equal;
`release.yaml` publishes the plugin, then the server, the Oxlint plugin and
the umbrella, skipping any already on npm so a failed job can be rerun. The
umbrella depends on the others with `workspace:^`, which pnpm turns into
that version as it packs, and ships the shared `CHANGELOG.md`, copied in as
it packs. A change that makes one of its parts load the others by package
name breaks it under pnpm, which `src/test/e2e/lit-devtools-umbrella_test.ts`
catches. The server's and the Oxlint plugin's own `CHANGELOG.md` files keep
their history from before 0.25.0, when they had versions of their own.

The editor extensions release on their own tags too. The VS Code extension
(`packages/vscode`): a release commit bumps its `package.json` and writes its
`packages/vscode/CHANGELOG.md` section, and a `vscode-v<version>` tag runs
`.github/workflows/release-vscode.yaml`, which packages one `.vsix` per
platform, publishes them to the Marketplace and Open VSX, and creates the
GitHub Release. It bundles the language server, so a server release that
users should get needs an extension release as well. The Zed extension
installs the server from npm, so it needs a release only when `packages/zed`
changes: bump `packages/zed/extension.toml` and push a `zed-v<version>` tag,
and `.github/workflows/release-zed.yaml` opens the update pull request to
`zed-industries/extensions`. Both workflows say what they need set up in
their headers.

Updating the language server must never break an installed extension: Zed
runs the project's server or the latest one on npm, and VS Code a project's
own, whatever their versions. So these are a contract, pinned by
`src/test/unit/editor-server-contract_test.ts` and the umbrella's e2e test:
the package names `@oddsquad/lit-language-server` and
`@oddsquad/lit-devtools`, the files `dist/bin.mjs` and
`bin/lit-language-server.mjs` that start the server, and LSP over
`--stdio`. A change to any of them is breaking for every user: ship an
extension release that handles both forms first, and only then the server.

Work lands on a branch named for its kind (`feature/`, `fix/`, `docs/`) and
merges with `--no-ff`. Release commits bump the four `package.json` files,
write the `CHANGELOG.md` section, and get a `v<version>` tag. Pushing that tag
(`git push origin main --follow-tags`) is the release:
`.github/workflows/release.yaml` runs the gate, publishes the four packages
to npm over trusted publishing, and creates the GitHub Release from the
changelog section. Don't `pnpm publish` by hand.

A release can carry a video: commit the render of its HyperFrames project as
`assets/release-<version>/renders/video.mp4`. Committed before the tag, the
release picks it up; committed after, run
`gh workflow run release.yaml -f tag=v<version> -f target=youtube`. The
release workflow's `youtube` job attaches it to the GitHub Release and uploads it to
YouTube with the changelog section as its description, then links it from the
release notes (credentials and the one-time setup: `scripts/youtube-auth.mjs`).
In `CHANGELOG.md` the video is a poster linking to the release asset, because
GitHub strips `<video>`; put the poster and a copy of the MP4 in
`docs/public/demo/release-<version>{-poster.jpg,.mp4}` and the docs play it
inline (`docs/scripts/sync-changelog.mjs`).

At release time, `/changelog release v0.6.0` assembles the section: it runs
the draft, rewrites any entry that fell back to a commit body, writes the
intro paragraph, inserts the section into `CHANGELOG.md` and bumps the four
`package.json` files, then stops for review. The draft alone is

```sh
pnpm run changelog                    # heading reads "Unreleased"
pnpm run changelog --tag v0.4.0       # heading reads "0.4.0" (no `--`)
```

which prints to stdout and writes nothing. The file is hand-written on
purpose, and `cliff.toml` explains why.

## Working through beads

Tasks live in beads (`bd ready`, `bd show <id>`). When you're handed several
beads, finish them one at a time. Each one gets:

1. A fresh branch off `main`, named for its kind (`feature/<slug>`,
   `fix/<slug>`, …). Claim the bead with `bd update <id> --claim`.
2. Atomic commits: each commit is one self-contained step that passes
   `vp check` and `vp test` by itself (a refactor, then the behaviour built on
   it, then docs), carrying its own body and `Changelog:` trailer.
3. A `--no-ff` merge into `main` once checks pass, then deleting the branch
   and running `bd close <id>`. Start the next bead from the updated `main`.

Anything you find along the way that's out of scope becomes a new bead
(`bd create`), not an extra commit.
