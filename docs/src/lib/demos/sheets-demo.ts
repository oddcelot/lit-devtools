/**
 * The landing page's stylesheet demo: what saving a CSS file does to a page
 * of a thousand shadow roots, without the plugin and with it.
 *
 * Both panes hold a thousand tiles, each a Lit element with its own shadow
 * root, styled by one stylesheet. The visitor selects tiles, which is state
 * on the elements, and an edit in the editor stands for saving the CSS file:
 *
 * - Without the plugin, a component takes its CSS as `?inline` text through
 *   `unsafeCSS()`, and nothing accepts that import's hot update, so Vite
 *   reloads the page. The pane stands in for the reload: it blanks, and a
 *   fresh set of tiles renders with the new CSS and no selection.
 * - With `?css-sheet`, every tile adopts one `CSSStyleSheet`, and the dev
 *   server calls `replaceSync()` on it with the file's new text. The demo
 *   does exactly that, since the docs build has no dev server: the same
 *   object, new text, every root restyled in place.
 *
 * The readouts are measured, not stated: shadow roots and stylesheets are
 * counted from the panes' DOM, renders are real `updated()` calls, and the
 * restyle time runs from `replaceSync()` through the style and layout pass
 * it causes, forced by reading layout, not up to the next frame.
 */
import {LitElement, css, unsafeCSS} from 'lit';
import {followTheme} from './theme.js';

followTheme();

const TILES = 1000;

interface Theme {
  colour: (typeof COLOURS)[number];
  round: boolean;
  fill: boolean;
}

const COLOURS = ['blue', 'cyan', 'violet'] as const;
const COLOUR_VALUE: Record<Theme['colour'], string> = {
  blue: 'var(--lit-blue-bright)',
  cyan: 'var(--lit-cyan)',
  violet: 'hsl(268 90% 66%)',
};

/** theme.css at one version, as the editor shows it. */
const sourceLines = (t: Theme): string[] => [
  `:host {`,
  `  display: block;`,
  `  aspect-ratio: 1;`,
  `  border-radius: ${t.round ? '50%' : '2px'};`,
  `  background: ${t.colour};`,
  `}`,
  ``,
  `:host([selected]) {`,
  t.fill ? `  background: white;` : `  opacity: 0.25;`,
  `}`,
];

/** The same file as the browser gets it, the colour names resolved. */
const cssText = (t: Theme): string =>
  sourceLines(t)
    .join('\n')
    .replace(
      `background: ${t.colour};`,
      `background: ${COLOUR_VALUE[t.colour]};`
    )
    .replace('background: white;', 'background: var(--text-strong);');

let theme: Theme = {colour: 'blue', round: false, fill: false};
const renders = {hot: 0, cold: 0};

// With the plugin: one sheet for every tile, its text swapped on each save.
const sharedSheet = new CSSStyleSheet();
sharedSheet.replaceSync(cssText(theme));

const tileProps = {selected: {type: Boolean, reflect: true}};

class HotTile extends LitElement {
  static properties = tileProps;
  static styles = sharedSheet;
  declare selected: boolean;
  constructor() {
    super();
    this.selected = false;
  }
  override updated() {
    renders.hot++;
  }
}
customElements.define('hot-tile', HotTile);

// Without it: the CSS is part of the class, so the reload brings a class
// built from the new text, under a tag of its own per version.
let coldVersion = 0;
const defineColdTile = (): string => {
  const tag = `cold-tile-${coldVersion++}`;
  customElements.define(
    tag,
    class extends LitElement {
      static properties = tileProps;
      static styles = css`
        ${unsafeCSS(cssText(theme))}
      `;
      declare selected: boolean;
      constructor() {
        super();
        this.selected = false;
      }
      override updated() {
        renders.cold++;
      }
    }
  );
  return tag;
};

const $ = <T extends Element>(selector: string): T =>
  document.querySelector<T>(selector)!;

