---
format: 1920x1080
duration: 46s
message: "0.17.0: the Components tab now explains a component and lets you change it."
arc: Title + value → docs → edit → overrides → docs everywhere → find it on the page → CSS example → fixes → lockup
audience: Lit developers who already use vite-plugin-lit
music: groche-energique (user-supplied, played from 0, ends inside its own fade-out; host audio)
---

# vite-plugin-lit 0.17.0 — changelog walk

Source of truth: `capture/extracted/visible-text.txt` (the CHANGELOG `## 0.17.0` section). Every
beat shows only what that section lists. Subject component throughout: `<fh-product-card>` from
the Fernhouse example (props `name`, `price`, `badge`, `productId`; slots `media`, default,
`price`; parts `title`, `cta`). No voice-over and no captions: on-screen text carries every beat,
each with a changelog eyebrow (ADDED / CHANGED / FIXED). Layouts confirmed on `storyboard.html` v1.

## Video direction

- **Palette**: `frame.md` roles only. `canvas` ground, `surface` panels, `accent` for eyebrows,
  selection and the tab, `cyan` for the one emphasized phrase or focus ring per beat, `success`
  for checks. The Fernhouse cream/green appears only on the page card.
- **Stage**: geometry is fixed in `frame.md` § Stage spec. Frames 02, 03 and 04 draw the DevTools
  window at the identical position from their first frame, so their cuts are invisible and only
  the details-pane content changes.
- **Motion grammar**: power3 eases, smooth over bouncy. Each piece reveals on its musical cue, never
  everything at t=0. Every key hit lands on the beat grid (a beat every 0.5454s; each frame starts on
  a beat, so local beats are 0, 0.55, 1.09, 1.64, 2.18, 2.73, 3.27, 3.82, 4.36, 4.91, 5.45, 6.0).
  Holds are still; the only aliveness allowed is a blinking caret.
- **Music re-time**: the bed is "Groche Énergique" (beat every 0.488s from 0.214s; quiet breakdown
  ~7–21s; the drop is the cut 04→05 at 21.685s). Each frame's timeline runs at 1.1176×, so the
  local beat times listed in the frames below (written on the old 0.5454s grid) land on the new
  grid in real time. Frame starts: 0 · 4.118 · 9.974 · 15.830 · 21.685 · 26.565 · 33.396 · 37.300 · 41.205.
- **Seams**: every seam dissolves; the outgoing frame holds its last image while the incoming one
  fades in over it and builds. Frames 02→03→04 share the DevTools window, so a plain crossfade
  changes only the details pane and the headline; the rest use blur-crossfade.
- **Rhythm**: 01 builds, 02–04 are dense UI demos, 05 is a split punch, 06 a spatial reveal,
  07 and 08 quick list beats, 09 a held lockup. The held reads are the last ~0.8s of 02, 04
  and 09.
- **Never**: light canvases, gradient text, floating bokeh, a second accent per beat, browser
  chrome around the DevTools window (it is the panel itself), invented features, a cursor that
  teleports. Neither failure mode: no slideshow (front-load then freeze), no screensaver
  (everything drifting independently).

## Frame 01 — Title: 0.17.0

- scene: "vite-plugin-lit 0.17.0" title card resolves into the value line
- duration: 4.118s
- poster: 3.8s
- transition_in: cut
- status: animated
- src: compositions/frames/01-title.html
- blueprint: titlecard-reveal (Adapt)
- narrativeRole: hook + value claim
- asset_candidates: assets/flame.svg
- focal: assets/flame.svg
- roles: flame.svg = supporting (brand mark above the title)
- rules: spring-pop-entrance, discrete-text-sequence, ambient-glow-bloom
- on_screen: "vite-plugin-lit 0.17.0" → "Your components explain themselves." / "And take edits."

Adapt: keep the three-beat prelude (mark pop → name + version append → tagline), no blur-snap
between them; the tagline rises under the title instead of replacing it.

- Scene 1 (0.0–1.09s): empty ground; the indigo glow blooms in. On beat 0.55 the flame
  (≈96px tall) spring-pops at centre, upper third.
- Scene 2 (1.09–2.18s): on beat 1.09, "vite-plugin-lit" reveals under the flame (display 800,
  ~84px, white, centred). On beat 1.64, "0.17.0" appends in cyan, and the line recentres smoothly.
