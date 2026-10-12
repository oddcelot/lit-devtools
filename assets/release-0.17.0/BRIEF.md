---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "0.17.0: the Components tab now explains a component and lets you change it."
destination: youtube
aspect: 1920x1080
language: en
audience: Lit developers who already use vite-plugin-lit
length: 45-60s
angle: changelog walk
recipe: lit-devtools-timeline
vo_mode: restructured
---
## Intent

A plain changelog walk of the vite-plugin-lit 0.17.0 release (user's pick): intro → one beat per headline change → a fast fixes roll → outro. Source of truth is the `## 0.17.0 — 2026-10-12` section of the repo's CHANGELOG.md and the v0.16.0..v0.17.0 commits; show only what that section lists (store-honesty rule from the extension promo).

Beats: component docs in the details pane · edit props (incl. inside objects/arrays/Maps, double-click) · overrides (switch off, undo, pin across reloads, extension pins) · docs in Lit Inspector + `lit_component-docs` MCP tool · hover a slot/part to find it · Anatomy labels with leader lines · CSS example with UnoCSS · fixes roll (6) · outro.

## Assets

No site capture (no-capture path). The UI is redrawn from the recipe's dark Lit DevTools design (frame.md). Music: the user-supplied "Brisk Feature Reveal" bed from assets/promo-video/assets/bgm (as in the first promo).

## Customizations

Music, no voice-over, no captions: on-screen text carries the story. Copy restructured from the changelog, not verbatim.

## Notes

Originally asked as /pr-to-video; the repo has no GitHub PRs, so the source is the release range. Lives in the repo at assets/release-0.17.0/ on branch feature/release-video-0.17 (bead vpl-31e4). Run npx from this directory, never the repo root (root devEngines blocks npm).
