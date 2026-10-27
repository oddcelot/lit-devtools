---
name: Lit DevTools
description: The DevTools panel and in-page UI of Lit DevTools, built on the in-repo Lit Design System.
colors:
  lit-blue: '#324fff'
  lit-blue-bright: '#4d63ff'
  lit-indigo: '#2a2c9d'
  lit-cyan: '#00ffff'
  lit-dark-cyan: '#00e8ff'
  dark-bg: '#030303'
  dark-surface-low: '#0d0d0d'
  dark-surface: '#121212'
  dark-surface-container: '#212121'
  dark-surface-container-high: '#292929'
  dark-border: '#363636'
  dark-border-strong: '#474747'
  dark-text-muted: '#919191'
  dark-text-secondary: '#c7c7c7'
  dark-text: '#e3e3e3'
  dark-text-link: 'oklch(0.72 0.15 268)'
  light-bg: '#f4f4f4'
  light-surface: '#ffffff'
  light-surface-low: '#f3f3f3'
  light-surface-container-high: '#e8e8e8'
  light-border: '#e2e2e2'
  light-border-strong: '#c6c6c6'
  light-border-control: '#8a8a8a'
  light-text-muted: '#6f6f6f'
  light-text-secondary: '#595959'
  light-text: '#242424'
  light-text-link: '#005dc7'
  dark-success: 'hsl(158 74% 53%)'
  dark-warning: '#f4bf4f'
  dark-error: '#ff6b6b'
  light-success: '#007a52'
  light-warning: '#b26a00'
  light-error: '#ba1a1a'
typography:
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "'Lilex Variable', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: '15px'
    fontWeight: 600
    lineHeight: 1.3
  data:
    fontFamily: "'Lilex Variable', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Lexend Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: '12px'
    fontWeight: 500
    lineHeight: 1.3
  wordmark:
    fontFamily: "'Lexend Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: '13px'
    fontWeight: 600
    letterSpacing: '-0.01em'
rounded:
  none: '0'
  pill: '9999px'
spacing:
  '1': '2px'
  '2': '4px'
  '3': '6px'
  '4': '8px'
  '5': '12px'
  '6': '16px'
  '7': '20px'
  '8': '24px'
  '9': '32px'
components:
  button-brand:
    backgroundColor: '{colors.lit-blue}'
    textColor: '{colors.light-surface}'
    rounded: '{rounded.none}'
    height: '28px'
  button-neutral-outlined:
    backgroundColor: 'transparent'
    textColor: '{colors.dark-text}'
    rounded: '{rounded.none}'
    height: '28px'
  input:
    backgroundColor: 'transparent'
    textColor: '{colors.dark-text}'
    rounded: '{rounded.none}'
    height: '28px'
  tab-active:
    textColor: '{colors.lit-blue-bright}'
    typography: '{typography.body}'
  layer-chip:
    backgroundColor: '{colors.dark-surface-container-high}'
    textColor: '{colors.dark-text}'
    rounded: '{rounded.pill}'
    height: '28px'
  tree-row:
    textColor: '{colors.dark-text}'
    typography: '{typography.data}'
    height: '24px'
  card:
    backgroundColor: '{colors.dark-surface}'
    rounded: '{rounded.none}'
---

# Design System: Lit DevTools

## Overview

**Creative North Star: "The Lit Workbench"**

A clean bench beside the running app. The panel is where a Lit developer
lays a component out to look at it: its properties, its renders, its parts.
The bench itself stays quiet. Surfaces are near-black ink in dark and paper
greys in light, separated by hairlines rather than shadows. Colour belongs to
what is being inspected (syntax hues for values, layer colours on the
timeline) and to the one brand voice, the blue of the Lit flame, which marks
what is selected, active or actionable.

It is precise and exact. Corners are square, borders are one pixel, numbers
and code are set in a monospace with fixed widths, and every size steps along
a fine 2px/4px grid made for dense tooling. Nothing is approximate or
decorative; anything that does not help the user read their component is
left off the bench.

The system is open to revision. The panel's design system (tokens,
`packages/lit-components`, the Web Awesome theme) may change as the panel is
redesigned. Rules below marked **(provisional)** describe how the system is
today and are under review; unmarked rules are firm.

**Key Characteristics:**

- Quiet ink and paper surfaces; the user's data is the loudest thing on screen.
- One brand accent, Lit blue, for selection, focus and primary action.
- Square everything, hairline borders, no shadows on resting surfaces.
- Lexend names things, the system sans carries the interface, mono sets data.
- One authored brand moment: the flame gradient under the active tab.
- Dense: 13px body text, 28px controls, 24px rows.
- Light and dark are equal, generated from one token source.

## Colors

A neutral ink-and-paper ground with one saturated brand blue and a cyan
companion from the Lit flame; status and syntax colours carry meaning only.

All colours come from `packages/webawesome-theme-lit/src/tokens/*.css` and are
generated into `src/lib/design-tokens.ts` (`pnpm run generate:tokens`). Code
reads them only as `--lit-devtools-*` custom properties, through the semantic
names (`--lit-devtools-accent`, `--lit-devtools-surface`, …), never the raw
ramps.

