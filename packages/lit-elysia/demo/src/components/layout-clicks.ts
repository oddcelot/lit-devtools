import {LitElement, html} from 'lit';
import '@awesome.me/webawesome/dist/components/button/button.js';

/** Lives in the layout: its count shows whether the layout stayed mounted. */
export class LayoutClicks extends LitElement {
  static override properties = {clicks: {type: Number}};

  clicks = 0;

  override render() {
    return html`<wa-button size="s" @click=${() => this.clicks++}>
      Layout clicks: ${this.clicks}
    </wa-button>`;
  }
}
customElements.define('layout-clicks', LayoutClicks);

declare global {
  interface HTMLElementTagNameMap {
    'layout-clicks': LayoutClicks;
  }
}