- Scene 3 (2.18–3.82s): on beat 2.18, "Your components explain themselves." rises in below
  (700, ~46px, `text`). On beat 3.27, "And take edits." rises in under it in cyan.
- Scene 4 (3.82–4.513s): held read, centred, nothing moving. The hard cut to 02 lands on the
  music's first drop (global 4.51).

## Frame 02 — Component docs in the details pane

- scene: the Components tab selects fh-product-card; its About section fills with description, events, CSS properties; a property tooltip opens
- duration: 5.856s
- poster: 5.2s
- transition_in: blur-crossfade 0.5s
- status: animated
- src: compositions/frames/02-docs.html
- blueprint: compose
- narrativeRole: evidence 1 (explains)
- asset_candidates: assets/flame.svg
- focal: the details pane's About section (rebuilt UI)
- roles: flame.svg = supporting (window header mark)
- rules: anchored-layout-expand, waterfall-entry, context-sensitive-cursor
- on_screen: eyebrow ADDED · "Docs, right in the details pane." · sub "From your JSDoc during dev, or a Custom Elements Manifest."
- handoff_out: DevTools window at the frame.md Stage spec geometry, opacity 1, scale 1, static; tree row fh-product-card selected; headline column cleared by the cut.

Layout: asymmetric 30/70. The headline column is on the left, and the DevTools window on the right is the dominant element.

- Scene 1 (0.0–0.55s): the window rises 40px into place and fades in (power3.out), already
  showing the tree with nothing selected and an empty details pane. The eyebrow "ADDED" fades in.
- Scene 2 (0.55–1.64s): on beat 0.55, the headline "Docs, right in the **details pane.**"
  reveals line by line ("details pane." in cyan). On beat 1.09, the selection highlight slides
  onto the fh-product-card row, and the details header `<fh-product-card>` + source path appear.
- Scene 3 (1.64–3.82s): the About section expands downward (anchored-layout-expand). Its
  description is "A product tile in the shop grid. Fill the `media` slot with a photo and
  `price` with a sale price." with code spans in `code-tag`. Then the sections waterfall in, one
  per beat:
  - beat 2.18: Properties, with name "Monstera", price 24 and badge "New"
  - beat 2.73: Events, with `add-to-cart` "Fired when the CTA is pressed."
  - beat 3.27: CSS properties, with `--card-accent` "Border and CTA colour."
  The sub line under the headline reveals on beat 2.18.
- Scene 4 (3.82–5.2s): the pointer glides in from the lower right onto the `price` row name. On
  beat 4.36, a cyan focus ring settles around the row and the tooltip opens beside it: "Price in
  euros. Shown unless the `price` slot is filled."
- Scene 5 (5.2–6.0s): held read, nothing moving.

## Frame 03 — Edit props in place

- scene: a boolean flips on click, `name` turns into an input and retypes, a value inside an object is double-click-edited; the page card updates live
- duration: 5.856s
- poster: 4.6s
- transition_in: crossfade 0.35s
- status: animated
- src: compositions/frames/03-edit.html
- blueprint: panel-edit-live-sync (Adapt)
- narrativeRole: evidence 2 (changes)
- asset_candidates: assets/flame.svg
- focal: the page card reacting to each edit (rebuilt Fernhouse card)
- roles: flame.svg = supporting (window header mark)
- rules: control-target-sync, cursor-click-ripple, discrete-text-sequence, press-release-spring
- on_screen: eyebrow ADDED · "Edit a prop. Watch the page." · sub "Strings, numbers, booleans. Also inside objects, arrays and Maps."
- handoff_in: DevTools window at the Stage spec geometry, opacity 1, static, from the very first frame. The details pane now shows the Properties list (no About).
- handoff_out: DevTools window unchanged at the Stage spec geometry, opacity 1, static.

Adapt: keep the signature live coupling, where the bound target (the page card on the left)
changes on the same frame as the panel edit. Three edits instead of a scrub. The page panel sits
in the headline column under the copy.

- Scene 1 (0.0–0.55s): the window is static at its spec position. The details pane lists
  Properties, each with an edit button:
  - name "Monstera"
  - price 24
  - badge "New"
  - inStock true (⇄ toggle)
  - ▸ meta Object
  The eyebrow and the headline "Edit a prop. **Watch the page.**" are already set. The sub
  reveals on beat 0.55.
