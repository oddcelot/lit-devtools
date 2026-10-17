---
version: alpha
name: Lit DevTools Night — Frame (video / frame layer)
description: >
  Hand-authored from the lit-design skill's dark DevTools theme (build-frame's blue-professional
  remix inverted the brand into a light canvas, which the brief rules out; kept at
  .hyperframes/frame.blue-professional.md). The unit is the frame (1920×1080). Atoms are sacred —
  near-black void canvas, charcoal surfaces with hairline borders, the Lit flame blue as the one
  accent with flame-tip cyan as its highlight, Manrope for display/body, Roboto Mono for code,
  track labels and timestamps. The video's stage is the Lit DevTools Timeline itself.
unit: the frame — 1920×1080
principle: atoms are sacred · composition is free · the DevTools UI is the stage

colors:
  canvas: '#030308'
  surface: '#121212'
  surface-high: '#1c1c1c'
  surface-top: '#292929'
  border: '#363636'
  text: '#e3e3e3'
  text-strong: '#ffffff'
  text-muted: '#a1a1a1'
  text-dim: '#616161'
  accent: '#4d63ff'
  accent-deep: '#324fff'
  indigo: '#2a2c9d'
  cyan: '#00e8ff'
  accent-soft: 'rgba(77,99,255,0.16)'
  accent-ring: 'rgba(77,99,255,0.45)'
  success: '#34e0a1'
  error: '#ff6b6b'
  code-keyword: '#c792ea'
  code-string: '#c3e88d'
  code-number: '#f78c6c'
  code-tag: '#89ddff'
  code-callee: '#82aaff'
  code-property: '#b2ccd6'

fonts:
  display: Manrope # assets/manrope-{medium,semibold,bold,extrabold}.woff2
  body: Manrope
  mono: Roboto Mono # assets/RobotoMono-Latin-400.woff2

typography:
  hero:
    {
      fontFamily: 'Manrope',
      px: 132,
      weight: 800,
      lineHeight: 1.0,
      tracking: '-0.04em',
      color: 'text-strong',
    }
  h1:
    {
      fontFamily: 'Manrope',
      px: 88,
      weight: 800,
      lineHeight: 1.05,
      tracking: '-0.03em',
      color: 'text-strong',
    }
  h2:
    {
      fontFamily: 'Manrope',
      px: 56,
      weight: 700,
      lineHeight: 1.1,
      tracking: '-0.02em',
      color: 'text',
    }
  lede:
    {
      fontFamily: 'Manrope',
      px: 32,
      weight: 500,
      lineHeight: 1.35,
      color: 'text-muted',
    }
  eyebrow:
    {
      fontFamily: 'Manrope',
      px: 20,
      weight: 700,
      tracking: '0.14em',
      upper: true,
      color: 'accent',
    }
  code:
    {
      fontFamily: 'Roboto Mono',
      px: 30,
      weight: 400,
      lineHeight: 1.55,
      color: 'text',
    }
  track: {fontFamily: 'Roboto Mono', px: 22, weight: 400, color: 'text-muted'}
  tick: {fontFamily: 'Roboto Mono', px: 16, weight: 400, color: 'text-dim'}

radii:
  window: '14px'
  card: '10px'
  chip: '999px'
  bar: '6px'

shadows:
  window: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px #363636'
  glow: '0 0 40px rgba(77,99,255,0.55)'
  glow-cyan: '0 0 24px rgba(0,232,255,0.7)'

components:
  devtools-window:
    backgroundColor: '{colors.surface}'
    border: '1px solid {colors.border}'
    rounded: '{radii.window}'
    shadow: '{shadows.window}'
    header: "56px bar on surface-high: flame mark + 'LIT DEVTOOLS' (Manrope 800, 0.12em tracking, text); tabs Components · Updates · Timeline · Settings in text-muted; active tab = accent text + 2px accent underline"
  track-row:
    spec: 'left label gutter 280px; row height 76px; hairline divider in border; label = 10px accent dot + track type'
  event-bar:
    spec: 'accent-deep fill, radius bar, height 28px; when the playhead hits it: fill accent + glow, then it blooms into a demo card'
  playhead:
    spec: '2px cyan vertical line with glow-cyan; 14px cyan downward triangle cap on the ruler'
  ruler:
    spec: "40px band on surface-high, tick type every 100ms label ('1600ms' style)"
  chip:
    spec: 'surface-top pill, 8px colored dot, track type'
  code-card:
    spec: '#0b0b12 fill, 1px border, radius card, code type with code-* syntax colors, 32px padding'
  record-button:
    spec: "idle: pill on surface-top, '▶ Record' text. Recording: 1px error border, error text '■ Stop'"

layout:
  safe: '96px inset all sides'
  ground: 'canvas + a soft radial indigo glow (indigo @ ~35%) behind the focal element. Never busy.'

