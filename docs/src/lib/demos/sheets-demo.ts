/**
 * The landing page's stylesheet demo: a thousand Lit elements, each with
 * its own shadow root, recoloured two ways.
 *
 * - One shared sheet, which is what `?css-sheet` gives a component: every
 *   shadow root adopts the same `CSSStyleSheet` object, so changing its
 *   text restyles all of them at once and no component renders.
 * - A `<style>` per component, the usual way: the colour lives in each
 *   element's template, so recolouring means a thousand updates.
 *
 * The readout counts real `updated()` calls and times each recolour up to
 * the next frame.
 */
import {LitElement, html} from 'lit';
import {followTheme} from './theme.js';

followTheme();

const COUNT = 1000;
/** The first colour; the frame's buttons carry the others. */
const INITIAL = 'var(--lit-blue-bright)';

type Mode = 'shared' | 'inline';

let renders = 0;
const sheetText = (colour: string) =>
  `:host { display: block; aspect-ratio: 1; border-radius: 22%; background: ${colour}; transition: background .5s; }`;

const shared = new CSSStyleSheet();
shared.replaceSync(sheetText(INITIAL));

class SharedDot extends LitElement {
  static styles = shared;
  override updated() {
    renders++;
  }
  override render() {
    return html``;
  }
}

class InlineDot extends LitElement {
  static properties = {colour: {}};
  declare colour: string;
  constructor() {
    super();
    this.colour = INITIAL;
  }
  override updated() {
    renders++;
  }
  override render() {
    return html`<style>
      ${sheetText(this.colour)}
    </style>`;
  }
}

customElements.define('shared-dot', SharedDot);
customElements.define('inline-dot', InlineDot);

const $ = <T extends Element>(selector: string): T =>
  document.querySelector<T>(selector)!;

const grid = $<HTMLElement>('#grid');
const stat = (name: string) => $<HTMLElement>(`[data-stat="${name}"]`);

let mode: Mode = 'shared';
let colour = INITIAL;

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

const mount = async () => {
  const tag = mode === 'shared' ? 'shared-dot' : 'inline-dot';
  const dots = Array.from({length: COUNT}, () => {
    const el = document.createElement(tag);
    if (el instanceof InlineDot) el.colour = colour;
    return el;
  });
  if (mode === 'shared') shared.replaceSync(sheetText(colour));
  grid.replaceChildren(...dots);
  await Promise.all(dots.map((d) => (d as LitElement).updateComplete));
  renders = 0;
  stat('sheets').textContent =
    mode === 'shared' ? '1' : COUNT.toLocaleString('en');
  stat('renders').textContent = '–';
  stat('time').textContent = '–';
  document.documentElement.dataset.mode = mode;
};

const recolour = async (next: string) => {
  colour = next;
  renders = 0;
  const started = performance.now();
  if (mode === 'shared') {
    shared.replaceSync(sheetText(colour));
  } else {
    const dots = [...grid.children] as InlineDot[];
    for (const dot of dots) dot.colour = colour;
    await Promise.all(dots.map((d) => d.updateComplete));
  }
  await frame();
  const ms = performance.now() - started;
  stat('renders').textContent = renders.toLocaleString('en');
  stat('time').textContent = `${ms.toFixed(1)} ms`;
  for (const el of [stat('renders'), stat('time')]) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
};

for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-colour]'
)) {
  button.addEventListener('click', () => {
    for (const b of document.querySelectorAll('[data-colour]')) {
      b.setAttribute('aria-pressed', String(b === button));
    }
    void recolour(button.dataset.colour!);
  });
}
for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-mode]'
)) {
  button.addEventListener('click', () => {
    if (button.dataset.mode === mode) return;
    mode = button.dataset.mode as Mode;
    for (const b of document.querySelectorAll('[data-mode]')) {
      b.setAttribute('aria-pressed', String(b === button));
    }
    void mount();
  });
}

stat('roots').textContent = COUNT.toLocaleString('en');
void mount();
