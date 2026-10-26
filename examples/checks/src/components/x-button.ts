import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';

/**
 * A button that says how big it is when pressed.
 *
 * Hover the tag in a template to read this, and its attributes, events,
 * slots and parts below.
 *
 * @fires press - When the button is clicked, with its size.
 * @slot - The label.
 * @csspart base - The native button.
 * @cssprop [--x-button-accent=#4f46e5] - The button's colour.
 */
@customElement('x-button')
export class XButton extends LitElement {
  static styles = css`
    button {
      font: inherit;
      color: white;
      background: var(--x-button-accent, #4f46e5);
      border: 0;
      border-radius: 6px;
      padding: 0.4em 0.9em;
      cursor: pointer;
    }
    :host([size='large']) button {
      font-size: 1.25rem;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `;

  /** How much room the button takes. */
  @property({reflect: true}) size: 'small' | 'large' = 'small';

  /** Turns the button off. */
  @property({type: Boolean, reflect: true}) disabled = false;

  render() {
    return html`<button
      part="base"
      ?disabled=${this.disabled}
      @click=${this.#press}
    >
      <slot></slot>
    </button>`;
  }

  #press() {
    this.dispatchEvent(
      new CustomEvent('press', {
        detail: {size: this.size},
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'x-button': XButton;
  }
}
