/**
 * The HMR indicator, drawn in place for pages outside the app: the docs'
 * tutorial and stylesheet guide, and the kitchen sink. On a real page it sits
 * fixed in a corner and shows only while something happens; here it is held
 * in a chosen state, from the same markup the runtime uses, so a theme change
 * shows on it as it would on a page.
 */
import {INDICATOR_HTML} from '../../lib/runtime/indicator-template.js';
import {injectTokens} from '../../lib/token-text.js';

injectTokens({scope: 'hmr-indicator-specimen'});

/** What the indicator is showing: at rest, or just after an update. */
type IndicatorState = 'idle' | 'update' | 'style-swap';

/**
 * `<hmr-indicator-specimen state="update" count="3">`: the HMR indicator in
 * `state`, with the running `count` when one is given. A click replays the
 * pulse it plays on every update.
 */
export class HmrIndicatorSpecimen extends HTMLElement {
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

declare global {
  interface HTMLElementTagNameMap {
    'hmr-indicator-specimen': HmrIndicatorSpecimen;
  }
}