const code = $<HTMLElement>('#code');
const panes = {hot: $<HTMLElement>('#hot'), cold: $<HTMLElement>('#cold')};
const status = {
  hot: $<HTMLElement>('#hot-status'),
  cold: $<HTMLElement>('#cold-status'),
};
const counts = {
  hot: $<HTMLElement>('#hot-counts'),
  cold: $<HTMLElement>('#cold-counts'),
};

type Side = keyof typeof panes;
type Tile = LitElement & {selected: boolean};

const tilesOf = (side: Side) => [...panes[side].children] as Tile[];

/** Shadow roots and distinct stylesheets, read from the pane's DOM. */
const countPane = (side: Side) => {
  const sheets = new Set<CSSStyleSheet>();
  let roots = 0;
  for (const tile of tilesOf(side)) {
    if (!tile.shadowRoot) continue;
    roots++;
    for (const sheet of tile.shadowRoot.adoptedStyleSheets) sheets.add(sheet);
    for (const style of tile.shadowRoot.querySelectorAll('style')) {
      if (style.sheet) sheets.add(style.sheet);
    }
  }
  const n = sheets.size;
  counts[side].textContent =
    `${roots.toLocaleString('en')} shadow roots · ${n.toLocaleString('en')} stylesheet${n === 1 ? '' : 's'}`;
};

const selectedCount = (side: Side) =>
  tilesOf(side).filter((t) => t.selected).length;

const setStatus = (side: Side, text: string, tone: string) => {
  status[side].textContent = text;
  status[side].dataset.tone = tone;
};

/** A pattern to start from, as if someone had been clicking around. */
const seeded = (i: number) => i % 37 === 5 || i % 53 === 11;

const fill = async (side: Side, tag: string, seed: boolean) => {
  const tiles = Array.from({length: TILES}, (_, i) => {
    const tile = document.createElement(tag) as Tile;
    if (seed && seeded(i)) tile.selected = true;
    return tile;
  });
  panes[side].replaceChildren(...tiles);
  await Promise.all(tiles.map((t) => t.updateComplete));
  countPane(side);
};

const highlight = (line: string): string =>
  line
    .replace(/^(:host(?:\(\[selected\]\))?)/, '<span class="sel">$1</span>')
    .replace(/^(\s+)([a-z-]+):/, '$1<span class="prop">$2</span>:');

const renderCode = (changed: Set<number>) => {
  code.innerHTML = sourceLines(theme)
    .map(
      (line, i) =>
        `<span class="line${changed.has(i) ? ' changed' : ''}"><span class="ln">${i + 1}</span>${highlight(line) || ' '}</span>`
    )
    .join('');
};

type Edit = 'colour' | 'round' | 'fill';
const next = (t: Theme, edit: Edit): Theme => {
  switch (edit) {
    case 'colour':
      return {
        ...t,
        colour: COLOURS[(COLOURS.indexOf(t.colour) + 1) % COLOURS.length],
      };
    case 'round':
      return {...t, round: !t.round};
    case 'fill':
      return {...t, fill: !t.fill};
  }
};

let busy = false;

const save = async (edit: Edit) => {
  if (busy) return;
  busy = true;
  const before = sourceLines(theme);
  theme = next(theme, edit);
  const after = sourceLines(theme);
  renderCode(new Set(after.flatMap((l, i) => (before[i] === l ? [] : [i]))));

  // With the plugin: new text into the same sheet, then the restyle it
  // causes, forced by reading layout.
  const kept = selectedCount('hot');
  renders.hot = 0;
  const started = performance.now();
  sharedSheet.replaceSync(cssText(theme));
  void panes.hot.offsetHeight;
  const ms = performance.now() - started;
  // Any render the change caused would be queued by now; let it run.
  await new Promise((r) => setTimeout(r));
  setStatus(
    'hot',
    `Restyled in ${ms.toFixed(1)} ms · ${renders.hot} renders · ${kept} selected, kept`,
    'ok'
  );
  countPane('hot');

  // Without it: the page reloads, and every tile starts over.
  const lost = selectedCount('cold');
  panes.cold.classList.add('reloading');
  setStatus('cold', 'Reloading the page…', 'busy');
  await new Promise((r) => setTimeout(r, 600));
  renders.cold = 0;
  await fill('cold', defineColdTile(), false);
  panes.cold.classList.remove('reloading');
  setStatus(
    'cold',
    `Reloaded · ${renders.cold.toLocaleString('en')} first renders · ${lost ? `${lost} selected, lost` : 'selection reset'}`,
    'warn'
  );
  busy = false;
};

