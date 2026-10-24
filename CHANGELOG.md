# Changelog

Notable changes per release. Versions before 0.3.0 predate this file; see the
git history for those.

## 0.23.0 — 2026-10-24

The Components panel now shows what a component keeps to itself: its
`#private` fields, readable and editable under the dev server, and the custom
states, form value and validity of a form-associated element. The tree no
longer has a Live switch; it stays live, holds still under the pointer and
paces itself on busy pages. The panel's rows, colours and fields got easier
to read and hit, and the docs run the examples live beside the panel. Nothing
needs action to upgrade.

### Added

- **The Components panel shows and edits a component's `#private` fields.**
  Under the dev server, a Private section after State lists each native
  `#private` field as `#name` with its live value. A string, number or
  boolean has the same edit button as a property, kept as an override you can
  switch off, pin across reloads or remove, and the component re-renders with
  it. Agents read them through `lit_component-details` and set them through
  `lit_set-prop`. They come from the `hmr.privateFields` rewrite, so turning
  that off hides them.
- **The Components details show custom states and form values.** An element
  that calls `attachInternals()` gets an Internals section with the states
  `:state()` matches, the value it last passed to `setFormValue()`, and its
  validity and validation message, kept live as they change. Agents read the
  same through `lit_component-details`.
- **Try the examples live in the docs.** The Demos page opens flame, Web
  Awesome, Fernhouse, CSS, Tailwind, Forms and the tutorial's app running in
  your browser with the DevTools panel under them, with nothing to boot and a
  zoom control; StackBlitz is one switch away for editing their files.

### Changed

- **The live component tree keeps up with busy pages without slowing them.**
  A page that changes constantly still gets a fresh tree every so often,
  rebuilds space themselves out by how long the last one took, and none run
  while the Timeline is recording.
- **The Components toolbar sets Pick apart from the switches.** Pick is a
  crosshair beside the tag filter, and Flash and Anatomy, which stay on until
  you turn them off, sit together as one group at the right.
- **Tree and list rows are easier to hit.** Rows in the component tree and
  the timeline list are 24px tall, the minimum target size WCAG asks for.
- **Element references and functions no longer share a colour.** Tags and
  element refs are teal, functions stay blue, in both colour schemes.

### Fixed

- **A link to a component opens its details even before the page is ready.**
  Opening the panel on `#tab=components&component=N` before the page
  connected, or before its components defined, no longer shows "This element
  is no longer in the page" for an element that is there.
- **Settings' About shows the page's Lit even when opened first.** A panel
  opened on the Settings tab before the page connected said "lit: not
  detected" until the tab was reopened; it now lists the page's Lit packages
  as soon as the page connects.
- **Disabled fields no longer pass for empty ones.** A disabled select or
  input is dimmed, filled and dash-outlined with a not-allowed cursor, and the
  tags of a multi-select read as live rather than greyed out.
- **The Lit tab's footer buttons work in a narrow panel.** A long notice no
  longer covers its own "Don't show again" or "Not now": the text is cut
  short instead, and shows whole when you hover it.

### Removed

- **The Components tab's Live toggle is gone; the tree is always live.** It
  stays still while the pointer is over it, so the row under the pointer does
  not move, and catches up when the pointer leaves. A tree paused in an
  earlier version comes back live.

## 0.22.0 — 2026-10-24

The Lit DevTools now run in any server. `createLitDevtools()` serves the
panel from your app's own origin, without Vite or a second port, and docks it
in a drawer along the bottom of the page. An Elysia example puts it next to
server rendering on Bun, and a forms example shows form-associated elements
with `:state()`. The panel takes its colours, type and code font from the Lit
Design System, and agents can read the docs as Markdown. Nothing needs action
to upgrade.

### Added

- **The Lit DevTools in any server.** `createLitDevtools()` from
  `@oddsquad/vite-plugin-lit/devframe` gives a server without Vite (Elysia,
  Hono, `Bun.serve`, a SvelteKit or Next.js route) one request handler for the
  panel, its page script and its RPC on the app's own origin, with no
  `lit-devtools dev` process or second port.
- **The panel docks in the page.** With `createLitDevtools()`, a Lit button in
  the corner opens the panel in a resizable drawer along the bottom of the
  page, and picking an element opens it there instead of in another tab. It
  reopens as you left it; pass `dock: false` to keep it a tab.
- **An Elysia example, without Vite.** A guestbook that Elysia renders on Bun
  with `@lit-labs/ssr`, streams, hydrates and keeps live over a WebSocket,
  with a form that works before it hydrates. It shows the hydration traps to
  avoid, attaches the standalone Lit DevTools, and builds into a single
  executable.
- **A forms example.** A text field, a switch and a star rating extend one
  `FormControl` base class and work in a plain `<form>`: they submit with
  `FormData`, block submit while invalid, reset, and follow a disabled
  fieldset. Each shows what it is doing as `:state()` custom states for CSS to
  style on.
- **Every docs page has a Markdown copy.** Append `index.md` to a page's
  address, follow its `rel="alternate"` link, or send `Accept: text/markdown`
  to get the page as Markdown, with Link headers pointing to llms.txt and the
  sitemap.
- **An agent skill for the plugin.** Agents that read Agent Skills Discovery
  find it at `/.well-known/agent-skills/` on the docs site: setup, CSS
  delivery, hot-patch failures and the DevTools MCP server in one file.
- **A setup prompt for coding agents.** The Installation page has a prompt to
  copy into your agent; it installs the plugin, adds it to the Vite config and
  registers the types, then lists what it changed.
- **Browser agents can search and read the docs through WebMCP.** In a
  browser with WebMCP, the docs offer `search_docs`, `read_docs_page` and
  `open_docs_page` tools.

### Changed

- **The panel takes the Lit Design System's theme.** Its colours, focus ring,
  motion and type scale come from the same tokens as the docs, in both colour
  schemes. Corners stay square; pills, status dots and the Timeline's layer
  chips are round.
- **The panel sets code in Lilex.** Values, source locations, timings and the
  Timeline's lanes use the Lilex monospace instead of the system one.
- **The Updates count no longer looks like an error.** The number on the
  Updates tab is blue instead of red; the orange count on Components still
  flags Lit warnings.
- **A lighter split between the tree and the details.** The divider in the
  Components view is a hairline that lights up blue under the pointer, and is
  just as easy to drag.
- **The docs moved to vite-plugin-lit.oddsquad.dev.** Links in the DevTools
  panel, the README and the extension listing point there, and the old
  oddcelot.github.io/vite-plugin-lit/ addresses redirect.

### Fixed

- **A re-created child keeps its own listeners and lookups.** When a parent
  edit makes Lit re-create a child, `#private` arrow-function listeners and
  fields the child sets in `connectedCallback`, such as a form it looks up,
  stay the new element's instead of being overwritten by the old one's.
- **Dark outlines and nulls are legible.** In the dark scheme, unchecked
  switches, inputs and outlined buttons have a visible outline, and `null`
  values in the Properties view no longer fade into the background.
- **The `./build` and `./astro/*` exports have types on JSR.** JSR no longer
  warns that these entry points have no type declarations, and installing the
  package from JSR types them like the others.

## 0.21.0 — 2026-10-19

Lit Inspector now opens sources in your editor: on a page a Vite dev server
serves, even without the plugin, a component's **defined** and **rendered**
links open the file. Locations read shorter everywhere, by package and
version or relative to the project, and a library's component names the
module its manifest gives. The panel also follows sites that swap in a new
page body, such as webawesome.com. Nothing needs action to upgrade.

### Added

- **The extension opens sources in your editor on a Vite dev server.** On a
  page Vite serves, with or without the plugin, the **defined** and
  **rendered** links open the file in your editor instead of only in Chrome's
  Sources panel, and work in Firefox too. They use the plugin's endpoint when
  it serves one, else Vite's own `/__open-in-editor`, under the page's `base`.
  When the extension can't tell where the project is on disk, the bottom of
  the **Lit** tab says so and offers **Set project folder…** for the site.

### Changed

- **Locations in dependencies name the package.** A component from a
  package reads as its name, version and path inside it, such as
  `@awesome.me/webawesome 3.14.0 › dist/chunks/chunk.js:11`, instead of five
  lines of pnpm store path; the full path is in the tooltip.
- **A package's component names its module.** When the package ships a Custom
  Elements Manifest, **defined** reads as the module and class it names, such
  as `components/card/card.js (WaCard)`, instead of a bundler chunk. That
  holds in the Vite panel and, for a manifest read from the site, in the
  extension.
- **Project files read relative to the project.** A location given as an
  absolute path, such as Astro's for an element in `.astro` markup, reads
  `src/pages/basics.astro:26`, in the Vite panel and in the extension on a
  Vite dev server; the full path is in the tooltip.

