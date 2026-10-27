# Iterating on the Lit DevTools promo, v4

A 54.92 s, 1920×1080 film cut to the user's track "Bounce Énergique" (125 BPM,
bar = 1.92 s). The dark Lit DevTools panel is the canvas: its Timeline strip
pans past a fixed cyan playhead, and each scene is a bar on a lane while the
stage above shows the demo. Output: `renders/video.mp4`. v1 (20 s) is in
`../promo-video/`, v2 (0.15 look) in `../promo-video-v2/`; both stay as they were.

v4 (2026-10-27) is a copy of v3 on the same bed, grid and windows, rebranded for 0.26: "Lit DevTools"
wordmark and headlines in Lexend (bundled `assets/lexend-latin-wght-normal.woff2`, OFL), the active tab
underlined in the flame gradient, the followed page's path in the header, panel section labels in
sentence-case Lexend, lane 3 renamed Editor. Frame 01 opens on the landing line "Lit, with the lights
on."; frame 11 (`11-editor.html`, `s11-editor`) replaces jump-to-source with the language server's checks
and a failing `lit-devtools check`; the lockup names Lit DevTools, `@oddsquad/lit-devtools` and the docs
URL. The Lexend restyle was scripted over v3's frames (headline/eyebrow classes, section labels).

Pass 2 (the user's pick, now `renders/video.mp4`; the first draft's source is in the ignored
`.hyperframes/draft1/`): frame 01's big Record button became the empty Timeline view (Record, List/Tracks,
the 0.26 Layers menu with its Record chips, Mouse switched on 6/9 → 7/9, "Start recording" → Stop,
"Recording."); the lockup adds VS Code (Iconify `logos:visual-studio-code`) and Zed (simple-icons
`zedindustries`, filled `#e3e3e3`) marks in `assets/logos/`. Then (user: the stat lines were too short to
read and added little) the demo was compressed to finish by 1.2 s and the stat stack replaced by the Lit
flame: its seven pieces (split from the panel's `LIT_LOGO_SVG`) assemble dark from 1.26, flicker on at
1.80/1.86/1.94 with "lights on.", and glow until the cut.

Code-card gotcha: v3's frames were reformatted by the repo's pre-commit formatter (v3 was missing from
the ignore lists in the root vite.config.ts), which wrapped inline spans and added whitespace to lines
set in `white-space: pre` (frame 05 drew "import … sheet"). v4 sets those lines `nowrap` as blocks, and
the root config now ignores every video project. Snapshot and render with the pinned
`npx --yes hyperframes@0.8.189 …` (the package.json scripts).

v3 (2026-10-23) is a copy of v2 on the same bed, grid and scene windows, redrawn in the 0.21 panel look
(system sans + Lilex, Phosphor icons, landing-page headline voice with the shine gradient) and with
scenes 3, 5, 6, 9, 10, 12, 13, 14 rebuilt for the 0.16–0.21 features. The v3 section at the top of
`STORYBOARD.md` and `BRIEF.md` say what changed.

v2 on YouTube: https://www.youtube.com/watch?v=eUg84347jyE. v3 is not uploaded yet.

## Where things are

| File                                                     | What it holds                                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BRIEF.md`                                               | What the user asked for, plus the agreed scene table                                                                                                         |
| `.hyperframes/stage-spec.md`                             | **Binding** geometry, colours, time model, bars, outro. Read it before touching anything                                                                     |
| `STORYBOARD.md`                                          | Per-scene shot list in local time, plus the chrome's cold open, break and outro                                                                              |
| `compositions/chrome.html`                               | The persistent panel (window, header, tabs, Record, the timeline strip, playhead, outro). It runs for the whole 0 → 54.92 s at z-index 1                     |
| `compositions/frames/NN-*.html`                          | One stage scene each (ids `sNN-*`), z-index 2, transparent, drawing only inside the stage rect                                                               |
| `index.html`                                             | **Hand-written.** Don't run `assemble-index.mjs`, which would replace it with a sequential frames-only index and drop the chrome layer                       |
| `capture/ref/`                                           | Screenshots and `PANEL-REFERENCE.md` of the 0.21 panel (dark), the source of truth for the redrawn UI. `capture/ref-v2/` is the 0.15 capture, for comparison |
| `assets/lilex-*.woff2`, `assets/icons/`, `assets/logos/` | Lilex (OFL, `LILEX-LICENSE`), Phosphor icons (MIT, `icons/LICENSE`), brand marks copied from `docs/src/assets/logos`                                         |
| `assets/bgm/bounce-energique.m4a`                        | The user's track. The original is Opus in an m4a, which the renderer's container can't carry, so it was re-encoded to AAC 256k. Used whole, no trim          |

## Why the chrome is its own layer

v1 redrew the chrome in every frame, and parallel workers drifted on it (the
ruler in 3 of 7 frames), so every cut needed a manual seam check. In v2 one
composition draws the chrome for the whole film, so a cut can't move it. A
frame only has to start and end on an empty stage, apart from 04 → 05, where the
tile grid carries across the drop and both files share its constants.

## Timing

- Scenes start on bar lines: 0 · 3.89 · 9.65 · 13.49 · 15.41 (drop A) · 19.25 ·
  23.09 · 26.93 (break) · 30.77 (drop B) · 34.61 · 38.45 · 42.29 (dip) ·
  46.13 · 49.97 (outro). To retime, change `index.html`, the scene table in the
  stage spec, and the bar times and `D(tg)` in `chrome.html` together.
- The strip shows timeline time `D(tg)`. It holds during the break, so
  everything after 30.77 sits 3.84 s behind global time.
- Beat grid: `npx hyperframes beats /path/to/dir-with-the-song` reports
  "250 bpm", the eighth-note grid (0.24 s from 0.053). Hits use the 0.48 s beat.

## Commands

Run from this directory (its `package.json` shields `npx` from the repo root's
pnpm-only `devEngines`).

```sh
npx hyperframes lint && npx hyperframes check
npx hyperframes snapshot --no-end --at 15.40,15.42,30.76,30.80   # seams on the drops
npx hyperframes preview --background                             # Studio
npx hyperframes render --quality high --output renders/video.mp4
```
