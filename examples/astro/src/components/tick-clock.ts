import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import ui from './ui.css?css-sheet';

/** Updates once a second, which gives the Timeline something to record. */
@customElement('tick-clock')
export class TickClock extends LitElement {
  static override styles = [
    ui,
    css`
      time {
        color: var(--text-strong);
        font: var(--weight-semibold) var(--text-2xl) var(--font-mono);
      }
    `,
  ];

  @state() private now = new Date();
  #timer?: ReturnType<typeof setInterval>;

  override connectedCallback() {
    super.connectedCallback();
    if (globalThis.document !== undefined) {
      this.#timer = setInterval(() => (this.now = new Date()), 1000);
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.#timer);
  }

  override render() {
    return html`<time>${this.now.toLocaleTimeString('en-GB')}</time>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'tick-clock': TickClock;
  }
}