### Primary

- **Lit Flame Blue** (`lit-blue`): the accent in light. Selected tree rows (as
  a soft tint with a 2px inset bar), the active tab's underline, primary
  buttons, switches that are on, focus rings, the selection highlight. Carries
  an 11-step OKLCH ramp at hue 268 (`--lit-devtools-lit-blue-05`…`-95`).
- **Bright Flame Blue** (`lit-blue-bright`): the same role in dark, one step
  lighter so it holds against near-black.
- **Deep Indigo** (`lit-indigo`): the pressed state of the accent in light.

### Secondary

- **Flame Cyan** (`lit-cyan`, `lit-dark-cyan`): the second colour of the Lit
  flame, used as `--lit-devtools-accent-cyan` and the dark scheme's info
  colour. Rare by design.

### Neutral

- **Ink scale** (`dark-*`): fourteen grey steps from near-black (`dark-bg`) to
  white. Dark surfaces climb it for hierarchy: background, low surface
  (header, toolbars), surface, container, container-high (chips, raised
  fills). Borders sit two steps above the surface.
- **Paper scale** (`light-*`): the lit.dev website's light theme. A grey page
  (`light-bg`) under white surfaces, `#e2e2e2` hairlines.
- **Text**: three steps per scheme: text, secondary (labels), muted
  (metadata, placeholders, origin tags). Links have their own colour, lighter
  than the brand blue in dark and darker in light, so they read as text.

### Status and syntax

- **Success / Warning / Error / Info** each have a solid and a `-soft` tint
  (15% in dark, 10% in light). Status chips use the soft tint behind the
  solid colour, never a solid fill.
- **Syntax hues** (`--lit-devtools-code-*`): Material-like on dark, the same
  hues darkened GitHub-style on light: keyword violet, string green, number
  orange, tag teal, callee blue, property grey-blue, comment grey.

### Named Rules

**The One Blue Rule.** Lit blue means "selected, active or yours to act on".
It is not decoration, not a heading colour and not a background for areas.

**The Earned Contrast Rule.** Every text token clears 4.5:1 on the surfaces it
sits on, and everything that marks a control (its outline, the focus ring)
clears 3:1. Where the upstream design system's value fell short, the token was
lightened or darkened and the source comment says so. Keep doing that rather
than reverting to the upstream value.

**The Opaque Focus Rule.** Keyboard focus is drawn in `--lit-devtools-focus-ring`,
an opaque accent (the accent in light, the accent's hover step in dark), never
in the translucent `--lit-devtools-accent-ring`, which measured under 2:1. The
translucent ring is for tinted fills such as a timeline range.

**The One Flame Rule.** The Lit flame's blue-into-cyan gradient
(`--lit-devtools-flame`) appears once: under the active tab. It is the
panel's one authored brand moment; don't spread it to buttons, borders or
text. In light, its cyan is deepened to `#0097b2` to hold 3:1.

**The Two Schemes Rule.** Every colour exists in both schemes. A change that
only defines or checks one scheme is unfinished.

## Typography

**Display Font:** Lexend Variable (with the system sans), bundled from
`@fontsource-variable/lexend`
**Interface Font:** the platform's system sans (`ui-sans-serif`, `system-ui`,
then -apple-system, Segoe UI, Roboto)
**Data Font:** Lilex Variable (with ui-monospace, SF Mono, Menlo, Consolas)

**Character:** Lexend, the docs' heading face, names things: the wordmark and
the section labels, so the panel and the site speak in one voice. A neutral
system sans carries the chrome and prose, so the panel still feels native
beside the browser's own DevTools, and a crisp coding mono sets everything
the user wrote: tag names, values, paths, timings.

### Hierarchy

- **Title** (mono, 600, 15px): the selected element's tag in the details
  pane.
- **Body** (sans, 400, 13px, 1.5): interface text, notes, descriptions. The
  panel's base size; Web Awesome's scale is set to 0.8125 to match.
- **Data** (mono, 400, 12–13px): tree rows, property names and values,
  timeline rows, settings values, source links.
- **Label** (Lexend, 500–600, 11–12px, sentence case): section headers in the
  details pane, settings card titles, the Updates column heads. No
  uppercase, no tracking: Lexend's width does the work capitals used to.
- **Wordmark** (Lexend, 600, 13px, -0.01em): "Lit DevTools" beside the logo,
  nowhere else.
- **Mark label** (sans, 9px): the inline label in a timeline track mark,
  which is 11px tall. The one size below the scale, and only there.

### Named Rules

**The Mono Means Data Rule.** Monospace marks what came from the user's code
or runtime (names, values, paths, durations). Interface words such as
setting labels and button text stay in the sans.

## Layout

The panel fills its frame edge to edge: a header row (logo and tabs), an
optional toolbar per tab, then the tab's view, which scrolls on its own. It
runs docked in Vite DevTools, in its own tab, standalone and in the Lit
Inspector extension, so it must work from a narrow side dock to a full
window.

