import {LitElement, html} from 'lit';
import buttons from './button.css?css-sheet';

/** Lives in the layout: its count shows whether the layout stayed mounted. */
export class LayoutClicks extends LitElement {
  static override properties = {clicks: {type: Number}};
  static override styles = [buttons];

  clicks = 0;

  override render() {
    return html`<button class="secondary" @click=${() => this.clicks++}>
      Layout clicks: ${this.clicks}
    </button>`;
  }
}
customElements.define('layout-clicks', LayoutClicks);

declare global {
  interface HTMLElementTagNameMap {
    'layout-clicks': LayoutClicks;
  }
}
