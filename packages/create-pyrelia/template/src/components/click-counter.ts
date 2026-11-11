import {LitElement, css, html} from 'lit';

/** Counts clicks. Edit the template while it runs: the count stays. */
export class ClickCounter extends LitElement {
  static override properties = {count: {type: Number}};
  static override styles = css`
    button {
      font: inherit;
    }
  `;

  count = 0;

  override render() {
    return html`<button @click=${() => this.count++}>
      Clicked ${this.count} times
    </button>`;
  }
}
customElements.define('click-counter', ClickCounter);

declare global {
  interface HTMLElementTagNameMap {
    'click-counter': ClickCounter;
  }
}
