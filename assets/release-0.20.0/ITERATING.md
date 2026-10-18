# vite-plugin-lit 0.20.0 release video (Astro)

A 43.6s release video for the Astro integration only (1920×1080, music, no voice-over). A new
look, not the `lit-devtools-timeline` recipe of 0.17–0.19: deep space, Astro's mark and
red→magenta gradient, Space Grotesk + Space Mono. Built in companion mode with a storyboard pass.

## Where things are

| Path                                 | What it is                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `BRIEF.md`                           | The confirmed brief                                                                            |
| `STORYBOARD.md`                      | Per-frame shots, cut points and cues                                                           |
| `frame.md`                           | Palette, type and § Stage spec (headline column, visual stage, pills, toolbar, Lit window)     |
| `scripts/build-frames.py`            | **Source of truth** for `compositions/frames/*.html` and `index.html`; edit it, then rerun it |
| `compositions/space.html`            | Hand-written persistent sky under the whole film: stars, nebula, planet, the frame-06 warp     |
| `assets/astro-*.svg`                 | Astro's press-kit marks (astro.build/press), nominative use only                               |
| `assets/bgm/groche-energique-space.m4a` | The user's Suno space remix of "Groche Énergique" (AAC; original upload was Opus)          |
| `boards/storyboard.html`             | The approved sketch board                                                                      |
| `renders/video.mp4`                  | The render, picked up by the release workflow's `youtube` job                                  |

## Commands (run from this directory; the repo root's devEngines blocks npx)

```sh
python3 scripts/build-frames.py .
npx hyperframes lint && npx hyperframes check
npx hyperframes preview --background
npx hyperframes render --quality high --output renders/video.mp4
```

## The beat grid and the re-time

The frames were written on a 128 BPM placeholder grid (beat 0.46875s). The track is 123 BPM
(beat 0.4878s); its grid locks from 5.85s, with downbeats at 5.851 · 7.779 · 9.729 · 11.656 ·
13.584 · 15.534 (the drop) · 17.461 · … · 25.194 · 30.906 (the breakdown) · 32.833 · 38.68 (the
kick returns). Each frame starts on one of those downbeats and plays its timeline at
`timeScale(0.9609)` (old beat / new beat), wrapped once in an outer paused timeline, so a cue on
local beat n lands on the track's beat n. Frame 01 sits on the beatless intro and plays at 0.641
to fill it. Local cue times in the script and STORYBOARD.md are pre-scale.

| Frame | Starts | Music | Lands on |
| --- | --- | --- | --- |
| 01 Liftoff | 0 | ambient intro | — |
| 02 Docking | 5.851 | beat enters, build | `lit()` docks on 7.779 |
| 03 Re-entry | 11.656 | groove | first flip 13.584; the deferred card wakes on the drop, 15.534 |
| 04 Hot patch | 17.461 | drop / peak | patch 19.389; click 21.339 |
| 05 Mission control | 25.194 | groove | click, resize, re-dock |
| 06 Warp | 30.906 | breakdown | warp peak 32.833 (space.html: 30.906 → 32.85 → 34.8) |
| 07 Lockup | 38.68 | kick returns | fades 42.4–43.3 as the music ends |

The analysis came from `music-to-video/scripts/analyze-beatgrid.py` (librosa in a throwaway venv).

## Known check output

None at the time of writing: `check` passes clean. `#space-planet` carries
`data-layout-allow-overflow` (it is a 2600px circle mostly below the frame) and `.f03-cards`
`data-layout-allow-overlap` (the cards overlap for a moment while they drop in).

Example components and pages (ssr-counter, TagList, launch-timer, mission-card, Lunar Rover Kit)
are illustrative; every capability shown is from the 0.20.0 section of CHANGELOG.md.
