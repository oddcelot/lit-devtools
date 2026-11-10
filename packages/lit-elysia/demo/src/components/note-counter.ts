import {LitElement, css, html} from 'lit';

/** Counts clicks; edit the template and the count stays. */
export class NoteCounter extends LitElement {
  static override properties = {count: {type: Number}};
  static override styles = css`
    button {
      font: inherit;
    }
  `;

  count = 0;

  override render() {
    return html`<button @click=${() => this.count++}>
      Liked ${this.count} times
    </button>`;
  }
}
customElements.define('note-counter', NoteCounter);

declare global {
  interface HTMLElementTagNameMap {
    'note-counter': NoteCounter;
  }
}