// All thousand tiles show: the columns are picked so the grid fills the
// pane without spilling, whatever its size.
const fit = (pane: HTMLElement) => {
  const style = getComputedStyle(pane);
  const w = pane.clientWidth - parseFloat(style.paddingLeft) * 2;
  const h = pane.clientHeight - parseFloat(style.paddingTop) * 2;
  if (w <= 0 || h <= 0) return;
  let cols = Math.ceil(Math.sqrt((TILES * w) / h));
  while (Math.ceil(TILES / cols) * (w / cols) > h) cols++;
  pane.style.setProperty('--cols', String(cols));
};
const resized = new ResizeObserver((entries) => {
  for (const entry of entries) fit(entry.target as HTMLElement);
});
for (const pane of Object.values(panes)) resized.observe(pane);

// Click or drag across tiles to select them, in either pane.
let painting: boolean | undefined;
for (const pane of Object.values(panes)) {
  const tileAt = (el: Element | null) =>
    el?.parentElement === pane ? (el as Tile) : undefined;
  pane.addEventListener('pointerdown', (e) => {
    const tile = tileAt(e.target as Element);
    if (!tile) return;
    painting = !tile.selected;
    tile.selected = painting;
    pane.setPointerCapture(e.pointerId);
  });
  pane.addEventListener('pointermove', (e) => {
    if (painting === undefined) return;
    const tile = tileAt(document.elementFromPoint(e.clientX, e.clientY));
    if (tile) tile.selected = painting;
  });
  for (const type of ['pointerup', 'pointercancel']) {
    pane.addEventListener(type, () => (painting = undefined));
  }
}

const restart = async () => {
  theme = {colour: 'blue', round: false, fill: false};
  sharedSheet.replaceSync(cssText(theme));
  renderCode(new Set());
  await Promise.all([
    fill('hot', 'hot-tile', true),
    fill('cold', defineColdTile(), true),
  ]);
  const idle = 'Some tiles selected · waiting for a save';
  setStatus('hot', idle, 'idle');
  setStatus('cold', idle, 'idle');
};

// Saves on their own until the visitor does anything in the frame.
const AUTOPLAY: Edit[] = ['colour', 'round', 'fill', 'colour'];
let timer: ReturnType<typeof setTimeout> | undefined;
const stopAutoplay = () => {
  clearTimeout(timer);
  timer = undefined;
};
const autoplay = (step: number) => {
  if (step >= AUTOPLAY.length) return;
  timer = setTimeout(
    () => {
      const kind = AUTOPLAY[step];
      const button = document.querySelector(`[data-edit="${kind}"]`);
      button?.classList.add('pressed');
      setTimeout(() => button?.classList.remove('pressed'), 300);
      void save(kind).then(() => autoplay(step + 1));
    },
    step === 0 ? 2600 : 3800
  );
};

for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-edit]'
)) {
  button.addEventListener('click', () => {
    stopAutoplay();
    void save(button.dataset.edit as Edit);
  });
}
$('#restart').addEventListener('click', () => {
  stopAutoplay();
  if (!busy) void restart();
});
for (const type of ['pointerdown', 'keydown']) {
  addEventListener(type, stopAutoplay, {capture: true, once: true});
}

await restart();
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) autoplay(0);
