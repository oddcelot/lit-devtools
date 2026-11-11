import {LitElement, html} from 'lit';
import '@awesome.me/webawesome/dist/components/button/button.js';

/** Counts clicks; edit the template and the count stays. */
export class NoteCounter extends LitElement {
  static override properties = {count: {type: Number}};

  count = 0;

  override render() {
    return html`<wa-button appearance="outlined" @click=${() => this.count++}>
      Liked ${this.count} times
    </wa-button>`;
  }
}
customElements.define('note-counter', NoteCounter);

declare global {
  interface HTMLElementTagNameMap {
    'note-counter': NoteCounter;
  }
}
