---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "0.18.0: utility CSS as one shared sheet, builds without dev code, and the console reaches your components."
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

A plain changelog walk of the vite-plugin-lit 0.18.0 release, the same shape as the 0.17.0 video: intro → one beat per headline change → a fast fixes roll → outro. Source of truth is the `## 0.18.0 — 2026-10-14` section of the repo's CHANGELOG.md; show only what that section lists.

Beats: `unoSheet()` makes UnoCSS one adopted sheet · the Tailwind example, with `@property` utilities working in shadow roots and dev classes reaching the sheet · builds carry no dev code (`litCss()` from `/build`) · Request update from the Components tab · `$lit` and Store as global variable in the console · DevTools edits, overrides and requests show up as the update's cause · fixes roll · outro.

## Assets

No site capture. The UI is redrawn from the recipe's dark Lit DevTools design (frame.md). Music: "Groche Énergique" from the 0.17.0 video, on the same frame grid so every cut lands where it did there.

## Customizations

Music, no voice-over, no captions: on-screen text carries the story. Copy restructured from the changelog, not verbatim.

## Notes

Lives in the repo at assets/release-0.18.0/ on branch feature/release-video-0.18 (bead vpl-836o), copied from assets/release-0.17.0. index.html is hand-edited, so don't run assemble-index.mjs over it. Run npx from this directory, never the repo root (root devEngines blocks npm).
