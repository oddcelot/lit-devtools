import {LitElement, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {navigation} from '../navigation.ts';
import ui from './ui.css?css-sheet';

/**
 * Says when it came alive. The server renders it saying it is still server
 * HTML; hydration keeps that markup, then the first update notes how long
 * after the page arrived it ran. An element with no server HTML at all
 * (`client:only`) says it rendered in the browser instead.
 */
@customElement('island-probe')
export class IslandProbe extends LitElement {
  static override styles = [
    ui,
    css`
      :host {
        display: grid;
        gap: var(--space-5);
        justify-items: start;
      }
      h3 {
        margin: 0;
      }
    `,
  ];

  @property() label = '';

  @state() private after?: number;
  @state() private clicks = 0;

  /** Whether the server sent a shadow root: decided before Lit makes one. */
  #fromServer = this.shadowRoot !== null;

  override firstUpdated() {
    this.after = Math.round(performance.now() - navigation.arrivedAt);
  }

  #status() {
    if (this.after === undefined) {
      return html`<span class="badge server"
        >Server HTML, not hydrated yet</span
      >`;
    }
    const how = this.#fromServer ? 'Hydrated' : 'Rendered in the browser';
    return html`<span class="badge hydrated"
      >${how} ${this.after} ms after the page arrived</span
    >`;
  }

  override render() {
    return html`
      <h3><code>${this.label}</code></h3>
      ${this.#status()}
      <button @click=${() => this.clicks++}>
        Clicked ${this.clicks} times
      </button>
    `;
  }
}
