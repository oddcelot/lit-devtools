/**
 * The DevTools' in-page UI, drawn in place for the kitchen sink. On a real
 * page these sit fixed over the app and show only while something happens;
 * here each one is a specimen in a chosen state, from the same markup the
 * runtime uses, so a theme change shows on them as it would on a page.
 */
import {INDICATOR_HTML} from '../../../src/lib/runtime/indicator-template.js';
import {renderOverlay} from '../../../src/lib/runtime/source-overlay/template.js';
import {injectTokens} from '../../../src/lib/token-text.js';

injectTokens({scope: 'hmr-indicator-specimen'});
injectTokens({scope: 'source-overlay-specimen'});

/** What the indicator is showing: at rest, or just after an update. */
type IndicatorState = 'idle' | 'update' | 'style-swap';

/**
 * `<hmr-indicator-specimen state="update" count="3">`: the HMR indicator in
 * `state`, with the running `count` when one is given. A click replays the
 * pulse it plays on every update.
 */
class HmrIndicatorSpecimen extends HTMLElement {
  static observedAttributes = ['state', 'count'];
  #container: HTMLElement;
  #count: HTMLElement;

  constructor() {
    super();
    const root = this.attachShadow({mode: 'open'});
    root.innerHTML = `${INDICATOR_HTML}<style>
      /* In place instead of fixed over the page, and lit after an update
         instead of fading back out. */
      :host{position:static;display:inline-grid;padding:0;pointer-events:auto;cursor:pointer}
      #container.shown{opacity:1}
    </style>`;
    this.#container = root.getElementById('container')!;
    this.#count = root.querySelector<HTMLElement>('.count')!;
    this.addEventListener('click', () => {
      this.#container.classList.remove('active', 'shown');
      void this.#container.offsetWidth;
      this.#container.classList.add('active');
    });
  }

  connectedCallback() {
    this.attributeChangedCallback();
  }

  attributeChangedCallback() {
    const state = (this.getAttribute('state') ?? 'idle') as IndicatorState;
    const count = this.getAttribute('count');
    this.#container.classList.toggle('with-count', count !== null);
    this.#count.textContent = count ?? '0';
    this.#container.classList.toggle('style-swap', state === 'style-swap');
    this.#container.classList.toggle('shown', state !== 'idle');
  }
}

customElements.define('hmr-indicator-specimen', HmrIndicatorSpecimen);

/**
 * `<source-overlay-specimen tag path site step armed>`: the source overlay
 * while the picker hovers a component, in place: its highlight ring around
 * the slotted content, and the tooltip under it. `tag`, `path` (where the
 * class is declared), `site` (where it is rendered) and `step` (the arrow
 * keys' way out and back) fill the tooltip as the overlay does; `armed` is
 * the row a click would open with Cmd/Ctrl (`source`) or Cmd/Ctrl+Shift
 * (`site`) held.
 */
class SourceOverlaySpecimen extends HTMLElement {
  static observedAttributes = ['tag', 'path', 'site', 'step', 'armed'];
  #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({mode: 'open'});
    renderOverlay(this.#root);
    this.#root
      .getElementById('highlight')!
      .append(document.createElement('slot'));
    const style = document.createElement('style');
    // In place instead of fixed over the page: the dialog is a column, the
    // ring wraps the slotted content, and there is no dimming mask.
    style.textContent = `
      dialog{position:static;display:flex;flex-direction:column;align-items:flex-start;gap:12px;overflow:visible}
      #mask{display:none}
      #highlight{position:static;display:block;padding:8px;transition:none}
      #tooltip{position:static;translate:none;display:flex}
    `;
    this.#root.append(style);
  }

  connectedCallback() {
    this.attributeChangedCallback();
  }

  attributeChangedCallback() {
    const byId = (id: string) => this.#root.getElementById(id)!;
    const text = (id: string, value: string | null) => {
      byId(id).textContent = value ?? '';
      byId(id).style.display = value === null ? 'none' : '';
    };
    const tag = this.getAttribute('tag');
    text('tag', tag === null ? null : `<${tag}>`);
    text('path', this.getAttribute('path'));
    text('step', this.getAttribute('step'));
    text('site-text', this.getAttribute('site'));
    byId('site-row').style.display = this.hasAttribute('site') ? '' : 'none';
    const armed = this.getAttribute('armed');
    byId('source-row').classList.toggle('armed', armed === 'source');
    byId('site-row').classList.toggle('armed', armed === 'site');
  }
}

customElements.define('source-overlay-specimen', SourceOverlaySpecimen);

declare global {
  interface HTMLElementTagNameMap {
    'hmr-indicator-specimen': HmrIndicatorSpecimen;
    'source-overlay-specimen': SourceOverlaySpecimen;
  }
}