### Fixed

- **The panel follows sites that swap in a new page body.** On a site that
  navigates with Turbo Drive, such as webawesome.com, the Components tree
  updates as you follow links, and the hover outline, update flashes and
  element picker keep working.
- **Lit components with a closed shadow root show their children.** The
  Components tree lists what such a component renders, and Live follows
  changes inside it, as the anatomy view already did.
- **Elements written in `.astro` markup show where they are rendered.** The
  **rendered** link, the source overlay and timeline events now point at the
  `.astro` file and line, where before those elements had no location at all.
- **The extension finds a decorated component on a Vite dev server.** On a
  page Vite serves without the plugin, **defined** pointed at the compiler's
  `decorate` helper instead of the file that declares the class.

## 0.20.1 — 2026-10-19

A patch of fixes: the Lit tab in Firefox DevTools works again after opening
blank since 0.19.0, server-rendered elements hydrate with the source overlay
on, and closing a panel tab always clears what it drew. Nothing needs action
to upgrade.

### Fixed

- **The Lit tab works in Firefox DevTools again.** Since 0.19.0 it opened
  blank in Firefox; it now shows the site's status and the inspector once the
  site is enabled.
- **Server-rendered Lit elements hydrate with the source overlay on.** An
  element whose template renders another custom element no longer re-renders
  in the browser with a warning about an edit that never happened, in Astro or
  any other server rendering.
- **Closing a panel tab always clears what it drew on the page.** The anatomy
  overlay, outline and Live mode no longer outlive a panel tab that closed too
  fast to say so, or crashed.
- **The panel stops filling the console with warnings.** Opening it no longer
  prints Web Awesome's `size="small" is deprecated` warnings, and a panel in a
  tab of its own, at `/__lit/` or in Firefox's DevTools, no longer warns that
  the in-page channel has no handshake targets.

## 0.20.0 — 2026-10-18

The plugin now runs in Astro. `lit()` server-renders and hydrates Lit
components with no other renderer, and `litDevtools()` brings hot patching and
the Lit panel, opened from Astro's dev toolbar. The Components tab reads
hydration as a state and stops labelling other libraries' elements. The
DevTools now warn when the Lit Inspector extension and the plugin share a page,
and both work there. Nothing needs action to upgrade.