- Scene 2 (0.55–1.64s): the page panel (fill #f6f3ec) slides up into the headline column
  below the sub: x 115→691, top ~560, height ~400. The card (title "Monstera", €24, badge "New")
  sits centred in it.
- Scene 3 (1.64–2.73s): the pointer clicks inStock's toggle on beat 1.64 (click ripple). The
  value flips true→false in `code-keyword`. On the same frame the card's CTA greys out and reads
  "Sold out".
- Scene 4 (2.73–3.82s): the pointer clicks name's edit button on beat 2.73, and the value becomes
  an input. "Fiddle Leaf" types in over the next beat. The card title swaps on beat 3.27, the
  same frame the input commits.
- Scene 5 (3.82–5.454s): the pointer double-clicks the price value 24 on beat 3.82, it becomes
  an input, and "19" types. On beat 4.36 it commits: the price reads 19 and the card's price
  ticks €24→€19. Then the meta row expands to show `light: "bright"` with an edit button, which
  shows that nested values are editable too. Held through the end.

## Frame 04 — Overrides that hold, switch off and pin

- scene: the app writes `price` back but the override holds; its checkbox switches it off; the overrides bar lists it; pin → page reloads → the value is back
- duration: 5.855s
- poster: 5.9s
- transition_in: crossfade 0.35s
- status: animated
- src: compositions/frames/04-overrides.html
- blueprint: compose
- narrativeRole: evidence 3 (changes stick)
- asset_candidates: assets/flame.svg
- focal: the price row with its override controls (rebuilt UI)
- roles: flame.svg = supporting (window header mark)
- rules: discrete-text-sequence, cursor-click-ripple, svg-path-draw
- on_screen: eyebrow ADDED · "Overrides hold. Pins survive a reload." · sub "Switch one off to see the app's value. In the browser extension too, kept in its own storage."
- handoff_in: DevTools window at the Stage spec geometry, opacity 1, static, from the very first frame.
- handoff_out: none (hard cut to the split in 05).

Layout: asymmetric 30/70, the same as 02. The details pane shows the override state.

- Scene 1 (0.0–1.09s): the window is static. A details pane carries:
  - the overrides bar at the top: "2 overrides on this page", "Switch all off", "Clear all"
  - the header
  - the Properties list:
    - ☑ price 19 (cyan checkbox), with a pin outline and ✕
    - ☑ name "Fiddle Leaf", with a pin outline and ✕
    - badge "New"

  The eyebrow and headline "Overrides hold. **Pins survive a reload.**" reveal on beats 0 and
  0.55.
- Scene 2 (1.09–2.18s): the app writes back. On beat 1.09, a ghost "24" slides in from the
  right of the price value and bounces off. A muted "app wrote 24 · held" note fades in, and the
  19 stays.
- Scene 3 (2.18–3.27s): the pointer unticks price's checkbox on beat 2.18, and the value
  crossfades to 24 (the app's latest). It reticks on beat 2.73, and 19 returns. The sub reveals
  on beat 2.73.
- Scene 4 (3.27–5.45s): the pointer clicks price's pin on beat 3.27, and it fills cyan.
  - Beat 3.82: a reload sweep (a thin cyan line top→bottom across the details pane, with the
    rows dimming under it) passes.
  - Beat 4.36: the rows re-appear, and a success pill "↻ reloaded · price = 19 (pinned)"
    springs in at the bottom of the details pane.
  - Beat 4.91: the price row flashes once in cyan.
- Scene 5 (5.45–6.545s): held read.

## Frame 05 — Docs in Lit Inspector and for agents

- scene: split: left, the browser extension's Lit tab showing the same About section; right, an agent call to `lit_component-docs` returning the description, events, slots and parts
- duration: 4.88s
- poster: 4.3s
- transition_in: blur-crossfade 0.45s
- status: animated
- src: compositions/frames/05-everywhere.html
- blueprint: comparison-split (Adapt)
- narrativeRole: evidence 4 (docs reach every surface)
- asset_candidates: assets/flame.svg
- focal: the two panels side by side
- roles: flame.svg = supporting (Lit tab icon in the left panel)
- rules: split-tilt-cards, discrete-text-sequence, waterfall-entry
- on_screen: eyebrow ADDED · "In Lit Inspector. And for your agent." · code `lit_component-docs`

Adapt: keep the paired panels entering from opposite wings with mirrored tilts that settle flat.
The pairing is the same docs on two surfaces.

- Scene 1 (0.0–0.55s): the eyebrow (top 115) and the headline "In Lit Inspector. **And for your
  agent.**" (69px, single line, top 158, x 115) are set.
- Scene 2 (0.55–1.64s): two panels split in from opposite wings, tilted, settling flat on beat
  1.09. Both are 1px #363636 with radius 12, top 326, height 634.
  - Left panel (x 115, 806 wide): the browser DevTools frame. Its tab strip reads "Elements ·
    Console · Sources · **Lit**", with Lit in accent and the flame icon. Inside it:
    - the header `<fh-product-card>`
    - ABOUT with the same description as frame 02
    - a dim note `from <link rel="custom-elements-manifest">`
  - Right panel (x 979, 826 wide, fill #0a0a10): a terminal-style agent pane.
- Scene 3 (1.64–3.82s): in the right panel, `› lit_component-docs({ tag: "fh-product-card" })`
  types in over 1.64–2.18, with the tool name in `code-callee`. The JSON answer then streams line
  by line, one per half-beat from 2.18: description, events ["add-to-cart"], slots ["media", "",
  "price"], cssParts ["title", "cta"], cssProperties ["--card-accent"]. The left panel's About
  lines reveal on beats 1.64 and 2.18.
- Scene 4 (3.82–4.909s): held read.

## Frame 06 — Find slots and parts on the page

- scene: hovering the `media` slot row outlines that region on the page card; then the Anatomy overlay lays its labels out beside the card with leader lines to each slot and part
- duration: 6.831s
- poster: 5.9s
- transition_in: blur-crossfade 0.45s
- status: animated
- src: compositions/frames/06-anatomy.html
- blueprint: compose
- narrativeRole: evidence 5 (explains, on the page)
- asset_candidates: assets/flame.svg
- focal: the page card with its outlined region and leader lines
- roles: flame.svg = unused (omit)
- rules: svg-path-draw, waterfall-entry, context-sensitive-cursor
- on_screen: eyebrow ADDED + CHANGED · "Hover a slot. See it on the page." · sub "Anatomy labels now sit beside the component, with lines to their regions."

Layout: asymmetric 35/65. The large page panel (x 806, top 115, 998×845) is dominant, and an
Anatomy slots box sits under the headline (x 115, top 557, 576×326).

- Scene 1 (0.0–1.09s): the page panel is set, with the card centred in it (about 384×576, title
  "Fiddle Leaf", €19, badge "Sale"). The eyebrow "ADDED + CHANGED" (the second word in cyan) and
  the headline "Hover a slot. **See it on the page.**" reveal on beats 0 and 0.55.
- Scene 2 (1.09–2.73s): the Anatomy box waterfalls in on beat 1.09. Its label is "ANATOMY ·
  SLOTS", with three rows:
  - `media` "A product photo."
  - (default) "Short description."
  - `price` "A sale price."

  The pointer glides onto the `media` row. On beat 2.18 the row lights cyan-tinted, and on the
  same frame a cyan outline traces the card's media region.
- Scene 3 (2.73–5.45s): the overlay turns on. The sub reveals on beat 2.73. Labels slide out
  into the gutters, one per beat from 3.27, filled pills in Roboto Mono white:
  - "slot media" in `accent`, left gutter
  - "part title", "slot price" and "part cta" in `accent-deep`, right gutter
  Each label's leader line draws from the pill to its region (svg-path-draw) as it lands.
  Labels never overlap. They line up in their gutter columns.
- Scene 4 (5.45–6.545s): held read.

## Frame 07 — A CSS example

- scene: four cards, one per way to get CSS into a shadow root (`?css-sheet`, `?hmr-url`, `?inline`, `css` literal), each with a render counter; an edit restyles them and only the counters that re-render tick
- duration: 3.904s
- poster: 3.9s
- transition_in: blur-crossfade 0.45s
- status: animated
- src: compositions/frames/07-css.html
- blueprint: grid-card-assemble (Adapt)
- narrativeRole: supporting (new example)
- asset_candidates: assets/flame.svg
- focal: the four-card row
- roles: flame.svg = unused (omit)
- rules: waterfall-entry, theme-crossfade-morph, counting-dynamic-scale
- on_screen: eyebrow ADDED · examples/css · "Every way to style a shadow root, side by side." · sub "With real UnoCSS utilities, one shared sheet for every component."

Adapt: keep the self-assembling tile row, then add one post-assembly status flip (the
re-tint + counters).

- Scene 1 (0.0–0.55s): the eyebrow (top 115) and the headline (single line, top 158) are set.
  The sub (top 257) reveals on beat 0.55.
- Scene 2 (0.55–2.18s): four cards (each 384×499, top 384, gaps 38, starting x 115, surface
  #121212 with a 1px border) assemble left to right, one per beat from 0.55. Each card carries:
  - its label in `code-tag` mono: `?css-sheet`, `?hmr-url`, `?inline`, css`…`
  - a swatch block in an accent→indigo gradient
  - "renders 1" mono at the bottom
- Scene 3 (2.18–3.82s): on beat 2.73, a small mono chip "edit · --accent" appears above the row.
  All four swatches re-tint together to a cyan→accent gradient (theme crossfade). On beat 3.27,
  the `?inline` and css`…` counters tick 1→2 in `code-number`; the two sheet-based ones stay at
  1 in `success`.
- Scene 4 (3.82–4.363s): held read.

## Frame 08 — Fixes

- scene: six fixes stack in as a checklist, each checked off on the beat
- duration: 3.904s
- poster: 3.6s
- transition_in: blur-crossfade 0.45s
- status: animated
- src: compositions/frames/08-fixes.html
- blueprint: grid-card-assemble (Adapt)
- narrativeRole: supporting (trust)
- asset_candidates: assets/flame.svg
- focal: the checklist panel
- roles: flame.svg = unused (omit)
- rules: waterfall-entry, svg-path-draw
- on_screen: eyebrow FIXED · "Small fixes. Less friction." · rows: Custom timeline events line up with Lit's · The selection survives a reload · Collapsed Timeline rows say what changed · Details sections fold again · Source paths wrap between folders · Tooltips follow the keyboard

Adapt: a vertical benefit list that accumulates (the menu's variant). One row per half-beat to
fit six in the frame.

- Scene 1 (0.0–0.55s): headline column: the eyebrow "FIXED" in `success` and the headline "Small
  fixes. **Less friction.**" (second line cyan) are set. The checklist panel (x 806, top 134, 998×806,
  surface + border) fades up.
- Scene 2 (0.55–3.27s): six rows (Manrope 600 30px, `text`, row pitch ~96px) enter top to
  bottom, one per half-beat from 0.55. Each row's ✓ (`success`) draws in as it lands.
- Scene 3 (3.27–3.818s): held read.

## Frame 09 — Lockup

- scene: flame + "0.17.0" lockup with the install command typing in a terminal pill
- duration: 4.795s
- poster: 3.5s
- transition_in: blur-crossfade 0.5s
- status: animated
- src: compositions/frames/09-lockup.html
- blueprint: prompt-type-submit-generate (Adapt)
- narrativeRole: CTA
- asset_candidates: assets/flame.svg
- focal: assets/flame.svg
- roles: flame.svg = supporting (brand mark)
- rules: spring-pop-entrance, discrete-text-sequence
- on_screen: "vite-plugin-lit 0.17.0" · `pnpm add -D @oddsquad/vite-plugin-lit` · "Full notes in CHANGELOG.md"

Adapt: the install-command end-card variant. The headline holds while a terminal pill springs in
and the command types, then the caret blinks.

- Scene 1 (0.0–0.55s): the flame (~77px, centre, top ~211) and "vite-plugin-lit **0.17.0**"
  (~84px, centred, top ~365) spring in together on beat 0.
- Scene 2 (0.55–2.18s): on beat 0.55, the terminal pill springs in centred at top ~538 (surface
  fill, 1px border, radius 99, Roboto Mono 31px). `$ pnpm add -D @oddsquad/vite-plugin-lit`
  types over 0.55–1.64, with the package name in `code-tag`. The cyan caret then blinks at
  0.5s.
- Scene 3 (2.18–3.87s): "Full notes in CHANGELOG.md" (500, 25px, muted, centred, top ~691)
  fades in on beat 2.18. Held to the end while the music's natural fade finishes. The last
  ~0.3s fades everything to the ground.
