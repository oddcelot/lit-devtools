import {LitElement, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import ui from './ui.css?css-sheet';

/**
 * Shows what the server knew when it rendered this request: the name in
 * the query string, and when. `renderedAt` is a Date, which reaches the
 * browser in the element's marker and comes back a Date, so the hydrated
 * element can count the seconds since.
 */
@customElement('request-card')
export class RequestCard extends LitElement {
  static override styles = [
    ui,
    css`
      dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: var(--space-3) var(--space-7);
        margin: 0;
      }
      dt {
        color: var(--text-muted);
      }
      dd {
        margin: 0;
        font-family: var(--font-mono);
      }
    `,
  ];

  @property() name = 'stranger';
  @property({attribute: false}) renderedAt?: Date;

  @state() private now?: number;
  #tick?: ReturnType<typeof setInterval>;

  override connectedCallback() {
    super.connectedCallback();
    // In the browser only: the server never connects an element for real.
    if (globalThis.document !== undefined) {
      this.#tick = setInterval(() => (this.now = Date.now()), 1000);
    }
  }

  override firstUpdated() {
    // Right after hydration, rather than a second later on the first tick.
    this.now = Date.now();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.#tick);
  }

  override render() {
    const at = this.renderedAt;
    const age =
      at === undefined || this.now === undefined
        ? 'counting once hydrated'
        : `${Math.round((this.now - at.getTime()) / 1000)} s ago`;
    return html`
      <h3>Hello, ${this.name}</h3>
      <dl>
        <dt>Rendered at</dt>
        <dd id="at">${at?.toISOString() ?? 'unknown'}</dd>
        <dt>That was</dt>
        <dd id="age">${age}</dd>
        <dt>renderedAt is a</dt>
        <dd id="type">${at instanceof Date ? 'Date' : typeof at}</dd>
      </dl>
    `;
  }
}