rules:
  - Dark only. No light surfaces, no cream, no pure-white fills.
  - Blue is the voice; cyan is punctuation (playhead, the one highlighted word or number). One cyan focus at a time.
  - Real product vocabulary only — tag names, API and tool names from the README.
  - Big type, few words per beat; each beat readable in under 2s.
---

# Lit DevTools Night

The video borrows the plugin's own Lit DevTools Timeline as its stage. Everything reads as if
recorded inside the panel: mono track labels, a millisecond ruler, blue event bars, a cyan
playhead. Headlines are Manrope 800, white, tight tracking, placed over the void with an indigo glow.

## Stage spec — vite-plugin-lit 0.19.0 release video (binding for every frame)

Canvas 1920×1080, px. Captions are off, so the bottom band is free. Ground: a full-bleed `canvas` #030308 background clip plus a radial `indigo` #2a2c9d glow at 35% opacity centred (1344, 430), radius ~1000. Every frame paints its own ground clip.

**Headline column** (frames 02, 03, 04, 06): x 115, width 576.

- Eyebrow: top 230. Manrope 700 18px, tracking 0.14em, uppercase, `accent` #4d63ff. A second word in `cyan`.
- Headline: top 273. Manrope 800 69px, line-height 1.05, letter-spacing -0.03em, #ffffff, at most 3 lines. The emphasized words are `cyan` #00e8ff.
- Sub: top = 24px below the headline's last line. Manrope 500 24px, line-height 1.4, `text-muted` #a1a1a1, width 556.

**DevTools window** (frames 02, 03, 04, IDENTICAL geometry, so a cut between them never moves it): left 768, top 86, 1056×912, fill `surface` #121212, 1px `border` #363636, radius 15, shadow 0 38px 96px rgba(0,0,0,.65).

- Header bar: height 56, fill #1c1c1c, bottom hairline #363636, top radius 15.
  - At x 31 (window-relative): flame.svg 22px tall, then "LIT DEVTOOLS" at x 58, Manrope 800 18px, tracking 0.12em, #e3e3e3, vertically centred.
  - Tabs from x 250, gap 38: "Components" "Updates" "Timeline" "Settings", Manrope 600 17px, #a1a1a1. "Components" is #4d63ff with a 2px #4d63ff underline flush with the bar bottom.
  - Version pill right-aligned, ending 27px from the right edge: "0.19.0" Roboto Mono 16px `cyan`, 1px rgba(0,232,255,.4) border, radius 99, padding 3/15.
- Tree pane: x 0→288, below the bar, right hairline #363636, padding 23. Rows Roboto Mono 17px, line-height 40px, #a1a1a1, indented 12px per depth. The selected row is #ffffff on rgba(77,99,255,.16), with a 4px #4d63ff left bar spanning the pane width.
  - Tree: fh-app › fh-header, fh-search, fh-product-card (selected), fh-product-card, fh-cart-button, fh-toast.
- Details pane: x 288→1056, padding 27/35.
  - Header `<fh-product-card>`: Roboto Mono 23px, `code-tag` #89ddff.
  - Under it the source path `src/components/product-card.ts:4`, Roboto Mono 14px, `text-dim` #616161.
  - Section labels: Manrope 700 15px, tracking 0.12em, uppercase, #616161, with a top hairline #363636 and 15px above/10px below.
  - Prop rows: Roboto Mono 18px, line-height 36px. Name `code-property` #b2ccd6, strings `code-string`, numbers `code-number`, booleans/event names `code-keyword`. Description text Manrope 500 16px #a1a1a1.
  - Edit button: 28px square, radius 6, fill #292929, glyph ✎ in `cyan`, 10px after the value.
  - Inline input: 1px #4d63ff border, fill #0a0a14, radius 5, padding 0 10px.
- Tooltip: fill #292929, 1px #363636, radius 8, padding 12/17, Manrope 500 16px #e3e3e3, max-width 330, shadow 0 19px 38px rgba(0,0,0,.6).

**Fernhouse page card** (frames 03, 06) is the real shop's look and the only light surface in the video.

- Page panel: fill #f6f3ec, radius 12.
- Card: fill #fff, 1px #e3ded2, radius 10.
- Media region: the top 55%, a gradient #bcd3b8→#6f9a74 (a plant photo stand-in).
- Badge: pill #2f6f4e with white Manrope 700 text.
- Title: Manrope 700 #1f2a1f. Price: Roboto Mono #1f2a1f, "€24".
- CTA "Add to cart": 1.5px #2f6f4e outline, #2f6f4e text, radius 6.

**Pointer**: a white arrow cursor 24px with a soft dark drop shadow. It moves on power3.inOut and never teleports.

**Fonts** (local @font-face only): assets/manrope-{medium,semibold,bold,extrabold}.woff2 (500/600/700/800) and assets/RobotoMono-Latin-400.woff2.

**Beat grid**: the music ("Groche Énergique") beat falls every 0.488s, starting 0.214s into the film; frame timelines are written on a 0.5454s grid and run at 1.1176×. Land each frame's key hit on a beat, given in the frame's own local seconds in its storyboard block.
