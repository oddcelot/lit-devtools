import {LitElement, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';

/**
 * Rendered on the server with its starting count, then hydrated: the button
 * works without the page rendering it again. `hydrated` says which side
 * last rendered it.
 */
@customElement('ssr-counter')
export class SsrCounter extends LitElement {
  static override styles = css`
    :host {
      display: block;
      padding: 1rem;
      border: 1px solid color-mix(in oklch, currentColor 25%, transparent);
      border-radius: 0.5rem;
    }
  `;

  @property({type: Number}) start = 0;

  @state() private count = 0;

  @state() private hydrated = false;

  override willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has('start') && !this.hasUpdated) this.count = this.start;
  }

  override firstUpdated() {
    // Runs only in the browser: the server never updates an element.
    this.hydrated = true;
  }

  override render() {
    return html`
      <h2>Counter</h2>
      <button id="increment" @click=${() => this.count++}>
        Count: ${this.count}
      </button>
      <p id="side">${this.hydrated ? 'Hydrated' : 'Server-rendered'}</p>
    `;
  }
}
