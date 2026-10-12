# vite-plugin-lit 0.17.0 release video

A 46s changelog walk of the 0.17.0 release (1920×1080, music, no voice-over), built with
HyperFrames' product-launch-video workflow on the `lit-devtools-timeline` recipe. It is attached
to the v0.17.0 GitHub release and linked from that section of CHANGELOG.md.

## Where things are

| Path | What it is |
| --- | --- |
| `BRIEF.md` | The confirmed brief |
| `STORYBOARD.md` | Per-frame shots, durations, beat cues and Video direction |
| `storyboard.html` | The sketch sheet the layouts were confirmed on (open from `file://`) |
| `frame.md` | Palette and type, plus **§ Stage spec**: the binding geometry every frame worker read (the DevTools window shared by frames 02–04, the headline column, the page card) |
| `compositions/frames/NN-*.html` | One composition per frame |
| `assets/bgm/groche-energique.m4a` | The user-supplied "Groche Énergique" bed, played from 0 so the film ends inside its own fade-out |
| `audio_meta.json` | Hand-written, points the assembler at the bed (`source: host`) |
| `renders/video.mp4` | The render, 46.0s |

## The beat grid and the re-time

The frames were built on a 0.5454s beat (an earlier music choice). "Groche Énergique" beats every
0.488s from 0.214s (about 123 BPM; `hyperframes beats` reports 165 because of the quiet breakdown,
so the grid was taken from the steady drop section). Every frame wraps its timeline once at
registration and plays it at 1.1176×, so each cue written on the old grid lands on the new one:

```js
tl.paused(false).timeScale(1.1177); // old beat / new beat
var tlOuter = gsap.timeline({ paused: true }).add(tl, 0);
window.__timelines["NN-id"] = tlOuter;
```

So the local cue times in STORYBOARD.md are pre-scale. Frame starts sit on bar downbeats:
0 · 4.118 · 9.974 · 15.830 · 21.685 (the drop, cut 04→05) · 26.565 · 33.396 · 37.300 · 41.205.
Frame 09's `DUR` constant is in pre-scale seconds (4.795 × 1.1176) so its fade still ends the film.

## Commands (run from this directory; the repo root's devEngines blocks npx)

```sh
S=~/.claude/skills/product-launch-video/scripts
node $S/assemble-index.mjs --storyboard ./STORYBOARD.md --hyperframes . --audio-meta ./audio_meta.json
npx hyperframes lint && npx hyperframes check
npx hyperframes preview --background
npx hyperframes render --skill=product-launch-video --quality high --output renders/video.mp4
```

Always pass `--audio-meta`, or the bed is left out. Keep STORYBOARD `music:` anything but `none`.

## Known check output

- 7 contrast warnings come from `frame.md`'s palette: the `accent` eyebrows measure 4.45:1, the `text-dim` labels 3.02:1.
- Frame 04's ghost "24" overlapping the held "19" is deliberate (`data-layout-allow-overlap`).
- The subject is the Fernhouse `fh-product-card`. Its About text and prop descriptions are illustrative; the component has no JSDoc yet.
