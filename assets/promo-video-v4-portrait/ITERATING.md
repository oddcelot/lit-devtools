# Lit DevTools promo, 15 s portrait (v4)

1080×1920, 15.36 s, for X/Twitter, made 2026-10-27. Same music window as `../promo-video-v4-short`
(the bed from 15.41 s, drop A, 8 bars of 1.92 s) but no footage: the user found film crops in boxes
"recycled" and asked for one coherent look with movement. Everything is drawn natively on drifting
gradient blobs, with a light sweep on every cut and a bloom on the drop (6.24 s):

| Time        | Shot                                                                 |
| ----------- | -------------------------------------------------------------------- |
| 0–1.92      | Flame pieces fly in dark, flicker on with "lights on." (0.48)        |
| 1.92–5.76   | `<h2>Counter` types `: edited live`; split-flap count 39 → 42, save hit 3.36, flips to 42 again |
| 5.76–9.60   | 1,000 dots recolour on the drop; the import swaps theme → tailwind → uno → theme with Tailwind v4 / UnoCSS / plain CSS chips |
| 9.60–11.52  | Event rows joined by cause rails, the `2×` echo shakes               |
| 11.52–15.36 | Lockup: flame, Lit DevTools, `plugins: [litPlugin()]`, npm, URL, logo row (Vite … MCP) |

`index.html` is generated: shots, copy and timing live in `scripts/build.py`; background, headline
and lockup styles in `scripts/template.html`. Edit them, then `python3 scripts/build.py`.

```sh
npx --yes hyperframes@0.8.189 check
npx --yes hyperframes@0.8.189 render --quality high --output renders/video.mp4
```
