---
format: 1920x1080
duration: 46s
message: "0.19.0: Lit rendered on the server, hot-patched in the browser, with hydration in the DevTools and a Lit tab in Chrome's Elements panel."
arc: Title → SSR hot patches → hydration in the tree → SSR example (build, preview, StackBlitz) → Lit tab in Elements → double renders flagged → manifests → fixes → lockup
audience: Lit developers who already use vite-plugin-lit
music: groche-energique (user-supplied, played from 0, ends inside its own fade-out; host audio)
---

# vite-plugin-lit 0.19.0 — changelog walk

Source of truth: the CHANGELOG `## 0.19.0` section. Every beat shows only what that section
lists. No voice-over and no captions: on-screen text carries every beat, each with a changelog
eyebrow (ADDED / CHANGED / FIXED). UI strings match the panel source: hydration chips read
`deferred`, `not hydrated` and `SSR`; a self-caused update reads `re-rendered` in Updates and
`2×` in the Timeline list.

## Video direction

Same as 0.18.0 (see `frame.md` § Stage spec): `canvas` ground with the indigo glow, `accent`
eyebrows, one `cyan` emphasis per beat, `success` for checks, power3 eases, holds are still.
Frames are written on the 0.5454s grid and every frame timeline runs at 1.117715× so its cues
land on the "Groche Énergique" beat (see ITERATING.md). The cuts sit where 0.18.0's did:
0 · 4.118 · 9.974 · 15.830 · 21.685 (the drop) · 26.565 · 33.396 · 37.300 · 41.205. Every seam is a
blur-crossfade. Light surfaces appear only inside page panels.

Local beat times below are pre-scale. Each frame's file is a copy of the 0.18.0 frame in the
same slot, so its `data-duration`, `DUR` and timeScale wrapper stay as they were.

The SSR example's page (used in 02, 03, 04): a light page panel (#f6f3ec, radius 12) with an
`h1` "Lit SSR" and three cards: `<ssr-counter>` (h2 "Counter", button "Count: 3", a line that
reads "Server-rendered" then "Hydrated"), `<ssr-deferred>` (h2 "Deferred", button "Clicks: 0",
dimmed while deferred), `<ssr-themed>` (a green bold line "Styled by a shared sheet"). Cards:
fill #fff, 1px #e3ded2, radius 10, Manrope; buttons 1.5px #2f6f4e outline, #2f6f4e text.

## Frame 01 — Title: 0.19.0

- duration: 4.118s · src: compositions/frames/01-title.html
- on_screen: "vite-plugin-lit 0.19.0" → "Lit, rendered on the server." / "Hot-patched in the browser."
- Unchanged choreography.

## Frame 02 — Server-rendered Lit, hot-patched

