import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';

/**
 * A card with a header, a body and a footer.
 *
 * Its slots are documented, so a child with a `slot` the card doesn't have
 * is reported (src/mistakes/names.ts).
 *
 * @slot header - The title row.
 * @slot - The body.
 * @slot footer - Actions, aligned to the end.
 * @cssprop [--x-card-padding=1rem] - Space inside the card.
 */
@customElement('x-card')
export class XCard extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: var(--x-card-padding, 1rem);
      background: white;
      border-radius: 10px;
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
    }
    :host([raised]) {
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.16);
    }
    footer {
      display: flex;
      justify-content: end;
      gap: 0.5rem;
    }
  `;

  /** Lifts the card off the page. */
  @property({type: Boolean, reflect: true}) raised = false;

  render() {
    return html`
      <header><slot name="header"></slot></header>
      <slot></slot>
      <footer><slot name="footer"></slot></footer>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'x-card': XCard;
  }
}
