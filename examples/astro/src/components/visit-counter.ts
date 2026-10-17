import {LitElement, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import ui from './ui.css?css-sheet';

/**
 * Counts the pages seen since the document loaded. The layout marks it
 * `transition:persist`, so Astro moves this element into each swapped-in
 * page instead of rendering a new one: the count only resets on a full
 * page load.
 */
@customElement('visit-counter')
export class VisitCounter extends LitElement {
  static override styles = [ui];

  @state() private pages = 1;

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener('astro:after-swap', this.#count);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('astro:after-swap', this.#count);
  }

  #count = () => {
    this.pages++;
  };

  override render() {
    return html`
      <strong>${this.pages}</strong>
      <span class="muted"
        >${this.pages === 1 ? 'page' : 'pages'} without a reload</span
      >
    `;
  }
}