- duration: 5.856s · src: compositions/frames/02-ssr.html
- on_screen: eyebrow ADDED · "Server-rendered Lit. **Hot-patched.**" · sub "With @lit-labs/ssr in your Vite server, edits patch hydrated components and reach the next server render."
- Layout: headline column left; right area x 806→1804. A mono "server HTML" card (top 134, 998×300, #0b0b12) and the SSR page panel below it (top 470, 998×470).
- 0–0.55: eyebrow and headline. The server HTML card types three lines, one per half-beat from 0.55: `<ssr-counter start="3">` / `  <template shadowrootmode="open">` / `    <button>Count: 3</button>`.
- 1.64: the page panel rises in showing `<ssr-counter>` with "Server-rendered" in dim text; on 2.18 it flips to "Hydrated" in success with a small `SSR` chip. Sub reveals on 2.18.
- 2.73: pointer clicks the button twice (2.73, 3.0): "Count: 4", "Count: 5".
- 3.27: an edit chip lands above the panel: `src/ssr-counter.ts · h2: "Counter" → "Clicker"`; on 3.82 the card's h2 swaps in place with a cyan flash, the count stays "Count: 5"; at the same time the server HTML card's lines refresh with `<h2>Clicker</h2>` (a success tick "next render: new code").
- 4.36 → end: held read.

## Frame 03 — Hydration state in the Components tab

- duration: 5.856s · src: compositions/frames/03-hydration.html
- on_screen: eyebrow ADDED · "Hydration, **in the tree.**" · sub "Deferred, not hydrated, SSR: each server-rendered element says where it stands, the moment it changes."
- Layout: headline column left; the DevTools window at the Stage spec geometry, Components tab active.
- Tree: the example has no app element, so the rows are `ssr-counter`, `ssr-deferred`, `ssr-themed` at depth 0, each with a hydration chip after the tag (pill, Manrope 600 14px): `SSR` (success-tinted), `deferred` (accent-tinted), `not hydrated` (dim outline).
- 0: window set, tree rows with chips: ssr-counter `not hydrated`, ssr-deferred `deferred`, ssr-themed `not hydrated`.
- 1.09: ssr-counter's chip turns `SSR`; 1.37 ssr-themed's turns `SSR` (each a short scale pop). Sub reveals 1.09.
- 1.64: ssr-deferred selected; details pane shows `<ssr-deferred>`, `src/ssr-deferred.ts:9`, a Hydration row "deferred · held back by defer-hydration", Properties `clicks 0`.
- 2.73: a callout pill drops in above the window: `removeAttribute('defer-hydration')`; on 3.27 the tree chip and the details row both turn `SSR` / "hydrated" with a cyan flash on the same frame.
- 3.82 → end: held read.

## Frame 04 — The SSR example: build, preview, StackBlitz

- duration: 5.855s · src: compositions/frames/04-production.html
- on_screen: eyebrow ADDED · "One example. **Dev, build, StackBlitz.**" · sub "Production builds inline shared sheets, and the Lit panel attaches through lit-devtools dev."
- Layout: headline column left; a terminal panel (#0a0a10) x 806, top 134, 998×560; below it at top 730 an "Open in StackBlitz" card (998×210).
- 0.55: `$ npm run build` types; 1.09 two output rows: `dist/client/index.html` and `dist/server/entry-server.js`, each with a success tick; a third row `<ssr-themed> <style>.note{…}</style> inlined` with a cyan "inlined".
- 2.18: `$ npm run preview -- --devtools http://localhost:5180/lit-devtools.js` types; 2.73 `[lit-devtools] connected` in success. Sub reveals 2.18.
- 3.82: the StackBlitz card rises: a lightning-bolt glyph in #1389fd, "Open in StackBlitz" (Manrope 700 30px), and the path `examples/ssr` in mono; a cyan pill "runs in your browser" pops on 4.36.
- 4.91 → end: held read.

## Frame 05 — A Lit tab in the Elements panel (the drop)

- duration: 4.88s · src: compositions/frames/05-elements.html
- on_screen: eyebrow ADDED · "A Lit tab in **Elements.**" · sub "Lit Inspector adds it beside Styles and Computed, for the element you select there."
- Layout: headline column left; a Chrome DevTools window at the Stage spec window geometry (left 768, top 86, 1056×912) but Chrome-styled: a 44px toolbar with panel tabs "Elements Console Sources Network Lit" (Elements active, blue #8ab4f8 underline). Below: DOM tree pane (x 0→600) in mono with `<fh-app>` › `<fh-product-card name="Monstera">` selected (a #8ab4f8-tinted row), and a sidebar (x 600→1056) with tabs "Styles Computed Layout Lit".
- 0: window and headline land on the drop; Styles is the active sidebar tab, showing a few CSS rules dimmed.
- 0.55: pointer glides to the "Lit" sidebar tab; 1.09 click: the tab underline slides to Lit (accent #4d63ff underline, the flame glyph before "Lit"), the sidebar content swaps to Lit's: header `<fh-product-card>` in code-tag, then sections PROPERTIES (`name "Monstera"`, `price 24`), STATE (`inCart false`), SLOTS (`default · 1 node`), PARTS (`media`, `cta`), and a source link `src/components/product-card.ts:4`. Sections land one per quarter-beat from 1.2. Sub reveals 1.09.
- 2.73 → end: held read.

## Frame 06 — Double renders, flagged

- duration: 6.831s · src: compositions/frames/06-double.html
- on_screen: eyebrow ADDED · "Double renders, **flagged.**" · sub "An update your own updated() scheduled is marked, counted, and reported to agents as selfCaused."
- Layout: full-width headline (top 158) as in 0.18.0's frame 06; two panels at top 326, height 634: left a code card (x 115, 806 wide, #0b0b12), right an Updates panel (x 979, 826 wide, surface #121212 with the DevTools tab header, Updates active).
- 0.55: panels split in. Code card types:
  `updated(changed) {` / `  if (changed.has('price'))` / `    this.total = this.price * this.qty;` / `}` one line per half-beat from 0.55, the third line underlined in error red at 2.73.
- 1.64: Updates rows land one per half-beat: `fh-cart-button` · `price changed`, then `fh-cart-button` with a cyan `re-rendered` chip on 2.73 (the paired row).
- 3.82: below the Updates list, a Timeline-list strip shows `fh-cart-button  performUpdate  2×` with `2×` in cyan; 4.36 a Warnings line: "Re-rendered itself 3 times in this recording" with an error-red dot. A mono chip `lit_update-summary → selfCaused: 3` pops on 4.91.
- 5.45 → end: held read.

## Frame 07 — Component docs from any manifest

- duration: 3.904s · src: compositions/frames/07-manifests.html
- on_screen: eyebrow ADDED · "Docs from **any manifest.**" · rows (Lit Inspector Settings › Component docs): `custom-elements.json` · linked by page / `/dist/custom-elements.json` · found beside the scripts / `cdn.jsdelivr.net/…/custom-elements.json` · Allow access
- Layout: headline column left; a Settings panel x 806, top 245, 998×590, header "COMPONENT DOCS" section label, rows 110px tall each with a switch on the right and ↑/↓ arrows.
- 0.55, 1.09, 1.64: one row per beat; each row's switch flips on (accent) as it lands; the third row's "Allow access" button lights cyan, then turns into a success "access granted".
- 2.73 → end: held read.

## Frame 08 — Fixes

- duration: 3.904s · src: compositions/frames/08-fixes.html
- on_screen: eyebrow FIXED · "Small fixes. **Fewer surprises.**" · rows: Hiding the panel clears the overlay · Slotted consumers find their provider · Provider details follow setValue() · A throwing constructor isn’t “not Lit” · MCP discovery works in middleware mode
- Unchanged choreography.

## Frame 09 — Lockup

- duration: 4.795s · src: compositions/frames/09-lockup.html
- on_screen: "vite-plugin-lit 0.19.0" · `pnpm add -D @oddsquad/vite-plugin-lit` · "Full notes in CHANGELOG.md"
- Unchanged choreography.
