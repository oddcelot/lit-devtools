---
workflow: general-video
flow: companion
storyboard: yes
message: "Lit lands in Astro: server-rendered, hydrated, hot-patched, with the Lit panel in Astro's dev toolbar."
destination: youtube
aspect: 1920x1080
language: en
audience: Lit and Astro developers
length: 45s
angle: feature reveal (Astro integration only)
---

## Intent

The vite-plugin-lit 0.20.0 release video, about the new Astro integration only.
A new style, not the lit-devtools-timeline recipe of 0.17–0.19: "more on the
astro side and with the astro logo", "more space-themed". Source of truth is
the `## 0.20.0 — 2026-10-18` section of the repo's CHANGELOG.md, Astro entries
only; show nothing it doesn't list.

## Assets

- Astro logo — from Astro's official press kit, nominative use ("for Astro",
  never "by Astro" or "official").
- Music — the user will generate a ~45s track in Suno after the storyboard,
  on the grid below. Frames are built on that grid first.

## Customizations

- Music, no voice-over, no captions: on-screen text carries the story.
- Beat grid the user generates against: 128 BPM, 4/4, 24 bars = 45.0s.
  Intro bars 1–2, build 3–6, drop 7–14, breakdown 15–18, drop 19–22, outro
  23–24.
  When the real track arrives, measure its grid and re-time with a
  timeScale wrapper (the 0.19.0 pattern).
- No StackBlitz frame (user, 2026-10-18).

## Notes

Lives in the repo at assets/release-0.20.0/ on branch
feature/release-video-0.20, bead vpl-l016. Run npx from this directory, never
the repo root (root devEngines blocks npm). Render to renders/video.mp4 for
the release workflow's youtube job. UI is redrawn from the dark Lit DevTools
design (see assets/release-0.19.0/frame.md), not screen-captured; example
values are illustrative.
