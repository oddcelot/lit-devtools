/**
 * The source overlay, drawn in place for pages outside the app: the docs'
 * source overlay guide and the kitchen sink. On a real page it sits fixed
 * over the app while the picker is armed; here it wraps its slotted content,
 * from the same template the runtime renders, so a theme change shows on it
 * as it would on a page.
 */
import {renderOverlay} from '../../lib/runtime/source-overlay/template.js';
import {injectTokens} from '../../lib/token-text.js';

injectTokens({scope: 'source-overlay-specimen'});

/**
 * `<source-overlay-specimen tag path site step armed>`: the source overlay
 * while the picker hovers a component, in place: its highlight ring around
 * the slotted content, and the tooltip under it. `tag`, `path` (where the
 * class is declared), `site` (where it is rendered) and `step` (the arrow
 * keys' way out and back) fill the tooltip as the overlay does; `armed` is
 * the row a click would open with Cmd/Ctrl (`source`) or Cmd/Ctrl+Shift
 * (`site`) held.
 */
export class SourceOverlaySpecimen extends HTMLElement {
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
    'source-overlay-specimen': SourceOverlaySpecimen;
  }
}