[![Watch the 0.20.0 release video, 44 seconds](https://vite-plugin-lit.oddsquad.dev/demo/release-0.20.0-poster.jpg)](https://github.com/oddcelot/vite-plugin-lit/releases/download/v0.20.0/vite-plugin-lit-0.20.0.mp4)

### Added

- **The plugin runs in Astro, with the Lit panel in the dev toolbar.** Add
  `litDevtools()` from `@oddsquad/vite-plugin-lit/astro` to your integrations:
  Lit components hot-patch in place, hydrated or not, and the Lit logo in
  Astro's dev toolbar opens the panel on the page you are on.
  `LIT_PLUGIN_TIMELINE=false` turns the panel off, and the `timeline` option
  wins over it.
- **Lit components render and hydrate in Astro with no other renderer.**
  `lit()` from `@oddsquad/vite-plugin-lit/astro` server-renders Lit
  components, hydrates them with their array and object props, keeps a
  `defer-hydration` you wrote until you remove it, and needs no hydrate imports
  in your pages. Components nested in another's shadow root hydrate after a
  view transition too.
- **Resize the Lit window in Astro's dev toolbar.** Drag the grip in its top
  corner to make it bigger or smaller; the size sticks across page loads, and a
  double click on the grip resets it. The window lines up with where the
  toolbar is docked.
- **The DevTools warn when two runtimes share a page.** With the Lit Inspector
  extension enabled on a dev server that already runs the plugin, the console
  and the Components tab now say that two runtimes are loaded and that the
  extension should be off for that site, instead of the picker silently doing
  nothing.

### Changed

- **Hydration state reads as a state.** A server-rendered component that has
  hydrated is now marked _hydrated_ instead of _SSR_, and _deferred_, _not
  hydrated_ and _hydrated_ show as pills in the Components tree and details,
  with a drop icon that is empty until the element hydrates and filled once it
  has.
- **Custom elements from other libraries sit in the tree unmarked.** The muted
  _not Lit_ chip is gone from their rows and the details head, so wrappers like
  Astro's islands no longer crowd the tree with labels; the details pane still
  says why they have no properties.
- **A component that never upgraded shows one chip, not two.** One the server
  rendered was marked both _not upgraded_ and _not hydrated_, as if hydration
  were still coming; it now carries only _not upgraded_, whose tooltip says it
  still shows the HTML the server sent.

### Fixed

- **The Lit Inspector extension works on a dev server that runs the plugin.**
  Enabled for such a site, Pick did nothing and threw in the console, and Vite
  DevTools lost the page. The extension's runtime now serves the page and the
  plugin's shares it, so both panels show the tree and Pick works from either.
- **The link printed with the DevTools code opens the Lit panel.** Without the
  Vite DevTools hub, the `#devframe_otp` link in the terminal opened your app
  instead of the panel at `/__lit/`, so you had to type the code; it now opens
  the panel, approved.
- **The Lit panel connects on StackBlitz without Vite DevTools.** In a
  WebContainer the panel the plugin serves at `/__lit/` used to be refused by
  its own socket and never show the page; it now admits StackBlitz's origins.

## 0.19.0 — 2026-10-17

Lit rendered on the server with `@lit-labs/ssr` now works with the plugin:
edits hot-patch hydrated components and reach the next server render, shared
sheets arrive styled, and the Components tab shows where hydration stands. A
new SSR example covers dev, production builds and StackBlitz. Lit Inspector
gains a Lit tab in the Elements panel and reads Custom Elements Manifests from
more places, and the DevTools flag double renders. Nothing needs action to
upgrade.

[![Watch the 0.19.0 release video, 46 seconds](https://vite-plugin-lit.oddsquad.dev/demo/release-0.19.0-poster.jpg)](https://github.com/oddcelot/vite-plugin-lit/releases/download/v0.19.0/vite-plugin-lit-0.19.0.mp4)

### Added

- **Server-rendered Lit works in the dev server.** With `@lit-labs/ssr` in
  your Vite server, an edit patches hydrated components in place and the next
  server render uses the new code instead of failing because the tag is
  already defined. A `?css-sheet` renders into the declarative shadow root, so
  the page arrives styled, and its edits restyle hydrated components. A
  `defer-hydration` component edited before it wakes renders the new template,
  and a page whose HTML predates an edit renders that component once in the
  browser instead of failing to hydrate. The new SSR guide shows the setup, and
  Troubleshooting covers the dock's socket in middleware mode.
- **The Components tab shows hydration state.** A server-rendered component
  is marked _deferred_ while `defer-hydration` holds it back, _not hydrated_
  until its first update, and _SSR_ the moment it hydrates, in the tree and the
  details pane.
- **An SSR example, on StackBlitz too.** Open it from the README or the docs'
  Demos page: the counter arrives as server HTML, hydrates, and keeps its
  count through an edit, with the DevTools dock connected.
- **Server-rendered pages in production builds, with the Lit panel.** The SSR
  guide and example cover a production build served without Vite: shared
  `?css-sheet` styles arrive inlined, and the Lit panel attaches through
  `lit-devtools dev` with each element's hydration state.
- **The Lit panel works without Vite DevTools.** With `timeline: true` and no
  `DevTools()`, the dev server serves the panel at `/__lit/` and prints its
  address, instead of only warning that the panel never mounted.
- **A Lit tab in the Elements panel.** The browser extension adds a Lit tab to
  the Elements sidebar, beside Styles and Computed, showing the properties,
  state, slots, parts and source links of the Lit element you select there.
- **Double renders are flagged.** An update that a component's own previous
  update scheduled, usually because `updated()` set a property, is marked
  _re-rendered_ in the Updates tab and `2×` in the Timeline list, and
  `lit_update-summary` reports it as `selfCaused`. The Components tab's
  Warnings count how many times the recording shows an element re-rendering
  itself, also under a production build.
- **The Components tab counts dispatched events.** With the Custom events
  layer on, a Dispatched section lists how many times the selected element
  dispatched each event type during the recording.
- **Properties show which class declared them.** For a component that extends
  a base class or uses mixins, the Properties and State tables group their
  rows under the declaring class, the element's own first.
- **Component docs include members from your mixins.** For a component
  written as `extends Sized(Base)`, the Components tab lists what your
  project's `Sized` mixin adds, marked as inherited from it, and still reaches
  `Base` past a package mixin such as `SignalWatcher`.
- **Agents can set component properties.** The new `lit_set-prop` tool sets a
  reactive property, or a field inside the object it holds, on a live element
  and answers with the element's details afterwards. Agent edits land as
  overrides in the panel, where you can switch them off or clear them.
- **Lit Inspector can pause on an update or a property change.** Arm _update_
  or _render_ on the selected element, or the pause toggle on one of its
  properties, and the page stops in the debugger when it happens.
- **Lit Inspector finds more Custom Elements Manifests.** When a page links
  none, the Lit tab looks for every `custom-elements.json` beside the page's
  scripts and offers them, so Web Awesome's docs show component documentation
  with one click. Manifests on another site, such as a CDN, work once Chrome
  is granted access to it, through an Allow access button for a linked one.
- **Choose the manifests Lit Inspector reads.** The Settings tab's Component
  docs section lists the page's linked manifests, the ones found and the ones
  you add by URL, such as `/dist/custom-elements.json`. Each can be switched
  off, ignored and reset, or moved up and down; the first switched-on one that
  describes a component supplies its docs.
- **The extension shows where an element is rendered.** On a page without the
  Vite plugin, the details pane's rendered row names the template tag that
  created an element, found by the template's text in the page's sources, and
  in Chrome a click opens it in the Sources panel.
- **Read component docs without hovering.** Turn on "inline descriptions"
  under Components in the Settings tab, and every documented property,
  attribute, slot and part shows its description under its row.
- **`unoSheet()` works with presetWind4.** Pass `preflights: true` to keep
  Wind4's theme variables and `@property` rules in the shared sheet; drop the
  reset at the preset with `presetWind4({preflights: {reset: false}})`.
- **Context consumers waiting for a provider say so.** A subscribing consumer
  that no provider has answered yet reads "waiting for a provider" instead of
  linking to a provider that never answered it, and links as soon as a
  ContextRoot replays its request.

### Changed

- **The Settings tab no longer lists env var names.** Hints name the plugin
  option alone, the reset button reads "Reset overrides", and a value set from
  the environment still shows its "(env)" badge.

### Fixed

- **Hiding the panel clears what it drew on the page.** Collapsing the dock,
  closing DevTools with the browser extension, or closing a panel opened as
  its own tab now takes down the anatomy overlay, hover outline and
  breakpoints and stops Live, instead of leaving them until the page reloads.
  The overlay comes back when the dock opens again.
- **Slotted context consumers link to the right provider.** A consumer
  slotted into a component whose shadow tree provides the context now links to
  that provider, instead of to none or to one further out.
- **A provider's details follow a value set directly.** Setting a context
  provider's value with `setValue`, without its host updating, refreshes the
  selected provider's row right away instead of on its next update.
- **A component whose constructor threw is no longer called "not Lit".** The
  Components tab marks it _not upgraded_ and says its constructor probably
  threw, instead of claiming another library defined it.
- **The Anatomy "not rendered" list follows the page.** A light child added
  with a slot name the element doesn't have, or renamed to one, shows up
  without reselecting the element.
- **The Updates tab's equal-content badge shows its icon again.** The badge
  that flags a property changed to a new reference with equal content rendered
  as a bare number.
- **`lit-devtools mcp` finds dev servers behind your own HTTP server.** When
  Vite runs in middleware mode with your server passed in, the plugin
  registers that server's real port instead of probing 5173 and warning that
  discovery is unavailable.

## 0.18.0 — 2026-10-14

Shared stylesheets now work with utility frameworks: UnoCSS utilities become
one adopted sheet through `unoSheet()`, and Tailwind v4 classes you add in dev
reach a `?css-sheet` with their shadows, rings and gradients intact. Builds got
leaner: `vite build` no longer loads the dev tooling, and what the CSS queries
emit carries no HMR code. The Components tab gains a Request update button, and
the console gets `$lit` and Store as global variable. Nothing needs action to
upgrade.

[![Watch the 0.18.0 release video, 46 seconds](https://vite-plugin-lit.oddsquad.dev/demo/release-0.18.0-poster.jpg)](https://github.com/oddcelot/vite-plugin-lit/releases/download/v0.18.0/vite-plugin-lit-0.18.0.mp4)

### Added

- **UnoCSS utilities can be one shared sheet across shadow roots.**
  `unoSheet()` from `@oddsquad/vite-plugin-lit/uno` writes the utilities your
  source uses to a `.css` file; import it with `?css-sheet` and every component
  adopts the same `CSSStyleSheet`, swapped in place when a new class shows up.
- **A Tailwind example.** Three components share Tailwind v4 utilities as one
  adopted sheet, each counting its renders: change the brand colour and
  everything recolours in place, add a class and the shared sheet gains it,
  with shadows, rings and gradients working inside shadow roots.
- **Production builds can leave the dev tooling out entirely.** Use `litCss()`
  from `@oddsquad/vite-plugin-lit/build` for `vite build` and HMR, the source
  overlay and DevTools are never imported into the build; it keeps the CSS
  queries, `css` literal minification and `cssSheetBuild`.
- **Request update from the Components tab.** A button beside the tag name
  calls `requestUpdate()` on the selected element, and the Updates and Timeline
  tabs name the DevTools as that update's cause.
- **`$lit` in the console is the selected component.** Like `$0` in Elements,
  it returns the element selected in the Components tab, in every host, so you
  can call its methods or read its fields directly.
- **Store a property as a global variable.** A button on each Properties,
  State and Instance row puts the live value in `temp1`, `temp2`… on the page
  and logs it in the console, so you can work with the object itself instead
  of its preview.

### Changed

- **Builds carry no dev code, with no config change.** With plain
  `litPlugin()`, `vite build` no longer imports HMR, the source overlay or the
  DevTools panel, and a `?css-sheet` or `?hmr-url` import compiles without the
  hot-swap callback and the dev-server fetch rewrite. `urlSheet()` and
  `devCacheBust()` fold their dev branches away when minified.
- **Edits and overrides show up as the update's cause.** Updates you cause by
  editing or overriding a property in the Components tab now read "after edit
  in DevTools" or "after override in DevTools" in the Updates and Timeline
  tabs, instead of having no cause.
- **`?css-sheet` on `virtual:uno.css` now tells you what to do instead.**
  Importing a virtual CSS module with `?css-sheet` or `?hmr-url` warns that
  there is no file behind it and points to `unoSheet()`, instead of failing
  later with an error that doesn't mention the query.

### Fixed

- **`@property` rules in a `?css-sheet` now apply inside shadow roots.**
  Browsers ignore `@property` in a shadow root, so properties a shared sheet
  registered had no initial value there, and utilities built on them
  (Tailwind's shadows, rings, transforms and gradients) rendered nothing. The
  plugin now registers them on the document as well, and a build only ships
  that code for sheets that have such a rule.
- **Tailwind classes you add in dev reach the shared `?css-sheet`.** A class
  written in a component now lands in the sheet every adopter shares and swaps
  in place; before, only edits to the CSS file itself did. In dev the sheet is
  built from the file's `?inline` text, so it no longer waits on a fetch
  either.
- **Component docs stay current.** Changing a component's JSDoc updates its
  About, property and event descriptions on the next hot patch, and a Custom
  Elements Manifest an analyzer rewrites shows up within a second or so, both
  without selecting another tag and coming back.
- **Sites that enforce Trusted Types keep working with the extension on.** On
  a page whose CSP allows only Lit's own `lit-html` policy, enabling Lit
  Inspector stopped the page's components from rendering. The injected runtime
  no longer creates that policy, and its picker no longer needs one.
- **Rendered at links into `index.html` open the right line.** In Chrome's
  extension, an element written in `index.html` now opens that file at its
  line in the Sources panel, instead of Vite's inline-script module at the top.
- **SVG files on an enabled site open cleanly.** Viewing an `.svg` file
  directly on a site where Lit Inspector is on no longer logs a
  `configure is not a function` error.
- **Unminified builds no longer print your project's absolute path.** With
  `build.minify: false`, a `?css-sheet` or `?hmr-url` import's region comment
  named the css file by its full path on disk; it now names it relative to the
  project root.

## 0.17.1 — 2026-10-13

A small patch: Lit Inspector is now on Firefox Add-ons, and the Timeline list
no longer jumps back to the newest event while you read further up. Nothing
needs action to upgrade.

### Added

- **Lit Inspector is on Firefox Add-ons.** Install it with **Add to Firefox**
  from addons.mozilla.org and Firefox keeps it up to date, instead of loading
  a temporary add-on from a release after every restart.

### Fixed

- **The Timeline list stays where you scrolled it.** New events no longer
  pull the list back to the newest row while you read further up, open an
  update or follow an `#event=` link; at the end of the list it still follows
  them, now all the way to the last row.

## 0.17.0 — 2026-10-12

The Components tab now explains a component and lets you change it. Its details
pane shows the documentation from your JSDoc or a Custom Elements Manifest, in
the panel, in Lit Inspector and to agents. Primitive props, also inside
objects, arrays and Maps, can be edited in place, held as overrides against the
app's own writes, and pinned to survive a reload. Anatomy labels sit beside the
component with leader lines, and a CSS example shows each way of styling a
shadow root. Nothing needs action to upgrade.

[![Watch the 0.17.0 release video, 46 seconds](https://vite-plugin-lit.oddsquad.dev/demo/release-0.17.0-poster.jpg)](https://github.com/oddcelot/vite-plugin-lit/releases/download/v0.17.0/vite-plugin-lit-0.17.0.mp4)

[Watch it on YouTube](https://youtu.be/mByiAk5wsn4)

### Added

- **The Components tab shows a component's documentation.** The details pane
  adds the selected element's description, `@example`s, the events it fires,
  the CSS custom properties it reads and what each property is for, rendered as
  formatted text with long descriptions folded behind "more". During dev it
  reads your components' JSDoc straight from source; otherwise it uses a Custom
  Elements Manifest, from your project or a library such as Web Awesome.
  Hovering a documented slot or part in the Anatomy rows says what it is for,
  and the icon in the About heading tells where the docs came from.
- **Edit a component's props from the details pane.** A string, number or
  boolean gets an edit button, also inside an expanded object, array or Map;
  double-click a value to edit it, or a boolean to flip it. The value goes to
  the live element and lasts until the page reloads.
- **Overrides you can switch off, undo and pin.** An edited value holds against
  the app's own writes, with a checkbox to switch it off and see the app's
  latest value and a button to remove it; a bar lists every override on the
  page and switches off or clears them all. Pin one and it comes back after a
  reload from the component's first render, kept per tab and page path. In the
  browser extension pins live in the extension's storage, never the site's, and
  are cleared when the browser closes.
- **Lit Inspector shows component documentation.** On a page that links its
  Custom Elements Manifests with `<link rel="custom-elements-manifest">`, the
  Lit tab shows each component's docs. With DevTools on, pages from the dev
  server link the manifests your project and its dependencies ship, so this
  works there too.
- **Agents can read a component's documentation.** The new `lit_component-docs`
  MCP tool returns a tag's description, examples, events, slots, CSS parts and
  custom properties, from source or a Custom Elements Manifest.
- **Hover a slot or part to find it on the page.** Hovering a slot or CSS part
  row in the details pane outlines that region on the page, even with the
  Anatomy overlay off.
- **A CSS example with real UnoCSS utilities.** One card per way of delivering
  CSS to a shadow root (a shared `?css-sheet`, `?hmr-url`, `?inline` and a
  `css` literal through Lightning CSS), each counting its renders so an edit
  shows what restyles in place. UnoCSS reaches every component as one shared
  sheet.

### Changed

- **Anatomy labels sit beside the component with lines to their regions.** The
  overlay's labels no longer pile up or drift off on small elements: they line
  up next to the component, never overlap, and a line leads from each to its
  slot or part. Repeated part names share one label.

### Fixed

- **Custom timeline events line up with Lit's.** `addTimelineEvent` takes a
  `performance.now()` time, or none to stamp the event as it is added, and
  places it on the recording's clock, so a router or store event no longer
  lands long after the updates it caused.
- **The selected component stays selected after a reload.** Reloading the page
  no longer leaves the details pane showing some other component.
- **Collapsed Timeline rows say what changed.** Each update's row in the list
  names the reactive properties it changed again, as it did before rows were
  grouped, without having to open it.
- **Details sections fold again.** Clicking a section heading in the Components
  tab hides its rows instead of only turning the caret.
- **Source paths wrap between folders.** The defined and rendered links in the
  details header no longer split a file name in the middle when the pane is
  narrow.
- **Tooltips follow the keyboard.** Tabbing between controls in the panel shows
  each one's tooltip, not only the first one focused.

## 0.16.0 — 2026-10-09

Lit Inspector and the browser's own DevTools now hand off to each other:
sourcemaps tell the extension where components are defined, the Elements and
Sources panels link to and from the Lit tab, and custom elements from other
libraries keep their place in the tree. The dev server can connect your
project to Chrome's Sources panel for editing, the panel got a calmer, more
readable look, and a Fernhouse shop example gives the DevTools something to
explore. Editing a `@provide` component no longer leaves its consumers stale.
Nothing needs action to upgrade.

### Added

- **Custom elements from other libraries show up in the Components tree.** A
  defined element that isn't a Lit component is listed where it sits, marked
  "not Lit", instead of being flattened away, so the tree keeps the page's
  real structure. Selecting one shows its attributes and slots with a note on
  why it has no properties, the browser's Elements panel selects its own row,
  and the Anatomy tables link to it. Agents see it in the list-components
  tool too.
- **The extension finds component sources through the page's sourcemaps.** On
  pages without the plugin that ship sourcemaps, Lit Inspector shows where
  each component is defined in the details pane, the Updates view and the
  Timeline's span details.
- **Lit Inspector and the browser's DevTools hand off to each other.** The
  details pane's Reveal in Elements button selects the element in the
  Elements panel, picking a node in the Elements panel selects its component
  (or the nearest Lit element around it), and in Chrome the defined and
  Rendered at links open the file in Sources at that line, also on pages
  built with the Vite plugin.
- **Edit components in Chrome's Sources panel and save to disk.** The dev
  server now answers Chrome DevTools' workspace request, so DevTools offers to
  connect your project folder. Turn it off with `devtoolsWorkspace: false` or
  point it at another folder with a path.
- **Lit warnings get their own Timeline layer and stand out.** Toggle them
  apart from the Lifecycle layer; a warning issued during an update folds
  under it, and turning the layer on mid-recording brings in earlier warnings.
  Warning rows are tinted, selecting one shows its message and a link to the
  explanation on lit.dev, and components Lit warned about carry a chip in the
  tree, counted in the Components tab.
- **Source locations in lit-devtools dev.** On pages that ship sourcemaps, the
  standalone panel shows where each component is defined, in the details
  pane, the Updates view and the Timeline's span details. Load
  lit-devtools.js in `<head>` so it sees the app's defines.
- **A Fernhouse shop example to explore the DevTools on.** A small Lit plant
  shop with context, slots and parts, a task and custom events, runnable
  locally or on StackBlitz, with a production build for Lit Inspector.

### Changed

- **A calmer component tree with keyboard navigation.** Tags read as plain
  text with the selection clearly marked, the inspector's values line up
  across sections, and arrow keys move through and fold the tree.
- **A clearer Timeline.** An empty timeline says what to do and offers
  Record, layer chips show plainly whether they're on, and the lane filter in
  Tracks no longer looks like a second set of layers.
- **Updates reads as a table.** Counts and times sit under named columns, and
  a bar under each total shows which components cost the most.
- **A tidier Settings tab.** Status pills and origin tags no longer shout or
  look clickable, and values line up from section to section.

### Fixed

- **Context consumers keep updating after you edit their provider.** Editing
  a component that uses `@provide` no longer leaves its `@consume` children
  stuck on the value they had before the edit.
- **Lit Inspector names the right file for decorated components.** On
  bundled production builds, the defined link no longer points every
  component at the same unrelated module.
- **Flash on update skips components that didn't re-render.** A component
  whose `shouldUpdate` returned false no longer flashes, since nothing on the
  page changed.
- **Quiet text in the panel is readable.** Timestamps, labels and counts in
  muted grey, and links in the dark theme, now meet WCAG AA contrast.
- **Bundled Phosphor icons carry their licence.** The npm package, the JSR
  package and the Lit Inspector extension now ship THIRD_PARTY_NOTICES.md
  with the full MIT notice for the Phosphor icons they include.

## 0.15.0 — 2026-10-09

Lit Inspector is on the Chrome Web Store, and the Timeline now explains itself:
every update records what caused it, a column of rails draws the chain from a
click or a parent render through `@lit/task` runs to the re-render, and a time
range can be selected, summarised and shared as a link. The Components tab
shows a component's slots, parts, context, Lit's warnings and tags that were
never defined, and its details pane can be filtered, folded, expanded and
copied from. Nothing needs action to upgrade.

### Added

- **Lit Inspector is on the Chrome Web Store.** Install it with Add to Chrome
  instead of loading an unpacked zip, and Chrome keeps it up to date. Firefox
  still loads the zip from the GitHub release.
- **Updates know what caused them.** The cause is recorded at the
  `requestUpdate` call that scheduled an update, so the Updates tab reads
  "after click (412, 88)" or "after my-parent update" instead of guessing from
  timing, and the Timeline details pane names the cause with a show link to it.
- **The Timeline draws why each update ran.** A column beside the list connects
  an update to the row that caused it: the parent whose render set a property
  on it, or the click, key or custom event whose handler requested it. Rows
  stay in time order, each chain has its own colour, and hovering a row
  highlights its chain.
- **`@lit/task` runs show in the Timeline's cause chain.** A task run is a row
  of its own, from the update or handler that started it to when it settled,
  and the re-render it asks for hangs from it, so a click, the fetch it started
  and the render that showed the result read as one chain.
- **Select a time range in the Timeline.** Shift+drag on the tracks, or drag
  the time ruler, to see which layers fired and which components updated in
  that stretch, then zoom to it or filter the list to it. Drag either edge, or
  Tab to it and use the arrow keys, to adjust it a tick step at a time; Shift
  moves five.
- **Share a Timeline range as a link.** Copy link in the range summary gives an
  address with `#tab=timeline&range=<start>-<end>` that opens the Tracks on
  that stretch, including in an exported snapshot.
- **Coding agents can summarise a window of the Timeline.** The new
  `lit_range-summary` MCP tool takes a start and an end from
  `lit_recent-events` times and returns which layers fired and which components
  updated between them.
- **See a component's slots and parts.** The Components tab lists each slot
  with what is assigned to it, flags empty, fallback, forwarded and duplicate
  slots, and shows in red the children no slot takes. Turn on Anatomy to draw
  the slots and `::part` exports on the page; hovering a row in the Slots or
  Parts table pulses that region and fades the others.
- **See parts forwarded with `exportparts`.** The Parts list and the Anatomy
  overlay now include parts a nested component re-exports, marked forwarded,
  and show the outer name when `exportparts` renames one.
- **See which provider a Lit context consumer reads from.** The Components
  details pane now shows each `@lit/context` provider and consumer with its key
  and value, links a consumer to its provider and a provider to its consumers,
  and selects the element when you click a link.
- **Record the custom events your components dispatch.** The new Custom events
  layer on the Timeline, off by default, shows each event's type, flags and
  detail next to the component that dispatched it.
- **Lit dev-mode warnings show up.** Mistakes Lit warns about, like scheduling
  an update from inside `updated()`, record a `warning` event in the Timeline
  naming the component, including ones issued before recording started. A
  component Lit has warned about gets a warning chip and a Warnings section in
  the Components tab, with Lit's message and a link to its explanation; agents
  get the same list from the component details tool.
- **Updates that `shouldUpdate` vetoes leave a trace.** A refused update
  records an `update skipped` event in the Timeline with the property keys that
  changed, and the Updates tab counts each component's refused updates and
  marks them in its list.
- **Components that were never defined show up in the tree.** A custom tag on
  the page with no definition, from a missing import or a typo, is listed with
  a "not defined" chip instead of being left out; selecting it explains what is
  missing and links to the template that renders it. Agents see it in the
  list-components tool too.
- **Property options show on the Properties rows.** A custom `hasChanged` or
  `converter`, `noAccessor`, `useDefault` and `attribute: false` each get a
  badge, so you can see how a property is declared without opening the source.
  `lit_component-details` lists the same options for agents.
- **Filter the Components tree.** A box in the toolbar narrows the tree to
  elements whose tag or class name matches, keeps their parents for context,
  and restores your expanded branches when cleared.
- **Filter the details pane.** A box under the tag name narrows properties,
  state, attributes, instance fields, slots and parts to rows whose name or
  value matches, and stays set as you select other components.
- **Details sections fold, and remember it.** Properties, State, Attributes,
  Instance, Slots and Parts each fold on their heading, show how many rows they
  hold, and stay folded as you select other components.
- **Expand values in the details pane.** Objects, arrays, Maps and Sets open
  level by level from a caret, so values nested past the preview limits are no
  longer cut off, and open levels follow the value as it changes. Maps and Sets
  also preview their first entries, such as `Map(2) {"a" => 1, "b" => 2}`.
- **Values in the details pane are syntax-coloured and pretty-printed.**
  Strings, numbers, keywords and keys are coloured like code, and objects or
  arrays too wide for a line show one entry per line.
- **Changed values light up in the details pane.** When the selected component
  updates, each row whose value changed briefly highlights, so you can see what
  an interaction touched.
- **Copy a value from the details pane.** Hover a row for a copy button that
  puts the value, as shown, on the clipboard.
- **Shift-hover a tree row to outline every instance of that component.** The
  page shows each element with the same tag in a dashed box, and the tree marks
  their rows.

### Changed

- **Timeline list rows group by update.** Each component update is one
  collapsed row showing its duration and changed properties; expand it to see
  its phases, skips, warnings and events from the same update.
- **The Timeline's detail pane is resizable and easier to scan.** Drag its top
  edge to give a selected event more room; the height sticks. A header shows
  the event's name, layer, time and duration, and the facts below line up in a
  compact grid with pretty-printed data and any recorded error.
- **The Components details header is compact.** The class and template
  locations, and the render root, now sit in a three-line block under the tag
  name, and a status shows next to the tag only while an update is pending or
  the first render has not happened.
- **Long values in the details pane get the full width.** Objects and long
  strings move to their own line instead of wrapping in a narrow column, badges
  follow the value, and arrays, dates and DOM nodes are tagged with their type.
- **Task status shows as a coloured dot in the details pane.** Instance rows
  name their kind in a quiet tag after the name instead of outlined chips, a
  task's status is green, amber or red, and attribute values show as quoted
  strings.
- **Details sections are easier to tell apart.** A thin rule and more space now
  separate Properties, State, Attributes, Instance, Slots and Parts.
- **The Anatomy toggle is remembered.** Leaving it on keeps it on after the
  panel reloads.

### Fixed

- **The Slots table follows light-child changes.** Changing a child's `slot`
  attribute, or adding or removing children, now updates the selected element's
  slots without a re-render or a re-select.
- **Timeline ticks line up with the marks.** With many lanes and a scrollbar,
  the time ruler was offset from the marks by the scrollbar's width, and the
  range edges could block clicks on marks beneath them.
- **The Timeline range no longer overshoots the tracks.** With many lanes and a
  vertical scrollbar, the shaded range's right edge stopped a few pixels past
  the last mark; it now ends where the marks do.
- **Long strings in the details pane wrap under their own text.** A string that
  wraps inside a pretty-printed object now continues indented under its line
  instead of at the left edge of the value.

## 0.14.0 — 2026-10-07

Lit Inspector now runs in Firefox. Every release carries a Firefox build next
to the Chrome one, with the same Lit tab; sites are enabled from its toolbar
popup, because Firefox doesn't let DevTools ask for access. Performance
tracks reach browsers without Chrome's custom tracks as User Timing marks,
the Timeline opens in Tracks, and the extension has a new icon. Nothing needs
action to upgrade.

### Added

- **Lit Inspector for Firefox.** GitHub releases now include
  `lit-inspector-<version>-firefox.zip`, a Firefox 140+ add-on with the same
  Lit tab, loaded from `about:debugging` until it's on addons.mozilla.org.
  Enable a site from the Lit Inspector toolbar popup; since Firefox can't
  name a port in site access, enabling `localhost:5173` covers every port on
  `localhost`.
- **Performance tracks in Firefox, Safari and older Chrome.** Where the
  browser has no custom tracks, the **performance tracks** setting (formerly
  chrome performance tracks) writes Lit's updates and input as User Timing
  marks named `lit:…`, which show in the Firefox Profiler's Marker Chart next
  to the browser's own work. Its help and "Where to find them" link follow
  the browser.

### Changed

- **The Timeline opens in Tracks.** A first visit shows the recording as
  lanes on a shared time axis instead of the list; switch with **List |
  Tracks**, and the panel remembers your choice.
- **Lit Inspector has a new icon.** The extension's toolbar button, DevTools
  tab and panel header show a magnifying glass in Lit's blues.
- **The pick tooltip shows the component icon everywhere.** In the browser
  extension and with `lit-devtools dev`, the tooltip over a picked component
  has the same component icon as under the Vite plugin, not just the tag
  name.

### Fixed

- **The Lit tab notices a site enabled from another window.** Enabling or
  disabling Lit Inspector for a site in one DevTools window now updates the
  Lit tab in every other window on that site, and **Enable on this site** no
  longer asks for access the extension already has.

## 0.13.0 — 2026-10-06

Every component instance now knows where it was written. On the dev server,
custom elements in `html` templates and in `index.html` carry their line and
column, so the Components, Timeline and Updates views and the source overlay
can open the template tag that rendered a given instance, not only the class
behind it. The overlay tooltip becomes a readout that lights up the row a
click will open. Nothing needs action to upgrade, but tests that match
attributes exactly will see the new dev-only `data-lit-source`.

### Added

- **Jump to where a component instance is rendered.** The Components panel
  shows a "Rendered at" link next to the declaration that opens the `html`
  template, or `index.html`, at the line and column of the tag that created
  this instance. To make that possible the dev server stamps a
  `data-lit-source` attribute on those elements while `sourceOverlay` is on;
  production builds never get it.
- **The source overlay opens the call site too.** Its tooltip shows a
  "rendered at" row under the declaration, and Ctrl/⌘+Shift+click opens it.
  Library elements picked with `hosts: 'lit'` have no declaration, so
  Ctrl/⌘+click opens their call site instead. `onSelect` receives the new
  `callSite`, and a custom `EditorConfig.url` gets an optional `column`.
- **The overlay shows which file a click will open.** Holding Ctrl/⌘ lights
  up the declaration row, now marked with the Components tab's cube, and
  adding Shift lights up the "rendered at" row.
- **Timeline and Updates link to where an element is rendered.** A selected
  span, and the updates of a single instance, show a "Rendered at" link next
  to the source link.
- **The Settings tab says why a feature is on or off.** The HMR, Source
  Overlay and Timeline headers now tag their enabled or disabled pill with
  `(option)` or `(env)` when your config set it, like the rows below them.

### Changed

- **The overlay tooltip is a readout, not a control.** The pointer never
  settled on it long enough to click, so its open icons are no longer buttons
  and the pointer passes through to the page underneath, which can now be
  picked there too.

### Fixed

- **A snapshot from `lit-devtools dev` no longer promises HMR or source
  links.** The frozen panel now offers what the host that recorded the
  session could do, instead of assuming the Vite plugin.

### Removed

- **The overlay tooltip's copy button.** It sat out of the pointer's reach;
  the path is still shown in the tooltip and in the Components panel.

## 0.12.0 — 2026-10-02

The Lit panel now reaches pages no dev server is watching. Lit Inspector, a
Chrome extension attached to every GitHub release, injects it into any site
you enable, production builds and strict Content Security Policies included.
`lit-devtools dev` stops showing controls it can't serve and gains the Chrome
Performance tracks switch, and the selected component keeps updating across a
reload. Nothing needs action to upgrade.

### Added

- **Lit Inspector, a Chrome extension, comes with every GitHub release.**
  Download `lit-inspector-<version>.zip` from the release and load it unpacked
  to inspect Lit components on any page, production builds and sites you don't
  serve included, with no dev server.

### Changed

- **The panel hides what `lit-devtools dev` can't do.** Open-in-editor links
  and the snapshot Export button no longer appear as controls that fail, the
  Settings tab explains why plugin settings are missing, and the timeline notes
  when render layers stay empty because the page's Lit is a production build.

### Fixed

- **The panel no longer reports the DevTools' own Lit as a duplicate.** Pages
  loading `lit-devtools.js` showed "(duplicate copies)" in Settings and a
  warning in the components view even with a single Lit of their own.
- **The selected component keeps updating after the page reloads.** Its
  details used to freeze on the old page's values, marked "update pending",
  until you selected another row.
- **Chrome Performance tracks and update flashing can be switched on under
  `lit-devtools dev`.** The Settings tab hid both whenever the page wasn't
  served by the Vite plugin.

## 0.11.0 — 2026-10-02

A smaller release that makes the panel easier to read. The Components tab can
scroll the selected element into view, async failures now count in Updates,
every button has a tooltip, and Settings drops its row-by-row origin labels in
favour of showing the default where you choose a value. About also lists the
right Lit versions. Nothing needs action to upgrade.

### Added

- **Scroll a component into view from the Components tab.** A target button
  next to the selected element's tag scrolls it to the middle of the page and
  outlines it for a moment, so you no longer have to hunt for elements below
  the fold.
- **Async failures show up in Updates.** An async `updated()` whose promise
  rejects unhandled, or a `@lit/task` that fails, now marks the update that
  started it (_rejected in updated_, _task userTask failed_) and counts toward
  the component's ⚠, where before it left no trace in the panel.
- **Panel buttons explain themselves.** Hovering or tabbing to a button now
  shows a tooltip naming what it does, including the icon-only ones that
  previously had no hint at all.
- **Settings links to where the Chrome tracks show up.** The Chrome
  performance tracks row links to the timeline guide, which now shows the
  expanded Lit group in Chrome's Performance panel and how far to zoom to
  read it.

### Changed

- **Settings rows lose their "(default)" and "(overridden)" labels.** Only
  values set by an option or env var keep an origin badge, and an overridden
  row is marked by the highlighted value it replaced, such as `env: Zed`, and
  the × that resets it. Open a dropdown to see the default beside your value:
  with `LIT_PLUGIN_HMR_ON_INCOMPATIBLE=warn` the list reads `warn env` and
  `reload default`. Hover a setting's name for what it does.

### Fixed

- **About shows the right Lit versions.** Settings > About used to show
  lit-element's version labelled as "lit" (for example "lit 4.2.2" next to lit
  3.3.3). It now lists lit-html, lit-element and @lit/reactive-element by
  name, and the duplicate-copies warning says which package is duplicated.

## 0.10.0 — 2026-10-02

The DevTools panel has a new look built on Web Awesome, and it now follows one
tab at a time, so a second tab of the app no longer wipes the recording or
leaks into what you are looking at. Updates and the timeline show what changed
in a re-render and which updates threw, the Components tab stays live by
default and shows task, signal and controller state and the last HMR patch,
and agents can query by tag name. Nothing needs action to upgrade.

### Added

- **See what changed in a re-render.** Turn on the Changed values layer and
  each update records the old and new value of every changed property. The
  Updates tab lists them and flags a new reference that holds the same value,
  and `lit_update-summary` lists, per component, the properties reassigned to
  an equal new reference, so an agent can say which props re-render for
  nothing.
- **Errors thrown during an update are visible.** A phase that throws is
  marked in the timeline, counted per component in Updates, and reported
  through `lit_update-summary`, instead of looking like a normal update.
- **See tasks, signals and controllers in the Components tab.** The details
  pane now lists an element's `@lit/task` state, signals, reactive
  controllers and plain fields in an Instance table below its properties.
- **Pick a component library's elements, and step out to the one around.**
  Set `sourceOverlay.hosts` to `'lit'` and the picker also picks Lit elements
  you didn't write, such as `<wa-button>`, into the Components tab. While
  picking, ↑ and ↓ move the outline out to the enclosing element and back.
- **Agents can query by tag name and bound the tree.** `lit_recent-events`
  and `lit_component-details` accept `tagName`, the latter returning every
  matching element, so an agent no longer has to find an element id first.
  `lit_list-components` accepts `maxDepth`, and nodes it cuts off report how
  many children were left out.
- **See whether an HMR edit landed.** After an edit the Components tab reads
  which component was patched, how many instances it touched and how long it
  took. `lit_hmr-history` gives agents the recent patches with child-state
  mode, interleaved with the components that could not be patched.
- **The Components tab says why it is empty.** Instead of one generic line,
  it now tells you when the page runtime has not connected, when more than
  one copy of lit is loaded, or when the runtime is inside an iframe, with
  the next step for each.
- **Settings has an About section.** It shows the plugin version, the lit
  version the page loaded (and a warning for duplicate copies), the timeline
  layers, picker availability, and the order in which settings resolve.
- **The dev server tells you when the DevTools panel cannot mount.** With
  `timeline` on and `DevTools()` missing from `plugins`, the terminal now
  prints a one-time warning with the fix instead of staying silent.
- **Resize the component details pane.** Drag the divider between the
  component tree and the details; the width is remembered across reloads.

### Changed

- **The DevTools panel has a new look built on Web Awesome.** Buttons, tabs,
  switches, selects and badges are Web Awesome components with square
  corners and the Lit blue as the accent, and the text glyphs that stood in
  for icons, including the arrow between old and new values, are Phosphor
  icons now. The panel still works fully offline.
- **The Components tree follows the page by default.** **Live** starts on, so
  components that appear or go away show up without a click. Toggle it off
  to pause the tree; the Refresh button is gone, because turning Live back on
  brings the tree up to date.

### Fixed

- **A second tab no longer wipes the recording or leaks into the panel.** The
  session follows one page at a time, the one that loaded last, and a banner
  says when it switches. Events, picks, custom layers and HMR notices from
  any other tab are ignored, and the previous page's recording, component
  tree and HMR notices are cleared on a switch; reloading the same tab clears
  them without the banner.
- **`update` spans close for components that override `update()`.** A
  subclass calling `super.update()` no longer produces a nested duplicate
  bracket that left the outer span open and skewed Updates durations.
- **Agents see the live component tree.** `lit_list-components` and
  `lit_component-details` now ask the page instead of returning what the
  panel last fetched, so they work with no panel open.
- **Live mode follows the panel.** Closing the panel no longer leaves the
  page observing the DOM and rebuilding the tree, and after a panel or page
  reload the Live toggle no longer shows as on while the page has stopped
  pushing tree updates.
- **The active tab label no longer jumps up.** The selected panel tab now
  sits on the same baseline as the others instead of a couple of pixels
  higher.

## 0.9.0 — 2026-10-01

Pick now works on pages connected to the standalone `lit-devtools dev` server,
and `#private` state survives hot-patching on Vite 7 as it already did on Vite 8. One change needs action: runtime globals moved to the package's own
`Symbol.for` prefix. The rest are fixes to panel settings that didn't stick,
a Pick button with no picker behind it, and the HMR indicator sitting on the
DevTools toolbar.

### Added

- **Pick works on pages connected to `lit-devtools dev`.** Pick in the
  Components tab, or Ctrl/⌘+Shift+S on the page, picks any Lit element; the
  panel selects it and a panel tab comes forward on it. If you opened the
  panel yourself, the first pick opens a second panel tab and later picks
  reuse it.

### Changed

- **Runtime globals are keyed `@oddsquad/vite-plugin-lit#…`.** Code that read
  component source metadata (or any other plugin global) through
  `Symbol.for('@lit-labs/vite-plugin-lit#source')` needs the new prefix.

### Fixed

- **`#private` state survives HMR on Vite 7 too.** Editing a method that
  touches a private field of a decorated component no longer throws "Cannot
  read from private field" after esbuild has lowered it.
- **Panel settings survive a page reload in standalone mode and on
  StackBlitz.** After reloading the app, overrides such as flash updates or
  the HMR indicator reverted to the config defaults until a setting was
  changed again.
- **A setting changed right after opening the panel is kept.** The first
  toggle in a fresh panel session (for example Flash on the Components tab)
  could be silently wiped from the saved settings, so it was gone after a
  reload. Seen with `lit-devtools dev`; the Vite DevTools panel runs the same
  code.
- **The Components tab no longer shows a Pick button that does nothing.**
  Without the source overlay (off by default, and unavailable to pages
  connected to `lit-devtools dev`) the button lit up and no picker appeared.
  It now only appears when there is a picker to start.
- **The HMR indicator no longer covers the DevTools toolbar.** With the Vite
  DevTools dock on an edge, the indicator and the source-overlay tooltip sat
  on top of it instead of moving aside.
- **A `#event=` link scrolls to its row on a slow first load.** Opening the
  panel or a snapshot through a timeline link selected the event but could
  leave its row out of view when the list's layout code loaded slowly.

## 0.8.1 — 2026-10-01

A one-fix patch: turning the timeline on with `LIT_PLUGIN_TIMELINE=true` now
brings up the Lit DevTools panel, not just the page runtime behind it.

### Fixed

- **`LIT_PLUGIN_TIMELINE=true` brings up the Lit DevTools panel.** Turning the
  timeline on through the env var injected the page runtime but left the
  panel out of Vite DevTools; it now mounts as it does with `timeline: true`.

## 0.8.0 — 2026-09-30

The plugin is now on JSR as well as npm: every release publishes the same
build to jsr.io/@oddsquad/vite-plugin-lit. The documentation site gets a page
per release, the StackBlitz playground starts again, and the licence now names
oddcelot as the copyright holder.

### Added

- **Also on JSR.** Releases now publish to jsr.io/@oddsquad/vite-plugin-lit
  alongside npm, so `npx jsr add @oddsquad/vite-plugin-lit` installs the same
  build.
- **The docs have a page per release.** The changelog on the documentation
  site now lists every version with its date and links to a page for each
  one, plus a page with everything that changed since a given version.

### Changed

- **The licence names the right copyright holder.** The package's LICENSE,
  author field and source headers credited Google LLC; they now credit
  oddcelot. The licence terms (BSD-3-Clause) are unchanged.

### Fixed

- **The StackBlitz playground starts.** Opening the playground on StackBlitz,
  in dev or with `npm run standalone`, no longer stops at "Cannot find native
  binding", and the dev server prints where to open the Lit DevTools panel in
  its own tab.

## 0.7.0 — 2026-09-29

Hot-patching covers two cases it used to get wrong: components with native
`#private` members, which threw, and child elements whose parent template you
edit, which lost their state. The standalone `lit-devtools dev` server also
gets pages to feed it: one script tag connects any page running Lit, whether
Vite serves it or not, directly or through a proxy. Two fixes ride along:
open-in-editor links lose a stray slash, and the timeline no longer misses the
first component's connect and disconnect.

### Added

- **Components with `#private` fields keep hot-patching.** Editing an element
  that uses native `#private` fields or methods now updates it in place and
  keeps its private state, instead of throwing "Cannot read private member".
  Set `hmr.privateFields: false` to keep real brand checks in dev.
- **Child components keep their state when you edit the parent.** Changing the
  template a child element sits in no longer resets its `@state` and
  `#private` fields; `hmr.childState: 'reuse'` keeps the original element
  where it has no bindings, and `'reset'` restores the old behaviour. The
  DevTools Settings tab can switch the mode live; the next edit uses it.
- **Pages outside Vite can feed the standalone panel.** `lit-devtools dev` now
  prints a `<script src=".../lit-devtools.js">` tag; a page that loads it shows
  its component tree, inspector and timeline in the panel, even when Vite
  doesn't serve it or it's reached through a proxy or tunnel. Pages on
  localhost connect on any port, and `--allow-origin` admits others, with `*`
  for any subdomain (`--allow-origin 'https://*.webcontainer-api.io'` for
  StackBlitz). HMR, source locations and open-in-editor still need Vite.

### Fixed

- **Open-in-editor links use the documented URL form.** Links to VS Code,
  Cursor, Zed and Windsurf no longer carry a double slash before absolute
  paths like `/Users/...`.
- **The timeline records the first component's connect and disconnect.** On a
  page with no Lit element when the DevTools runtime starts, the first
  component defined afterwards now shows its `connectedCallback` and
  `disconnectedCallback` events like the rest.

## 0.6.1 — 2026-09-29

A fix release. Components whose `extends` clause holds braces load in dev
again, and the plugin now shares one devframe with the current Vite DevTools.
The rest comes from a security pass over the dev server: source opens and
snapshot exports stay inside the project, and the standalone server won't go
without its code gate on a network address.

### Changed

- **`lit-devtools dev --no-auth` only runs on localhost.** Combined with a
  `--host` other machines can reach, it now refuses to start instead of
  letting anyone on the network drive the panel without a code.

### Fixed

- **Components whose `extends` clause has braces load in dev again.** With
  `sourceOverlay` on, a class like `extends Dialog<{open: boolean}>` or
  `extends Mixin(Base, {shadow: true})` broke the module with a 500 from the
  dev server. Broken since 0.3.0.
- **Exporting a snapshot can no longer delete your files.** The export wipes
  its output directory before writing, and nothing checked which directory
  that was. It now only writes inside the dev server's working directory and
  only replaces an earlier snapshot.
- **The panel can only open source files inside your project.** Source links
  from the DevTools panel used to open any absolute path they were given. They
  now follow the same rule as the in-page overlay: the path has to be under
  the Vite root or `server.fs.allow`.
- **Symlinks can't send the editor outside your project.** Opening a source
  file used to follow a symlink under the project to wherever it pointed. Now
  the target has to be inside the project too.
- **One copy of devframe alongside the current Vite DevTools.** The plugin
  pinned devframe 1.0.0 exactly, so apps on `@vitejs/devtools-kit` 0.7.6
  installed a second copy and got an unmet-peer warning. It now accepts any
  devframe 1.x.

## 0.6.0 — 2026-09-29

A small release with one feature. The Lit timeline can now appear in Chrome
DevTools' own Performance panel, so an update tick sits on the same time axis
as the layout, paint and long tasks it caused.

### Added

- **Lit updates in Chrome's Performance panel.** Turn on **chrome performance
  tracks** under Timeline in the Settings tab and a Chrome Performance
  recording gets a Lit track group, with each update tick nested as
  `<my-element> performUpdate` over its phases, next to layout, paint and
  long tasks. It works without the Lit panel recording, and traces taken
  through chrome-devtools-mcp include it.

## 0.5.0 — 2026-09-29

The timeline gets a second view: Tracks, one lane per layer on a shared time
axis. The Settings tab now says where each value came from and flags overrides
the config has since moved past. Timeline events can be linked to, a reloaded
panel keeps what was recorded, and both the panel and the in-page overlay open
source links in the editor you picked.

### Added

- **Tracks view for the timeline.** A List | Tracks switch in the Timeline
  toolbar draws the recording as one horizontal lane per layer on a shared time
  axis, so concurrency, gaps and rhythm are visible: which layers fire
  together, how a click lines up with the update it caused. Overlapping spans
  stack, so an update tick reads as `performUpdate` with its phases beneath it,
  and marks never get narrower than 2px. Wheel zooms around the pointer, drag
  pans, double-click fits the whole recording, and a fitted view follows the
  live edge while recording. A chip strip picks which lanes to draw; it is a
  view filter, not the capture toggle. Both views share one selection and one
  detail pane.
- **Where each setting came from.** Settings rows read like "Zed (env)",
  "VS Code (default)" or "Cursor (option)". An overridden row names the
  baseline it replaced and has its own reset. An unknown
  `LIT_PLUGIN_SOURCE_OVERLAY_EDITOR` value now logs a warning and falls back to
  the default.
- **A hint when the config moved under an override.** An override remembers
  the value it was made against. If that config value has since changed, the
  row says "Config changed since you overrode this: was X, now Y", with Reset
  (let the new config apply) and Keep (hide the hint, keep the override).
- **Links to timeline events.** Selecting a row puts `#event=<id>` in the
  hash; opening that link selects the span and scrolls it into view, in a live
  session or an exported snapshot. An id the buffer no longer holds opens the
  Timeline with nothing selected.
- **Temporal values in the inspector** preview as their kind plus ISO form,
  e.g. `Temporal.PlainDate(2026-09-29)`, instead of an empty object. This works
  with native Temporal and with polyfills.
- **The standalone `lit-devtools dev` server can be fed from a live page.** A
  page calls `connectToDevServer()` (from `@oddsquad/vite-plugin-lit/connect.js`)
  to send its tree, inspector and timeline traffic to the server's panel over
  devframe RPC. `lit-devtools dev --no-auth` skips the one-time code. Pages not
  served by Vite, and cross-origin pages, are not covered yet.

### Changed

- **The timeline's element and regex filters apply to Tracks too**, so
  switching views mid-investigation no longer brings back everything you
  filtered out. A filter that hides the selected mark keeps its detail pane
  open, as the List always did.

### Fixed

- **A reloaded live panel keeps the recorded events.** Reloading or first
  opening the panel mid-session used to show "No events recorded." while the
  dev server still held them, and a cold `#event=` link could not resolve. The
  panel now fills itself from the server's buffer when it connects, without
  duplicates, and events you cleared stay cleared across a reload.
- **Source links open in the editor you chose.** The editor picked through
  `sourceOverlay.editor`, `LIT_PLUGIN_SOURCE_OVERLAY_EDITOR` or the Settings
  tab only shaped the overlay's URL scheme; clicks from the panel and the
  in-page overlay let launch-editor guess, so picking Cursor could open VS
  Code. Both now pass the chosen editor (`vscode`, `cursor`, `zed`, `idea`).
  Windsurf, custom editors and projects that never named one still
  auto-detect.
- **Exported snapshots contain the whole event buffer**, not the last 50
  events, so every row in an export can be linked to.
- **A linked timeline row scrolls into view on a cold open** instead of
  leaving the list pinned to its newest row.
- **The panel has a favicon**, so opening it in its own tab no longer logs a
  404 for `/favicon.ico`.

## 0.4.0 — 2026-09-29

A maintenance release. The timeline panel stays fast with a full buffer, the
live inspector stops walking the whole page, and several failures that used to
pass silently now say so. Releases are published from CI now.

### Added

- **Verbose render layer.** lit-html's per-part debug events (template
  instantiation, `set part`, each binding commit) go to a new "Lit Render
  (verbose)" layer. It is off by default, because it fires once per binding on
  every render. Values are summarized as strings (`string:"…"`, `node:<li>`,
  `template`, `function:onClick`) and never passed through.
- **Releases from a version tag.** Pushing a `v*` tag runs the CI gate, checks
  the tag against `package.json` and `CHANGELOG.md`, publishes to npm over
  trusted publishing (OIDC), and creates the GitHub Release from the changelog
  section. Prereleases go to the `next` dist-tag.

### Changed

- **The timeline list renders only the visible rows**, through
  `@lit-labs/virtualizer`. A 2500-event recording keeps about 75 rows in the
  DOM instead of one per event. Filtering reruns only when the events or
  filters change.
- **Live inspector mode no longer re-walks the page on every mutation.**
  Batches with no custom element or shadow root in them are dropped, and
  relevant batches walk only the subtrees they added.
- **The docs site was rewritten** in plain language, with a tutorial, task-sized
  DevTools guides, a troubleshooting page, screenshots in both themes, and the
  Lit Design System's colours and type.

### Fixed

- The source overlay's default hotkey is Ctrl+Shift+S, as documented. The
  runtime used to fall back to `e`, which also collided with the DevTools pick
  command.
- The source overlay removes its HMR listeners when it disconnects. Moving the
  element used to register the toggle twice, so the Vite DevTools overlay
  command did nothing, and a removed overlay kept reacting.
- `urlSheet()` and `?css-sheet` warn when a stylesheet fails to load, and treat
  non-ok responses as failures. A 404 used to hand Vite's fallback page to the
  sheet as CSS, with a clean console. The sheet keeps its last good CSS.
- An unknown `LIT_PLUGIN_HMR_ON_INCOMPATIBLE` value logs a warning and falls
  back to the default, instead of quietly acting as `reload`.
- The Lightning CSS pass over `css` literals finds them by parsing the module,
  so `css`-tagged text inside a string, a comment, or another template literal
  is no longer rewritten.

## 0.3.0 — 2026-09-17

The DevTools half of the plugin was rebuilt on
[devframe](https://www.npmjs.com/package/devframe), and most of what follows
falls out of that: the panel is no longer tied to Vite DevTools, and the same
data it shows is reachable by a coding agent over MCP.

### Added

- **The panel runs on devframe.** The bespoke transport is gone. The panel
  works docked in Vite DevTools, in its own tab, or standalone from the CLI.
- **`lit-devtools` CLI.** `lit-devtools dev` serves the panel without a Vite
  dev server of its own; `lit-devtools mcp` exposes the panel's data to an MCP
  client over stdio, discovering a running dev server on its own.
- **MCP tools for agents** — list the component tree, read recent timeline
  events, start and stop a recording, and read why a module fell back to a full
  reload instead of a hot patch.
- **Updates tab.** The timeline reads as an explainer for a single update:
  what changed, which components re-rendered, and what it cost.
- **Session export.** A recorded session can be written out as a static copy of
  the panel — shareable, no dev server needed to open it.
- **Deep links.** Panel views are addressable, so a link opens the tab, the
  selected element, or an exported snapshot at the right place.
- **Flash on update.** An opt-in fading outline over every element that
  finishes an update, with an optional ramp colouring it by updates per second.
- **Ambient types for `virtual:lit-plugin/timeline`**, shipped in
  `@oddsquad/vite-plugin-lit/client` alongside the CSS query declarations.
  Following the custom-layers guide no longer means silencing `TS2307`.
- **Documentation site** at <https://oddcelot.github.io/vite-plugin-lit/>, and
  a CI workflow that type checks, lints, tests and builds every push.

### Changed

- Panel settings persist per developer through devframe's settings store
  instead of per browser, so they follow you across browsers and survive
  clearing site data. `localStorage` stays as the page's boot-time cache.
- Source links open through the shared open-in-editor service and resolve
  against the Vite root.
- The docked panel draws its hover outline over a direct page channel rather
  than routing through the dev server.
- Tooling moved to Vite+ (oxfmt, oxlint, tsgolint); dependencies updated to
  TypeScript 7, Vite 8.3, es-module-lexer 3 and magic-string 1.
- The README is a front door now; the long-form guides live on the docs site.

### Fixed

- **`virtual:lit-plugin/timeline` broke `vite build`.** Both hooks lived on the
  serve-only plugin, so nothing claimed the specifier during a build and the
  bundler failed on a module the developer never wrote. It now resolves in dev
  and build alike, stubbing itself out in any build.
- The dev-server endpoints reject cross-site requests.
- Source metadata is injected in the component class's own scope, so it can no
  longer reference a class that isn't in scope.
- The DevTools element watch survives a hot patch; `updated()` is resolved
  lazily rather than captured once.
- Recording state is synced to a page runtime when it connects, so a reload
  mid-recording keeps recording.
- `recent-events` works when called with no arguments, and the documented MCP
  endpoint path matches the one the server serves.
