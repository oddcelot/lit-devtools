---
version: alpha
name: Lit × Astro Deep Space — Frame (video / frame layer)
description: >
  Hand-authored for the vite-plugin-lit 0.20.0 release video. Astro leads: its press-kit dark
  #0d0f14 is the void, its red→magenta mark gradient (#D83333 → #F041FF) is the accent, and
  its purple #8D46E7 tints the nebula. Lit blue appears only inside the Lit UI (the panel, the
  flame). Space Grotesk for display and body, Space Mono for code, labels and readouts.
unit: the frame — 1920×1080
principle: atoms are sacred · composition is free · the sky never cuts

colors:
  void: '#0d0f14'
  surface: '#15171e'
  surface-high: '#1c1f28'
  surface-top: '#262a35'
  border: '#343841'
  text: '#e9e6f2'
  text-strong: '#f7f4ff'
  text-muted: '#a7a9b8'
  text-dim: '#6d7080'
  astro-red: '#D83333'
  astro-magenta: '#F041FF'
  astro-purple: '#8D46E7'
  lit-blue: '#4d63ff'
  lit-cyan: '#00e8ff'
  warning: '#f5b54a'
  code-keyword: '#c792ea'
  code-string: '#c3e88d'
  code-number: '#f78c6c'
  code-tag: '#89ddff'
  code-callee: '#82aaff'
  code-property: '#b2ccd6'
  code-comment: '#6d7080'

fonts:
  display: Space Grotesk # assets/space-grotesk-{400,500,700}.woff2
  body: Space Grotesk
  mono: Space Mono # assets/space-mono-{400,700}.woff2

typography:
  hero: {fontFamily: 'Space Grotesk', px: 112, weight: 700, lineHeight: 1.0, tracking: '-0.035em', color: 'text-strong'}
  h1: {fontFamily: 'Space Grotesk', px: 76, weight: 700, lineHeight: 1.03, tracking: '-0.03em', color: 'text-strong'}
  lede: {fontFamily: 'Space Grotesk', px: 28, weight: 400, lineHeight: 1.4, color: 'text-muted'}
  eyebrow: {fontFamily: 'Space Mono', px: 20, weight: 700, tracking: '0.16em', upper: true, color: 'astro-magenta'}
  code: {fontFamily: 'Space Mono', px: 26, weight: 400, lineHeight: 1.6, color: 'text'}
  label: {fontFamily: 'Space Mono', px: 20, weight: 400, color: 'text-muted'}

radii:
  window: '16px'
  card: '12px'
  chip: '999px'

shadows:
  window: '0 40px 100px rgba(0,0,0,0.65), 0 0 0 1px #343841'
  glow-magenta: '0 0 48px rgba(240,65,255,0.45)'
  glow-blue: '0 0 32px rgba(77,99,255,0.6)'

rules:
  - Dark only. The sky is one persistent layer (compositions/space.html); scenes are transparent.
  - Astro's gradient is for the mark, the docking module and one accent bar per frame. Never gradient text.
  - Emphasis words in a headline are astro-magenta. One emphasis per headline.
  - Lit blue and cyan appear only inside Lit UI (pills, panel, flame, patch rings).
  - Real API only — `lit()`, `litDevtools()`, `@oddsquad/vite-plugin-lit/astro`, `defer-hydration`, `client:visible`. Example components (ssr-counter, TagList, launch-timer) are illustrative.
---

# Lit × Astro Deep Space

## Stage spec (binding for every frame)

Canvas 1920×1080. Safe inset 96px.

**Space layer** (`compositions/space.html`, 0–45s, under everything): fill `void`; ~260 seeded
stars in three tiers drifting left in two parallax speeds; two nebula glows (radial, never a
full-screen linear gradient): `astro-purple` at 28% centred (1500, 260) r 900 and
`astro-magenta` at 14% centred (300, 900) r 700; a planet arc: a 2600px circle centred
(960, 3050), fill #10121a, rim light 2px `astro-magenta` → `astro-purple`, so only its top
curve shows across the bottom ~200px. Warp (33.75–37.5s): stars stretch radially from (960, 540).

**Headline column** (frames 02–06): x 120, width 620.

- Eyebrow at top 220, Space Mono 700 20px, tracking 0.16em, uppercase, `astro-magenta`.
- Headline at top 262, Space Grotesk 700 76px, line-height 1.03, tracking -0.03em, `text-strong`, at most 3 lines. One emphasis word in `astro-magenta`.
- Sub 28px below the headline, Space Grotesk 400 28px, line-height 1.4, `text-muted`, width 600.

**Visual stage** (frames 02–06): x 820 → 1800, y 120 → 960. Windows and cards live here.

**Code card**: fill #0b0c11, 1px `border`, radius 16, a 52px title bar on `surface-high` with three 12px dots (#343841) and the filename in Space Mono 18px `text-muted`; body padding 36/40, code type, syntax in code-*.

**Pills** (from the panel): radius 999, padding 4/14, Space Mono 18px, a 16px drop icon before the text. `deferred` / `not hydrated`: `warning` text and border, empty drop. `hydrated`: `lit-blue` fill at 20%, `lit-blue` border, #c9d0ff text, filled drop.

**Astro dev toolbar**: a pill bar centred at the bottom of its browser viewport, fill #13151a, 1px #343841, radius 999, height 56, icon buttons 40px; the Lit button shows the flame; its active state is a 2px `astro-magenta` underline dot.

**Lit window** (the toolbar app): fill #13151a, 1px rgba(52,56,65,1), radius 12, header 44px "Lit DevTools" Space Grotesk 600 18px with the flame; tree rows Space Mono 18px, line-height 36; a 14px resize grip in the top corner away from the dock.

**Pointer**: white arrow 26px with a dark drop shadow, moves on power3.inOut, never teleports.

**Beat grid**: 128 BPM placeholder — beat 0.46875s, bar 1.875s. Scene starts on bar downbeats. When the real track lands, scenes are re-timed by a timeScale wrapper.
