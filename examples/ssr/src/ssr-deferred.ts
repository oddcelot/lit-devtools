import {LitElement, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';

/**
 * Rendered with `defer-hydration`, so it stays server HTML until the
 * attribute is removed: the button in the page does that.
 */
@customElement('ssr-deferred')
export class SsrDeferred extends LitElement {
  @state() private clicks = 0;

  override render() {
    return html`
      <h2>Deferred</h2>
      <button id="poke" @click=${() => this.clicks++}>
        Clicks: ${this.clicks}
      </button>
    `;
  }
}
