---
format: 1920x1080
duration: 43.6s
message: "Lit lands in Astro: server-rendered, hydrated, hot-patched, with the Lit panel in Astro's dev toolbar."
arc: Liftoff → Docking (value) → Re-entry → Hot patch → Mission control → Warp → Lockup
audience: Lit and Astro developers
mode: collaborative
grid: written on 128 BPM (beat 0.46875s); re-timed to "Groche Énergique" space remix, 123 BPM (beat 0.4878s), timeScale 0.9609 (frame 01: 0.641)
---

Global direction: one persistent space layer under the whole film (`compositions/space.html`:
the registry `starfield` block in two parallax tiers, a slow-drifting nebula glow in Astro's
gradient, one planet arc low in frame). Every scene is a transparent sub-composition on top, so
the sky never jumps at a cut. Cuts land on bar downbeats. Headlines short enough to read in
under 2s. Every claim from the 0.20.0 section of CHANGELOG.md, Astro entries only. Beat cues
below are in the frame's local seconds on the 128 BPM grid (see ITERATING.md for the re-time).

## Frame 1: Liftoff (0–5.85s)

- act: Intro (bars 1–2, ambient pads)
- status: animated
- src: compositions/frames/01-liftoff.html
- duration: 3.75s
- poster: 2.6
- transition_in: cut
- blueprint: logo-assemble-lockup (elements orbit and assemble around the mark)
- rules: spring-pop-entrance, ambient-glow-bloom, sine-wave-loop
- scene: The Astro mark rises out of the nebula; the Lit flame swings in on an orbit and docks beside it. "Lit, now landing in Astro."

Hook in outcome language. Lockup lands on beat 5 (1.875s), headline on beat 6.

## Frame 2: Docking (5.85–11.66s)

- act: Build (bars 3–6, kick enters, riser)
- status: animated
- src: compositions/frames/02-docking.html
- duration: 7.5s
- poster: 6.5
- transition_in: cut
- rules: motion-blur-streak, spring-pop-entrance, press-release-spring
- scene: An `astro.config.mjs` code card; the `lit()` module flies in and docks into `integrations: [ ]`; three labels light up beside it (server rendering + hydration · hot patching · the Lit panel). Below, a smaller satellite: "Keeping another Lit renderer? `litDevtools()`: HMR and the panel only." "One integration. Nothing else to wire."

The value claim, by beat 2. `lit()` docks on bar 2's downbeat (1.875s), the three labels one per beat from 2.344s, the `litDevtools()` satellite on bar 3 (3.75s); the riser peaks at the cut.

## Frame 3: Re-entry (11.66–17.46s)

- act: Drop 1 (bars 7–10, full beat)
- status: animated
- src: compositions/frames/03-reentry.html
- duration: 7.5s
- poster: 5.2
- transition_in: cut (on the drop)
- rules: motion-blur-streak, scale-swap-transition
- scene: Server HTML streaks down like a re-entry trail and lands as three cards from the page's markup: `<ssr-counter start="3">` and `<TagList client:visible tags={['island','visible']} />` hydrate (pill not hydrated → hydrated, the drop icon fills; the tags array arrives intact), while `<launch-timer defer-hydration>` stays deferred until the attribute is removed. "Server-rendered and hydrated. No other renderer."

The drop hits as the cards land (0s). First pill flip on bar 2 (1.875s); the deferred card holds, then wakes on bar 4 (5.625s).

## Frame 4: Hot patch (17.46–25.19s)

- act: Drop 1 (bars 11–14)
- status: animated
- src: compositions/frames/04-hotpatch.html
- duration: 7.5s
- poster: 3.4
- transition_in: cut
- blueprint: panel-edit-live-sync
- rules: control-target-sync
- scene: Split: an editor line changes (`Launch` → `Liftoff`) and the two islands beside it, one hydrated, one not, re-render in place; the hydrated one's counter stays at 3. "Edit it. It patches in place, hydrated or not."

The edit and the patch share one beat (bar 2, 1.875s). A cyan ring flashes on each patched element. On bar 3 (3.75s) the cursor clicks the hydrated button and its count goes 3 → 4: the state survived the patch.

## Frame 5: Mission control (25.19–30.91s)

- act: Breakdown (bars 15–18, drums thin out)
- status: animated
- src: compositions/frames/05-toolbar.html
- duration: 7.5s
- poster: 4.2
- transition_in: cut
- rules: cursor-click-ripple, cursor-drag (corner-handle resize)
- scene: Astro's dev toolbar at the bottom; the cursor clicks the Lit logo; the Lit window opens above it with the Components tree and hydration pills; the cursor drags the grip and the window grows; the toolbar re-docks bottom-right and the window follows. "The Lit panel, in Astro's dev toolbar."

The breather. Click on beat 3 (0.9375s), window open by bar 2 (1.875s), drag across bar 3 (3.75–5.0s), re-dock on bar 4 (5.625s).

## Frame 6: Warp (30.91–38.68s)

- act: Drop 2 (bars 19–22, full beat)
- status: animated
- src: compositions/frames/06-warp.html
- duration: 7.5s
- poster: 5.0
- transition_in: cut (on the drop)
- rules: motion-blur-streak, viewport-change
- scene: An Astro view transition rendered as a hyperspace jump: stars stretch to streaks, the page swaps, and on the far side a product card's nested rating stars, inside its shadow root, light up hydrated. "Warp to the next page. Still lit."

The space layer's stars streak for this frame only (driven from the space layer's timeline at 33.75s, peak at +1.875s, settle by +3.75s). Stars hydrate one per beat from bar 3.

## Frame 7: Lockup (38.68–43.6s)

- act: Outro (bars 23–24, final hit then fade)
- status: animated
- src: compositions/frames/07-lockup.html
- duration: 3.75s
- poster: 2.4
- transition_in: cut (on the final hit)
- blueprint: logo-assemble-lockup (settling as satellites clear)
- rules: spring-pop-entrance, waterfall-entry
- scene: Lit flame × Astro mark centred, "vite-plugin-lit 0.20" and the import line `import lit from '@oddsquad/vite-plugin-lit/astro'`. Stars drift; the film fades with the music.

Lockup on the final hit (bar 23 downbeat, 0s); hold, fade over the last bar.
