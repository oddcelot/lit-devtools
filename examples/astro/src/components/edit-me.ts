import {LitElement, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import ui from './ui.css?css-sheet';

/**
 * The element to edit while the page is open. Change the heading, the
 * swatch's colour or the styles: the element on the page takes the new
 * code in place, and its click count stays.
 */
@customElement('edit-me')
export class EditMe extends LitElement {
  static override styles = [
    ui,
    css`
      :host {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: var(--space-7);
      }
      .swatch {
        width: 72px;
        height: 72px;
        border-radius: var(--radius-lg);
        background: var(--lit-blue);
      }
      h3 {
        margin: 0 0 var(--space-3);
      }
      button {
        margin-top: var(--space-5);
      }
    `,
  ];

  /** Editable from the Lit panel too: select the element, change it there. */
  @property() note = 'Edit src/components/edit-me.ts and save.';

  @state() private clicks = 0;

  override render() {
    return html`
      <div class="swatch"></div>
      <div>
        <h3>Edit me</h3>
        <p class="muted">${this.note}</p>
        <button @click=${() => this.clicks++}>
          Clicked ${this.clicks} times
        </button>
      </div>
    `;
  }
}