- **Grid:** spacing steps of 2, 4, 6, 8, 12, 16, 20, 24 and 32px. Views pad
  12px vertically and 16px horizontally; card rows pad 4px by 12px.
- **Density:** controls are 28px tall (`--lit-devtools-control-height`); tree
  and list rows 24px (`--lit-devtools-row-height`), the WCAG 2.5.8 minimum
  target, since a row is what gets clicked **(provisional for everything but
  the 24px floor)**.
- **Split views:** Components is a tree beside a details pane in a draggable
  split (`lit-split-panel`); the details width defaults to 400px, has a 220px
  floor and is remembered per browser.
- **Forms:** Settings is a column of cards capped at 760px, with one fixed
  11em label column so values line up across cards.
- **Responsive:** there are no layout breakpoints today. Views rely on flex
  wrapping (toolbars, layer chips), the draggable split and scrolling
  regions.

## Elevation & Depth

Flat. Resting surfaces have no shadow; depth comes from tonal steps on the
ink or paper scale and from 1px borders. Shadows (`--lit-devtools-shadow-xs`
to `-xl`, tuned for dark) exist for things that genuinely float: menus,
popovers, tooltips, and the in-page overlay drawn over the user's app.

### Named Rules

**The Hairline Rule.** Separate regions with a 1px border or one tonal step,
never with a shadow. A shadow means "this is above the page".

## Shapes

Square corners everywhere (`rounded.none`): buttons, inputs, selects, cards,
the split panel, focus outlines, inline chips and swatches. There is no small
radius; a corner is square or, for the few pills, round. The pill radius is the
one round shape, kept for small things: count badges on tabs, timeline layer
chips, dots. Borders are 1px; 2px is reserved for the focus ring and the
selection bar.

## Components

The panel's components are Web Awesome components restyled by the Lit theme
(`packages/webawesome-theme-lit`) and wrapped in `packages/lit-components`
(`lit-button`, `lit-input`, `lit-select`, `lit-switch`, `lit-card`,
`lit-badge`, `lit-tabs`, `lit-tree-node`, `lit-split-panel`, …). Use them;
do not hand-roll a control the set already has.

### Buttons

- **Shape:** square (0), 28px tall, size `s` by default.
- **Brand:** Lit blue fill, white text; the default variant of `lit-button`.
- **Neutral outlined:** transparent with a 1px border, used for toolbar
  actions (Flash, Anatomy, Clear, Reset overrides). Usually leads with an
  icon.
- **Icon buttons:** borderless, muted icon, for row-level actions (reveal,
  refresh, open source).

### Chips

- **Layer chips** (Timeline): pill-shaped toggles with a square colour
  swatch. On: raised fill and full text. Off: transparent fill, muted text,
  hollow swatch.
- **Status badges:** a soft status tint behind status-coloured text
  ("enabled"); origin tags such as "(option)" are plain muted mono text with
  no fill.

### Cards / Containers

- **Corner Style:** square.
- **Background:** the surface step, on the page background.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px; rows inside are separated by 1px lines.
- **Header:** a Label-style uppercase title, with its status badges inline.

### Inputs / Fields

- **Style:** 1px border, transparent fill, square, 28px; filter fields lead
  with a search icon and use sentence-case placeholders ("Filter tags").
- **Focus:** a 2px ring in the focus-ring colour.
- **Outline:** `--lit-devtools-border-control`, the one border that must read
  as a control (3:1); hairline `--lit-devtools-border` is for regions only.
- **Disabled:** a muted fill, a dashed outline and the not-allowed cursor on
  top of Web Awesome's half opacity, so a disabled field never looks like an
  empty one.

### Navigation

- **Tabs** (`lit-tabs`): icon plus label, full header height, 13px. Active:
  brand-coloured label over a 2px underline in the flame gradient
  (`--lit-devtools-flame`); inactive tabs carry a transparent underline so
  heights never shift. A narrow header drops the labels for icons, with the
  label as tooltip and accessible name. Count badges are brand-blue
  pills; warning counts are warning pills.

### Component tree (signature)

- **Rows:** 24px, mono tag names in angle brackets, a disclosure chevron
  indented by depth.
- **Selected:** accent-soft tint with a 2px inset accent bar on the left
  **(provisional)**.
- **Focus:** a 2px ring inset by 2px, so it never spills into the next row.

## Do's and Don'ts

### Do:

- **Do** read every colour, size and space from a `--lit-devtools-*` token,
  and add a token in `packages/webawesome-theme-lit/src/tokens/` when one is
  missing.
- **Do** check every change in light and dark.
- **Do** keep text at 4.5:1 or better, and say so in a comment when a token
  departs from the upstream design system to get there.
- **Do** set user data in mono and interface text in sans.
- **Do** keep clickable rows at least 24px tall.

### Don't:

- **Don't** use Lit blue for decoration, headings or large fills.
- **Don't** put a shadow on a resting surface; use a border or a tonal step.
- **Don't** round a control, card or panel while the square rule stands; the
  pill is only for badges, chips and dots.
- **Don't** fill an origin tag or metadata label like a button; muted text is
  enough.
- **Don't** let a form or a line of prose run the full width of a wide panel.
