---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "0.19.0: Lit rendered on the server, hot-patched in the browser, with hydration in the DevTools and a Lit tab in Chrome's Elements panel."
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

A plain changelog walk of the vite-plugin-lit 0.19.0 release, the same shape as the 0.18.0 video: intro → one beat per headline change → a fast fixes roll → outro. Source of truth is the `## 0.19.0 — 2026-10-17` section of the repo's CHANGELOG.md; show only what that section lists.

Beats: server-rendered Lit hot-patched in the dev server · hydration state in the Components tab · the SSR example (production build with the Lit panel, StackBlitz) · a Lit tab in Chrome's Elements panel · double renders flagged · Lit Inspector reads more manifests · fixes roll · outro.

## Assets

No site capture. The UI is redrawn from the recipe's dark Lit DevTools design (frame.md). Music: "Groche Énergique", on the same frame grid as 0.17.0 and 0.18.0.

## Customizations

Music, no voice-over, no captions: on-screen text carries the story. Copy restructured from the changelog, not verbatim.

## Notes

Lives in the repo at assets/release-0.19.0/ on branch feature/release-video-0.19, copied from assets/release-0.18.0. index.html is hand-edited, so don't run assemble-index.mjs over it. Run npx from this directory, never the repo root (root devEngines blocks npm).
