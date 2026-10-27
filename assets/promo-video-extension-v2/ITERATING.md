# Iterating on the Lit Inspector promo, v2

v2 (2026-10-27, bead vpl-1u9e) is a copy of `../promo-video-extension/` on the same music cut, grid,
scene windows and browser window, redrawn in the 0.26 look: captions in Lexend with the shine on the
emphasised word, panel UI in the system sans, mono in Lilex, the "Lit Inspector" wordmark in Lexend and
the active Lit tab underlined in the flame gradient (fonts restyled by script over v1's frames).
Five scenes changed for features added since October: 04 `s04-sidebar` (the Lit tab in the Elements
sidebar, Elements active 11.52 → 15.36), 05 `s05-docs` (component docs from Custom Elements Manifests),
06 `s06-pause` (break on update → paused in Sources at 20.64), 10 `s10-global` (store as global
variable → Console 35.76 → 38.40), 12 end card with Add to Firefox. The trust line moved into scene 11's
sub-line. The DevTools tab schedule in `chrome.html` (`DT`, the `cut(lit…)` calls) changed to match.
Scenes 04/05/06/10 were built by parallel agents from briefs; v1's versions stay in the v1 project.

---

# v1 notes

A 47.2 s, 1920×1080 film for the Chrome Web Store listing and the docs'
browser-extension page. A dark Chrome window holds a fictional production
shop with DevTools docked below. The **Lit** tab is the star, and captions sit
in a rail on the left. Output: `renders/video.mp4`.

It is built like `../promo-video-v2/` (read that project's ITERATING.md too):
one persistent `compositions/chrome.html` (z-index 1, the whole film) draws
the browser, the page, the DevTools dock and tab bar, and the Lit header and
footer. The 12 scenes (`compositions/frames/NN-*.html`, ids `sNN-*`, z-index
2) draw the caption rail, the DevTools body for the active tab, and overlays
on the page. `index.html` is hand-written; don't run `assemble-index.mjs`.

## Rules that are easy to break

- **Show only what the extension does.** Store policy treats showing plugin-only
  features as misleading. The checked list is in
  `capture/ref/EXTENSION-REFERENCE.md` (the real extension on a production
  build) and the docs' features-by-host page. Not in the film, on purpose:
  HMR, open in editor, source overlay, MCP, snapshot export, Copy link,
  Rendered-at links, render and warning layers.
- **The chrome owns the schedules.** The active DevTools tab, the gate, the
  permission prompt, the reload, the Lit tab per period, the omnibox URL and
  the collapse are tables in `.hyperframes/stage-spec.md`. A scene that
  switches what it draws has to switch at those exact times, so change the
  table, `chrome.html` and the scene together.
- **Fictional sites only** (`.example` domains, made-up brands), and the end
  card keeps the not-affiliated line from the store listing.

## Music

`assets/bgm/bounce-energique-from-bar4.m4a` is the v2 project's AAC re-encode
of the user's track, cut from 7.733 s (its bar 4) with a 0.12 s fade-in, so
the film's 0 s is on a bar line and both drops survive: drop A at 7.68 and
drop B at 23.04.

## Commands

Run from this directory.

```sh
npx hyperframes lint && npx hyperframes check
npx hyperframes snapshot --no-end --at 7.66,7.70,23.02,23.06   # the drops
npx hyperframes render --quality high --output renders/video.mp4
```

On YouTube: https://www.youtube.com/watch?v=3sPdpev0emU, set as the Chrome
Web Store promo video (see `extension/store/listing.md`). A new render needs a
new upload; the store field only takes a YouTube URL.

`capture/ref/EXTENSION-REFERENCE.md` indexes 63 screenshots, but only the ten
the scenes were drawn from are committed (see `.gitignore`). To shoot the rest
again, follow the `store` mode of `scripts/extension-assets.mjs`.
