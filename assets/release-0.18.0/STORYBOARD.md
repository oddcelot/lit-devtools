---
format: 1920x1080
duration: 46s
message: "0.18.0: utility CSS as one shared sheet, builds without dev code, and the console reaches your components."
arc: Title → UnoCSS sheet → Tailwind in shadow roots → builds without dev code → Request update → $lit + Store → update causes → fixes → lockup
audience: Lit developers who already use vite-plugin-lit
music: groche-energique (user-supplied, played from 0, ends inside its own fade-out; host audio)
---

# vite-plugin-lit 0.18.0 — changelog walk

Source of truth: the CHANGELOG `## 0.18.0` section. Every beat shows only what that section
lists. No voice-over and no captions: on-screen text carries every beat, each with a changelog
eyebrow (ADDED / CHANGED / FIXED). UI strings match the panel source: the ↻ button is "Request
update", causes read "Request update in DevTools", "after edit in DevTools", "after override in
DevTools", and Store as global variable names values `temp1`, `temp2`…

## Video direction

Same as 0.17.0 (see `frame.md` § Stage spec): `canvas` ground with the indigo glow, `accent`
eyebrows, one `cyan` emphasis per beat, `success` for checks, power3 eases, holds are still.
Frames are written on the 0.5454s grid and every frame timeline runs at 1.117715× so its cues
land on the "Groche Énergique" beat (see ITERATING.md). The cuts sit where 0.17.0's did:
0 · 4.118 · 9.974 · 15.830 · 21.685 (the drop) · 26.565 · 33.396 · 37.300 · 41.205. Every seam is a
blur-crossfade. Light surfaces appear only inside page panels (the Tailwind example's slate page).

Local beat times below are pre-scale.

## Frame 01 — Title: 0.18.0

- duration: 4.118s · src: compositions/frames/01-title.html
- on_screen: "vite-plugin-lit 0.18.0" → "Utility CSS in one shared sheet." / "Builds without dev code."
- Unchanged choreography from 0.17.0: glow, flame pop 0.55, name 1.09, version 1.64, claim 2.18, qualifier 3.27, hold.

## Frame 02 — UnoCSS as one shared sheet

- duration: 5.856s · src: compositions/frames/02-uno.html
- on_screen: eyebrow ADDED · "UnoCSS utilities. **One shared sheet.**" · sub "unoSheet() writes the utilities your source uses to a .css file. Import it with ?css-sheet."
- Layout: headline column left (x 115, w 576); right area x 806→1804.
- 0–0.55: eyebrow, headline lines arrive. A code card (x 806, top 134, 998×236) rises in:
  `import { unoSheet } from '@oddsquad/vite-plugin-lit/uno'` / `plugins: [litPlugin(), unoSheet()]` /
  `import uno from './uno.css?css-sheet'`, one line per half-beat from 0.55.
- 1.64: a "CSSStyleSheet · uno.css" pill pops centred at top ~452.
- 2.18–2.73: three shadow-root cards (`<fh-header>`, `<fh-product-card>`, `<fh-toast>`, each 300×300 at top 620) arrive one per half-beat; a leader line draws from the pill to each, with "adoptedStyleSheets: [uno]" in mono. Sub reveals on 2.18.
- 3.82: a chip "+ class text-emerald-600" lands above the pill; on 4.36 the pill flashes cyan ("swapped in place") and all three cards' accent bars recolour on the same frame.
- 4.91 → end: held read.

## Frame 03 — Tailwind v4 inside shadow roots

- duration: 5.856s · src: compositions/frames/03-tailwind.html
- on_screen: eyebrow ADDED + FIXED · "Tailwind v4 in **shadow roots.**" · sub "Shadows, rings and gradients now render. Classes you add in dev reach the shared sheet."
- Layout: headline column left; a slate page panel (#f1f5f9) x 806, top 134, 998×806 holding the example's two cards (`tw-profile-card`: gradient avatar, ring, shadow, "Ada Lovelace", brand button; `tw-stat-card`: "Programs written", 1, "Note G, 1843"), each with "renders: 1".
- 0–1.09: page and cards set, flat: no shadow, no ring, avatar a flat grey disc. A dim mono note under the page reads "@property in a shadow root: ignored".
- 1.64: the note swaps to "@property registered on the document" in success; on the same beat shadows, rings and the avatar gradient fade in.
- 2.73: a mono chip "--color-brand: 265 → 160" lands top right of the page; on 3.27 the brand colour (button, stat number, avatar gradient start) recolours indigo → green in place. Sub reveals on 2.73.
- 3.82: both "renders: 1" counters flash success: still 1, nothing re-rendered.
- 4.36 → end: held read.

## Frame 04 — Builds carry no dev code

- duration: 5.855s · src: compositions/frames/04-builds.html
- on_screen: eyebrow CHANGED + ADDED · "Builds carry **no dev code.**" · sub "No config change. Or build with litCss() from /build and the dev tooling is never imported."
- Layout: headline column left; a terminal panel (#0a0a10) x 806, top 134, 998×806.
- 0.55: `$ vite build` types; 1.09: "in the bundle" label, then eight module rows waterfall in, one per quarter-beat: lit · your components · ?css-sheet styles · css`` minified · HMR client · source overlay · DevTools panel · hot-swap + fetch rewrite.
- 2.73–3.82: the four dev rows strike through in error red one per quarter-beat, then collapse out; the four kept rows get success checks on 3.82.
- 4.36: a code line appears at the bottom: `import { litCss } from '@oddsquad/vite-plugin-lit/build'`. Sub reveals on 4.36.
- 4.91 → end: held read.

## Frame 05 — Request update (the drop)

- duration: 4.88s · src: compositions/frames/05-request.html
- on_screen: eyebrow ADDED · "Request an update. **From the panel.**" · sub "It calls requestUpdate() on the selected element."
- Layout: headline column left; the DevTools window at the Stage spec geometry.
- 0: window and headline set; details header `<fh-product-card>` with a ↻ button beside it.
- 0.55: pointer glides to ↻; 1.09 click (ripple, tooltip "Call requestUpdate() on this element"). Sub reveals 1.09.
- 1.64: the tab underline slides Components → Updates; the Updates list shows a new top row `fh-product-card` with the cause chip "Request update in DevTools" in cyan on 2.18.
- 2.73 → end: held read.

## Frame 06 — $lit and Store as global variable

- duration: 6.831s · src: compositions/frames/06-console.html
- on_screen: eyebrow ADDED · "**$lit** in the console. Store any value." · sub (none)
- Layout: full-width headline (top 158, single line); two panels at top 326, height 634: left the Components details (x 115, 806 wide), right a console pane (x 979, 826 wide, #0a0a10).
- 0.55: panels split in. 1.09–1.64: `› $lit` types, answers `<fh-product-card>`; 2.18–2.73: `› $lit.price` → `24`.
- 3.27: pointer reaches the `meta` row; a Store button appears; 3.82 click → console logs `temp1` then `▸ {light: "bright", sku: "MON-01"}`.
- 4.91: `› temp1.light` → `"bright"`.
- 5.45 → end: held read.

## Frame 07 — Updates name their cause

- duration: 3.904s · src: compositions/frames/07-causes.html
- on_screen: eyebrow CHANGED · "Your DevTools changes **name their cause.**" · rows: fh-product-card · after edit in DevTools / fh-product-card · after override in DevTools / fh-product-card · Request update in DevTools
- Layout: headline column left; an Updates panel x 806, top 245, 998×590.
- 0.55, 1.09, 1.64: one row per beat, each cause chip lights cyan as it lands, then dims as the next lands.
- 2.73 → end: held read.

## Frame 08 — Fixes

- duration: 3.904s · src: compositions/frames/08-fixes.html
- on_screen: eyebrow FIXED · "Small fixes. **Fewer surprises.**" · rows: Docs follow your JSDoc edits · Trusted Types pages keep rendering · index.html links open the right line · SVG files open without errors · No absolute paths in unminified builds
- Five rows, one per beat from 0.55, tick draws on the beat; held read.

## Frame 09 — Lockup

- duration: 4.795s · src: compositions/frames/09-lockup.html
- on_screen: "vite-plugin-lit 0.18.0" · `pnpm add -D @oddsquad/vite-plugin-lit` · "Full notes in CHANGELOG.md"
- Unchanged choreography from 0.17.0.
