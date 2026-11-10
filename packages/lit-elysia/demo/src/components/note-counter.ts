import {LitElement, html} from 'lit';
import buttons from './button.css?css-sheet';

/** Counts clicks; edit the template and the count stays. */
export class NoteCounter extends LitElement {
  static override properties = {count: {type: Number}};
  static override styles = [buttons];

  count = 0;

  override render() {
    return html`<button class="outline" @click=${() => this.count++}>
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
