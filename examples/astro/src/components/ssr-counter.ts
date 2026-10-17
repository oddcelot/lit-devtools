import {LitElement, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import ui from './ui.css?css-sheet';

/**
 * Rendered on the server with its starting count, then hydrated: the button
 * works without the page rendering it again. The `hydrated` attribute, set
 * once hydration has run, switches the line that says which side rendered
 * it. An attribute rather than reactive state, which would render a second
 * time just to say so.
 */
@customElement('ssr-counter')
export class SsrCounter extends LitElement {
  static override styles = [
    ui,
    css`
      :host([hydrated]) .server,
      :host(:not([hydrated])) .client {
        display: none;
      }
      #side {
        margin: var(--space-5) 0 0;
      }
    `,
  ];

  @property({type: Number}) start = 0;

  @state() private count = 0;

  override willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has('start') && !this.hasUpdated) this.count = this.start;
  }

  override firstUpdated() {
    // Runs only in the browser: the server never updates an element.
    this.setAttribute('hydrated', '');
  }

  override render() {
    return html`
      <h2>Counter</h2>
      <button id="increment" @click=${() => this.count++}>
        Count: ${this.count}
      </button>
      <p id="side">
        <span class="badge server">Server-rendered</span>
        <span class="badge hydrated client">Hydrated</span>
      </p>
    `;
  }
}
